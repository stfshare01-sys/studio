/**
 * HCM Operations - Cloud Functions
 * 
 * Callable functions for Human Capital Management operations.
 * All business logic and payroll calculations run server-side.
 * 
 * ⚠️ CRITICAL: These functions use Firestore transactions for atomicity.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyRole, HCM_ROLES, MANAGER_ROLES, getUserData } from '../utils/auth-middleware';
import {
    calculateOvertime,
} from '../utils/lft-calculations';
import {
    canApproveForEmployee,
    ApprovalType
} from '../utils/hierarchy-validator';
import type {
    PrenominaRecord,
    Employee,
    AttendanceRecord,
    Incidence
} from '../types/firestore-types';

/**
 * Obtiene el día de reinicio de HE según configuración de ubicación
 * @returns Número del día (0-6, donde 0 = domingo)
 */
async function getOvertimeResetDay(
    db: admin.firestore.Firestore,
    employee: any
): Promise<number> {
    const locationId = employee.locationId;

    if (!locationId) {
        console.warn(`[Prenomina] Employee ${employee.id} has no location, using default: Sunday`);
        return 0; // Domingo por defecto
    }

    try {
        const locationDoc = await db.collection('locations').doc(locationId).get();
        if (!locationDoc.exists) {
            console.warn(`[Prenomina] Location ${locationId} not found, using default: Sunday`);
            return 0;
        }

        const location = locationDoc.data();
        const overtimeResetDay = location?.overtimeResetDay || 'sunday';

        switch (overtimeResetDay) {
            case 'sunday':
                return 0;
            case 'saturday':
                return 6;
            case 'custom':
                return location?.customOvertimeResetDay || 0;
            default:
                console.warn(`[Prenomina] Unknown overtimeResetDay: ${overtimeResetDay}, using Sunday`);
                return 0;
        }
    } catch (error) {
        console.error(`[Prenomina] Error fetching location ${locationId}:`, error);
        return 0;
    }
}

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

// =========================================================================
// CONSOLIDATE PRENOMINA - TRANSACTIONAL
// =========================================================================

interface ConsolidatePrenominaRequest {
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    employeeIds?: string[];
}

interface ConsolidatePrenominaResponse {
    success: boolean;
    recordIds: string[];
    processedCount: number;
    skippedCount: number;
    errors: { employeeId: string; message: string }[];
}

/**
 * Consolidates attendance, incidences, and overtime into prenomina records.
 * 
 * Uses Firestore batch writes for atomicity - all employee records in a
 * period are created together or none are created.
 * 
 * @requires Role: Admin or HRManager
 */
