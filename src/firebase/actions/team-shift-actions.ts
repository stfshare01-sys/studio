'use client';

/**
 * team-shift-actions.ts
 *
 * Gestión de asignaciones de turno y cambios de horario del equipo.
 * Cubre flujos de asignación temporal/permanente y consultas de historial.
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - assignShift
 *  - cancelShiftAssignment
 *  - getTeamShiftAssignments
 *  - getEmployeeShiftHistory
 *  - getAvailableShifts
 *  - changeEmployeeSchedule
 *  - cancelScheduleChange
 *  - getTeamScheduleChanges
 */

import {
    doc,
    collection,
    addDoc,
    updateDoc,
    getDocs,
    getDoc,
    deleteDoc,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '../non-blocking-updates';
import {
    notifyShiftAssigned,
    notifyScheduleChanged
} from './notification-actions';
import { getDirectReports } from './team-queries';
import type { ShiftAssignment, ScheduleChange, CustomShift } from '@/lib/types';

// =========================================================================
// ASIGNACIÓN DE TURNOS
// =========================================================================

/**
 * Asigna un turno a un empleado (temporal o permanente)
 */
export async function assignShift(
    employeeId: string,
    employeeName: string,
    newShiftId: string,
    newShiftName: string,
    assignmentType: 'temporary' | 'permanent',
    startDate: string,
    reason: string,
    assignedById: string,
    assignedByName: string,
    endDate?: string,
    originalShiftId?: string,
    originalShiftName?: string
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Validar que si es temporal, tenga fecha fin
        if (assignmentType === 'temporary' && !endDate) {
            return { success: false, error: 'Las asignaciones temporales requieren fecha de fin.' };
        }

        // Build assignment data without undefined values (Firestore doesn't accept undefined)
        const assignmentData: Record<string, unknown> = {
            employeeId,
            employeeName,
            newShiftId,
            newShiftName,
            assignmentType,
            startDate,
            reason,
            status: 'active',
            assignedById,
            assignedByName,
            assignedAt: now,
            createdAt: now,
            updatedAt: now
        };

        // Only add optional fields if they have values
        if (originalShiftId) assignmentData.originalShiftId = originalShiftId;
        if (originalShiftName) assignmentData.originalShiftName = originalShiftName;
        if (endDate) assignmentData.endDate = endDate;

        const ref = await addDoc(collection(firestore, 'shift_assignments'), assignmentData);

        // Si es permanente, actualizar el turno del empleado
        if (assignmentType === 'permanent') {
            const employeeRef = doc(firestore, 'employees', employeeId);
            updateDocumentNonBlocking(employeeRef, {
                customShiftId: newShiftId,
                updatedAt: now
            });
        }

        // Send notification to employee
        notifyShiftAssigned(
            firestore,
            employeeId,
            newShiftName,
            startDate,
            endDate,
            assignmentType === 'permanent',
            assignedById,
            assignedByName
        );

        // ── RECÁLCULO DE RETARDOS PARA TURNO TEMPORAL ────────────────────────
        // Si el turno es temporal, corregir retardos ya registrados en el rango
        // de fechas que corresponden al nuevo horario. No bloquea el flujo.
        if (assignmentType === 'temporary' && endDate && newShiftId) {
            (async () => {
                try {
                    // Obtener el horario del nuevo turno
                    const shiftSnap = await getDoc(doc(firestore, 'shifts', newShiftId));
                    if (!shiftSnap.exists()) return;

                    const shiftData = shiftSnap.data();
                    // Resolver startTime: nivel raíz primero, luego daySchedules si aplica
                    const newStartTime: string = shiftData.startTime || '';
                    const daySchedules: Record<string, { startTime: string }> = shiftData.daySchedules || {};
                    const toleranceMinutes = 10; // mismo default que el import

                    // Buscar retardos pendientes (no justificados) del empleado
                    // Evitamos usar >= y <= en date junto con '==' en isJustified para no requerir índice compuesto en Firestore
                    const tardinessQ = query(
                        collection(firestore, 'tardiness_records'),
                        where('employeeId', '==', employeeId),
                        where('isJustified', '==', false)
                    );
                    const tardinessSnap = await getDocs(tardinessQ);

                    for (const tardinessDoc of tardinessSnap.docs) {
                        const tardData = tardinessDoc.data();
                        const recordDate: string = tardData.date;

                        // Filtrar por fecha en memoria
                        if (recordDate < startDate || recordDate > endDate) continue;


                        // Resolver el startTime correcto para ese día (daySchedules tiene precedencia)
                        let effectiveStart = newStartTime;
                        if (Object.keys(daySchedules).length > 0) {
                            const [y, m, d] = recordDate.split('-').map(Number);
                            const dayOfWeek = new Date(y, m - 1, d).getDay();
                            if (daySchedules[dayOfWeek]?.startTime) {
                                effectiveStart = daySchedules[dayOfWeek].startTime;
                            }
                        }

                        if (!effectiveStart || !tardData.actualTime) continue;

                        // Recalcular minutesLate con el nuevo horario
                        const [sH, sM] = effectiveStart.split(':').map(Number);
                        const [aH, aM] = (tardData.actualTime as string).split(':').map(Number);
                        const newMinutesLate = (aH * 60 + aM) - (sH * 60 + sM) - toleranceMinutes;

                        if (newMinutesLate <= 0) {
                            // Con el nuevo horario NO habría retardo → eliminarlo
                            await deleteDoc(tardinessDoc.ref);
                            console.log(`[HCM] assignShift: retardo eliminado para ${employeeId} en ${recordDate} (nuevo horario ${effectiveStart})`);
                        }
                        // Si newMinutesLate > 0, sigue siendo retardo → no tocar
                    }
                } catch (recalcError) {
                    // No-bloquear: si falla el recálculo, el turno ya fue asignado OK
                    console.error('[HCM] assignShift: error en recálculo de retardos (no crítico):', recalcError);
                }
            })();
        }
        // ─────────────────────────────────────────────────────────────────────

        return { success: true, assignmentId: ref.id };
    } catch (error) {
        console.error('[Team] Error assigning shift:', error);
        return { success: false, error: 'Error asignando turno.' };
    }
}

