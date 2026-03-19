'use client';

/**
 * tardiness-actions.ts
 *
 * Gestión de retardos, salidas tempranas y marcajes faltantes.
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Estas tres secciones están en el mismo archivo porque están acopladas:
 * - justifyMissingPunch llama a recordTardiness y recordEarlyDeparture
 *
 * Funciones exportadas:
 *  - recordTardiness
 *  - justifyTardiness
 *  - markTardinessUnjustified
 *  - resetTardinessCounter
 *  - recordEarlyDeparture
 *  - justifyEarlyDeparture
 *  - getPendingEarlyDepartures
 *  - recordMissingPunch
 *  - justifyMissingPunch
 *  - getPendingMissingPunches
 *  - syncAllMissingPunches
 *  - syncMissingPunchesForEmployee
 */

import {
    doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, limit,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type {
    Employee,
    AttendanceRecord,
    TardinessRecord,
    EarlyDeparture,
} from '@/lib/types';
import type { MissingPunchRecord, MissingPunchType } from '@/types/hcm-operational';
import { addDebtToHourBank } from './hour-bank-actions';
import { checkAttendanceTaskCompletion } from './task-completion-actions';

// =========================================================================
// TARDINESS
// =========================================================================

export async function recordTardiness(
    employeeId: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string,
    toleranceMinutes: number = 0
): Promise<{ success: boolean; tardinessId?: string; sanctionApplied?: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        // Restar tolerancia del retardo: solo cuentan los minutos DESPUÉS de la tolerancia
        const minutesLate = (actH * 60 + actM) - (schedH * 60 + schedM) - toleranceMinutes;

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
            justificationStatus: 'pending',
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
    justifiedById: string,
    justifiedByName: string,
    useHourBank: boolean = false,
    justificationType?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        const tardinessSnap = await getDoc(tardinessRef);
        if (!tardinessSnap.exists()) {
            return { success: false, error: 'Registro de retardo no encontrado.' };
        }
        const tardiness = tardinessSnap.data() as TardinessRecord;

        await updateDoc(tardinessRef, {
            isJustified: true,
            justificationStatus: useHourBank ? 'compensated' : 'justified',
            justificationReason: reason,
            justificationType,
            justifiedById,
            justifiedAt: now,
            sanctionApplied: false,
            updatedAt: now,
            hourBankApplied: useHourBank
        });

        // NOTA: Overtime ya NO se recalcula al justificar retardo.
        // Overtime siempre es checkOut - scheduledEnd (sin descontar retardos).
        // El mecanismo de bolsa de horas maneja los descuentos por separado.

        if (useHourBank) {
            console.log(`[HCM] Adding ${tardiness.minutesLate} min debt to hour bank for employee ${tardiness.employeeId}`);
            const hbResult = await addDebtToHourBank({
                employeeId: tardiness.employeeId,
                date: tardiness.date,
                type: 'tardiness',
                minutes: tardiness.minutesLate,
                reason: `Retardo justificado con bolsa de horas: ${reason}`,
                sourceRecordId: tardinessId,
                createdById: justifiedById,
                createdByName: justifiedByName
            });
            if (!hbResult.success) {
                console.error('[HCM] Failed to add debt to hour bank:', hbResult.error);
                return { success: false, error: `Retardo justificado, pero no se pudo registrar en bolsa de horas: ${hbResult.error}` };
            }
            console.log(`[HCM] Hour bank updated. New balance: ${hbResult.newBalance} min, movement: ${hbResult.movementId}`);
        }

        // Check if this completes any pending tasks
        // Basado en Plan de Implementación de NotebookLM
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
            // Don't fail the justification if task check fails
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying tardiness:', error);
        return { success: false, error: 'Error justificando retardo.' };
    }
}