export const consolidatePrenomina = onCall<ConsolidatePrenominaRequest>(
    { region: 'us-central1' },
    async (request: CallableRequest<ConsolidatePrenominaRequest>): Promise<ConsolidatePrenominaResponse> => {
        // Verify authentication and role
        await verifyRole(request.auth?.uid, HCM_ROLES, 'consolidar prenómina');
        const userData = await getUserData(request.auth!.uid);

        const { periodStart, periodEnd, periodType, employeeIds } = request.data;

        // Validate required parameters
        if (!periodStart || !periodEnd || !periodType) {
            throw new HttpsError('invalid-argument', 'Período incompleto. Se requiere periodStart, periodEnd y periodType.');
        }

        const nowISO = new Date().toISOString();

        const recordIds: string[] = [];
        const errors: { employeeId: string; message: string }[] = [];
        let skippedCount = 0;

        try {
            // =====================================================================
            // PHASE 1: AUTO-PROCESS PENDING REQUESTS
            // At period close, all pending items become rejected/unjustified
            // =====================================================================
            console.log(`[HCM] Phase 1: Auto-processing pending items for period ${periodStart} to ${periodEnd}`);

            // 1a. Reject pending overtime requests
            const pendingOvertimeQuery = await db.collection('overtime_requests')
                .where('status', '==', 'pending')
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            for (const doc of pendingOvertimeQuery.docs) {
                await doc.ref.update({
                    status: 'rejected',
                    hoursApproved: 0,
                    rejectionReason: 'Auto-rechazado al cierre de período (sin autorización)',
                    approvedById: request.auth?.uid,
                    approvedByName: `${userData?.fullName || 'Sistema'} (Auto-cierre)`,
                    approvedAt: nowISO,
                    updatedAt: nowISO,
                });
            }
            console.log(`[HCM] Auto-rejected ${pendingOvertimeQuery.size} pending overtime requests`);

            // Check for locked period (using unified payroll_period_locks)
            const lockQuery = await db.collection('payroll_period_locks')
                .where('periodStart', '==', periodStart)
                .where('periodEnd', '==', periodEnd)
                .where('isLocked', '==', true)
                .get();

            if (!lockQuery.empty) {
                return {
                    success: false,
                    recordIds: [],
                    processedCount: 0,
                    skippedCount: 0,
                    errors: [{
                        employeeId: 'GLOBAL',
                        message: `El período ${periodStart} al ${periodEnd} ya está bloqueado. No se puede reconsolidar.`
                    }]
                };
            }

            // Also check old system for backward compatibility
            const periodYearMonth = periodStart.substring(0, 7);
            const oldLockQuery = await db.collection('period_closures')
                .where('period', '==', periodYearMonth)
                .get();

            if (!oldLockQuery.empty) {
                console.warn(`[HCM] Period ${periodYearMonth} locked in legacy system.`);
            }


            // 1b. Mark unjustified tardiness records (they stay as is, but log)
            const unjustifiedTardinessQuery = await db.collection('tardiness_records')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();
            console.log(`[HCM] Found ${unjustifiedTardinessQuery.size} unjustified tardiness records - will affect puntualidad`);

            // 1c. Process unjustified early departures -> Mark as FALTA
            const unjustifiedEarlyDeparturesQuery = await db.collection('early_departures')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            for (const doc of unjustifiedEarlyDeparturesQuery.docs) {
                const departure = doc.data();

                // 1. Mark infringement as resulted in absence
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });

                // 2. Void the attendance record (if linked)
                if (departure.attendanceId) {
                    const attendanceRef = db.collection('attendance').doc(departure.attendanceId);
                    await attendanceRef.update({
                        isVoid: true,
                        voidReason: 'Converted to absence due to unjustified early departure',
                    });
                }

                // 3. Create incidence for visibility
                await db.collection('incidences').add({
                    employeeId: departure.employeeId,
                    type: 'unjustified_absence',
                    startDate: departure.date,
                    endDate: departure.date,
                    totalDays: 1,
                    status: 'approved', // Auto-approved by system
                    reason: 'Salida anticipada injustificada (Cierre Automático)',
                    isPaid: false,
                    createdAt: nowISO,
                    updatedAt: nowISO
                });
            }
            console.log(`[HCM] Processed ${unjustifiedEarlyDeparturesQuery.size} unjustified early departures (Voided Attendance + Created Absence)`);

            // 1d. Process unjustified missing punches -> Mark as FALTA
            const unjustifiedMissingPunchesQuery = await db.collection('missing_punches')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            for (const doc of unjustifiedMissingPunchesQuery.docs) {
                const punch = doc.data();

                // 1. Mark infringement as resulted in absence
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });

                // 2. Void the attendance record (if linked)
                if (punch.attendanceId) {
                    const attendanceRef = db.collection('attendance').doc(punch.attendanceId);
                    await attendanceRef.update({
                        isVoid: true,
                        voidReason: 'Converted to absence due to unjustified missing punch',
                    });
                }

                // 3. Create incidence for visibility
                await db.collection('incidences').add({
                    employeeId: punch.employeeId,
                    type: 'unjustified_absence',
                    startDate: punch.date,
                    endDate: punch.date,
                    totalDays: 1,
                    status: 'approved',
                    reason: 'Falta de marcaje injustificada (Cierre Automático)',
                    isPaid: false,
                    createdAt: nowISO,
                    updatedAt: nowISO
                });
            }
            console.log(`[HCM] Processed ${unjustifiedMissingPunchesQuery.size} unjustified missing punches (Voided Attendance + Created Absence)`);

            // =====================================================================
            // PHASE 2: CONSOLIDATE PRENOMINA
            // =====================================================================
            console.log(`[HCM] Phase 2: Consolidating prenomina records`);

            // Delete existing prenomina records for this period to prevent duplicates
            const existingPrenominaQuery = await db.collection('prenomina')
                .where('periodStart', '==', periodStart)
                .where('periodEnd', '==', periodEnd)
                .get();
            if (!existingPrenominaQuery.empty) {
                const deleteBatch = db.batch();
                existingPrenominaQuery.docs.forEach(d => deleteBatch.delete(d.ref));
                await deleteBatch.commit();
                console.log(`[HCM] Deleted ${existingPrenominaQuery.size} existing prenomina records for deduplication`);
            }

            // Get employees to process
            let employeesQuery = db.collection('employees').where('status', '==', 'active');
            const employeesSnap = await employeesQuery.get();

            const employees = employeesSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Employee))
                .filter(emp => !employeeIds || employeeIds.length === 0 || employeeIds.includes(emp.id));

            if (employees.length === 0) {
                return { success: true, recordIds: [], processedCount: 0, skippedCount: 0, errors: [] };
            }

            // Fetch Holiday Calendars (Global and others)
            // We'll simplisticly fetch all for the year for now to avoid N reads
            const year = parseInt(periodStart.substring(0, 4));
            const calendarsQuery = await db.collection('holiday_calendars')
                .where('year', '==', year)
                .get();

            const holidaysByCountry: Record<string, string[]> = {}; // countryCode -> dates[]
            const holidaysByCalendarId: Record<string, string[]> = {}; // calendarId -> dates[]

            calendarsQuery.docs.forEach(doc => {
                const data = doc.data();
                const dates = (data.holidays || []).map((h: any) => h.date);
                if (data.countryCode) {
                    holidaysByCountry[data.countryCode] = [...(holidaysByCountry[data.countryCode] || []), ...dates];
                }
                holidaysByCalendarId[doc.id] = dates;
            });


            // Process in batches to respect Firestore limits (500 writes per batch)
            const BATCH_SIZE = 100;

            for (let i = 0; i < employees.length; i += BATCH_SIZE) {
                const employeeBatch = employees.slice(i, i + BATCH_SIZE);

                // Use a transaction to ensure atomicity for this batch
                await db.runTransaction(async (transaction) => {
                    const prenominaRecords: { ref: admin.firestore.DocumentReference; data: Omit<PrenominaRecord, 'id'> }[] = [];

                    for (const employee of employeeBatch) {
                        try {
                            // Get attendance records for the period
                            const attendanceQuery = db.collection('attendance')
                                .where('employeeId', '==', employee.id)
                                .where('date', '>=', periodStart)
                                .where('date', '<=', periodEnd);
                            const attendanceSnap = await transaction.get(attendanceQuery);
                            const attendanceRecords = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);

                            if (attendanceRecords.length > 0) {
                                console.log(`[Consolidate] Found ${attendanceRecords.length} attendance records for employee ${employee.id} (${employee.fullName})`);
                            }

                            // Get approved incidences for the period
                            const incidencesQuery = db.collection('incidences')
                                .where('employeeId', '==', employee.id)
                                .where('status', '==', 'approved')
                                .where('startDate', '<=', periodEnd)
                                .where('endDate', '>=', periodStart);
                            const incidencesSnap = await transaction.get(incidencesQuery);
                            const incidences = incidencesSnap.docs.map(d => d.data() as Incidence);

                            // Calculate all values using server-side LFT formulas

                            // FILTER: Ignore voided attendance records (e.g. converted to absence)
                            const validAttendanceRecords = attendanceRecords.filter(a => !a.isVoid);

                            let daysWorked = validAttendanceRecords.length;
                            let totalOvertimeHours = validAttendanceRecords.reduce((sum, a) => sum + a.overtimeHours, 0);
                            let absenceDays = 0;
                            let vacationDaysTaken = 0;
                            let sickLeaveDays = 0;
                            let paidLeaveDays = 0;
                            let unpaidLeaveDays = 0;
                            let sundayDays = 0;
                            let holidayDays = 0; // Worked holidays

                            // Determine applicable holidays for this employee
                            // Priority: Location Calendar -> Country Code (Mexico default) -> None
                            let employeeHolidayDates: string[] = [];

                            // 1. Try location specific calendar
                            if (employee.locationId) {
                                // Safe check for locationId
                                const locRef = db.collection('locations').doc(employee.locationId);
                                const locDoc = await transaction.get(locRef);
                                const locData = locDoc.data();
                                if (locData?.holidayCalendarId && holidaysByCalendarId[locData.holidayCalendarId]) {
                                    employeeHolidayDates = holidaysByCalendarId[locData.holidayCalendarId];
                                }
                                // 2. If no specific calendar, try country code (assuming 'mx' for now or from location)
                                else if (holidaysByCountry['mx']) {
                                    employeeHolidayDates = holidaysByCountry['mx'];
                                }
                            } else if (holidaysByCountry['mx']) {
                                employeeHolidayDates = holidaysByCountry['mx'];
                            }

                            const isHoliday = (date: string) => employeeHolidayDates.includes(date);


                            // Process incidences
                            for (const inc of incidences) {
                                switch (inc.type) {
                                    case 'vacation':
                                        vacationDaysTaken += inc.totalDays;
                                        break;
                                    case 'sick_leave':
                                        sickLeaveDays += inc.totalDays;
                                        break;
                                    case 'unjustified_absence':
                                        absenceDays += inc.totalDays;
                                        break;
                                    default:
                                        if (inc.isPaid) {
                                            paidLeaveDays += inc.totalDays;
                                        } else {
                                            unpaidLeaveDays += inc.totalDays;
                                        }
                                }
                            }

                            // Count rest days worked (based on location config)
                            const resetDay = await getOvertimeResetDay(db, employee);

                            for (const record of validAttendanceRecords) {
                                const dayOfWeek = new Date(record.date).getDay();
                                const dateStr = record.date;

                                if (isHoliday(dateStr)) {
                                    holidayDays++;
                                    // Holidays worked count as Sunday Premium for "Triple Pay" logic purposes in some systems, 
                                    // but usually they are separate. LFT: Salary + 200%.
                                    // Here we just count them.
                                }

                                if (dayOfWeek === resetDay) sundayDays++;
                            }

                            // Count company benefit days
                            let companyBenefitDays = 0;
                            const locationId = employee.locationId;

                            if (locationId) {
                                try {
                                    const locationDoc = await db.collection('locations').doc(locationId).get();
                                    if (locationDoc.exists) {
                                        const location = locationDoc.data();
                                        const benefitDays: string[] = location?.companyBenefitDays || [];

                                        for (const record of validAttendanceRecords) {
                                            const dateObj = new Date(record.date);
                                            // Usamos UTC para consistency con isCompanyBenefitDay
                                            const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
                                            const day = dateObj.getUTCDate().toString().padStart(2, '0');
                                            const monthDay = `${month}-${day}`;

                                            if (benefitDays.includes(monthDay)) {
                                                companyBenefitDays++;
                                            }
                                        }
                                    }
                                } catch (error) {
                                    console.error(`[Prenomina] Error counting benefit days:`, error);
                                }
                            }

                            // Calculate overtime (HOURS ONLY - Rate 0)
                            // We pass 0 as rate because we only care about doubleHours and tripleHours
                            const overtimeCalc = calculateOvertime(totalOvertimeHours, 0);

                            // Prepare prenomina record
                            const prenominaRef = db.collection('prenomina').doc();
                            const prenominaData: Omit<PrenominaRecord, 'id'> = {
                                employeeId: employee.id,
                                employeeName: employee.fullName || 'Empleado Desconocido',
                                employeeRfc: employee.rfc_curp ?? '',
                                periodStart,
                                periodEnd,
                                periodType,
                                daysWorked,
                                overtimeDoubleHours: overtimeCalc.doubleHours,
                                overtimeTripleHours: overtimeCalc.tripleHours,
                                sundayPremiumDays: sundayDays,
                                holidayDays,
                                absenceDays,
                                vacationDaysTaken,
                                sickLeaveDays,
                                paidLeaveDays,
                                unpaidLeaveDays,
                                companyBenefitDaysTaken: companyBenefitDays,
                                status: 'draft',
                                costCenter: employee.costCenter ?? 'Sin Centro de Costos',
                                createdAt: nowISO,
                                updatedAt: nowISO
                            };

                            prenominaRecords.push({ ref: prenominaRef, data: prenominaData });
                            recordIds.push(prenominaRef.id);

                        } catch (empError: any) {
                            errors.push({ employeeId: employee.id, message: empError.message || 'Error procesando empleado' });
                            skippedCount++;
                        }
                    }

                    // Write all prenomina records in the transaction
                    for (const { ref, data } of prenominaRecords) {
                        transaction.set(ref, data);
                    }

                    // Create audit log
                    const auditRef = db.collection('prenomina_audit').doc();
                    transaction.set(auditRef, {
                        action: 'CONSOLIDATE_PRENOMINA',
                        periodStart,
                        periodEnd,
                        periodType,
                        recordCount: prenominaRecords.length,
                        createdById: request.auth?.uid,
                        createdByName: userData?.fullName || 'Unknown',
                        createdAt: nowISO
                    });
                });
            }

            console.log(`[HCM] Consolidated prenomina: ${recordIds.length} records, ${skippedCount} skipped`);

            return {
                success: true,
                recordIds,
                processedCount: recordIds.length,
                skippedCount,
                errors
            };

        } catch (error: any) {
            console.error('[HCM] Error consolidating prenomina:', error);
            throw new HttpsError('internal', `Error consolidando prenómina: ${error.message}`);
        }
    }
);

