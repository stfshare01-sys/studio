
'use client';

/**
 * HCM Client Actions
 * 
 * Client-side functions for HCM module operations.
 * 
 * ARCHITECTURE NOTE:
 * - Critical operations (prenomina, settlements, employee import) now use Cloud Functions
 * - Simple CRUD operations remain client-side for responsive UI
 * - LFT payroll calculations are performed server-side for security
 */

import { Firestore, doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, Timestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '.';
import { setDocumentNonBlocking, updateDocumentNonBlocking, addDocumentNonBlocking } from './non-blocking-updates';
import {
    callConsolidatePrenomina,
    callProcessEmployeeImport,
    callCalculateSettlement,
    callApproveIncidence,
    CloudFunctionError,
    type EmployeeImportRow as CFEmployeeImportRow
} from './callable-functions';
import type {
    Employee,
    Compensation,
    AttendanceRecord,
    Incidence,
    PrenominaRecord,
    AttendanceImportBatch,
    TimeBank,
    SettlementCalculation,
    ShiftType,
    EmployeeImportBatch,
} from '@/lib/types';
import {
    calculateSDIFactor,
    calculateSDI,
    calculateVacationDays,
    calculateYearsOfService,
    validateWorkday,
    calculateOvertime,
    calculateHourlyRate,
    calculateHoursWorked
} from '@/lib/hcm-utils';

// =========================================================================
// EMPLOYEE MANAGEMENT
// =========================================================================

interface CreateEmployeePayload {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: Employee['employmentType'];
    shiftType: ShiftType;
    hireDate: string;
    managerId?: string;
    rfc_curp?: string;
    nss?: string;
    clabe?: string;
    costCenter?: string;
}

/**
 * Creates a new employee record extending the base user
 */
export async function createEmployee(
    userId: string,
    payload: CreateEmployeePayload
): Promise<{ success: boolean; employeeId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const employeeRef = doc(firestore, 'employees', userId);

        const employeeData: Partial<Employee> = {
            id: userId,
            ...payload,
            role: 'Member',
            status: 'active',
            onboardingStatus: 'day_0',
            onboardingObjectives: [],
        };

        await setDoc(employeeRef, employeeData, {});

        console.log(`[HCM] Created employee record for ${userId}`);
        return { success: true, employeeId: userId };
    } catch (error) {
        console.error('[HCM] Error creating employee:', error);
        return { success: false, error: 'No se pudo crear el registro del empleado.' };
    }
}

/**
 * Updates an employee's onboarding status
 */
