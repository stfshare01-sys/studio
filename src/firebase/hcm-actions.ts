
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

// =========================================================================
// VACATION BALANCE MANAGEMENT
// =========================================================================

import type { VacationBalance, VacationMovement, TardinessRecord, OvertimeRequest, PayrollPeriodLock, HolidayCalendar, OfficialHoliday } from '@/lib/types';
import { checkVacationEligibility, calculateVacationBalance as calcVacBalance, validateVacationRequest, normalizeVacationDays, isAnniversaryDate, getNextAnniversaryDate } from '@/lib/hcm-utils';

/**
 * Gets or creates vacation balance for an employee
 */
export async function getVacationBalance(
    employeeId: string
): Promise<{ success: boolean; balance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get employee data
        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;

        // Check if balance exists for current period
        const balanceQuery = query(
            collection(firestore, 'vacation_balances'),
            where('employeeId', '==', employeeId),
            orderBy('periodStart', 'desc'),
            limit(1)
        );
        const balanceSnap = await getDocs(balanceQuery);

        if (!balanceSnap.empty) {
            const balance = { id: balanceSnap.docs[0].id, ...balanceSnap.docs[0].data() } as VacationBalance;
            return { success: true, balance };
        }

        // Create new balance if none exists
        const yearsOfService = calculateYearsOfService(employee.hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const periodStart = employee.hireDate;
        const nextAnniversary = getNextAnniversaryDate(employee.hireDate);

        const newBalance: Omit<VacationBalance, 'id'> = {
            employeeId,
            periodStart,
            periodEnd: nextAnniversary.toISOString(),
            daysEntitled,
            yearsOfService,
            daysTaken: 0,
            daysScheduled: 0,
            daysAvailable: daysEntitled,
            vacationPremiumPaid: false,
            movements: [],
            lastUpdated: new Date().toISOString(),
            createdAt: new Date().toISOString(),
        };

        const balanceRef = await addDoc(collection(firestore, 'vacation_balances'), newBalance);

        return { success: true, balance: { id: balanceRef.id, ...newBalance } };
    } catch (error) {
        console.error('[HCM] Error getting vacation balance:', error);
        return { success: false, error: 'Error obteniendo saldo de vacaciones.' };
    }
}

/**
 * Updates vacation balance after taking or cancelling vacation
 */
export async function updateVacationBalance(
    employeeId: string,
    days: number,
    type: 'taken' | 'scheduled' | 'cancelled',
    incidenceId?: string,
    approvedById?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Get current balance
        const balanceResult = await getVacationBalance(employeeId);
        if (!balanceResult.success || !balanceResult.balance) {
            return { success: false, error: balanceResult.error };
        }

        const balance = balanceResult.balance;
        const balanceRef = doc(firestore, 'vacation_balances', balance.id);

        // Calculate new values
        let newDaysTaken = balance.daysTaken;
        let newDaysScheduled = balance.daysScheduled;

        const movement: VacationMovement = {
            id: `mov_${Date.now()}`,
            date: now,
            type,
            days: type === 'cancelled' ? -days : days,
            description: type === 'taken' ? 'Vacaciones tomadas' :
                type === 'scheduled' ? 'Vacaciones programadas' : 'Vacaciones canceladas',
            incidenceId,
            approvedById,
        };

        switch (type) {
            case 'taken':
                newDaysTaken += days;
                // If was scheduled, reduce scheduled count
                if (balance.daysScheduled >= days) {
                    newDaysScheduled -= days;
                }
                break;
            case 'scheduled':
                newDaysScheduled += days;
                break;
            case 'cancelled':
                // Return days to available
                if (balance.daysTaken >= days) {
                    newDaysTaken -= days;
                } else if (balance.daysScheduled >= days) {
                    newDaysScheduled -= days;
                }
                break;
        }

        const newDaysAvailable = balance.daysEntitled - newDaysTaken - newDaysScheduled;

        await updateDoc(balanceRef, {
            daysTaken: newDaysTaken,
            daysScheduled: newDaysScheduled,
            daysAvailable: Math.max(0, newDaysAvailable),
            movements: [...balance.movements, movement].slice(-100),
            lastUpdated: now,
        });

        console.log(`[HCM] Updated vacation balance for ${employeeId}: ${type} ${days} days`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating vacation balance:', error);
        return { success: false, error: 'Error actualizando saldo de vacaciones.' };
    }
}

/**
 * Resets vacation balance on employee anniversary
 */