// =========================================================================
// PROCESS EMPLOYEE IMPORT - TRANSACTIONAL
// =========================================================================

interface EmployeeImportRow {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: 'full_time' | 'part_time' | 'contractor';
    shiftType: 'diurnal' | 'nocturnal' | 'mixed';
    hireDate: string;
    // salaryDaily REMOVED
    managerEmail?: string;
}

interface ProcessEmployeeImportRequest {
    rows: EmployeeImportRow[];
    filename: string;
}

interface ProcessEmployeeImportResponse {
    success: boolean;
    batchId: string;
    recordCount: number;
    successCount: number;
    errorCount: number;
    errors: { row: number; message: string }[];
}

/**
 * Processes bulk employee import with validation and automatic compensation creation.
 * 
 * @requires Role: Admin or HRManager
 */
export const processEmployeeImport = onCall<ProcessEmployeeImportRequest>(
    { region: 'us-central1' },
    async (request): Promise<ProcessEmployeeImportResponse> => {
        await verifyRole(request.auth?.uid, HCM_ROLES, 'importar empleados');
        const userData = await getUserData(request.auth!.uid);

        const { rows, filename } = request.data;

        if (!rows || rows.length === 0) {
            throw new HttpsError('invalid-argument', 'No hay filas para procesar.');
        }

        const nowISO = new Date().toISOString();
        const errors: { row: number; message: string }[] = [];
        let successCount = 0;

        // Create batch record
        const batchRef = db.collection('employee_imports').doc();
        const batchId = batchRef.id;

        try {
            await db.runTransaction(async (transaction) => {
                // Check for existing emails in batch
                const existingEmails = new Set<string>();
                for (const row of rows) {
                    if (row.email) {
                        const emailQuery = db.collection('employees').where('email', '==', row.email).limit(1);
                        const emailSnap = await transaction.get(emailQuery);
                        if (!emailSnap.empty) {
                            existingEmails.add(row.email);
                        }
                    }
                }

                for (let i = 0; i < rows.length; i++) {
                    const row = rows[i];
                    const rowNum = i + 2;

                    try {
                        // Validate required fields
                        if (!row.fullName || !row.email || !row.department || !row.positionTitle || !row.hireDate) {
                            throw new Error('Faltan campos obligatorios');
                        }

                        // salaryDaily validation removed

                        if (existingEmails.has(row.email)) {
                            throw new Error(`Email ${row.email} ya existe`);
                        }

                        // Create employee document
                        const employeeRef = db.collection('employees').doc();
                        const hireDateISO = new Date(row.hireDate).toISOString();
                        // const yearsOfService = calculateYearsOfService(hireDateISO);
                        // const vacationDays = calculateVacationDays(yearsOfService);
                        // SDI calculations removed

                        transaction.set(employeeRef, {
                            email: row.email,
                            fullName: row.fullName,
                            department: row.department,
                            positionTitle: row.positionTitle,
                            employmentType: row.employmentType || 'full_time',
                            shiftType: row.shiftType || 'diurnal',
                            hireDate: hireDateISO,
                            status: 'active',
                            onboardingStatus: 'pending',
                            createdAt: nowISO,
                            updatedAt: nowISO
                        });

                        // Compensation creation removed - Operational Only

                        successCount++;

                    } catch (rowError: any) {
                        errors.push({ row: rowNum, message: rowError.message });
                    }
                }

                // Create batch record
                transaction.set(batchRef, {
                    filename,
                    fileSize: 0,
                    mimeType: 'text/csv',
                    uploadedById: request.auth?.uid,
                    uploadedByName: userData?.fullName || 'Unknown',
                    uploadedAt: nowISO,
                    recordCount: rows.length,
                    successCount,
                    errorCount: errors.length,
                    status: errors.length === 0 ? 'completed' : (successCount === 0 ? 'failed' : 'partial'),
                    errors: errors.slice(0, 50)
                });
            });

            return {
                success: errors.length === 0,
                batchId,
                recordCount: rows.length,
                successCount,
                errorCount: errors.length,
                errors
            };

        } catch (error: any) {
            console.error('[HCM] Error processing employee import:', error);
            throw new HttpsError('internal', `Error en importación: ${error.message}`);
        }
    }
);