export async function updateOnboardingStatus(
    employeeId: string,
    phase: Employee['onboardingStatus']
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const employeeRef = doc(firestore, 'employees', employeeId);

        updateDocumentNonBlocking(employeeRef, {
            onboardingStatus: phase
        });

        console.log(`[HCM] Updated onboarding status for ${employeeId} to ${phase}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating onboarding:', error);
        return { success: false, error: 'No se pudo actualizar el estatus de onboarding.' };
    }
}

/**
 * Adds an employee to the blacklist
 */
export async function blacklistEmployee(
    employeeId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const employeeRef = doc(firestore, 'employees', employeeId);

        updateDocumentNonBlocking(employeeRef, {
            isBlacklisted: true,
            blacklistReason: reason,
            blacklistDate: new Date().toISOString(),
            status: 'disabled',
            terminationDate: new Date().toISOString()
        });

        console.log(`[HCM] Blacklisted employee ${employeeId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error blacklisting employee:', error);
        return { success: false, error: 'No se pudo agregar a lista negra.' };
    }
}

// =========================================================================
// COMPENSATION MANAGEMENT
// =========================================================================

interface CreateCompensationPayload {
    employeeId: string;
    salaryDaily: number;
    vacationPremium?: number;
    aguinaldoDays?: number;
    savingsFundPercentage?: number;
    foodVouchersDaily?: number;
    effectiveDate: string;
    createdById: string;
}

/**
 * Creates a new compensation record with automatic SDI calculation
 */
export async function createCompensation(
    payload: CreateCompensationPayload
): Promise<{ success: boolean; compensationId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get employee to calculate years of service
        const employeeRef = doc(firestore, 'employees', payload.employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;
        const yearsOfService = calculateYearsOfService(employee.hireDate);

        // Calculate vacation days based on seniority
        const vacationDays = calculateVacationDays(yearsOfService);
        const vacationPremium = payload.vacationPremium ?? 0.25; // 25% minimum
        const aguinaldoDays = payload.aguinaldoDays ?? 15; // 15 days minimum

        // Calculate SDI factor and SDI
        const sdiFactor = calculateSDIFactor(vacationDays, vacationPremium, aguinaldoDays);
        const sdiBase = calculateSDI(payload.salaryDaily, sdiFactor);

        const now = new Date().toISOString();

        const compensationData: Omit<Compensation, 'id'> = {
            employeeId: payload.employeeId,
            salaryDaily: payload.salaryDaily,
            salaryMonthly: Math.round(payload.salaryDaily * 30.4 * 100) / 100,
            sdiBase,
            sdiFactor,
            vacationDays,
            vacationPremium,
            aguinaldoDays,
            savingsFundPercentage: payload.savingsFundPercentage,
            foodVouchersDaily: payload.foodVouchersDaily,
            effectiveDate: payload.effectiveDate,
            createdAt: now,
            updatedAt: now,
            createdById: payload.createdById
        };

        const compensationRef = collection(firestore, 'compensation');
        const docRef = await addDoc(compensationRef, compensationData);

        console.log(`[HCM] Created compensation record ${docRef.id} for employee ${payload.employeeId}`);
        return { success: true, compensationId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating compensation:', error);
        return { success: false, error: 'No se pudo crear el registro de compensación.' };
    }
}

// =========================================================================
// ATTENDANCE IMPORT
// =========================================================================

interface AttendanceImportRow {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string;
}

interface ProcessAttendanceResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

/**
 * Processes imported attendance data from Excel/CSV
 * Validates work hours according to LFT shift rules
 */
export async function processAttendanceImport(
    rows: AttendanceImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string
): Promise<ProcessAttendanceResult> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Create import batch record
        const batchRef = collection(firestore, 'attendance_imports');
        const batchData: Omit<AttendanceImportBatch, 'id'> = {
            filename,
            fileSize: 0, // Would be provided by upload
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            uploadedById,
            uploadedByName,
            uploadedAt: now,
            recordCount: rows.length,
            successCount: 0,
            errorCount: 0,
            status: 'processing',
            errors: []
        };

        const batchDocRef = await addDoc(batchRef, batchData);
        const batchId = batchDocRef.id;

        const errors: Array<{ row: number; message: string }> = [];
        let successCount = 0;

        // Get all unique employee IDs and fetch their shift types
        const employeeIds = [...new Set(rows.map(r => r.employeeId))];
        const employeeShifts: Record<string, ShiftType> = {};

        for (const empId of employeeIds) {
            const empRef = doc(firestore, 'employees', empId);
            const empSnap = await getDoc(empRef);
            if (empSnap.exists()) {
                const empData = empSnap.data() as Employee;
                employeeShifts[empId] = empData.shiftType || 'diurnal';
            }
        }

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2; // +2 because Excel rows start at 1 and header is row 1

            try {
                // Validate employee exists
                if (!employeeShifts[row.employeeId]) {
                    errors.push({ row: rowNum, message: `Empleado ${row.employeeId} no encontrado` });
                    continue;
                }

                // Calculate hours worked
                const hoursWorked = calculateHoursWorked(row.checkIn, row.checkOut);

                // Validate workday according to shift type
                const shiftType = employeeShifts[row.employeeId];
                const validation = validateWorkday(hoursWorked, shiftType);

                // Create attendance record
                const attendanceRef = collection(firestore, 'attendance');
                const attendanceData: Omit<AttendanceRecord, 'id'> = {
                    employeeId: row.employeeId,
                    date: row.date,
                    checkIn: row.checkIn,
                    checkOut: row.checkOut,
                    hoursWorked,
                    regularHours: validation.regularHours,
                    overtimeHours: validation.overtimeHours,
                    overtimeType: validation.overtimeHours > 0 ? 'double' : undefined, // Will be recalculated weekly
                    isValid: validation.isValid,
                    validationNotes: validation.message,
                    importBatchId: batchId,
                    createdAt: now
                };

                await addDoc(attendanceRef, attendanceData);
                successCount++;

            } catch (rowError) {
                errors.push({ row: rowNum, message: `Error procesando fila: ${rowError}` });
            }
        }

        // Update batch with results
        const finalStatus = errors.length === 0 ? 'completed' :
            successCount === 0 ? 'failed' : 'partial';

        updateDocumentNonBlocking(batchDocRef, {
            status: finalStatus,
            successCount,
            errorCount: errors.length,
            errors: errors.slice(0, 50), // Limit stored errors
            dateRangeStart: rows.length > 0 ? rows.reduce((min, r) => r.date < min ? r.date : min, rows[0].date) : undefined,
            dateRangeEnd: rows.length > 0 ? rows.reduce((max, r) => r.date > max ? r.date : max, rows[0].date) : undefined
        });

        console.log(`[HCM] Processed attendance import: ${successCount} success, ${errors.length} errors`);

        return {
            success: true,
            batchId,
            recordCount: rows.length,
            successCount,
            errorCount: errors.length,
            errors
        };
    } catch (error) {
        console.error('[HCM] Error processing attendance import:', error);
        return { success: false, errors: [{ row: 0, message: 'Error general en la importación' }] };
    }
}

