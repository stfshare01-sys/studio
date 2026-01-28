'use client';

import { doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '../non-blocking-updates';
import { callApproveIncidence, CloudFunctionError } from '../callable-functions';
import type {
    Employee,
    AttendanceRecord,
    Incidence,
    AttendanceImportBatch,
    TimeBank,
    VacationBalance,
    VacationMovement,
    TardinessRecord,
    OvertimeRequest,
    HolidayCalendar,
    OfficialHoliday,
    ShiftType
} from '@/lib/types';
import {
    calculateVacationDays,
    calculateYearsOfService,
    validateWorkday,
    calculateHoursWorked,
    isAnniversaryDate,
    getNextAnniversaryDate
} from '@/lib/hcm-utils';

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
            fileSize: 0,
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
            const rowNum = i + 2;

            try {
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
                    overtimeType: validation.overtimeHours > 0 ? 'double' : undefined,
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
            errors: errors.slice(0, 50),
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
// VACATION BALANCE MANAGEMENT
// =========================================================================

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
                if (balance.daysScheduled >= days) newDaysScheduled -= days;
                break;
            case 'scheduled':
                newDaysScheduled += days;
                break;
            case 'cancelled':
                if (balance.daysTaken >= days) newDaysTaken -= days;
                else if (balance.daysScheduled >= days) newDaysScheduled -= days;
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

export async function resetVacationBalanceOnAnniversary(
    employeeId: string
): Promise<{ success: boolean; newBalance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) return { success: false, error: 'Empleado no encontrado.' };

        const employee = employeeSnap.data() as Employee;

        if (!isAnniversaryDate(employee.hireDate)) return { success: false, error: 'No es fecha de aniversario.' };

        const yearsOfService = calculateYearsOfService(employee.hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const nextAnniversary = getNextAnniversaryDate(employee.hireDate);

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
        return { success: true, newBalance: { id: balanceRef.id, ...newBalance } };
    } catch (error) {
        console.error('[HCM] Error resetting vacation balance:', error);
        return { success: false, error: 'Error reseteando saldo de vacaciones.' };
    }
}

// =========================================================================
// TIME BANK
// =========================================================================

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

        const movement = {
            id: `mov_${Date.now()}`,
            type,
            hours,
            date: now,
            description,
            approvedById
        };

        if (type === 'earn') currentBank.hoursEarned += hours;
        else currentBank.hoursUsed += hours;

        currentBank.hoursBalance = currentBank.hoursEarned - currentBank.hoursUsed - currentBank.hoursExpired;
        currentBank.lastUpdated = now;
        currentBank.movements = [...currentBank.movements, movement].slice(-50);

        setDocumentNonBlocking(timeBankRef, currentBank, { merge: true });

        console.log(`[HCM] Updated time bank for ${employeeId}: ${type} ${hours} hours`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating time bank:', error);
        return { success: false, error: 'Error actualizando bolsa de horas.' };
    }
}

// =========================================================================
// TARDINESS
// =========================================================================

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

        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        const minutesLate = (actH * 60 + actM) - (schedH * 60 + schedM);

        if (minutesLate <= 0) return { success: false, error: 'No hay retardo.' };

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
        return { success: true, tardinessId: tardinessRef.id, sanctionApplied };
    } catch (error) {
        console.error('[HCM] Error recording tardiness:', error);
        return { success: false, error: 'Error registrando retardo.' };
    }
}

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

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying tardiness:', error);
        return { success: false, error: 'Error justificando retardo.' };
    }
}

export async function resetTardinessCounter(
    employeeId: string,
    resetById: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0])
        );
        const tardinessSnap = await getDocs(tardinessQuery);

        for (const docSnap of tardinessSnap.docs) {
            await updateDoc(doc(firestore, 'tardiness_records', docSnap.id), {
                sanctionResetById: resetById,
                updatedAt: now,
            });
        }
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error resetting tardiness counter:', error);
        return { success: false, error: 'Error reseteando contador de retardos.' };
    }
}

// =========================================================================
// OVERTIME REQUESTS
// =========================================================================

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
        return { success: true, requestId: requestRef.id };
    } catch (error) {
        console.error('[HCM] Error creating overtime request:', error);
        return { success: false, error: 'Error creando solicitud de horas extras.' };
    }
}

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

        if (action === 'partial' && hoursApproved !== undefined) updateData.hoursApproved = hoursApproved;
        if (action === 'reject' && rejectionReason) updateData.rejectionReason = rejectionReason;

        await updateDoc(requestRef, updateData);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error processing overtime request:', error);
        return { success: false, error: 'Error procesando solicitud de horas extras.' };
    }
}

// =========================================================================
// HOLIDAY CALENDAR
// =========================================================================

export async function getHolidayCalendar(
    year: number,
    locationId?: string
): Promise<{ success: boolean; calendar?: HolidayCalendar; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        if (locationId) {
            const locCalendarQuery = query(
                collection(firestore, 'holiday_calendars'),
                where('year', '==', year),
                where('locationId', '==', locationId),
                limit(1)
            );
            const locSnap = await getDocs(locCalendarQuery);
            if (!locSnap.empty) {
                return { success: true, calendar: { id: locSnap.docs[0].id, ...locSnap.docs[0].data() } as HolidayCalendar };
            }
        }

        const globalCalendarQuery = query(
            collection(firestore, 'holiday_calendars'),
            where('year', '==', year),
            limit(1)
        );
        const globalSnap = await getDocs(globalCalendarQuery);

        if (!globalSnap.empty) {
            return { success: true, calendar: { id: globalSnap.docs[0].id, ...globalSnap.docs[0].data() } as HolidayCalendar };
        }

        // Create default
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

export async function isHoliday(
    date: string,
    locationId?: string
): Promise<{ isHoliday: boolean; holiday?: OfficialHoliday; error?: string }> {
    try {
        const year = new Date(date).getFullYear();
        const calendarResult = await getHolidayCalendar(year, locationId);
        if (!calendarResult.success || !calendarResult.calendar) return { isHoliday: false };

        const holiday = calendarResult.calendar.holidays.find(h => h.date === date);
        return { isHoliday: !!holiday, holiday };
    } catch (error) {
        console.error('[HCM] Error checking holiday:', error);
        return { isHoliday: false, error: 'Error verificando dia festivo.' };
    }
}
