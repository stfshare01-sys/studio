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

// =========================================================================
// SALIDAS TEMPRANAS (EARLY DEPARTURES)
// =========================================================================

/**
 * Tipo importado desde hcm-operational
 * (mantenemos aquí para referencia, el tipo real está en types)
 */
interface EarlyDepartureRecord {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    attendanceRecordId: string;
    scheduledTime: string;
    actualTime: string;
    minutesEarly: number;
    isJustified: boolean;
    justificationReason?: string;
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    resultedInAbsence: boolean;
    linkedAbsenceId?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Registra una salida temprana
 * Se crea cuando un empleado sale antes de su hora programada
 *
 * @param employeeId - ID del empleado
 * @param employeeName - Nombre del empleado
 * @param date - Fecha (YYYY-MM-DD)
 * @param attendanceRecordId - ID del registro de asistencia
 * @param scheduledTime - Hora programada de salida
 * @param actualTime - Hora real de salida
 * @returns Resultado con ID del registro creado
 */
export async function recordEarlyDeparture(
    employeeId: string,
    employeeName: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string
): Promise<{ success: boolean; earlyDepartureId?: string; minutesEarly?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calcular minutos de salida anticipada
        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        const scheduledMinutes = schedH * 60 + schedM;
        const actualMinutes = actH * 60 + actM;
        const minutesEarly = scheduledMinutes - actualMinutes;

        if (minutesEarly <= 0) {
            return { success: false, error: 'No hay salida temprana (salió a tiempo o después).' };
        }

        const earlyDepartureData: Omit<EarlyDepartureRecord, 'id'> = {
            employeeId,
            employeeName,
            date,
            attendanceRecordId,
            scheduledTime,
            actualTime,
            minutesEarly,
            isJustified: false,
            resultedInAbsence: true, // Por defecto, salida temprano injustificada = falta
            createdAt: now,
            updatedAt: now,
        };

        const earlyDepartureRef = await addDoc(
            collection(firestore, 'early_departures'),
            earlyDepartureData
        );

        console.log(`[HCM] Recorded early departure ${earlyDepartureRef.id} for ${employeeName} - ${minutesEarly} min early`);
        return { success: true, earlyDepartureId: earlyDepartureRef.id, minutesEarly };
    } catch (error) {
        console.error('[HCM] Error recording early departure:', error);
        return { success: false, error: 'No se pudo registrar la salida temprana.' };
    }
}

/**
 * Justifica una salida temprana
 * Si se justifica, el día NO se marca como falta
 *
 * @param earlyDepartureId - ID del registro de salida temprana
 * @param reason - Motivo de justificación
 * @param justifiedById - ID del usuario que justifica
 * @param justifiedByName - Nombre del usuario que justifica
 * @returns Resultado de la operación
 */