// =========================================================================
// EMPLOYEE IMPORT
// =========================================================================

interface EmployeeImportRow {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: Employee['employmentType'];
    shiftType: ShiftType;
    hireDate: string;
    salaryDaily: string;
    managerEmail?: string;
}

interface ProcessEmployeeImportResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

/**
 * Processes bulk employee import with validation.
 * 
 * NOTE: This function now delegates to a Cloud Function for:
 * - Server-side transactional processing
 * - Atomic employee + compensation creation
 * - Role-based access control
 */
export async function processEmployeeImport(
    rows: EmployeeImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string
): Promise<ProcessEmployeeImportResult> {
    try {
        // Convert to Cloud Function format with type validation
        const validEmploymentTypes = ['full_time', 'part_time', 'contractor'] as const;
        const cfRows: CFEmployeeImportRow[] = rows.map(row => {
            // Map employment type - default to full_time for unsupported types
            const empType = validEmploymentTypes.includes(row.employmentType as any)
                ? row.employmentType as 'full_time' | 'part_time' | 'contractor'
                : 'full_time';

            return {
                fullName: row.fullName,
                email: row.email,
                department: row.department,
                positionTitle: row.positionTitle,
                employmentType: empType,
                shiftType: row.shiftType || 'diurnal',
                hireDate: row.hireDate,
                salaryDaily: row.salaryDaily,
                managerEmail: row.managerEmail
            };
        });

        const result = await callProcessEmployeeImport({
            rows: cfRows,
            filename
        });

        console.log(`[HCM] Processed employee import: ${result.successCount} success, ${result.errorCount} errors`);

        return {
            success: result.success,
            batchId: result.batchId,
            recordCount: result.recordCount,
            successCount: result.successCount,
            errorCount: result.errorCount,
            errors: result.errors
        };
    } catch (error) {
        console.error('[HCM] Error processing employee import:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, errors: [{ row: 0, message: error.message }] };
        }
        return { success: false, errors: [{ row: 0, message: 'Error general en la importación de empleados' }] };
    }
}


// =========================================================================
// INCIDENCE MANAGEMENT
// =========================================================================

interface CreateIncidencePayload {
    employeeId: string;
    employeeName: string;
    type: Incidence['type'];
    startDate: string;
    endDate: string;
    isPaid: boolean;
    notes?: string;
    imssReference?: string;
}

/**
 * Creates a new incidence/leave request
 */
export async function createIncidence(
    payload: CreateIncidencePayload
): Promise<{ success: boolean; incidenceId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calculate total days
        const start = new Date(payload.startDate);
        const end = new Date(payload.endDate);
        const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

        const incidenceData: Omit<Incidence, 'id'> = {
            ...payload,
            totalDays,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        };

        const incidenceRef = collection(firestore, 'incidences');
        const docRef = await addDoc(incidenceRef, incidenceData);

        console.log(`[HCM] Created incidence ${docRef.id} for employee ${payload.employeeId}`);
        return { success: true, incidenceId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating incidence:', error);
        return { success: false, error: 'No se pudo crear la incidencia.' };
    }
}

/**
 * Approves or rejects an incidence
 * 
 * NOTE: This function now delegates to a Cloud Function for:
 * - Server-side role validation
 * - Consistent approval workflow
 */
export async function updateIncidenceStatus(
    incidenceId: string,
    status: 'approved' | 'rejected',
    approvedById: string,
    approvedByName: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await callApproveIncidence({
            incidenceId,
            action: status === 'approved' ? 'approve' : 'reject',
            rejectionReason
        });

        console.log(`[HCM] Updated incidence ${incidenceId} to ${status}`);
        return { success: result.success };
    } catch (error) {
        console.error('[HCM] Error updating incidence:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'No se pudo actualizar la incidencia.' };
    }
}

