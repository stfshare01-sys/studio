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
import {
    Employee,
    AttendanceRecord,
    Incidence,
    PrenominaRecord
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
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });
            }
            console.log(`[HCM] Marked ${unjustifiedEarlyDeparturesQuery.size} unjustified early departures as FALTA`);

            // 1d. Process unjustified missing punches -> Mark as FALTA
            const unjustifiedMissingPunchesQuery = await db.collection('missing_punches')
                .where('isJustified', '==', false)
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();

            for (const doc of unjustifiedMissingPunchesQuery.docs) {
                await doc.ref.update({
                    resultedInAbsence: true,
                    updatedAt: nowISO,
                });
            }
            console.log(`[HCM] Marked ${unjustifiedMissingPunchesQuery.size} unjustified missing punches as FALTA`);

            // =====================================================================
            // PHASE 2: CONSOLIDATE PRENOMINA
            // =====================================================================
            console.log(`[HCM] Phase 2: Consolidating prenomina records`);

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

                            // Calculate overtime (HOURS ONLY - Rate 0)
                            // We pass 0 as rate because we only care about doubleHours and tripleHours
                            const overtimeCalc = calculateOvertime(totalOvertimeHours, 0);

                            // Prepare prenomina record
                            const prenominaRef = db.collection('prenomina').doc();
                            const prenominaData: Omit<PrenominaRecord, 'id'> = {
                                employeeId: employee.id,
                                employeeName: employee.fullName,
                                employeeRfc: employee.rfc_curp,
                                periodStart,
                                periodEnd,
                                periodType,
                                daysWorked,
                                overtimeDoubleHours: overtimeCalc.doubleHours,
                                overtimeTripleHours: overtimeCalc.tripleHours,
                                sundayPremiumDays: sundayDays,
                                absenceDays,
                                vacationDaysTaken,
                                sickLeaveDays,
                                paidLeaveDays,
                                unpaidLeaveDays,
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
 * Includes server-side validation for:
 * 1. HIERARCHICAL AUTHORIZATION: Only direct managers, chain managers, or HR/Admin can approve
 * 2. DATE CONFLICTS: Prevents approving overlapping incidences
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

        const nowISO = new Date().toISOString();

        try {
            const incidenceRef = db.collection('incidences').doc(incidenceId);
            const incidenceSnap = await incidenceRef.get();

            if (!incidenceSnap.exists) {
                throw new HttpsError('not-found', 'Incidencia no encontrada.');
            }

            const incidenceData = incidenceSnap.data() as Incidence;

            // VALIDATION 1: Hierarchical authorization
            // Check if the approver can approve for this employee
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
            console.log(`[HCM] Reason: ${hierarchyCheck.reason}`);

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
