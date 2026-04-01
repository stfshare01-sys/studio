'use client';

/**
 * team-early-departure-actions.ts
 *
 * Mutaciones de salidas tempranas del equipo:
 * registro, justificación, marcado como injustificado,
 * y consulta de salidas del equipo.
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - recordEarlyDeparture
 *  - justifyEarlyDeparture
 *  - markEarlyDepartureUnjustified
 *  - getTeamEarlyDepartures
 */

import {
    doc,
    collection,
    addDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { notifyEarlyDepartureJustified } from './notification-actions';
import { addDebtToHourBank } from './hour-bank-actions';
import { checkAttendanceTaskCompletion } from './task-completion-actions';
import { getDirectReports, getHierarchicalReports } from './team-queries';
import type { EarlyDeparture } from '@/lib/types';

// =========================================================================
// SALIDAS TEMPRANAS
// =========================================================================

/**
 * Registra una salida temprana
 */
export async function recordEarlyDeparture(
    employeeId: string,
    employeeName: string,
    date: string,
    scheduledEndTime: string,
    actualEndTime: string,
    attendanceRecordId?: string
): Promise<{ success: boolean; departureId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calcular minutos de salida temprana
        const [schedH, schedM] = scheduledEndTime.split(':').map(Number);
        const [actH, actM] = actualEndTime.split(':').map(Number);
        const minutesEarly = (schedH * 60 + schedM) - (actH * 60 + actM);

        if (minutesEarly <= 0) {
            return { success: false, error: 'No es una salida temprana.' };
        }

        const departureData: Record<string, unknown> = {
            employeeId,
            employeeName,
            date,
            scheduledEndTime,
            actualEndTime,
            minutesEarly,
            isJustified: false,
            createdAt: now,
            updatedAt: now
        };

        // Calculate severity
        // Assume 9 hours shift for now or pass context. For manual record we might need to fetch shift config or just default.
        // Or if we don't have hoursWorked, we can't calculate severity accurately based on % worked unless we have shift duration.
        // However, minutesEarly is known. Maybe we skip severity for manual records or do a rough calc?
        // Let's rely on hoursWorked if available, but here we don't calculate hours worked yet.
        // So we skip severity for manual record or leave it undefined to be filled later.


        if (attendanceRecordId) departureData.attendanceRecordId = attendanceRecordId;

        const ref = await addDoc(collection(firestore, 'early_departures'), departureData);
        return { success: true, departureId: ref.id };
    } catch (error) {
        console.error('[Team] Error recording early departure:', error);
        return { success: false, error: 'Error registrando salida temprana.' };
    }
}

/**
 * Justifica una salida temprana
 */
export async function justifyEarlyDeparture(
    departureId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string,
    useHourBank: boolean = false,
    justificationType?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'early_departures', departureId);

        // Get the departure record first
        const departureSn = await getDoc(ref);
        if (!departureSn.exists()) {
            return { success: false, error: 'Registro no encontrado.' };
        }
        const departure = departureSn.data() as EarlyDeparture;

        await updateDoc(ref, {
            isJustified: true,
            justificationStatus: useHourBank ? 'compensated' : 'justified',
            justificationReason: reason,
            justificationType, // Added type
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            updatedAt: now,
            hourBankApplied: useHourBank
        });

        if (useHourBank) {
            console.log(`[Team] Adding ${departure.minutesEarly} min debt to hour bank for employee ${departure.employeeId}`);
            const hbResult = await addDebtToHourBank({
                employeeId: departure.employeeId,
                date: departure.date,
                type: 'early_departure',
                minutes: departure.minutesEarly,
                reason: `Salida temprana justificada con bolsa de horas: ${reason}`,
                sourceRecordId: departureId,
                createdById: justifiedById,
                createdByName: justifiedByName
            });
            if (!hbResult.success) {
                console.error('[Team] Failed to add debt to hour bank:', hbResult.error);
                return { success: false, error: `Salida justificada, pero no se pudo registrar en bolsa de horas: ${hbResult.error}` };
            }
            console.log(`[Team] Hour bank updated. New balance: ${hbResult.newBalance} min, movement: ${hbResult.movementId}`);
        }

        // Send notification to employee
        notifyEarlyDepartureJustified(
            firestore,
            departure.employeeId,
            departure.date,
            justifiedById,
            justifiedByName
        );

        // Check if this completes any pending tasks
        // // Basado en Plan de Implementación de NotebookLM
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

                if (records.some((r: any) => r.id === departureId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[Team] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[Team] Error justifying early departure:', error);
        return { success: false, error: 'Error al justificar salida temprana.' };
    }
}

export async function markEarlyDepartureUnjustified(
    departureId: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const ref = doc(firestore, 'early_departures', departureId);

        await updateDoc(ref, {
            isJustified: false,
            justificationStatus: 'unjustified',
            justificationType: 'unjustified',
            justificationReason: 'Marcado como injustificado por supervisor',
            justifiedById,
            justifiedByName,
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

                if (records.some((r: any) => r.id === departureId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[Team] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[Team] Error marking early departure unjustified:', error);
        return { success: false, error: 'Error marcando salida temprana como injustificada.' };
    }
}

/**
 * Obtiene las salidas tempranas del equipo
 */
export async function getTeamEarlyDepartures(
    managerId: string,
    dateFilter?: string,
    hierarchyDepth?: number
): Promise<{ success: boolean; records?: EarlyDeparture[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = hierarchyDepth === undefined || hierarchyDepth > 1
            ? await getHierarchicalReports(managerId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
            : await getDirectReports(managerId);

        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, records: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);

        // Preparar filtro de fecha
        let dateStart = '';
        let dateEnd = '';

        if (dateFilter) {
            if (dateFilter.length === 10) {
                dateStart = dateFilter;
                dateEnd = dateFilter;
            } else if (dateFilter.length === 7) {
                dateStart = `${dateFilter}-01`;
                const [year, month] = dateFilter.split('-').map(Number);
                const lastDay = new Date(year, month, 0).getDate();
                dateEnd = `${dateFilter}-${lastDay.toString().padStart(2, '0')}`;
            }
        } else {
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateStart = thirtyDaysAgo.toISOString().split('T')[0];
            dateEnd = today.toISOString().split('T')[0];
        }

        const allRecords: EarlyDeparture[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const qConstraints = [
                where('employeeId', 'in', batch),
                orderBy('date', 'asc')
            ];

            if (dateFilter !== 'all') {
                qConstraints.push(where('date', '>=', dateStart));
                qConstraints.push(where('date', '<=', dateEnd));
            }

            const departuresQuery = query(
                collection(firestore, 'early_departures'),
                ...qConstraints
            );

            const snapshot = await getDocs(departuresQuery);
            const records = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as EarlyDeparture[];

            allRecords.push(...records);
        }

        allRecords.sort((a, b) => b.date.localeCompare(a.date));

        return { success: true, records: allRecords };
    } catch (error) {
        console.error('[Team] Error getting team early departures:', error);
        return { success: false, error: 'Error obteniendo salidas tempranas del equipo.' };
    }
}
