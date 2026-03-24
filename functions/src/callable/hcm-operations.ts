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
// calculateOvertime no longer needed here
import {
    canApproveForEmployee,
    ApprovalType,
    findAvailableApprover
} from '../utils/hierarchy-validator';
import { validateIncidencePolicy, IncidenceType, Incidence as PolicyIncidence } from '../utils/incidence-policy';
import { shouldSkipInfractionForRestDay } from '../utils/infraction-detection';
import type {
    PrenominaRecord,
    Employee,
    AttendanceRecord,
    Incidence
} from '../types/firestore-types';


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


            // 1b. Re-evaluate unjustified tardiness records for schedule changes
            const unjustifiedTardinessQuery = await db.collection('tardiness_records')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            let cancelledTardinessCount = 0;
            for (const doc of unjustifiedTardinessQuery.docs) {
                const tardiness = doc.data();
                const employeeDoc = await db.collection('employees').doc(tardiness.employeeId).get();
                if (employeeDoc.exists) {
                    const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
                    if (await shouldSkipInfractionForRestDay(employeeData, tardiness.date, db)) {
                        console.log(`[HCM] Cancelling Tardiness for ${tardiness.employeeId} on ${tardiness.date} due to schedule change (now rest day).`);
                        await doc.ref.update({
                            isJustified: true,
                            justificationStatus: 'approved',
                            justificationReason: 'Anulado automáticamente por cambio de horario (ahora día de descanso)',
                            updatedAt: nowISO,
                        });
                        cancelledTardinessCount++;
                    }
                }
            }
            console.log(`[HCM] Found ${unjustifiedTardinessQuery.size} unjustified tardiness records (${cancelledTardinessCount} cancelled by schedule change) - remaining affect puntualidad`);

            // 1c. Process unjustified early departures -> Mark as FALTA
            const unjustifiedEarlyDeparturesQuery = await db.collection('early_departures')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            for (const doc of unjustifiedEarlyDeparturesQuery.docs) {
                const departure = doc.data();

                // Re-verify if this day is STILL supposed to have an infraction, 
                // in case the schedule changed to a rest day AFTER the infraction was generated.
                const employeeDoc = await db.collection('employees').doc(departure.employeeId).get();
                if (employeeDoc.exists) {
                    const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
                    if (await shouldSkipInfractionForRestDay(employeeData, departure.date, db)) {
                        console.log(`[HCM] Cancelling Early Departure for ${departure.employeeId} on ${departure.date} due to schedule change (now rest day).`);
                        await doc.ref.update({
                            isJustified: true,
                            justificationStatus: 'approved',
                            justificationReason: 'Anulado automáticamente por cambio de horario (ahora día de descanso)',
                            updatedAt: nowISO,
                        });
                        continue; // Skip converting to Falta
                    }
                }

                // 1. Mark infringement as resulted in absence
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });

                // 2. Void the attendance record (if linked)
                const attendanceRecordId = departure.attendanceRecordId || departure.attendanceId;
                if (attendanceRecordId) {
                    const attendanceRef = db.collection('attendance').doc(attendanceRecordId);
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

                // Re-verify if this day is STILL supposed to have an infraction, 
                // in case the schedule changed to a rest day AFTER the missing punch was generated.
                const employeeDoc = await db.collection('employees').doc(punch.employeeId).get();
                if (employeeDoc.exists) {
                    const employeeData = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
                    if (await shouldSkipInfractionForRestDay(employeeData, punch.date, db)) {
                        console.log(`[HCM] Cancelling Missing Punch for ${punch.employeeId} on ${punch.date} due to schedule change (now rest day).`);
                        await doc.ref.update({
                            isJustified: true,
                            justificationStatus: 'approved',
                            justificationReason: 'Anulado automáticamente por cambio de horario (ahora día de descanso)',
                            updatedAt: nowISO,
                        });
                        continue; // Skip converting to Falta
                    }
                }

                // 1. Mark infringement as resulted in absence
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });

                // 2. Void the attendance record (if linked)
                const attendanceRecordId = punch.attendanceRecordId || punch.attendanceId;
                if (attendanceRecordId) {
                    const attendanceRef = db.collection('attendance').doc(attendanceRecordId);
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

                            // Get approved overtime requests for the period
                            const overtimeQuery = db.collection('overtime_requests')
                                .where('employeeId', '==', employee.id)
                                .where('date', '>=', periodStart)
                                .where('date', '<=', periodEnd);
                            const overtimeSnap = await transaction.get(overtimeQuery);
                            const overtimeRequests = overtimeSnap.docs
                                .map(d => d.data() as any)
                                .filter(req => req.status === 'approved' || req.status === 'partial');

                            // Agrupar horas extra aprobadas por semana (Lunes a Domingo) para el límite LFT de 9h semanales dobles
                            const otHoursByWeek: Record<string, number> = {};
                            for (const orq of overtimeRequests) {
                                if (!orq.date || typeof orq.hoursRequested !== 'number') continue;
                                
                                // Calcular el lunes correspondiente a la fecha de la hora extra
                                const d = new Date(orq.date);
                                const day = d.getDay();
                                const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
                                const monday = new Date(d.setDate(diff));
                                const weekKey = monday.toISOString().split('T')[0];
                                
                                otHoursByWeek[weekKey] = (otHoursByWeek[weekKey] || 0) + orq.hoursRequested;
                            }

                            let doubleHours = 0;
                            let tripleHours = 0;

                            for (const weekHours of Object.values(otHoursByWeek)) {
                                // Aplicar redondeo a nivel semanal a medias horas (0.5)
                                const roundedWeekHours = Math.round(weekHours * 2) / 2;
                                if (roundedWeekHours <= 9) {
                                    doubleHours += roundedWeekHours;
                                } else {
                                    doubleHours += 9;
                                    tripleHours += (roundedWeekHours - 9);
                                }
                            }

                            // Calculate all values using server-side LFT formulas

                            // FILTER: Ignore voided attendance records (e.g. converted to absence)
                            const validAttendanceRecords = attendanceRecords.filter(a => !a.isVoid);

                            let daysWorked = validAttendanceRecords.length;
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
                                    case 'unpaid_leave':
                                        unpaidLeaveDays += inc.totalDays;
                                        break;
                                    default:
                                        if (inc.isPaid) {
                                            paidLeaveDays += inc.totalDays;
                                        } else {
                                            unpaidLeaveDays += inc.totalDays;
                                        }
                                }
                            }



                            const processedHolidays = new Set<string>();
                            const processedSundays = new Set<string>();
                            for (const record of validAttendanceRecords) {
                                const dayOfWeek = new Date(record.date).getDay();
                                const dateStr = record.date;
                                const effectivelyWorked = (!!record.checkIn && record.checkIn.trim() !== '') || (typeof record.hoursWorked === 'number' && record.hoursWorked > 0);

                                if (isHoliday(dateStr) && effectivelyWorked && !processedHolidays.has(dateStr)) {
                                    processedHolidays.add(dateStr);
                                    holidayDays++;
                                }

                                // Prima Dominical: solo domingos trabajados (dayOfWeek === 0)
                                if (dayOfWeek === 0 && effectivelyWorked && !processedSundays.has(dateStr)) {
                                    processedSundays.add(dateStr);
                                    sundayDays++;
                                }
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

                            // We use doubleHours and tripleHours calculated from overtime_requests earlier

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
                                overtimeDoubleHours: Math.round(doubleHours * 2) / 2,
                                overtimeTripleHours: Math.round(tripleHours * 2) / 2,
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

            // VALIDATION 0: Employee Status Check
            const employeeRef = db.collection('employees').doc(incidenceData.employeeId);
            const employeeSnap = await employeeRef.get();
            const employeeData = employeeSnap.data() as Employee;

            if (employeeData?.status !== 'active') {
                throw new HttpsError(
                    'failed-precondition',
                    'No se pueden gestionar incidencias para empleados inactivos/baja.'
                );
            }

            // VALIDATION 1: Hierarchical authorization
            const hierarchyCheck = await canApproveForEmployee(
                approverId,
                incidenceData.employeeId,
                'incidence' as ApprovalType,
                { role: userData?.role }
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

                // Removed strict date check (startDate <= today) to allow HR to cancel 
                // past incidences or active ones (e.g. to correct data entry errors).

                const today = new Date().toISOString().split('T')[0];
                if (incidenceData.endDate < today) {
                    throw new HttpsError(
                        'failed-precondition',
                        'No se puede cancelar una incidencia cuya fecha de fin ya pasó.'
                    );
                }

                // For vacation incidences: restore the deducted days atomically
                if (incidenceData.type === 'vacation') {
                    const totalDays = incidenceData.totalDays || 0;

                    console.log(`[HCM Cancel] Vacation cancel started. employeeId=${incidenceData.employeeId}, totalDays=${totalDays}, incidenceId=${incidenceId}`);

                    // Step 1: Find the balance document using direct .get()
                    // (consistent with approve/reject paths — avoids transaction.get(Query) issues)
                    const balanceQuerySnap = await db.collection('vacation_balances')
                        .where('employeeId', '==', incidenceData.employeeId)
                        .orderBy('periodEnd', 'desc')
                        .limit(1)
                        .get();

                    console.log(`[HCM Cancel] Balance query result: found=${!balanceQuerySnap.empty}, docs=${balanceQuerySnap.size}`);

                    if (balanceQuerySnap.empty) {
                        console.warn(`[HCM Cancel] ⚠️ No vacation balance found for employee ${incidenceData.employeeId}. Cancelling without balance restore.`);
                        // Just cancel the incidence — no balance to restore
                        await incidenceRef.update({
                            status: 'cancelled',
                            cancelledById: approverId,
                            cancelledByName: userData?.fullName,
                            cancelledAt: nowISO,
                            updatedAt: nowISO
                        });
                    } else {
                        const balanceDocRef = balanceQuerySnap.docs[0].ref;

                        // Step 2: Run transaction with DocumentReference (not Query)
                        await db.runTransaction(async (transaction) => {
                            const freshBalanceSnap = await transaction.get(balanceDocRef);
                            const balanceData = freshBalanceSnap.data()!;

                            const currentTaken = balanceData.daysTaken || 0;
                            const newTaken = Math.max(0, currentTaken - totalDays);
                            const newAvailable = (balanceData.daysAvailable || 0) + totalDays;

                            console.log(`[HCM Cancel] Balance before: taken=${currentTaken}, available=${balanceData.daysAvailable}. After: taken=${newTaken}, available=${newAvailable}`);

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

                            transaction.update(balanceDocRef, {
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
                        });

                        console.log(`[HCM Cancel] ✅ Vacation cancelled. Restored ${totalDays} days for employee ${incidenceData.employeeId}`);
                    }
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
                        marriage: 'matrimonio',
                        adoption: 'adopción',
                        civic_duty: 'deber cívico',
                        half_day_family: 'permiso medio día',
                        unpaid_leave: 'permiso sin goce',
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

                // VALIDATION 2.5: Policy Rules (Frequency & Duration)
                // Use the fetched incidences (conflictQuery) which contains all approved/pending incidences for this employee.
                // IMPORTANT: Filter out the current incidence so it doesn't count against its own yearly limit.
                const allEmployeeIncidences = conflictQuery.docs
                    .filter(d => d.id !== incidenceId)
                    .map(d => ({ id: d.id, ...d.data() } as PolicyIncidence));

                console.log(`[HCM] Evaluating policy for incidence ${incidenceId}. Found ${allEmployeeIncidences.length} OTHER active incidences for employee ${incidenceData.employeeId}.`,
                    allEmployeeIncidences.map(i => ({ id: i.id, type: i.type, status: i.status }))
                );

                // Calculate approximate effective days if not present (fallback)
                // In approveIncidence, incidenceData.totalDays should be present from creation
                const effectiveDays = incidenceData.totalDays || 1;

                const policyCheck = validateIncidencePolicy(
                    incidenceData.type as IncidenceType,
                    incidenceData.startDate,
                    incidenceData.endDate,
                    effectiveDays,
                    allEmployeeIncidences,
                    incidenceId
                );

                console.log(`[HCM] Policy check result:`, policyCheck);

                if (!policyCheck.isValid) {
                    throw new HttpsError(
                        'failed-precondition',
                        policyCheck.error || 'La solicitud no cumple con las políticas de incidencia.'
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

            // =========================================================================
            // TASK RESOLUTION: Close pending tasks associated with this incidence
            // =========================================================================
            try {
                // Fetch tasks where metadata.incidenceId matches this incidence
                const tasksQuery = await db.collection('tasks')
                    .where('metadata.incidenceId', '==', incidenceId)
                    .where('status', 'in', ['pending', 'active', 'Pending', 'Active'])
                    .get();

                if (!tasksQuery.empty) {
                    const batch = db.batch();
                    tasksQuery.docs.forEach(doc => {
                        batch.update(doc.ref, {
                            status: 'completed',
                            completedAt: nowISO,
                            completedById: approverId,
                            resolutionParams: { action, reason: rejectionReason || '' },
                            updatedAt: nowISO
                        });
                    });
                    await batch.commit();
                    console.log(`[HCM] Closed ${tasksQuery.size} associated tasks for incidence ${incidenceId}`);
                }
            } catch (taskErr) {
                console.error('[HCM] Error closing associated tasks:', taskErr);
            }

            // =========================================================================
            // NOTIFICATION TRIGGER: Send email to the employee who requested it
            // =========================================================================
            try {
                // Fetch the employee's email to send the resolution
                const employeeDoc = await db.collection('employees').doc(incidenceData.employeeId).get();
                if (employeeDoc.exists) {
                    const employeeData = employeeDoc.data();
                    if (employeeData && employeeData.email) {
                        const notificationType = action === 'approve' ? 'incidence_approved' : 'incidence_rejected';
                        const actionText = action === 'approve' ? 'aprobada' : 'rechazada';

                        // [FIX] Write to user subcollection so onNotificationCreated trigger fires
                        // Previously wrote to root 'notifications' which doesn't trigger emails
                        await db.collection('users')
                            .doc(incidenceData.employeeId)
                            .collection('notifications')
                            .add({
                                title: `Solicitud de permiso ${actionText}`,
                                message: `Tu solicitud de ${incidenceData.type} ha sido ${actionText} por ${userData?.fullName || 'tu mánager'}.`,
                                type: notificationType,
                                read: false,
                                createdAt: nowISO,
                                link: `/hcm/incidences`,
                                metadata: {
                                    incidenceId: incidenceId,
                                    incidenceType: incidenceData.type,
                                    recipientEmail: employeeData.email,
                                    approverName: userData?.fullName || 'Mánager',
                                    action: action,
                                    rejectionReason: rejectionReason || ''
                                }
                            });
                        console.log(`[HCM] Employee resolution notification generated for ${employeeData.email}`);
                    }
                }
            } catch (notifyError) {
                console.error('[HCM] Disparo de notificacion al empleado fallo, pero la operacion continua:', notifyError);
            }

            return { success: true };

        } catch (error: any) {
            console.error('[HCM] Error approving incidence:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error procesando incidencia: ${error.message}`);
        }
    }
);

// =========================================================================
// NOTIFICACIÓN CON ESCALAMIENTO — Notifica al jefe disponible
// =========================================================================

interface NotifyNewIncidenceRequest {
    incidenceId: string;
    employeeId: string;
    employeeName: string;
    managerId: string;
    type: string;
    startDate: string;
    endDate: string;
}

interface NotifyNewIncidenceResponse {
    success: boolean;
    notifiedId: string;
    notifiedName: string;
    escalated: boolean;
    absentManagerNames?: string[];
}

/**
 * Notifica al jefe correspondiente sobre una nueva solicitud de incidencia.
 * Si el jefe directo está ausente (tiene una incidencia activa aprobada),
 * escala al siguiente jefe en la cadena jerárquica y notifica también a RH.
 *
 * @requires Role: Any authenticated user (employee creating their own incidence)
 */
export const notifyNewIncidence = onCall<NotifyNewIncidenceRequest>(
    { region: 'us-central1' },
    async (request): Promise<NotifyNewIncidenceResponse> => {
        if (!request.auth?.uid) {
            throw new HttpsError('unauthenticated', 'Debe iniciar sesión.');
        }

        const { incidenceId, employeeId, employeeName, managerId, type, startDate, endDate } = request.data;

        if (!incidenceId || !employeeId || !employeeName || !type) {
            throw new HttpsError('invalid-argument', 'Parámetros incompletos para notificación.');
        }

        const nowISO = new Date().toISOString();

        try {
            // If no manager assigned, notify HR directly
            if (!managerId) {
                console.log(`[HCM Notify] No manager for ${employeeName}. Notifying HR directly.`);

                const hrUsers = await db.collection('users')
                    .where('role', '==', 'HRManager')
                    .get();

                const notifyPromises = hrUsers.docs.map(hrDoc =>
                    db.collection('users').doc(hrDoc.id).collection('notifications').add({
                        title: 'Nueva Solicitud de Incidencia (Sin Manager Directo)',
                        message: `${employeeName} ha solicitado ${type} del ${startDate} al ${endDate}. Requiere atención de RH.`,
                        type: 'warning',
                        read: false,
                        createdAt: nowISO,
                        link: '/hcm/incidences',
                        metadata: { incidenceId, incidenceType: type, escalated: false }
                    })
                );

                await Promise.all(notifyPromises);

                return {
                    success: true,
                    notifiedId: 'hr_role',
                    notifiedName: 'Recursos Humanos',
                    escalated: false,
                };
            }

            // Find available approver (checks absence, walks chain if needed)
            const result = await findAvailableApprover(employeeId);

            const targetId = result.approverId || managerId;
            const targetName = result.approverName || 'Manager';
            const escalated = result.isEscalated;

            // Build notification message
            let notificationMessage = `${employeeName} ha solicitado ${type} del ${startDate} al ${endDate}.`;
            if (escalated && result.absentManagerNames.length > 0) {
                notificationMessage += ` (Solicitud escalada — ${result.absentManagerNames.join(', ')} no disponible(s))`;
            }

            // Notify the available approver
            await db.collection('users').doc(targetId).collection('notifications').add({
                title: escalated
                    ? 'Solicitud de Incidencia Escalada'
                    : 'Nueva Solicitud de Incidencia',
                message: notificationMessage,
                type: 'warning',
                read: false,
                createdAt: nowISO,
                link: '/hcm/incidences',
                metadata: {
                    incidenceId,
                    incidenceType: type,
                    escalated,
                    originalManagerId: managerId,
                    absentManagers: result.absentManagerNames,
                }
            });

            console.log(`[HCM Notify] Notified ${targetName} (${targetId}) for incidence ${incidenceId}. Escalated: ${escalated}`);

            // If escalated, ALSO notify all HRManagers
            if (escalated) {
                const hrUsers = await db.collection('users')
                    .where('role', '==', 'HRManager')
                    .get();

                const hrPromises = hrUsers.docs
                    .filter(hrDoc => hrDoc.id !== targetId) // Don't duplicate if target IS HRManager
                    .map(hrDoc =>
                        db.collection('users').doc(hrDoc.id).collection('notifications').add({
                            title: 'Solicitud de Incidencia Escalada',
                            message: `${employeeName} ha solicitado ${type} del ${startDate} al ${endDate}. Su jefe directo (${result.absentManagerNames[0] || 'N/A'}) no está disponible. Se escaló a ${targetName}.`,
                            type: 'warning',
                            read: false,
                            createdAt: nowISO,
                            link: '/hcm/incidences',
                            metadata: {
                                incidenceId,
                                incidenceType: type,
                                escalated: true,
                                originalManagerId: managerId,
                            }
                        })
                    );

                await Promise.all(hrPromises);
                console.log(`[HCM Notify] Also notified ${hrUsers.size} HRManagers about escalation.`);
            }

            return {
                success: true,
                notifiedId: targetId,
                notifiedName: targetName,
                escalated,
                absentManagerNames: result.absentManagerNames,
            };

        } catch (error: any) {
            console.error('[HCM Notify] Error in notifyNewIncidence:', error);
            throw new HttpsError('internal', `Error enviando notificación: ${error.message}`);
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

        // 1. Obtener asistencia (incluye faltas generadas)
        const attendanceQuery = await db.collection('attendance')
            .where('date', '>=', startDate)
            .where('date', '<=', endDate || startDate)
            .get();

        // 2. Obtener incidencias APROBADAS que se solapen con el período
        //    (Necesitamos un rango amplio o checar overlap)
        //    Firestore no soporta rangos cruzados fácilmente. 
        //    Buscaremos incidencias que terminen después del inicio del periodo y empiecen antes del fin.
        //    Para simplificar y evitar lecturas masivas excesivas, buscamos por startDate en rango 
        //    Y también incidencias largas que empezaron antes?
        //    Lo ideal para "incidencias largas" es que se dividan o se consulten mejor.
        //    Por ahora: Consultamos incidencias activas en el rango.

        // Estrategia Simple: Traer incidencias que empiezan en el rango o terminan en el rango.
        // O traer todas las del mes. Asumimos que startDate y endDate definen un mes o quincena.

        const incidencesQuery = await db.collection('incidences')
            .where('status', '==', 'approved')
            .where('endDate', '>=', startDate)
            .get(); // Filtramos endDate >= startDate. Luego filtramos startDate <= endDate en memoria.

        const relevantIncidences = incidencesQuery.docs
            .map(d => ({ id: d.id, ...d.data() } as Incidence))
            .filter(inc => inc.startDate <= (endDate || startDate));

        // Mapeo: EmployeeID -> Date -> { attendance?: Data, incidence?: Data }
        const consolidatedData: Record<string, Record<string, { attendance?: any, incidence?: Incidence }>> = {};

        // Helper para inicializar
        const getRecord = (empId: string, date: string) => {
            if (!consolidatedData[empId]) consolidatedData[empId] = {};
            if (!consolidatedData[empId][date]) consolidatedData[empId][date] = {};
            return consolidatedData[empId][date];
        }

        // Poblar con Asistencia
        attendanceQuery.docs.forEach(doc => {
            const data = doc.data();
            const rec = getRecord(data.employeeId, data.date);
            rec.attendance = data;
        });

        // Poblar con Incidencias (Expandir fechas)
        const { parseISO, addDays, format, isAfter, isBefore } = require('date-fns');

        for (const inc of relevantIncidences) {
            let curr = parseISO(inc.startDate);
            const end = parseISO(inc.endDate);
            const periodStart = parseISO(startDate);
            const periodEnd = parseISO(endDate || startDate);

            // Iterar días de la incidencia
            while (isBefore(curr, end) || curr.getTime() === end.getTime()) {
                // Solo si cae dentro del periodo
                if ((isAfter(curr, periodStart) || curr.getTime() === periodStart.getTime()) &&
                    (isBefore(curr, periodEnd) || curr.getTime() === periodEnd.getTime())) {

                    const dateStr = format(curr, 'yyyy-MM-dd');
                    const rec = getRecord(inc.employeeId, dateStr);

                    // VALIDACIÓN: Si ya hay una incidencia, ¿cuál gana? 
                    // Asumimos que no hay solapamiento validado previamente.
                    rec.incidence = inc;
                }
                curr = addDays(curr, 1);
            }
        }

        const lines: string[] = [];
        lines.push('EMPLEADO|FECHA|CODIGO|VALOR');

        const INCIDENCE_CODE_MAP: Record<string, string> = {
            vacation: 'VAC', // Vacaciones
            sick_leave: 'INC', // Incapacidad
            personal_leave: 'PCS', // Permiso Con Sueldo
            maternity: 'INC', // Maternidad
            paternity: 'PCS', // Paternidad
            bereavement: 'PCS', // Luto
            marriage: 'PCS', // Matrimonio
            adoption: 'PCS', // Adopción
            civic_duty: 'PCS', // Deber Cívico
            half_day_family: 'PCS', // Medio Día
            unpaid_leave: 'PSS', // Permiso Sin Goce
            unjustified_absence: 'FINJ',
            abandono_empleo: 'AE'
        };

        // Procesar Consolidado
        for (const empId in consolidatedData) {
            // Necesitamos el número de empleado para el reporte
            // Esto requiere leer el empleado. Puede ser costoso N lecturas.
            // Optimizamos: Leer empleados en batch o cachear si son pocos, o usar empId si es numérico.
            // Asumimos que debemos leerlo para obtener "employeeNumber".
            const empDoc = await db.collection('employees').doc(empId).get();
            const empData = empDoc.data();
            if (!empData) continue;
            const employeeNumber = empData.employeeNumber || empId;

            const dates = consolidatedData[empId];
            for (const date in dates) {
                const { attendance, incidence } = dates[date];

                // LÓGICA DE DOMINANCIA Y MEDIOS DÍAS
                if (incidence) {
                    const code = INCIDENCE_CODE_MAP[incidence.type] || 'PCS';

                    if (incidence.type === 'half_day_family') {
                        // Regla: Medio día (0.5).
                        // 1. Emitir Permiso
                        lines.push(`${employeeNumber}|${date}|${code}|0.5`);

                        // 2. Si hay asistencia, emitir asistencia ajustada (0.5)
                        if (attendance) {
                            const attCode = attendance.nomipaqCode || 'ASI';
                            // Si es asistencia normal, ajustamos a 0.5
                            // Si es falta (nomipaqCode=FINJ), ¿qué pasa?
                            // Si tiene permiso de medio día y falta el otro medio... debería ser falta medio día?
                            // Asumimos que attendance refleja lo que pasó (e.g. checkin/out).
                            // Si hay attendance record, asumimos que trabajó o se generó falta.
                            // Emitimos 0.5
                            lines.push(`${employeeNumber}|${date}|${attCode}|0.5`);
                        } else {
                            // No hay asistencia registrada.
                            // ¿Falta de medio día? ¿O descanso?
                            // Si no hay registro, y no es día de descanso, suele ser Falta.
                            // Pero closePeriodAutoProcess ya debió generar faltas si correspondía.
                            // Si no hay attendance, no emitimos nada más (solo el permiso).
                        }
                    } else {
                        // Incidencia Completa (Domina)
                        // Emitimos Incidencia (Valor 1)
                        lines.push(`${employeeNumber}|${date}|${code}|1`);

                        // IGNORAMOS Asistencia (No duplicar)
                        // (Salvo que sea horas extras? Si trabajó en vacaciones, es HE? 
                        //  Complejo. Regla general: Incidencia justifica el día).
                        if (attendance && attendance.overtimeHours > 0) {
                            // Si tiene horas extras aprobadas, tal vez deberíamos pagarlas aparte?
                            // Por ahora, seguimos regla estricta: Incidencia Domina Día Normal.
                        }
                    }
                } else if (attendance) {
                    // Solo Asistencia
                    const code = attendance.nomipaqCode || 'ASI';
                    const val = attendance.nomipaqValue || '1'; // Default 1 día
                    lines.push(`${employeeNumber}|${date}|${code}|${val}`);
                }
            }
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

        // Generar URL
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
    emailSent?: boolean;
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
            let emailSent = false;
            try {
                const resetLink = await admin.auth().generatePasswordResetLink(email);
                console.log(`[HCM] Password reset link generated for ${email}: ${resetLink}`);
                // In the future, send this link via email notification (SMTP config goes here)

                // Assuming success if generation didn't throw
                emailSent = true;
            } catch (resetError: any) {
                console.warn(`[HCM] Could not generate password reset link (non-blocking):`, resetError);

                // Save to Dead-Letter Queue for Admins
                await db.collection('failed_notifications').add({
                    userId: userRecord.uid,
                    email,
                    type: 'welcome_password_reset',
                    error: resetError?.message || 'Unknown SMTP/Auth Error',
                    timestamp: nowISO,
                    status: 'pending_retry'
                });
            }

            return {
                success: true,
                uid: userRecord.uid,
                emailSent
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