export async function justifyEarlyDeparture(
    earlyDepartureId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const earlyDepartureRef = doc(firestore, 'early_departures', earlyDepartureId);
        const earlyDepartureSnap = await getDoc(earlyDepartureRef);

        if (!earlyDepartureSnap.exists()) {
            return { success: false, error: 'Registro de salida temprana no encontrado.' };
        }

        await updateDoc(earlyDepartureRef, {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            resultedInAbsence: false, // Ya no es falta
            updatedAt: now,
        });

        console.log(`[HCM] Justified early departure ${earlyDepartureId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying early departure:', error);
        return { success: false, error: 'No se pudo justificar la salida temprana.' };
    }
}

/**
 * Obtiene las salidas tempranas pendientes de justificar para un período
 *
 * @param startDate - Fecha inicio del período
 * @param endDate - Fecha fin del período
 * @param employeeId - Opcional: filtrar por empleado
 * @returns Lista de salidas tempranas pendientes
 */
export async function getPendingEarlyDepartures(
    startDate: string,
    endDate: string,
    employeeId?: string
): Promise<{ success: boolean; records?: EarlyDepartureRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        let earlyDeparturesQuery = query(
            collection(firestore, 'early_departures'),
            where('isJustified', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        if (employeeId) {
            earlyDeparturesQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', employeeId),
                where('isJustified', '==', false),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        }

        const snapshot = await getDocs(earlyDeparturesQuery);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as EarlyDepartureRecord[];

        return { success: true, records };
    } catch (error) {
        console.error('[HCM] Error getting pending early departures:', error);
        return { success: false, error: 'Error obteniendo salidas tempranas pendientes.' };
    }
}

// =========================================================================
// MARCAJES FALTANTES (MISSING PUNCHES)
// =========================================================================

/**
 * Tipo de marcaje faltante
 */
type MissingPunchType = 'entry' | 'exit' | 'both';

/**
 * Tipo importado desde hcm-operational
 */
interface MissingPunchRecord {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    attendanceRecordId?: string;
    missingType: MissingPunchType;
    isJustified: boolean;
    justificationReason?: string;
    providedEntryTime?: string;
    providedExitTime?: string;
    generatedTardinessId?: string;
    generatedEarlyDepartureId?: string;
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    resultedInAbsence: boolean;
    linkedAbsenceId?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Registra un marcaje faltante
 *
 * @param employeeId - ID del empleado
 * @param employeeName - Nombre del empleado
 * @param date - Fecha (YYYY-MM-DD)
 * @param missingType - Qué marcaje falta
 * @param attendanceRecordId - ID del registro de asistencia (si existe)
 * @returns Resultado con ID del registro creado
 */
export async function recordMissingPunch(
    employeeId: string,
    employeeName: string,
    date: string,
    missingType: MissingPunchType,
    attendanceRecordId?: string
): Promise<{ success: boolean; missingPunchId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Verificar que no exista ya un registro para esta fecha y empleado
        const existingQuery = query(
            collection(firestore, 'missing_punches'),
            where('employeeId', '==', employeeId),
            where('date', '==', date),
            limit(1)
        );
        const existingSnap = await getDocs(existingQuery);

        if (!existingSnap.empty) {
            // Actualizar el registro existente si el tipo de falta es mayor
            const existing = existingSnap.docs[0].data() as MissingPunchRecord;
            if (missingType === 'both' || (existing.missingType !== 'both' && existing.missingType !== missingType)) {
                await updateDoc(existingSnap.docs[0].ref, {
                    missingType: missingType === 'both' ? 'both' : (existing.missingType === 'entry' && missingType === 'exit' ? 'both' : missingType),
                    updatedAt: now,
                });
                return { success: true, missingPunchId: existingSnap.docs[0].id };
            }
            return { success: true, missingPunchId: existingSnap.docs[0].id };
        }

        const missingPunchData: Omit<MissingPunchRecord, 'id'> = {
            employeeId,
            employeeName,
            date,
            attendanceRecordId,
            missingType,
            isJustified: false,
            resultedInAbsence: true, // Por defecto, marcaje faltante = falta
            createdAt: now,
            updatedAt: now,
        };

        const missingPunchRef = await addDoc(
            collection(firestore, 'missing_punches'),
            missingPunchData
        );

        console.log(`[HCM] Recorded missing punch ${missingPunchRef.id} for ${employeeName} - type: ${missingType}`);
        return { success: true, missingPunchId: missingPunchRef.id };
    } catch (error) {
        console.error('[HCM] Error recording missing punch:', error);
        return { success: false, error: 'No se pudo registrar el marcaje faltante.' };
    }
}

/**
 * Justifica un marcaje faltante
 * Requiere proporcionar la hora del marcaje faltante
 * Si la hora no cuadra con el horario, se genera retardo o salida temprana
 *
 * @param missingPunchId - ID del registro de marcaje faltante
 * @param reason - Motivo de justificación
 * @param providedEntryTime - Hora de entrada proporcionada (si faltaba entrada)
 * @param providedExitTime - Hora de salida proporcionada (si faltaba salida)
 * @param scheduledEntryTime - Hora programada de entrada (para comparar)
 * @param scheduledExitTime - Hora programada de salida (para comparar)
 * @param justifiedById - ID del usuario que justifica
 * @param justifiedByName - Nombre del usuario que justifica
 * @param toleranceMinutes - Minutos de tolerancia para entrada
 * @returns Resultado de la operación
 */
export async function justifyMissingPunch(
    missingPunchId: string,
    reason: string,
    providedEntryTime: string | undefined,
    providedExitTime: string | undefined,
    scheduledEntryTime: string,
    scheduledExitTime: string,
    justifiedById: string,
    justifiedByName: string,
    toleranceMinutes: number = 10
): Promise<{
    success: boolean;
    generatedTardinessId?: string;
    generatedEarlyDepartureId?: string;
    error?: string
}> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const missingPunchRef = doc(firestore, 'missing_punches', missingPunchId);
        const missingPunchSnap = await getDoc(missingPunchRef);

        if (!missingPunchSnap.exists()) {
            return { success: false, error: 'Registro de marcaje faltante no encontrado.' };
        }

        const missingPunch = missingPunchSnap.data() as MissingPunchRecord;
        let generatedTardinessId: string | undefined;
        let generatedEarlyDepartureId: string | undefined;

        // Verificar si la hora proporcionada genera retardo
        if (providedEntryTime && (missingPunch.missingType === 'entry' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledEntryTime.split(':').map(Number);
            const [provH, provM] = providedEntryTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const lateMinutes = providedMinutes - scheduledMinutes;

            if (lateMinutes > toleranceMinutes) {
                // Generar registro de retardo
                const tardinessResult = await recordTardiness(
                    missingPunch.employeeId,
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledEntryTime,
                    providedEntryTime
                );
                if (tardinessResult.success && tardinessResult.tardinessId) {
                    generatedTardinessId = tardinessResult.tardinessId;
                }
            }
        }

        // Verificar si la hora proporcionada genera salida temprana
        if (providedExitTime && (missingPunch.missingType === 'exit' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledExitTime.split(':').map(Number);
            const [provH, provM] = providedExitTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const earlyMinutes = scheduledMinutes - providedMinutes;

            if (earlyMinutes > 0) {
                // Generar registro de salida temprana
                const earlyResult = await recordEarlyDeparture(
                    missingPunch.employeeId,
                    missingPunch.employeeName || '',
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledExitTime,
                    providedExitTime
                );
                if (earlyResult.success && earlyResult.earlyDepartureId) {
                    generatedEarlyDepartureId = earlyResult.earlyDepartureId;
                }
            }
        }

        // Actualizar el registro de marcaje faltante
        await updateDoc(missingPunchRef, {
            isJustified: true,
            justificationReason: reason,
            providedEntryTime,
            providedExitTime,
            generatedTardinessId,
            generatedEarlyDepartureId,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            resultedInAbsence: false, // Ya no es falta automática
            updatedAt: now,
        });

        console.log(`[HCM] Justified missing punch ${missingPunchId}`);
        return { success: true, generatedTardinessId, generatedEarlyDepartureId };
    } catch (error) {
        console.error('[HCM] Error justifying missing punch:', error);
        return { success: false, error: 'No se pudo justificar el marcaje faltante.' };
    }
}

/**
 * Obtiene los marcajes faltantes pendientes de justificar para un período
 *
 * @param startDate - Fecha inicio del período
 * @param endDate - Fecha fin del período
 * @param employeeId - Opcional: filtrar por empleado
 * @returns Lista de marcajes faltantes pendientes
 */
export async function getPendingMissingPunches(
    startDate: string,
    endDate: string,
    employeeId?: string
): Promise<{ success: boolean; records?: MissingPunchRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        let missingPunchesQuery = query(
            collection(firestore, 'missing_punches'),
            where('isJustified', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        if (employeeId) {
            missingPunchesQuery = query(
                collection(firestore, 'missing_punches'),
                where('employeeId', '==', employeeId),
                where('isJustified', '==', false),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        }

        const snapshot = await getDocs(missingPunchesQuery);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as MissingPunchRecord[];

        return { success: true, records };
    } catch (error) {
        console.error('[HCM] Error getting pending missing punches:', error);
        return { success: false, error: 'Error obteniendo marcajes faltantes pendientes.' };
    }
}