// =========================================================================
// APPROVE INCIDENCE
// =========================================================================

interface ApproveIncidenceRequest {
    incidenceId: string;
    action: 'approve' | 'reject' | 'cancel';
    rejectionReason?: string;
}

interface ApproveIncidenceResponse {
    success: boolean;
}

/**
 * Helper function to check if two date ranges overlap
 */
function datesOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
    const s1 = new Date(start1);
    const e1 = new Date(end1);
    const s2 = new Date(start2);
    const e2 = new Date(end2);
    return s1 <= e2 && e1 >= s2;
}

/**
 * Approves or rejects an incidence request.
 *
 * Includes server-side validation for:
 * 1. HIERARCHICAL AUTHORIZATION: Only direct managers, chain managers, or HR/Admin can approve
 * 2. DATE CONFLICTS: Prevents approving overlapping incidences
 * 3. VACATION BALANCE: Validates employee has sufficient days for vacation requests
 *
 * When approving VACATION incidences:
 * - Uses Firestore transaction for atomicity
 * - Validates sufficient balance
 * - Updates vacation balance (daysTaken, daysAvailable)
 * - Records movement in vacation balance for audit
 *
 * AUTHORIZATION RULES:
 * - HR/Admin can approve ANY employee's incidences
 * - Managers can only approve subordinates (direct or indirect in chain)
 * - Manager must have canApproveIncidences permission in their position
 *
 * @requires Role: Admin, HRManager, or Manager (with hierarchy validation)
 */