export async function resetVacationBalanceOnAnniversary(
    employeeId: string
): Promise<{ success: boolean; newBalance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Get employee data
        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;

        // Verify it's the anniversary
        if (!isAnniversaryDate(employee.hireDate)) {
            return { success: false, error: 'No es fecha de aniversario.' };
        }

        // Calculate new entitlement
        const yearsOfService = calculateYearsOfService(employee.hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const nextAnniversary = getNextAnniversaryDate(employee.hireDate);

        // Create new balance (vacations don't accumulate)
        const newBalance: Omit<VacationBalance, 'id'> = {
            employeeId,
            periodStart: now,
            periodEnd: nextAnniversary.toISOString(),
            daysEntitled,
            yearsOfService,
            daysTaken: 0,
            daysScheduled: 0,
            daysAvailable: daysEntitled,
            vacationPremiumPaid: false,
            movements: [{
                id: `mov_${Date.now()}`,
                date: now,
                type: 'reset',
                days: daysEntitled,
                description: `Reset de vacaciones - Aniversario año ${yearsOfService}`,
            }],
            lastUpdated: now,
            createdAt: now,
        };

        const balanceRef = await addDoc(collection(firestore, 'vacation_balances'), newBalance);

        console.log(`[HCM] Reset vacation balance for ${employeeId}: ${daysEntitled} days for year ${yearsOfService}`);
        return { success: true, newBalance: { id: balanceRef.id, ...newBalance } };
    } catch (error) {
        console.error('[HCM] Error resetting vacation balance:', error);
        return { success: false, error: 'Error reseteando saldo de vacaciones.' };
    }
}

// =========================================================================
// TARDINESS MANAGEMENT
// =========================================================================

/**
 * Records a tardiness event
 */
export async function recordTardiness(
    employeeId: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string
): Promise<{ success: boolean; tardinessId?: string; sanctionApplied?: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calculate minutes late
        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        const minutesLate = (actH * 60 + actM) - (schedH * 60 + schedM);

        if (minutesLate <= 0) {
            return { success: false, error: 'No hay retardo.' };
        }

        // Get tardiness count for current period (30 days) and week
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0]),
            where('isJustified', '==', false)
        );
        const tardinessSnap = await getDocs(tardinessQuery);
        const records = tardinessSnap.docs.map(d => d.data() as TardinessRecord);

        const countInPeriod = records.length + 1;
        const countInWeek = records.filter(r => new Date(r.date) >= weekStart).length + 1;

        // Check if sanction should be applied (3 in 30 days OR 2 in same week)
        const sanctionApplied = countInPeriod >= 3 || countInWeek >= 2;

        const tardinessData: Omit<TardinessRecord, 'id'> = {
            employeeId,
            date,
            attendanceRecordId,
            type: 'entry',
            scheduledTime,
            actualTime,
            minutesLate,
            isJustified: false,
            periodStartDate: thirtyDaysAgo.toISOString().split('T')[0],
            tardinessCountInPeriod: countInPeriod,
            tardinessCountInWeek: countInWeek,
            sanctionApplied,
            sanctionType: sanctionApplied ? 'suspension_1day' : undefined,
            sanctionDate: sanctionApplied ? now : undefined,
            createdAt: now,
            updatedAt: now,
        };

        const tardinessRef = await addDoc(collection(firestore, 'tardiness_records'), tardinessData);

        console.log(`[HCM] Recorded tardiness for ${employeeId}: ${minutesLate} minutes late, sanction: ${sanctionApplied}`);
        return { success: true, tardinessId: tardinessRef.id, sanctionApplied };
    } catch (error) {
        console.error('[HCM] Error recording tardiness:', error);
        return { success: false, error: 'Error registrando retardo.' };
    }
}

/**
 * Justifies a tardiness record
 */