export async function markTardinessUnjustified(
    tardinessId: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        await updateDoc(tardinessRef, {
            isJustified: false, // Remains false so it counts as infraction/strike
            justificationStatus: 'unjustified',
            justificationType: 'unjustified',
            justificationReason: 'Marcado como injustificado por supervisor',
            justifiedById,
            justifiedAt: now,
            updatedAt: now
        });

        // Check if this completes any pending tasks
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error marking tardiness unjustified:', error);
        return { success: false, error: 'Error marcando retardo como injustificado.' };
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
// SALIDAS TEMPRANAS (EARLY DEPARTURES)
// =========================================================================

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
 * Registra un marcaje faltante
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
            resultedInAbsence: false, // Pendiente hasta que el jefe decida: justificar o marcar falta
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

            console.log(`[HCM] justifyMissingPunch: entry check for ${missingPunch.employeeName} on ${missingPunch.date}`);
            console.log(`[HCM]   scheduledEntry=${scheduledEntryTime}, providedEntry=${providedEntryTime}`);
            console.log(`[HCM]   lateMinutes=${lateMinutes}, tolerance=${toleranceMinutes}, willCreateTardiness=${lateMinutes > toleranceMinutes}`);

            if (lateMinutes > toleranceMinutes) {
                // Generar registro de retardo — pasar tolerancia 0 porque ya la descontamos aquí
                const tardinessResult = await recordTardiness(
                    missingPunch.employeeId,
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledEntryTime,
                    providedEntryTime,
                    toleranceMinutes
                );
                console.log(`[HCM]   recordTardiness result:`, tardinessResult);
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

        // -----------------------------------------------------------------
        // OVERTIME: Si providedExitTime > scheduledExitTime → generar horas extra
        // -----------------------------------------------------------------
        let generatedOvertimeId: string | undefined;
        if (providedExitTime && (missingPunch.missingType === 'exit' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledExitTime.split(':').map(Number);
            const [provH, provM] = providedExitTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const overtimeMinutes = providedMinutes - scheduledMinutes;

            if (overtimeMinutes > 0) {
                const overtimeHours = Math.round((overtimeMinutes / 60) * 100) / 100;
                const doubleHours = Math.min(overtimeHours, 3);
                const tripleHours = Math.max(0, Math.round((overtimeHours - 3) * 100) / 100);

                try {
                    const otRef = await addDoc(collection(firestore, 'overtime_requests'), {
                        employeeId: missingPunch.employeeId,
                        employeeName: missingPunch.employeeName || '',
                        date: missingPunch.date,
                        hoursRequested: overtimeHours,
                        doubleHours: Math.round(doubleHours * 100) / 100,
                        tripleHours,
                        reason: `Horas extra generadas al justificar marcaje faltante (salida ${providedExitTime} vs programada ${scheduledExitTime})`,
                        status: 'pending',
                        createdAt: now,
                        updatedAt: now
                    });
                    generatedOvertimeId = otRef.id;
                    console.log(`[HCM] Created overtime_request ${otRef.id} for ${missingPunch.employeeName}: ${overtimeHours}h (${doubleHours}h dobles + ${tripleHours}h triples)`);

                    // Actualizar attendance record con nuevas horas
                    if (missingPunch.attendanceRecordId) {
                        const attendanceRef = doc(firestore, 'attendance', missingPunch.attendanceRecordId);
                        const attendanceSnap = await getDoc(attendanceRef);
                        if (attendanceSnap.exists()) {
                            await updateDoc(attendanceRef, {
                                checkOut: providedExitTime,
                                overtimeHours,
                                rawOvertimeHours: overtimeHours,
                                payableOvertimeHours: overtimeHours,
                                updatedAt: now
                            });
                        }
                    }
                } catch (otError) {
                    console.warn('[HCM] Error creating overtime from missing punch:', otError);
                }
            }
        }

        // Actualizar el registro de marcaje faltante
        // Only include fields that have values (Firestore rejects undefined)
        const updateData: Record<string, any> = {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            resultedInAbsence: false,
            updatedAt: now,
        };
        if (providedEntryTime !== undefined) updateData.providedEntryTime = providedEntryTime;
        if (providedExitTime !== undefined) updateData.providedExitTime = providedExitTime;
        if (generatedTardinessId !== undefined) updateData.generatedTardinessId = generatedTardinessId;
        if (generatedEarlyDepartureId !== undefined) updateData.generatedEarlyDepartureId = generatedEarlyDepartureId;

        await updateDoc(missingPunchRef, updateData);

        // Check if this completes any pending tasks
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === missingPunchId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
        }

        console.log(`[HCM] Justified missing punch ${missingPunchId}`);
        return { success: true, generatedTardinessId, generatedEarlyDepartureId };
    } catch (error) {
        console.error('[HCM] Error justifying missing punch:', error);
        return { success: false, error: 'No se pudo justificar el marcaje faltante.' };
    }
}