/**
 * Cancela una asignación de turno temporal
 */
export async function cancelShiftAssignment(
    assignmentId: string,
    cancelledById: string,
    cancelledByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'shift_assignments', assignmentId);

        await updateDoc(ref, {
            status: 'cancelled',
            cancelledById,
            cancelledByName,
            cancelledAt: now,
            updatedAt: now
        });

        return { success: true };
    } catch (error) {
        console.error('[Team] Error canceling shift assignment:', error);
        return { success: false, error: 'Error cancelando asignación de turno.' };
    }
}

/**
 * Obtiene las asignaciones de turno activas del equipo
 */
export async function getTeamShiftAssignments(
    managerId: string
): Promise<{ success: boolean; assignments?: ShiftAssignment[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, assignments: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);
        const allAssignments: ShiftAssignment[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const assignmentsQuery = query(
                collection(firestore, 'shift_assignments'),
                where('employeeId', 'in', batch),
                where('status', '==', 'active'),
                orderBy('startDate', 'desc')
            );

            const snapshot = await getDocs(assignmentsQuery);
            const assignments = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as ShiftAssignment[];

            allAssignments.push(...assignments);
        }

        return { success: true, assignments: allAssignments };
    } catch (error) {
        console.error('[Team] Error getting team shift assignments:', error);
        return { success: false, error: 'Error obteniendo asignaciones de turno.' };
    }
}

/**
 * Obtiene el historial de turnos de un empleado
 */