export async function justifyTardiness(
    tardinessId: string,
    reason: string,
    justifiedById: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        await updateDoc(tardinessRef, {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedAt: now,
            sanctionApplied: false,
            updatedAt: now,
        });

        console.log(`[HCM] Justified tardiness ${tardinessId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying tardiness:', error);
        return { success: false, error: 'Error justificando retardo.' };
    }
}

/**
 * Resets tardiness counter (after sanction applied or manager override)
 */
export async function resetTardinessCounter(
    employeeId: string,
    resetById: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Mark recent tardiness records as reset
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0])
        );
        const tardinessSnap = await getDocs(tardinessQuery);

        const batch = firestore.batch ? firestore : null; // Firestore client doesn't have batch directly
        for (const docSnap of tardinessSnap.docs) {
            await updateDoc(doc(firestore, 'tardiness_records', docSnap.id), {
                sanctionResetById: resetById,
                updatedAt: now,
            });
        }

        console.log(`[HCM] Reset tardiness counter for ${employeeId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error resetting tardiness counter:', error);
        return { success: false, error: 'Error reseteando contador de retardos.' };
    }
}

// =========================================================================
// OVERTIME REQUEST MANAGEMENT
// =========================================================================

/**
 * Creates an overtime request for approval
 */
export async function createOvertimeRequest(
    employeeId: string,
    employeeName: string,
    date: string,
    hoursRequested: number,
    reason: string,
    requestedToId: string,
    requestedToName: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const requestData: Omit<OvertimeRequest, 'id'> = {
            employeeId,
            employeeName,
            date,
            hoursRequested,
            reason,
            status: 'pending',
            approverLevel: 1,
            requestedToId,
            requestedToName,
            createdAt: now,
            updatedAt: now,
        };

        const requestRef = await addDoc(collection(firestore, 'overtime_requests'), requestData);

        console.log(`[HCM] Created overtime request ${requestRef.id} for ${employeeId}`);
        return { success: true, requestId: requestRef.id };
    } catch (error) {
        console.error('[HCM] Error creating overtime request:', error);
        return { success: false, error: 'Error creando solicitud de horas extras.' };
    }
}

/**
 * Approves or rejects an overtime request
 */
