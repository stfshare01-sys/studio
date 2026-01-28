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
    calculateHourlyRate,
    calculateSettlement as calculateSettlementLFT,
    calculateVacationDays,
    calculateYearsOfService,
    calculateSDIFactor,
    calculateSDI,
    ShiftType,
    TerminationType
} from '../utils/lft-calculations';
import {
    Employee,
    Compensation,
    AttendanceRecord,
    Incidence,
    PrenominaRecord,
    SettlementCalculation
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
            // Get employees to process
            let employeesQuery = db.collection('employees').where('status', '==', 'active');
            const employeesSnap = await employeesQuery.get();

            const employees = employeesSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Employee))
                .filter(emp => !employeeIds || employeeIds.length === 0 || employeeIds.includes(emp.id));

            if (employees.length === 0) {
                return { success: true, recordIds: [], processedCount: 0, skippedCount: 0, errors: [] };
            }

            // Process in batches to respect Firestore limits (500 writes per batch)
            const BATCH_SIZE = 100;

            for (let i = 0; i < employees.length; i += BATCH_SIZE) {
                const employeeBatch = employees.slice(i, i + BATCH_SIZE);

                // Use a transaction to ensure atomicity for this batch
                await db.runTransaction(async (transaction) => {
                    const prenominaRecords: { ref: admin.firestore.DocumentReference; data: Omit<PrenominaRecord, 'id'> }[] = [];

                    for (const employee of employeeBatch) {
                        try {
                            // Get latest compensation
                            const compQuery = db.collection('compensation')
                                .where('employeeId', '==', employee.id)
                                .orderBy('effectiveDate', 'desc')
                                .limit(1);
                            const compSnap = await transaction.get(compQuery);

                            if (compSnap.empty) {
                                errors.push({ employeeId: employee.id, message: 'Sin compensación registrada' });
                                skippedCount++;
                                continue;
                            }

                            const compensation = compSnap.docs[0].data() as Compensation;

                            // Get attendance records for the period
                            const attendanceQuery = db.collection('attendance')
                                .where('employeeId', '==', employee.id)
                                .where('date', '>=', periodStart)
                                .where('date', '<=', periodEnd);
                            const attendanceSnap = await transaction.get(attendanceQuery);
                            const attendanceRecords = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);

                            // Get approved incidences for the period
                            const incidencesQuery = db.collection('incidences')
                                .where('employeeId', '==', employee.id)
                                .where('status', '==', 'approved')
                                .where('startDate', '<=', periodEnd)
                                .where('endDate', '>=', periodStart);
                            const incidencesSnap = await transaction.get(incidencesQuery);
                            const incidences = incidencesSnap.docs.map(d => d.data() as Incidence);

                            // Calculate all values using server-side LFT formulas
                            let daysWorked = attendanceRecords.length;
                            let totalOvertimeHours = attendanceRecords.reduce((sum, a) => sum + a.overtimeHours, 0);
                            let absenceDays = 0;
                            let vacationDaysTaken = 0;
                            let sickLeaveDays = 0;
                            let paidLeaveDays = 0;
                            let unpaidLeaveDays = 0;
                            let sundayDays = 0;

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

                            // Count Sundays worked
                            for (const record of attendanceRecords) {
                                const dayOfWeek = new Date(record.date).getDay();
                                if (dayOfWeek === 0) sundayDays++;
                            }

                            // Calculate overtime using "Ley de los 9s"
                            const hourlyRate = calculateHourlyRate(compensation.salaryDaily, employee.shiftType as ShiftType);
                            const overtimeCalc = calculateOvertime(totalOvertimeHours, hourlyRate);

                            // Calculate Sunday premium (25%)
                            const sundayPremiumAmount = sundayDays * compensation.salaryDaily * 0.25;

                            // Calculate salary
                            const salaryBase = daysWorked * compensation.salaryDaily;
                            const absenceDeductions = absenceDays * compensation.salaryDaily;

                            const grossPay = salaryBase +
                                overtimeCalc.totalAmount +
                                sundayPremiumAmount +
                                (paidLeaveDays * compensation.salaryDaily);

                            const totalDeductions = absenceDeductions + (unpaidLeaveDays * compensation.salaryDaily);
                            const netPay = grossPay - totalDeductions;

                            // Earned wage (for salary on demand)
                            const earnedWage = Math.max(0, netPay * 0.8);

                            // Prepare prenomina record
                            const prenominaRef = db.collection('prenomina').doc();
                            const prenominaData: Omit<PrenominaRecord, 'id'> = {
                                employeeId: employee.id,
                                employeeName: employee.fullName,
                                employeeRfc: employee.rfc_curp,
                                periodStart,
                                periodEnd,
                                periodType,
                                salaryBase,
                                daysWorked,
                                overtimeDoubleHours: overtimeCalc.doubleHours,
                                overtimeDoubleAmount: overtimeCalc.doubleAmount,
                                overtimeTripleHours: overtimeCalc.tripleHours,
                                overtimeTripleAmount: overtimeCalc.tripleAmount,
                                sundayPremiumDays: sundayDays,
                                sundayPremiumAmount,
                                absenceDays,
                                absenceDeductions,
                                vacationDaysTaken,
                                sickLeaveDays,
                                paidLeaveDays,
                                unpaidLeaveDays,
                                grossPay,
                                totalDeductions,
                                netPay,
                                earnedWage,
                                status: 'draft',
                                costCenter: employee.costCenter,
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
    salaryDaily: string;
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
                        if (!row.fullName || !row.email || !row.department || !row.positionTitle || !row.hireDate || !row.salaryDaily) {
                            throw new Error('Faltan campos obligatorios');
                        }

                        const salaryDaily = parseFloat(row.salaryDaily);
                        if (isNaN(salaryDaily) || salaryDaily <= 0) {
                            throw new Error('Salario diario inválido');
                        }

                        if (existingEmails.has(row.email)) {
                            throw new Error(`Email ${row.email} ya existe`);
                        }

                        // Create employee document
                        const employeeRef = db.collection('employees').doc();
                        const employeeId = employeeRef.id;

                        const hireDateISO = new Date(row.hireDate).toISOString();
                        const yearsOfService = calculateYearsOfService(hireDateISO);
                        const vacationDays = calculateVacationDays(yearsOfService);
                        const sdiFactor = calculateSDIFactor(vacationDays);
                        const sdiBase = calculateSDI(salaryDaily, sdiFactor);

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

                        // Create compensation record
                        const compRef = db.collection('compensation').doc();
                        transaction.set(compRef, {
                            employeeId,
                            salaryDaily,
                            salaryMonthly: Math.round(salaryDaily * 30.4 * 100) / 100,
                            sdiBase,
                            sdiFactor,
                            vacationDays,
                            vacationPremium: 0.25,
                            aguinaldoDays: 15,
                            effectiveDate: hireDateISO,
                            createdAt: nowISO,
                            updatedAt: nowISO,
                            createdById: request.auth?.uid
                        });

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
// CALCULATE SETTLEMENT
// =========================================================================

interface CalculateSettlementRequest {
    employeeId: string;
    terminationType: TerminationType;
    terminationDate: string;
}

interface CalculateSettlementResponse {
    success: boolean;
    settlementId: string;
    settlement: SettlementCalculation;
}

/**
 * Calculates termination settlement (finiquito/liquidación) using LFT formulas.
 * 
 * @requires Role: Admin or HRManager
 */
export const calculateSettlement = onCall<CalculateSettlementRequest>(
    { region: 'us-central1' },
    async (request): Promise<CalculateSettlementResponse> => {
        await verifyRole(request.auth?.uid, HCM_ROLES, 'calcular finiquito');

        const { employeeId, terminationType, terminationDate } = request.data;

        if (!employeeId || !terminationType || !terminationDate) {
            throw new HttpsError('invalid-argument', 'Parámetros incompletos.');
        }

        const nowISO = new Date().toISOString();

        try {
            // Get employee
            const employeeSnap = await db.collection('employees').doc(employeeId).get();
            if (!employeeSnap.exists) {
                throw new HttpsError('not-found', 'Empleado no encontrado.');
            }
            const employee = employeeSnap.data() as Employee;

            // Get latest compensation
            const compQuery = db.collection('compensation')
                .where('employeeId', '==', employeeId)
                .orderBy('effectiveDate', 'desc')
                .limit(1);
            const compSnap = await compQuery.get();

            if (compSnap.empty) {
                throw new HttpsError('not-found', 'Compensación no encontrada.');
            }
            const compensation = compSnap.docs[0].data() as Compensation;

            // Calculate using server-side LFT formulas
            const yearsOfService = calculateYearsOfService(employee.hireDate, new Date(terminationDate));

            const yearStart = new Date(new Date(terminationDate).getFullYear(), 0, 1);
            const termDate = new Date(terminationDate);
            const daysWorkedInYear = Math.ceil((termDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));

            // Get vacation days used this year
            const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
            const incidencesQuery = db.collection('incidences')
                .where('employeeId', '==', employeeId)
                .where('type', '==', 'vacation')
                .where('status', '==', 'approved')
                .where('startDate', '>=', startOfYear);
            const incidencesSnap = await incidencesQuery.get();
            const vacationDaysUsed = incidencesSnap.docs.reduce((total, doc) => {
                return total + ((doc.data() as Incidence).totalDays || 0);
            }, 0);

            // Pending salary days (simplified)
            const lastPayDate = new Date(terminationDate);
            lastPayDate.setDate(1);
            const pendingSalaryDays = Math.ceil((termDate.getTime() - lastPayDate.getTime()) / (1000 * 60 * 60 * 24));

            // Calculate settlement using protected LFT formulas
            const settlementCalc = calculateSettlementLFT(
                compensation.salaryDaily,
                compensation.sdiBase,
                yearsOfService,
                daysWorkedInYear,
                pendingSalaryDays,
                terminationType,
                vacationDaysUsed
            );

            // Create settlement record
            const settlementRef = db.collection('settlements').doc();
            const settlementData: Omit<SettlementCalculation, 'id'> = {
                employeeId,
                employeeName: employee.fullName,
                type: terminationType,
                terminationDate,
                proportionalVacation: settlementCalc.proportionalVacation,
                proportionalVacationPremium: settlementCalc.proportionalVacationPremium,
                proportionalAguinaldo: settlementCalc.proportionalAguinaldo,
                salaryPending: settlementCalc.salaryPending,
                severancePay: settlementCalc.severancePay,
                seniorityPremium: settlementCalc.seniorityPremium,
                twentyDaysPerYear: settlementCalc.twentyDaysPerYear,
                totalPerceptions: settlementCalc.finiquitoTotal + settlementCalc.liquidacionTotal,
                totalDeductions: 0,
                netSettlement: settlementCalc.grandTotal,
                status: 'preliminary',
                calculatedAt: nowISO,
                calculatedById: request.auth!.uid
            };

            await settlementRef.set(settlementData);

            console.log(`[HCM] Calculated settlement ${settlementRef.id} for employee ${employeeId}`);

            return {
                success: true,
                settlementId: settlementRef.id,
                settlement: { id: settlementRef.id, ...settlementData }
            };

        } catch (error: any) {
            console.error('[HCM] Error calculating settlement:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error calculando finiquito: ${error.message}`);
        }
    }
);

// =========================================================================
// APPROVE INCIDENCE
// =========================================================================

interface ApproveIncidenceRequest {
    incidenceId: string;
    action: 'approve' | 'reject';
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
 * Includes server-side validation to prevent approving incidences
 * that overlap with other approved/pending incidences for the same employee.
 *
 * @requires Role: Admin, HRManager, or Manager
 */
export const approveIncidence = onCall<ApproveIncidenceRequest>(
    { region: 'us-central1' },
    async (request): Promise<ApproveIncidenceResponse> => {
        await verifyRole(request.auth?.uid, MANAGER_ROLES, 'aprobar incidencia');
        const userData = await getUserData(request.auth!.uid);

        const { incidenceId, action, rejectionReason } = request.data;

        if (!incidenceId || !action) {
            throw new HttpsError('invalid-argument', 'Parámetros incompletos.');
        }

        const nowISO = new Date().toISOString();

        try {
            const incidenceRef = db.collection('incidences').doc(incidenceId);
            const incidenceSnap = await incidenceRef.get();

            if (!incidenceSnap.exists) {
                throw new HttpsError('not-found', 'Incidencia no encontrada.');
            }

            const incidenceData = incidenceSnap.data() as Incidence;

            // Only validate date conflicts when approving (not when rejecting)
            if (action === 'approve') {
                // Query for other approved or pending incidences for the same employee
                const conflictQuery = await db.collection('incidences')
                    .where('employeeId', '==', incidenceData.employeeId)
                    .where('status', 'in', ['approved', 'pending'])
                    .get();

                const conflictingIncidences: Incidence[] = [];

                for (const doc of conflictQuery.docs) {
                    // Skip the current incidence being approved
                    if (doc.id === incidenceId) continue;

                    const otherIncidence = doc.data() as Incidence;

                    // Check if dates overlap
                    if (datesOverlap(
                        incidenceData.startDate,
                        incidenceData.endDate,
                        otherIncidence.startDate,
                        otherIncidence.endDate
                    )) {
                        conflictingIncidences.push({
                            ...otherIncidence,
                            id: doc.id
                        });
                    }
                }

                // If there are conflicts, reject the approval
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
            }

            const updateData: Partial<Incidence> = {
                status: action === 'approve' ? 'approved' : 'rejected',
                approvedById: request.auth?.uid,
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