export async function getEmployeeShiftHistory(
    employeeId: string
): Promise<{ success: boolean; history?: ShiftAssignment[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const q = query(
            collection(firestore, 'shift_assignments'),
            where('employeeId', '==', employeeId),
            orderBy('createdAt', 'desc')
        );

        const snapshot = await getDocs(q);
        const history = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as ShiftAssignment[];

        return { success: true, history };
    } catch (error) {
        console.error('[Team] Error getting employee shift history:', error);
        return { success: false, error: 'Error obteniendo historial de turnos.' };
    }
}

/**
 * Obtiene los turnos disponibles para asignar
 */
export async function getAvailableShifts(): Promise<{ success: boolean; shifts?: CustomShift[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const shiftsQuery = query(
            collection(firestore, 'shifts'),
            where('isActive', '==', true),
            orderBy('name')
        );

        const snapshot = await getDocs(shiftsQuery);
        const shifts = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as CustomShift[];

        return { success: true, shifts };
    } catch (error) {
        console.error('[Team] Error getting available shifts:', error);
        return { success: false, error: 'Error obteniendo turnos disponibles.' };
    }
}

// =========================================================================
// CAMBIO DE HORARIO
// =========================================================================

/**
 * Cambia el horario de un empleado (temporal o permanente)
 */
export async function changeEmployeeSchedule(
    employeeId: string,
    employeeName: string,
    originalStartTime: string,
    originalEndTime: string,
    newStartTime: string,
    newEndTime: string,
    changeType: 'temporary' | 'permanent',
    effectiveDate: string,
    reason: string,
    assignedById: string,
    assignedByName: string,
    endDate?: string
): Promise<{ success: boolean; changeId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Validar que si es temporal, tenga fecha fin
        if (changeType === 'temporary' && !endDate) {
            return { success: false, error: 'Los cambios temporales requieren fecha de fin.' };
        }

        const changeData: Record<string, unknown> = {
            employeeId,
            employeeName,
            originalStartTime,
            originalEndTime,
            newStartTime,
            newEndTime,
            changeType,
            effectiveDate,
            reason,
            status: 'active',
            assignedById,
            assignedByName,
            assignedAt: now,
            createdAt: now,
            updatedAt: now
        };

        if (endDate) changeData.endDate = endDate;

        const ref = await addDoc(collection(firestore, 'schedule_changes'), changeData);

        // Send notification to employee
        notifyScheduleChanged(
            firestore,
            employeeId,
            newStartTime,
            newEndTime,
            effectiveDate,
            endDate,
            changeType === 'permanent',
            assignedById,
            assignedByName
        );

        return { success: true, changeId: ref.id };
    } catch (error) {
        console.error('[Team] Error changing employee schedule:', error);
        return { success: false, error: 'Error cambiando horario.' };
    }
}

/**
 * Cancela un cambio de horario
 */
export async function cancelScheduleChange(
    changeId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'schedule_changes', changeId);

        await updateDoc(ref, {
            status: 'cancelled',
            updatedAt: now
        });

        return { success: true };
    } catch (error) {
        console.error('[Team] Error canceling schedule change:', error);
        return { success: false, error: 'Error cancelando cambio de horario.' };
    }
}

/**
 * Obtiene los cambios de horario activos del equipo
 */
export async function getTeamScheduleChanges(
    managerId: string
): Promise<{ success: boolean; changes?: ScheduleChange[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, changes: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);
        const allChanges: ScheduleChange[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const changesQuery = query(
                collection(firestore, 'schedule_changes'),
                where('employeeId', 'in', batch),
                where('status', '==', 'active'),
                orderBy('effectiveDate', 'desc')
            );

            const snapshot = await getDocs(changesQuery);
            const changes = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as ScheduleChange[];

            allChanges.push(...changes);
        }

        return { success: true, changes: allChanges };
    } catch (error) {
        console.error('[Team] Error getting team schedule changes:', error);
        return { success: false, error: 'Error obteniendo cambios de horario.' };
    }
}
