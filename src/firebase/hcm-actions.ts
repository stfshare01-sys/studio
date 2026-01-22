'use client';

/**
 * HCM Client Actions
 * 
 * Client-side functions for HCM module operations.
 * Uses non-blocking Firebase updates for responsive UI.
 * 
 * Note: These are client-side actions that use Firebase directly.
 * For sensitive operations requiring server-side validation,
 * consider creating separate API routes or Cloud Functions.
 */

import { Firestore, doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, Timestamp } from 'firebase/firestore';
import { initializeFirebase } from '.';
import { setDocumentNonBlocking, updateDocumentNonBlocking, addDocumentNonBlocking } from './non-blocking-updates';
import type {
    Employee,
    Compensation,
    AttendanceRecord,
    Incidence,
    PrenominaRecord,
    AttendanceImportBatch,
    TimeBank,
    SettlementCalculation,
    ShiftType
} from '@/lib/types';
import {
    calculateSDIFactor,
    calculateSDI,
    calculateVacationDays,
    calculateYearsOfService,
    validateWorkday,
    calculateOvertime,
    calculateHourlyRate,
    calculateSettlement,
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
        const now = new Date().toISOString();

        const employeeData: Partial<Employee> = {
            id: userId,
            ...payload,
            role: 'Member',
            status: 'active',
            onboardingStatus: 'day_0',
            onboardingObjectives: [],
        };

        setDocumentNonBlocking(employeeRef, employeeData, {});

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
 */
export async function updateIncidenceStatus(
    incidenceId: string,
    status: 'approved' | 'rejected',
    approvedById: string,
    approvedByName: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const incidenceRef = doc(firestore, 'incidences', incidenceId);

        const updateData: Partial<Incidence> = {
            status,
            approvedById,
            approvedByName,
            approvedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        if (status === 'rejected' && rejectionReason) {
            updateData.rejectionReason = rejectionReason;
        }

        updateDocumentNonBlocking(incidenceRef, updateData);

        console.log(`[HCM] Updated incidence ${incidenceId} to ${status}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating incidence:', error);
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
 */
export async function consolidatePrenomina(
    params: ConsolidatePrenominaParams
): Promise<{ success: boolean; recordIds?: string[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Get employees to process
        const employeesRef = collection(firestore, 'employees');
        let employeesQuery;

        if (params.employeeIds && params.employeeIds.length > 0) {
            // Specific employees - need to query each
            // Note: Firestore doesn't support 'in' queries with more than 10 items
            employeesQuery = query(employeesRef, where('status', '==', 'active'));
        } else {
            employeesQuery = query(employeesRef, where('status', '==', 'active'));
        }

        const employeesSnap = await getDocs(employeesQuery);
        const employees = employeesSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee));

        const recordIds: string[] = [];

        for (const employee of employees) {
            // Skip if not in the specified list
            if (params.employeeIds && params.employeeIds.length > 0) {
                if (!params.employeeIds.includes(employee.id)) continue;
            }

            // Get compensation
            const compQuery = query(
                collection(firestore, 'compensation'),
                where('employeeId', '==', employee.id),
                orderBy('effectiveDate', 'desc'),
                limit(1)
            );
            const compSnap = await getDocs(compQuery);

            if (compSnap.empty) {
                console.warn(`[HCM] No compensation found for employee ${employee.id}`);
                continue;
            }

            const compensation = compSnap.docs[0].data() as Compensation;

            // Get attendance records for the period
            const attendanceQuery = query(
                collection(firestore, 'attendance'),
                where('employeeId', '==', employee.id),
                where('date', '>=', params.periodStart),
                where('date', '<=', params.periodEnd)
            );
            const attendanceSnap = await getDocs(attendanceQuery);
            const attendanceRecords = attendanceSnap.docs.map(d => d.data() as AttendanceRecord);

            // Get approved incidences for the period
            const incidencesQuery = query(
                collection(firestore, 'incidences'),
                where('employeeId', '==', employee.id),
                where('status', '==', 'approved'),
                where('startDate', '<=', params.periodEnd),
                where('endDate', '>=', params.periodStart)
            );
            const incidencesSnap = await getDocs(incidencesQuery);
            const incidences = incidencesSnap.docs.map(d => d.data() as Incidence);

            // Calculate totals
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

            // Calculate overtime (weekly basis - "Ley de los 9s")
            const hourlyRate = calculateHourlyRate(compensation.salaryDaily, employee.shiftType);
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

            // Earned wage (for salary on demand) - simplified calculation
            const earnedWage = Math.max(0, netPay * 0.8); // 80% of net available

            // Create prenomina record
            const prenominaData: Omit<PrenominaRecord, 'id'> = {
                employeeId: employee.id,
                employeeName: employee.fullName,
                employeeRfc: employee.rfc_curp,
                periodStart: params.periodStart,
                periodEnd: params.periodEnd,
                periodType: params.periodType,
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
                createdAt: now,
                updatedAt: now
            };

            const prenominaRef = collection(firestore, 'prenomina');
            const docRef = await addDoc(prenominaRef, prenominaData);
            recordIds.push(docRef.id);
        }

        console.log(`[HCM] Consolidated prenomina: ${recordIds.length} records created`);
        return { success: true, recordIds };
    } catch (error) {
        console.error('[HCM] Error consolidating prenomina:', error);
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
 */
export async function calculateEmployeeSettlement(
    params: CalculateSettlementParams
): Promise<{ success: boolean; settlementId?: string; settlement?: SettlementCalculation; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Get employee
        const employeeRef = doc(firestore, 'employees', params.employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;

        // Get latest compensation
        const compQuery = query(
            collection(firestore, 'compensation'),
            where('employeeId', '==', params.employeeId),
            orderBy('effectiveDate', 'desc'),
            limit(1)
        );
        const compSnap = await getDocs(compQuery);

        if (compSnap.empty) {
            return { success: false, error: 'No se encontró compensación para el empleado.' };
        }

        const compensation = compSnap.docs[0].data() as Compensation;

        // Calculate years of service
        const yearsOfService = calculateYearsOfService(employee.hireDate, new Date(params.terminationDate));

        // Calculate days worked in current year
        const yearStart = new Date(new Date(params.terminationDate).getFullYear(), 0, 1);
        const termDate = new Date(params.terminationDate);
        const daysWorkedInYear = Math.ceil((termDate.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));

        // Get vacation days used this year
        const startOfYear = new Date(new Date().getFullYear(), 0, 1).toISOString();
        const incidencesQuery = query(
            collection(firestore, 'incidences'),
            where('employeeId', '==', params.employeeId),
            where('type', '==', 'vacation'),
            where('status', '==', 'approved'),
            where('startDate', '>=', startOfYear)
        );
        const incidencesSnap = await getDocs(incidencesQuery);
        const vacationDaysUsed = incidencesSnap.docs.reduce((total, doc) => {
            return total + (doc.data() as Incidence).totalDays;
        }, 0);

        // Calculate pending salary days (approximation)
        const lastPayDate = new Date(params.terminationDate);
        lastPayDate.setDate(1); // First of month
        const pendingSalaryDays = Math.ceil((termDate.getTime() - lastPayDate.getTime()) / (1000 * 60 * 60 * 24));

        // Use our settlement calculation utility
        const settlement = calculateSettlement(
            compensation.salaryDaily,
            compensation.sdiBase,
            yearsOfService,
            daysWorkedInYear,
            pendingSalaryDays,
            params.terminationType,
            vacationDaysUsed
        );

        // Create settlement record
        const settlementData: Omit<SettlementCalculation, 'id'> = {
            employeeId: params.employeeId,
            employeeName: employee.fullName,
            type: params.terminationType,
            terminationDate: params.terminationDate,
            proportionalVacation: settlement.proportionalVacation,
            proportionalVacationPremium: settlement.proportionalVacationPremium,
            proportionalAguinaldo: settlement.proportionalAguinaldo,
            salaryPending: settlement.salaryPending,
            severancePay: settlement.severancePay,
            seniorityPremium: settlement.seniorityPremium,
            twentyDaysPerYear: settlement.twentyDaysPerYear,
            totalPerceptions: settlement.finiquitoTotal + settlement.liquidacionTotal,
            totalDeductions: 0, // Would include loans, advances, etc.
            netSettlement: settlement.grandTotal,
            status: 'preliminary',
            calculatedAt: now,
            calculatedById: params.calculatedById
        };

        const settlementRef = collection(firestore, 'settlements');
        const docRef = await addDoc(settlementRef, settlementData);

        console.log(`[HCM] Calculated settlement ${docRef.id} for employee ${params.employeeId}`);

        return {
            success: true,
            settlementId: docRef.id,
            settlement: { id: docRef.id, ...settlementData }
        };
    } catch (error) {
        console.error('[HCM] Error calculating settlement:', error);
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