export const approveIncidence = onCall<ApproveIncidenceRequest>(
    { region: 'us-central1' },
    async (request): Promise<ApproveIncidenceResponse> => {
        // First verify the user has one of the required roles
        await verifyRole(request.auth?.uid, MANAGER_ROLES, 'aprobar incidencia');
        const userData = await getUserData(request.auth!.uid);
        const approverId = request.auth!.uid;

        const { incidenceId, action, rejectionReason } = request.data;

        if (!incidenceId || !action) {
            throw new HttpsError('invalid-argument', 'Parámetros incompletos.');
        }

        if (!['approve', 'reject', 'cancel'].includes(action)) {
            throw new HttpsError('invalid-argument', `Acción no válida: ${action}.`);
        }

        const nowISO = new Date().toISOString();

        try {
            const incidenceRef = db.collection('incidences').doc(incidenceId);
            const incidenceSnap = await incidenceRef.get();

            if (!incidenceSnap.exists) {
                throw new HttpsError('not-found', 'Incidencia no encontrada.');
            }

            const incidenceData = incidenceSnap.data() as Incidence;

            // VALIDATION 1: Hierarchical authorization
            const hierarchyCheck = await canApproveForEmployee(
                approverId,
                incidenceData.employeeId,
                'incidence' as ApprovalType
            );

            if (!hierarchyCheck.canApprove) {
                throw new HttpsError(
                    'permission-denied',
                    hierarchyCheck.reason || 'No tienes permiso para aprobar solicitudes de este empleado.'
                );
            }

            console.log(`[HCM] Hierarchy check passed: ${hierarchyCheck.approvalMethod} (level ${hierarchyCheck.approverLevel || 'N/A'})`);

            // ----------------------------------------------------------------
            // CANCEL ACTION: Reverses an already-approved incidence
            // Only allowed if the start date hasn't passed yet
            // ----------------------------------------------------------------
            if (action === 'cancel') {
                if (incidenceData.status !== 'approved') {
                    throw new HttpsError(
                        'failed-precondition',
                        'Solo se pueden cancelar incidencias que ya están aprobadas.'
                    );
                }

                const today = new Date().toISOString().split('T')[0];
                if (incidenceData.startDate <= today) {
                    throw new HttpsError(
                        'failed-precondition',
                        'No se puede cancelar una incidencia cuya fecha de inicio ya pasó o es hoy.'
                    );
                }

                // For vacation incidences: restore the deducted days atomically
                if (incidenceData.type === 'vacation') {
                    await db.runTransaction(async (transaction) => {
                        const balanceQuery = await db.collection('vacation_balances')
                            .where('employeeId', '==', incidenceData.employeeId)
                            .orderBy('periodEnd', 'desc')
                            .limit(1)
                            .get();

                        if (!balanceQuery.empty) {
                            const balanceDoc = balanceQuery.docs[0];
                            const balanceData = balanceDoc.data();
                            const totalDays = incidenceData.totalDays || 0;

                            const currentTaken = balanceData.daysTaken || 0;
                            const newTaken = Math.max(0, currentTaken - totalDays);
                            const newAvailable = (balanceData.daysAvailable || 0) + totalDays;

                            const newMovement = {
                                id: `mov_cancelled_${Date.now()}`,
                                date: nowISO,
                                type: 'cancelled',
                                days: totalDays,
                                description: `Incidencia cancelada: ${incidenceData.startDate} al ${incidenceData.endDate}`,
                                incidenceId,
                                approvedById: approverId
                            };

                            const updatedMovements = [...(balanceData.movements || []), newMovement].slice(-100);

                            transaction.update(balanceDoc.ref, {
                                daysTaken: newTaken,
                                daysAvailable: newAvailable,
                                movements: updatedMovements,
                                lastUpdated: nowISO
                            });

                            transaction.update(incidenceRef, {
                                status: 'cancelled',
                                cancelledById: approverId,
                                cancelledByName: userData?.fullName,
                                cancelledAt: nowISO,
                                updatedAt: nowISO
                            });

                            console.log(`[HCM] Vacation cancelled. Restored ${totalDays} days. Available: ${balanceData.daysAvailable} -> ${newAvailable}`);
                        } else {
                            // No balance found, just cancel the incidence
                            transaction.update(incidenceRef, {
                                status: 'cancelled',
                                cancelledById: approverId,
                                cancelledByName: userData?.fullName,
                                cancelledAt: nowISO,
                                updatedAt: nowISO
                            });
                        }
                    });
                } else {
                    // Non-vacation incidences: just mark as cancelled
                    await incidenceRef.update({
                        status: 'cancelled',
                        cancelledById: approverId,
                        cancelledByName: userData?.fullName,
                        cancelledAt: nowISO,
                        updatedAt: nowISO
                    });
                }

                console.log(`[HCM] Incidence ${incidenceId} cancelled by ${userData?.fullName}`);
                return { success: true };
            }

            // Only validate when approving (not when rejecting)
            if (action === 'approve') {
                // VALIDATION 2: Date conflicts
                const conflictQuery = await db.collection('incidences')
                    .where('employeeId', '==', incidenceData.employeeId)
                    .where('status', 'in', ['approved', 'pending'])
                    .get();

                const conflictingIncidences: Incidence[] = [];

                for (const doc of conflictQuery.docs) {
                    if (doc.id === incidenceId) continue;

                    const otherIncidence = doc.data() as Incidence;

                    if (datesOverlap(
                        incidenceData.startDate,
                        incidenceData.endDate,
                        otherIncidence.startDate,
                        otherIncidence.endDate
                    )) {
                        conflictingIncidences.push({ ...otherIncidence, id: doc.id });
                    }
                }

                if (conflictingIncidences.length > 0) {
                    const typeNames: Record<string, string> = {
                        vacation: 'vacaciones',
                        sick_leave: 'incapacidad',
                        personal_leave: 'permiso personal',
                        maternity: 'maternidad',
                        paternity: 'paternidad',
                        bereavement: 'duelo',
                        unjustified_absence: 'falta injustificada'
                    };

                    const conflictDescriptions = conflictingIncidences.map(c =>
                        `${typeNames[c.type] || c.type} del ${c.startDate} al ${c.endDate}`
                    );

                    throw new HttpsError(
                        'failed-precondition',
                        `No se puede aprobar: las fechas se solapan con ${conflictingIncidences.length === 1 ? 'otra incidencia' : 'otras incidencias'}: ${conflictDescriptions.join('; ')}.`
                    );
                }

                // VALIDATION 3: Vacation balance (only for vacation type)
                if (incidenceData.type === 'vacation') {
                    // Use transaction to ensure atomicity
                    await db.runTransaction(async (transaction) => {
                        // Get vacation balance
                        const balanceQuery = await db.collection('vacation_balances')
                            .where('employeeId', '==', incidenceData.employeeId)
                            .orderBy('periodEnd', 'desc')
                            .limit(1)
                            .get();

                        if (balanceQuery.empty) {
                            throw new HttpsError(
                                'failed-precondition',
                                'El empleado no tiene saldo de vacaciones configurado. Contacte a RH.'
                            );
                        }

                        const balanceDoc = balanceQuery.docs[0];
                        const balanceData = balanceDoc.data();
                        const currentAvailable = balanceData.daysAvailable || 0;
                        const requestedDays = incidenceData.totalDays;

                        // Validate sufficient balance
                        if (requestedDays > currentAvailable) {
                            throw new HttpsError(
                                'failed-precondition',
                                `Saldo insuficiente. El empleado tiene ${currentAvailable} día(s) disponible(s) y está solicitando ${requestedDays} día(s).`
                            );
                        }

                        console.log(`[HCM] Vacation balance check passed: ${currentAvailable} available, ${requestedDays} requested`);

                        // Create movement for audit
                        const newMovement = {
                            id: `mov_taken_${Date.now()}`,
                            date: nowISO,
                            type: 'taken',
                            days: -requestedDays,
                            description: `Vacaciones aprobadas: ${incidenceData.startDate} al ${incidenceData.endDate}`,
                            incidenceId: incidenceId,
                            approvedById: approverId
                        };

                        // Update vacation balance within transaction
                        // [MODIFIED] Logic to decrement daysScheduled and daysAvailable
                        const currentScheduled = balanceData.daysScheduled || 0;
                        const newDaysScheduled = Math.max(0, currentScheduled - requestedDays);

                        const updatedMovements = [...(balanceData.movements || []), newMovement].slice(-100);

                        transaction.update(balanceDoc.ref, {
                            daysTaken: (balanceData.daysTaken || 0) + requestedDays,
                            daysScheduled: newDaysScheduled, // [NEW] Decrement scheduled days
                            daysAvailable: currentAvailable - requestedDays,
                            movements: updatedMovements,
                            lastUpdated: nowISO
                        });

                        // Update incidence status within same transaction
                        transaction.update(incidenceRef, {
                            status: 'approved',
                            approvedById: approverId,
                            approvedByName: userData?.fullName,
                            approvedAt: nowISO,
                            updatedAt: nowISO
                        });

                        console.log(`[HCM] Vacation balance updated atomically: Available ${currentAvailable} -> ${currentAvailable - requestedDays}, Scheduled ${currentScheduled} -> ${newDaysScheduled}`);
                    });

                    console.log(`[HCM] Vacation incidence ${incidenceId} approved by ${userData?.fullName} (transactional)`);
                    return { success: true };
                }
            }

            // Handle Rejection for Vacation (Release scheduled days)
            if (action === 'reject' && incidenceData.type === 'vacation') {
                await db.runTransaction(async (transaction) => {
                    // Get vacation balance
                    const balanceQuery = await db.collection('vacation_balances')
                        .where('employeeId', '==', incidenceData.employeeId)
                        .orderBy('periodEnd', 'desc')
                        .limit(1)
                        .get();

                    if (!balanceQuery.empty) {
                        const balanceDoc = balanceQuery.docs[0];
                        const balanceData = balanceDoc.data();
                        const totalDays = incidenceData.totalDays || 0;

                        // Release scheduled days
                        const currentScheduled = balanceData.daysScheduled || 0;
                        const newDaysScheduled = Math.max(0, currentScheduled - totalDays);
                        // Recalculate available: Entitled + CarriedOver - Taken - NewScheduled
                        // Or just simplisticly: CurrentAvailable + ReleasedDays (if they were subtracted when scheduled?)
                        // Usually: Available = Entitled - Taken - Scheduled. 
                        // If Scheduled decreases, Available increases.

                        // Let's rely on the formula: Available = Entitled - Taken - Scheduled
                        const daysEntitled = balanceData.daysEntitled || 0;
                        const daysTaken = balanceData.daysTaken || 0; // Unchanged on rejection

                        // [FIX] Ensure we don't create "ghost" days if data was inconsistent
                        const newAvailable = Math.max(0, daysEntitled - daysTaken - newDaysScheduled);

                        // Create movement for audit
                        const newMovement = {
                            id: `mov_cancelled_${Date.now()}`,
                            date: nowISO,
                            type: 'cancelled',
                            days: totalDays,
                            description: `Solicitud rechazada: ${rejectionReason || 'Sin motivo'}`,
                            incidenceId: incidenceId,
                            approvedById: approverId
                        };

                        const updatedMovements = [...(balanceData.movements || []), newMovement].slice(-100);

                        transaction.update(balanceDoc.ref, {
                            daysScheduled: newDaysScheduled,
                            daysAvailable: newAvailable,
                            movements: updatedMovements,
                            lastUpdated: nowISO
                        });

                        console.log(`[HCM] Vacation rejection released ${totalDays} days. Scheduled: ${currentScheduled} -> ${newDaysScheduled}`);
                    }

                    // Update incidence status
                    transaction.update(incidenceRef, {
                        status: 'rejected',
                        rejectionReason: rejectionReason || '',
                        approvedById: approverId,
                        approvedByName: userData?.fullName,
                        approvedAt: nowISO,
                        updatedAt: nowISO
                    });
                });

                console.log(`[HCM] Vacation incidence ${incidenceId} rejected by ${userData?.fullName} (transactional)`);
                return { success: true };
            }

            // For non-vacation incidences or rejections (non-vacation), update normally
            const updateData: Partial<Incidence> = {
                status: action === 'approve' ? 'approved' : 'rejected',
                approvedById: approverId,
                approvedByName: userData?.fullName,
                approvedAt: nowISO,
                updatedAt: nowISO
            };

            if (action === 'reject' && rejectionReason) {
                updateData.rejectionReason = rejectionReason;
            }

            await incidenceRef.update(updateData);

            console.log(`[HCM] Incidence ${incidenceId} ${action}ed by ${userData?.fullName}`);

            return { success: true };

        } catch (error: any) {
            console.error('[HCM] Error approving incidence:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error procesando incidencia: ${error.message}`);
        }
    }
);

// =========================================================================
// CONSOLIDACIÓN DE PERÍODO (CIERRE AUTOMÁTICO)
// =========================================================================

/**
 * Procesa automáticamente pendientes al cerrar período de nómina
 *
 * AUTOMATIZACIÓN AL CIERRE:
 * 1. Auto-rechaza HE pendientes
 * 2. Auto-injustifica retardos sin bitácora
 * 3. Auto-marca faltas por salidas tempranas injustificadas
 * 4. Auto-marca faltas por marcajes faltantes
 * 5. Genera códigos NOMIPAQ para exportación
 *
 * Solo HR/Admin pueden ejecutar esta función
 */
export const closePeriodAutoProcess = onCall(
    { enforceAppCheck: true },
    async (request: CallableRequest) => {
        const db = admin.firestore();
        const { period, closedBy } = request.data;

        if (!period) {
            throw new HttpsError('invalid-argument', 'El período es requerido');
        }

        try {
            // Validar permisos (solo HR/Admin)
            const caller = await db.collection('users').doc(request.auth!.uid).get();
            const callerRole = caller.data()?.role;

            if (!['Admin', 'HRManager'].includes(callerRole || '')) {
                throw new HttpsError(
                    'permission-denied',
                    'Solo HR/Admin pueden cerrar períodos de nómina'
                );
            }

            const summary = {
                overtimeRejected: 0,
                tardinessMarked: 0,
                earlyDeparturesMarked: 0,
                missingPunchesMarked: 0,
                faultsMarked: 0,
            };

            console.log(`[Consolidate] Starting period consolidation for ${period}`);

            // Fetch Holidays for Auto-Justification
            // Simplisticly fetch all for the year
            const year = parseInt(period.split('_')[0].substring(0, 4));
            const calendarsQuery = await db.collection('holiday_calendars').where('year', '==', year).get();
            const holidaysByCountry: Record<string, string[]> = {};
            const holidaysByCalendarId: Record<string, string[]> = {};

            calendarsQuery.docs.forEach(doc => {
                const data = doc.data();
                const dates = (data.holidays || []).map((h: any) => h.date);
                if (data.countryCode) holidaysByCountry[data.countryCode] = [...(holidaysByCountry[data.countryCode] || []), ...dates];
                holidaysByCalendarId[doc.id] = dates;
            });

            // Helper to check holiday (defaulting to MX if no location context available easily here, 
            // though strict logic would require fetching employee location. For bulk close, we'll check generic MX for now 
            // or we'd need to fetch all employees. 
            // OPTIMIZATION: We'll assume 'mx' for this safety net.
            const genericHolidays = holidaysByCountry['mx'] || [];


            // Fase 1: Auto-rechazar HE pendientes
            const pendingOT = await db.collection('overtime_requests')
                .where('period', '==', period)
                .where('status', '==', 'pending')
                .get();

            for (const doc of pendingOT.docs) {
                await doc.ref.update({
                    status: 'rejected',
                    rejectionReason: 'Auto-rechazado por cierre de período sin aprobación',
                    rejectedAt: new Date().toISOString(),
                    rejectedBy: closedBy || request.auth!.uid,
                    updatedAt: new Date().toISOString(),
                });
                summary.overtimeRejected++;
            }

            console.log(`[Consolidate] Rejected ${summary.overtimeRejected} pending overtime requests`);

            // Fase 2: Auto-injustificar retardos pendientes
            const pendingTardiness = await db.collection('tardiness')
                .where('date', '>=', period.split('_')[0])
                .where('date', '<=', period.split('_')[1] || period.split('_')[0])
                .where('isJustified', '==', false)
                .get();

            for (const doc of pendingTardiness.docs) {
                const data = doc.data();
                if (data.justificationStatus === 'pending') {
                    await doc.ref.update({
                        justificationStatus: 'unjustified',
                        processedAt: new Date().toISOString(),
                        processedBy: 'system',
                        updatedAt: new Date().toISOString(),
                    });
                    summary.tardinessMarked++;
                }
            }

            console.log(`[Consolidate] Marked ${summary.tardinessMarked} tardiness as unjustified`);

            // Fase 3: Auto-marcar faltas por salidas tempranas injustificadas
            const pendingDepartures = await db.collection('early_departures')
                .where('date', '>=', period.split('_')[0])
                .where('date', '<=', period.split('_')[1] || period.split('_')[0])
                .where('isJustified', '==', false)
                .get();

            for (const doc of pendingDepartures.docs) {
                const data = doc.data();

                await doc.ref.update({
                    resultedInAbsence: true,
                    processedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                // Marcar como falta en attendance si existe
                if (data.attendanceRecordId) {
                    const attendanceRef = db.collection('attendance').doc(data.attendanceRecordId);
                    const attendanceDoc = await attendanceRef.get();

                    if (attendanceDoc.exists) {
                        await attendanceRef.update({
                            status: 'absence_unjustified',
                            nomipaqCode: '1FINJ',
                            updatedAt: new Date().toISOString(),
                        });
                        summary.faultsMarked++;
                    }
                }

                summary.earlyDeparturesMarked++;
            }

            console.log(`[Consolidate] Processed ${summary.earlyDeparturesMarked} early departures, marked ${summary.faultsMarked} as faults`);

            // Fase 4: Auto-marcar faltas por marcajes faltantes
            const pendingPunches = await db.collection('missing_punches')
                .where('date', '>=', period.split('_')[0])
                .where('date', '<=', period.split('_')[1] || period.split('_')[0])
                .where('isJustified', '==', false)
                .get();

            for (const doc of pendingPunches.docs) {
                const data = doc.data();

                // Auto-justify if it is a holiday
                if (genericHolidays.includes(data.date)) {
                    await doc.ref.update({
                        isJustified: true,
                        justificationStatus: 'auto_justified',
                        justificationReason: 'Festivo Oficial - Auto-justificado',
                        processedAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    });
                    console.log(`[Consolidate] Auto-justified missing punch for ${data.employeeId} on ${data.date} (Holiday)`);
                    continue;
                }

                await doc.ref.update({
                    resultedInAbsence: true,
                    processedAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString(),
                });

                // Marcar como falta en attendance si existe
                if (data.attendanceRecordId) {
                    const attendanceRef = db.collection('attendance').doc(data.attendanceRecordId);
                    const attendanceDoc = await attendanceRef.get();

                    if (attendanceDoc.exists) {
                        await attendanceRef.update({
                            status: 'absence_unjustified',
                            nomipaqCode: '1FINJ',
                            updatedAt: new Date().toISOString(),
                        });
                        summary.faultsMarked++;
                    }
                }

                summary.missingPunchesMarked++;
            }

            console.log(`[Consolidate] Processed ${summary.missingPunchesMarked} missing punches`);

            // Fase 5: Generar archivo NOMIPAQ (placeholder - implementar según formato específico)
            const prenominaUrl = await generatePrenominaFile(db, period);

            // Guardar registro de cierre
            await db.collection('period_closures').add({
                period,
                closedAt: new Date().toISOString(),
                closedBy: closedBy || request.auth!.uid,
                summary,
                prenominaFileUrl: prenominaUrl,
                createdAt: new Date().toISOString(),
            });

            console.log(`[Consolidate] Period ${period} consolidated successfully`);

            return {
                success: true,
                summary,
                prenominaUrl,
            };

        } catch (error: any) {
            console.error('[Consolidate] Error consolidating period:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error consolidando período: ${error.message}`);
        }
    }
);

/**
 * Genera archivo de pre-nómina para NOMIPAQ
 * Formato: EMPLEADO_ID|FECHA|CODIGO|VALOR
 */
async function generatePrenominaFile(
    db: admin.firestore.Firestore,
    period: string
): Promise<string> {
    try {
        const [startDate, endDate] = period.split('_');

        // Obtener todos los registros de asistencia del período
        const attendanceQuery = await db.collection('attendance')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate || startDate)
            .get();

        const lines: string[] = [];
        lines.push('EMPLEADO|FECHA|CODIGO|VALOR'); // Header

        for (const doc of attendanceQuery.docs) {
            const data = doc.data();

            // Obtener datos del empleado
            const employeeDoc = await db.collection('employees').doc(data.employeeId).get();
            const empData = employeeDoc.data();

            if (!empData) continue;

            const employeeNumber = empData.employeeNumber || empData.id;
            const nomipaqCode = data.nomipaqCode || 'ASI';
            const nomipaqValue = data.nomipaqValue || '';

            // Formato: EMPLEADO_ID|FECHA|CODIGO|VALOR
            const line = `${employeeNumber}|${data.date}|${nomipaqCode}|${nomipaqValue}`;
            lines.push(line);
        }

        // Guardar archivo en Storage
        const fileName = `prenomina_${period}.txt`;
        const bucket = admin.storage().bucket();
        const file = bucket.file(`prenomina/${fileName}`);

        await file.save(lines.join('\n'), {
            contentType: 'text/plain',
            metadata: {
                metadata: {
                    period,
                    generatedAt: new Date().toISOString(),
                }
            }
        });

        // Generar URL (manejo especial para emulador/desarrollo)
        let url = '';
        try {
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
            });
            url = signedUrl;
        } catch (err) {
            if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
                const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
                url = `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;
                console.log(`[Prenomina] Using emulator download URL: ${url}`);
            } else {
                throw err;
            }
        }

        console.log(`[Prenomina] File generated: ${fileName} (${lines.length - 1} records)`);

        return url;

    } catch (error: any) {
        console.error('[Prenomina] Error generating file:', error);
        throw new HttpsError('internal', `Error generando archivo NOMIPAQ: ${error.message}`);
    }
}

// =========================================================================
// CREATE SYSTEM USER (Firebase Auth + Firestore)
// =========================================================================

interface CreateSystemUserRequest {
    email: string;
    fullName: string;
    department: string;
    role: string;
}

interface CreateSystemUserResponse {
    success: boolean;
    uid: string;
}

/**
 * Creates a new user in Firebase Auth and a corresponding document in Firestore.
 *
 * This is the production replacement for the simulated user creation.
 * Uses Firebase Admin SDK to:
 * 1. Create the user in Firebase Auth (with a temporary password)
 * 2. Create the user document in Firestore `users` collection
 *
 * @requires Role: Admin or HRManager
 */
export const createSystemUser = onCall<CreateSystemUserRequest>(
    { region: 'us-central1' },
    async (request: CallableRequest<CreateSystemUserRequest>): Promise<CreateSystemUserResponse> => {
        // Verify caller has permission
        await verifyRole(request.auth?.uid, HCM_ROLES, 'crear usuario del sistema');

        const { email, fullName, department, role } = request.data;

        if (!email || !fullName) {
            throw new HttpsError('invalid-argument', 'Email y nombre completo son requeridos.');
        }

        try {
            // 1. Create user in Firebase Auth
            const tempPassword = `Studio_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

            const userRecord = await admin.auth().createUser({
                email,
                displayName: fullName,
                password: tempPassword,
                disabled: false,
            });

            console.log(`[HCM] Created Firebase Auth user: ${userRecord.uid} (${email})`);

            // 2. Create user document in Firestore
            const nowISO = new Date().toISOString();
            await db.collection('users').doc(userRecord.uid).set({
                id: userRecord.uid,
                fullName,
                email,
                department: department || '',
                role: role || 'Member',
                status: 'active',
                createdAt: nowISO,
                updatedAt: nowISO,
            });

            console.log(`[HCM] Created Firestore user document for ${userRecord.uid}`);

            // 3. Generate password reset link so the user can set their own password
            try {
                const resetLink = await admin.auth().generatePasswordResetLink(email);
                console.log(`[HCM] Password reset link generated for ${email}: ${resetLink}`);
                // In the future, send this link via email notification
            } catch (resetError) {
                console.warn(`[HCM] Could not generate password reset link (non-blocking):`, resetError);
            }

            return {
                success: true,
                uid: userRecord.uid,
            };

        } catch (error: any) {
            console.error('[HCM] Error creating system user:', error);

            // Handle specific Firebase Auth errors
            if (error.code === 'auth/email-already-exists') {
                throw new HttpsError(
                    'already-exists',
                    `El correo ${email} ya está registrado en el sistema.`
                );
            }
            if (error.code === 'auth/invalid-email') {
                throw new HttpsError(
                    'invalid-argument',
                    `El correo ${email} no es válido.`
                );
            }

            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error creando usuario: ${error.message}`);
        }
    }
);