// =========================================================================
// PRENOMINA CONSOLIDATION
// =========================================================================

interface ConsolidatePrenominaParams {
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    employeeIds?: string[]; // Optional: specific employees, or all if not provided
    createdById: string;
}

/**
 * Consolidates attendance, incidences, and overtime into prenomina records
 * 
 * NOTE: This function now delegates to a Cloud Function for:
 * - Server-side transactional processing (atomicity)
 * - Protected LFT payroll calculations
 * - Role-based access control
 */
export async function consolidatePrenomina(
    params: ConsolidatePrenominaParams
): Promise<{ success: boolean; recordIds?: string[]; error?: string }> {
    try {
        const result = await callConsolidatePrenomina({
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            periodType: params.periodType,
            employeeIds: params.employeeIds
        });

        if (result.errors && result.errors.length > 0) {
            console.warn(`[HCM] Prenomina consolidation had ${result.errors.length} errors`);
        }

        console.log(`[HCM] Consolidated prenomina: ${result.processedCount} records created, ${result.skippedCount} skipped`);
        return { success: result.success, recordIds: result.recordIds };
    } catch (error) {
        console.error('[HCM] Error consolidating prenomina:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Error consolidando la pre-nómina.' };
    }
}

// =========================================================================
// SETTLEMENT CALCULATION
// =========================================================================

interface CalculateSettlementParams {
    employeeId: string;
    terminationType: SettlementCalculation['type'];
    terminationDate: string;
    calculatedById: string;
}

/**
 * Calculates termination settlement (finiquito/liquidación)
 * 
 * NOTE: This function now delegates to a Cloud Function for:
 * - Server-side LFT formula protection
 * - Atomic transaction guarantee
 * - Role-based access control
 */
export async function calculateEmployeeSettlement(
    params: CalculateSettlementParams
): Promise<{ success: boolean; settlementId?: string; settlement?: SettlementCalculation; error?: string }> {
    try {
        // Delegate to Cloud Function for server-side calculation
        const result = await callCalculateSettlement({
            employeeId: params.employeeId,
            terminationType: params.terminationType,
            terminationDate: params.terminationDate
        });

        if (!result.success) {
            return { success: false, error: 'Error en el servidor calculando finiquito.' };
        }

        console.log(`[HCM] Calculated settlement ${result.settlementId} for employee ${params.employeeId}`);

        return {
            success: true,
            settlementId: result.settlementId,
            settlement: result.settlement as SettlementCalculation
        };
    } catch (error) {
        console.error('[HCM] Error calculating settlement:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Error calculando finiquito/liquidación.' };
    }
}

// =========================================================================
// TIME BANK MANAGEMENT
// =========================================================================

/**
 * Updates an employee's time bank
 */
export async function updateTimeBank(
    employeeId: string,
    hours: number,
    type: 'earn' | 'use',
    description: string,
    approvedById?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const timeBankRef = doc(firestore, 'time_bank', employeeId);
        const timeBankSnap = await getDoc(timeBankRef);

        let currentBank: TimeBank;

        if (timeBankSnap.exists()) {
            currentBank = timeBankSnap.data() as TimeBank;
        } else {
            currentBank = {
                id: employeeId,
                employeeId,
                hoursEarned: 0,
                hoursUsed: 0,
                hoursBalance: 0,
                hoursExpired: 0,
                lastUpdated: now,
                movements: []
            };
        }

        // Add movement
        const movement = {
            id: `mov_${Date.now()}`,
            type,
            hours,
            date: now,
            description,
            approvedById
        };

        // Update totals
        if (type === 'earn') {
            currentBank.hoursEarned += hours;
        } else {
            currentBank.hoursUsed += hours;
        }
        currentBank.hoursBalance = currentBank.hoursEarned - currentBank.hoursUsed - currentBank.hoursExpired;
        currentBank.lastUpdated = now;
        currentBank.movements = [...currentBank.movements, movement].slice(-50); // Keep last 50 movements

        setDocumentNonBlocking(timeBankRef, currentBank, { merge: true });

        console.log(`[HCM] Updated time bank for ${employeeId}: ${type} ${hours} hours`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating time bank:', error);
        return { success: false, error: 'Error actualizando bolsa de horas.' };
    }
}