/**
 * Obtiene los marcajes faltantes pendientes de justificar para un período
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

/**
 * Sincroniza retroactivamente los marcajes faltantes para todos los empleados
 */
export async function syncAllMissingPunches(): Promise<{ success: boolean; count: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const employeesSnap = await getDocs(collection(firestore, 'employees'));

        let totalCreated = 0;
        for (const employeeDoc of employeesSnap.docs) {
            const employee = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;
            const result = await syncMissingPunchesForEmployee(employee.id);
            if (result.success) {
                totalCreated += result.count;
            }
        }

        console.log(`[HCM] Sync finished. Created ${totalCreated} missing punch records.`);
        return { success: true, count: totalCreated };
    } catch (error) {
        console.error('[HCM] Error syncing all missing punches:', error);
        return { success: false, count: 0, error: 'Error al sincronizar marcajes faltantes.' };
    }
}

/**
 * Sincroniza los marcajes faltantes para un empleado específico
 * Escanea los registros de asistencia y crea los missing_punches correspondientes si no existen
 */
export async function syncMissingPunchesForEmployee(employeeId: string): Promise<{ success: boolean; count: number }> {
    try {
        const { firestore } = initializeFirebase();

        // 1. Obtener los últimos 90 días de asistencia para este empleado
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const startDate = ninetyDaysAgo.toISOString().split('T')[0];

        const attendanceQuery = query(
            collection(firestore, 'attendance'),
            where('employeeId', '==', employeeId),
            where('date', '>=', startDate)
        );

        const attendanceSnap = await getDocs(attendanceQuery);
        let createdCount = 0;

        for (const attDoc of attendanceSnap.docs) {
            const att = attDoc.data() as AttendanceRecord;

            // Determinar si falta algún marcaje
            let missingType: MissingPunchType | null = null;
            if (!att.checkIn && !att.checkOut) missingType = 'both';
            else if (!att.checkIn) missingType = 'entry';
            else if (!att.checkOut) missingType = 'exit';

            if (missingType) {
                // Si es su día de descanso y no tiene ningún marcaje, simplemente no fue, no es falta
                if (att.isRestDay && !att.isRestDayWorked && missingType === 'both') {
                    continue;
                }

                // Verificar si ya existe un registro en missing_punches para este marcaje
                const existingQuery = query(
                    collection(firestore, 'missing_punches'),
                    where('attendanceRecordId', '==', attDoc.id)
                );
                const existingSnap = await getDocs(existingQuery);

                if (existingSnap.empty) {
                    // Crear el registro de marcaje faltante
                    const now = new Date().toISOString();
                    const missingPunch: Omit<MissingPunchRecord, 'id'> = {
                        employeeId: att.employeeId,
                        employeeName: att.employeeName,
                        date: att.date,
                        attendanceRecordId: attDoc.id,
                        missingType,
                        isJustified: false,
                        resultedInAbsence: false,
                        createdAt: now,
                        updatedAt: now
                    };
                    await addDoc(collection(firestore, 'missing_punches'), missingPunch);
                    createdCount++;
                }
            }
        }

        return { success: true, count: createdCount };
    } catch (error) {
        console.error(`[HCM] Error syncing missing punches for ${employeeId}:`, error);
        return { success: false, count: 0 };
    }
}