export async function processOvertimeRequest(
    requestId: string,
    action: 'approve' | 'reject' | 'partial',
    processedById: string,
    processedByName: string,
    hoursApproved?: number,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const requestRef = doc(firestore, 'overtime_requests', requestId);

        const updateData: Partial<OvertimeRequest> = {
            status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'partial',
            approvedById: processedById,
            approvedByName: processedByName,
            approvedAt: now,
            updatedAt: now,
        };

        if (action === 'partial' && hoursApproved !== undefined) {
            updateData.hoursApproved = hoursApproved;
        }

        if (action === 'reject' && rejectionReason) {
            updateData.rejectionReason = rejectionReason;
        }

        await updateDoc(requestRef, updateData);

        console.log(`[HCM] Processed overtime request ${requestId}: ${action}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error processing overtime request:', error);
        return { success: false, error: 'Error procesando solicitud de horas extras.' };
    }
}

// =========================================================================
// PAYROLL PERIOD LOCK MANAGEMENT
// =========================================================================

/**
 * Locks a payroll period after export
 */
export async function lockPayrollPeriod(
    periodStart: string,
    periodEnd: string,
    periodType: 'weekly' | 'biweekly' | 'monthly',
    lockedById: string,
    lockedByName: string,
    prenominaExportId?: string,
    exportFormat?: 'nomipaq' | 'excel' | 'json',
    locationId?: string
): Promise<{ success: boolean; lockId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Check if period is already locked
        const existingQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '==', periodStart),
            where('periodEnd', '==', periodEnd),
            where('isLocked', '==', true)
        );
        const existingSnap = await getDocs(existingQuery);

        if (!existingSnap.empty) {
            return { success: false, error: 'Este periodo ya esta bloqueado.' };
        }

        const lockData: Omit<PayrollPeriodLock, 'id'> = {
            periodStart,
            periodEnd,
            periodType,
            locationId,
            isLocked: true,
            lockedAt: now,
            lockedById,
            lockedByName,
            prenominaExportId,
            exportFormat,
            createdAt: now,
            updatedAt: now,
        };

        const lockRef = await addDoc(collection(firestore, 'payroll_period_locks'), lockData);

        console.log(`[HCM] Locked payroll period ${periodStart} - ${periodEnd}`);
        return { success: true, lockId: lockRef.id };
    } catch (error) {
        console.error('[HCM] Error locking payroll period:', error);
        return { success: false, error: 'Error bloqueando periodo de nomina.' };
    }
}

/**
 * Checks if a period is locked
 */
export async function checkPeriodLock(
    periodStart: string,
    periodEnd: string
): Promise<{ isLocked: boolean; lock?: PayrollPeriodLock; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const lockQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '==', periodStart),
            where('periodEnd', '==', periodEnd),
            where('isLocked', '==', true),
            limit(1)
        );
        const lockSnap = await getDocs(lockQuery);

        if (lockSnap.empty) {
            return { isLocked: false };
        }

        const lock = { id: lockSnap.docs[0].id, ...lockSnap.docs[0].data() } as PayrollPeriodLock;
        return { isLocked: true, lock };
    } catch (error) {
        console.error('[HCM] Error checking period lock:', error);
        return { isLocked: false, error: 'Error verificando bloqueo de periodo.' };
    }
}

/**
 * Unlocks a payroll period (Admin only)
 */
export async function unlockPayrollPeriod(
    lockId: string,
    unlockedById: string,
    unlockReason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const lockRef = doc(firestore, 'payroll_period_locks', lockId);

        await updateDoc(lockRef, {
            isLocked: false,
            unlockedAt: now,
            unlockedById,
            unlockReason,
            updatedAt: now,
        });

        console.log(`[HCM] Unlocked payroll period ${lockId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error unlocking payroll period:', error);
        return { success: false, error: 'Error desbloqueando periodo de nomina.' };
    }
}

// =========================================================================
// HOLIDAY CALENDAR MANAGEMENT
// =========================================================================

/**
 * Gets holiday calendar for a specific year and location
 */
export async function getHolidayCalendar(
    year: number,
    locationId?: string
): Promise<{ success: boolean; calendar?: HolidayCalendar; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Try to get location-specific calendar first
        if (locationId) {
            const locCalendarQuery = query(
                collection(firestore, 'holiday_calendars'),
                where('year', '==', year),
                where('locationId', '==', locationId),
                limit(1)
            );
            const locCalendarSnap = await getDocs(locCalendarQuery);

            if (!locCalendarSnap.empty) {
                const calendar = { id: locCalendarSnap.docs[0].id, ...locCalendarSnap.docs[0].data() } as HolidayCalendar;
                return { success: true, calendar };
            }
        }

        // Fall back to global calendar
        const globalCalendarQuery = query(
            collection(firestore, 'holiday_calendars'),
            where('year', '==', year),
            limit(1)
        );
        const globalCalendarSnap = await getDocs(globalCalendarQuery);

        if (!globalCalendarSnap.empty) {
            const calendar = { id: globalCalendarSnap.docs[0].id, ...globalCalendarSnap.docs[0].data() } as HolidayCalendar;
            return { success: true, calendar };
        }

        // Create default calendar with LFT holidays
        const defaultHolidays: OfficialHoliday[] = [
            { date: `${year}-01-01`, name: 'Año Nuevo', isObligatory: true, premiumRequired: true },
            { date: `${year}-02-05`, name: 'Dia de la Constitucion', isObligatory: true, premiumRequired: true },
            { date: `${year}-03-21`, name: 'Natalicio de Benito Juarez', isObligatory: true, premiumRequired: true },
            { date: `${year}-05-01`, name: 'Dia del Trabajo', isObligatory: true, premiumRequired: true },
            { date: `${year}-09-16`, name: 'Dia de la Independencia', isObligatory: true, premiumRequired: true },
            { date: `${year}-11-20`, name: 'Dia de la Revolucion', isObligatory: true, premiumRequired: true },
            { date: `${year}-12-25`, name: 'Navidad', isObligatory: true, premiumRequired: true },
        ];

        const now = new Date().toISOString();
        const newCalendar: Omit<HolidayCalendar, 'id'> = {
            year,
            holidays: defaultHolidays,
            createdAt: now,
            updatedAt: now,
        };

        const calendarRef = await addDoc(collection(firestore, 'holiday_calendars'), newCalendar);

        return { success: true, calendar: { id: calendarRef.id, ...newCalendar } };
    } catch (error) {
        console.error('[HCM] Error getting holiday calendar:', error);
        return { success: false, error: 'Error obteniendo calendario de dias festivos.' };
    }
}

/**
 * Checks if a date is a holiday
 */
export async function isHoliday(
    date: string,
    locationId?: string
): Promise<{ isHoliday: boolean; holiday?: OfficialHoliday; error?: string }> {
    try {
        const year = new Date(date).getFullYear();
        const calendarResult = await getHolidayCalendar(year, locationId);

        if (!calendarResult.success || !calendarResult.calendar) {
            return { isHoliday: false };
        }

        const holiday = calendarResult.calendar.holidays.find(h => h.date === date);

        if (holiday) {
            return { isHoliday: true, holiday };
        }

        return { isHoliday: false };
    } catch (error) {
        console.error('[HCM] Error checking holiday:', error);
        return { isHoliday: false, error: 'Error verificando dia festivo.' };
    }
}

