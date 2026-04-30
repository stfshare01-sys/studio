'use client';

import {
    doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, limit,
    serverTimestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { checkAttendanceTaskCompletion } from './task-completion-actions';
import { notifyMissingPunch } from './notification-actions';
import { format } from 'date-fns';
import type { Employee, MissingPunchRecord, MissingPunchType, AttendanceRecord } from "@/types/hcm.types";
import { recordTardiness } from './tardiness-actions';
import { recordEarlyDeparture } from './early-departure-actions';

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


        // Verificar si el empleado está exento de asistencia
        let isExempt = false;
        let managerId: string | undefined;
        let isHomeOfficeEmployee = false;
        try {
            const empDoc = await getDoc(doc(firestore, 'employees', employeeId));
            if (empDoc.exists()) {
                const empData = empDoc.data();
                managerId = empData.managerId as string | undefined;
                isHomeOfficeEmployee = Array.isArray(empData.homeOfficeDays) && empData.homeOfficeDays.length > 0;
                if (empData.positionId) {
                    const posDoc = await getDoc(doc(firestore, 'positions', empData.positionId));
                    if (posDoc.exists() && posDoc.data().isExemptFromAttendance) {
                        isExempt = true;
                    }
                }
            }
        } catch (err) {
            console.warn('[HCM] Error checking exemption for missing punch:', err);
        }

        if (isExempt) {
            console.log(`[HCM] Skipping missing punch for ${employeeName} (Position is exempt)`);
            return { success: true }; // Ignorarlo silenciosamente
        }

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
                    updatedAt: serverTimestamp(),
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const missingPunchRef = await addDoc(
            collection(firestore, 'missing_punches'),
            missingPunchData
        );

        // Notificar al jefe directo sobre el marcaje faltante
        // Se dispara junto con la importación de asistencia — no requiere Cloud Function adicional
        if (managerId) {
            try {
                await notifyMissingPunch(firestore, managerId, employeeName, date, missingType, isHomeOfficeEmployee);
            } catch (notifError) {
                // La notificación falla silenciosamente para no bloquear el registro
                console.warn('[HCM] notifyMissingPunch falló pero el registro se creó:', notifError);
            }
        } else {
            console.warn(`[HCM] No se encontró managerId para ${employeeName} — notificación omitida.`);
        }

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


        const missingPunchRef = doc(firestore, 'missing_punches', missingPunchId);
        const missingPunchSnap = await getDoc(missingPunchRef);

        if (!missingPunchSnap.exists()) {
            return { success: false, error: 'Registro de marcaje faltante no encontrado.' };
        }

        const missingPunch = missingPunchSnap.data() as MissingPunchRecord;
        let generatedTardinessId: string | undefined;
        let generatedEarlyDepartureId: string | undefined;

        // ─── Resolución del turno real desde Firestore ─────────────
        // El frontend puede pasar el default 09:00-18:00 si no resolvió el turno.
        // Aquí lo resolvemos directamente desde los datos del backend.
        let resolvedEntry = scheduledEntryTime;
        let resolvedExit = scheduledExitTime;

        // 1. Leer del registro de asistencia (tiene el scheduledStart/End de la importación)
        if (missingPunch.attendanceRecordId && missingPunch.attendanceRecordId !== '__pending__') {
            try {
                const attRef = doc(firestore, 'attendance', missingPunch.attendanceRecordId);
                const attSnap = await getDoc(attRef);
                if (attSnap.exists()) {
                    const attData = attSnap.data();
                    if (attData.scheduledStart) resolvedEntry = attData.scheduledStart;
                    if (attData.scheduledEnd) resolvedExit = attData.scheduledEnd;
                    console.log(`[HCM] justifyMissingPunch: shift from attendance record: ${resolvedEntry}-${resolvedExit}`);
                }
            } catch (attErr) {
                console.warn('[HCM] Could not read attendance record for shift resolution:', attErr);
            }
        }

        // 2. Si no se resolvió del attendance, leer del empleado → su turno en shifts
        if (resolvedEntry === scheduledEntryTime && (resolvedEntry === '09:00' || resolvedEntry === '09:00:00')) {
            try {
                const empRef = doc(firestore, 'employees', missingPunch.employeeId);
                const empSnap = await getDoc(empRef);
                if (empSnap.exists()) {
                    const empData = empSnap.data();
                    const shiftId = empData.customShiftId || empData.shiftId;
                    if (shiftId) {
                        const shiftRef = doc(firestore, 'shifts', shiftId);
                        const shiftSnap = await getDoc(shiftRef);
                        if (shiftSnap.exists()) {
                            const shiftData = shiftSnap.data();
                            resolvedEntry = shiftData.startTime || resolvedEntry;
                            resolvedExit = shiftData.endTime || resolvedExit;
                            console.log(`[HCM] justifyMissingPunch: shift from employee record: ${resolvedEntry}-${resolvedExit}`);
                        }
                    }
                }
            } catch (empErr) {
                console.warn('[HCM] Could not read employee shift for resolution:', empErr);
            }
        }

        // 3. Obtener la tolerancia real de la sede del empleado (ignorar el hardcode 10 del frontend)
        let realTolerance = toleranceMinutes;
        try {
            const empRef = doc(firestore, 'employees', missingPunch.employeeId);
            const empSnap = await getDoc(empRef);
            if (empSnap.exists()) {
                const empData = empSnap.data();
                const locationId = empData.locationId;
                if (locationId) {
                    const locRef = doc(firestore, 'locations', locationId);
                    const locSnap = await getDoc(locRef);
                    if (locSnap.exists() && typeof locSnap.data().toleranceMinutes === 'number') {
                        realTolerance = locSnap.data().toleranceMinutes;
                        console.log(`[HCM] justifyMissingPunch: using location tolerance = ${realTolerance}`);
                    }
                }
            }
        } catch (tolErr) {
            console.warn('[HCM] Could not read location tolerance, using fallback:', tolErr);
        }

        // Usar los horarios resueltos
        scheduledEntryTime = resolvedEntry;
        scheduledExitTime = resolvedExit;
        console.log(`[HCM] justifyMissingPunch: FINAL schedule: entry=${scheduledEntryTime}, exit=${scheduledExitTime}`);

        // Verificar si la hora proporcionada genera retardo
        if (providedEntryTime && (missingPunch.missingType === 'entry' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledEntryTime.split(':').map(Number);
            const [provH, provM] = providedEntryTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const lateMinutes = providedMinutes - scheduledMinutes;

            console.log(`[HCM] justifyMissingPunch: entry check for ${missingPunch.employeeName} on ${missingPunch.date}`);
            console.log(`[HCM]   scheduledEntry=${scheduledEntryTime}, providedEntry=${providedEntryTime}`);
            console.log(`[HCM]   lateMinutes=${lateMinutes}, tolerance=${realTolerance}, willCreateTardiness=${lateMinutes > realTolerance}`);

            if (lateMinutes > realTolerance) {
                // Generar registro de retardo
                const tardinessResult = await recordTardiness(
                    missingPunch.employeeId,
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledEntryTime,
                    providedEntryTime,
                    realTolerance
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
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
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
                                updatedAt: serverTimestamp()
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
            justifiedAt: serverTimestamp(),
            resultedInAbsence: false,
            updatedAt: serverTimestamp(),
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
        const startDate = format(ninetyDaysAgo, 'yyyy-MM-dd');

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
                    const missingPunch: Omit<MissingPunchRecord, 'id'> = {
                        employeeId: att.employeeId,
                        employeeName: att.employeeName,
                        date: att.date,
                        attendanceRecordId: attDoc.id,
                        missingType,
                        isJustified: false,
                        resultedInAbsence: false,
                        createdAt: serverTimestamp(),
                        updatedAt: serverTimestamp()
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
