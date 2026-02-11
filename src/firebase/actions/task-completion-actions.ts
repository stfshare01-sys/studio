'use client';

import { doc, getDoc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Task, TardinessRecord, EarlyDeparture, OvertimeRequest } from '@/lib/types';

/**
 * Verifica si todos los registros de una tarea de asistencia han sido procesados
 * y completa la tarea automáticamente si es necesario.
 * // Basado en Plan de Implementación de NotebookLM
 */
export async function checkAttendanceTaskCompletion(taskId: string): Promise<boolean> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener la tarea
        const taskRef = doc(firestore, 'tasks', taskId);
        const taskSnap = await getDoc(taskRef);

        if (!taskSnap.exists()) {
            console.warn(`[TaskCompletion] Task ${taskId} not found`);
            return false;
        }

        const task = { id: taskSnap.id, ...taskSnap.data() } as Task;

        // Solo procesar tareas de tipo attendance_justification
        if (task.type !== 'attendance_justification') {
            return false;
        }

        // Si ya está completada, no hacer nada
        if (task.status === 'completed') {
            return true;
        }

        const records = task.metadata?.records || [];

        if (records.length === 0) {
            // No hay registros, completar la tarea
            await completeTask(taskId, 'system', 'no_records');
            return true;
        }

        // Verificar cada registro
        const processedStatus = await Promise.all(
            records.map(async (record: any) => {
                if (record.type === 'tardiness') {
                    const tardinessRef = doc(firestore, 'tardiness_records', record.id);
                    const tardinessSnap = await getDoc(tardinessRef);

                    if (!tardinessSnap.exists()) return false;

                    const tardinessData = tardinessSnap.data() as TardinessRecord;
                    // Procesado si está justificado O marcado como injustificado
                    return tardinessData.isJustified || tardinessData.justificationStatus === 'unjustified';

                } else if (record.type === 'early_departure') {
                    const departureRef = doc(firestore, 'early_departures', record.id);
                    const departureSnap = await getDoc(departureRef);

                    if (!departureSnap.exists()) return false;

                    const departureData = departureSnap.data() as EarlyDeparture;
                    return departureData.isJustified || departureData.justificationStatus === 'unjustified';

                } else if (record.type === 'overtime') {
                    const overtimeRef = doc(firestore, 'overtime_requests', record.id);
                    const overtimeSnap = await getDoc(overtimeRef);

                    if (!overtimeSnap.exists()) return false;

                    const overtimeData = overtimeSnap.data() as OvertimeRequest;
                    // Procesado si está aprobado O rechazado
                    return overtimeData.status === 'approved' || overtimeData.status === 'rejected';
                }

                return false;
            })
        );

        // Si todos están procesados, completar la tarea
        const allProcessed = processedStatus.every(status => status === true);

        if (allProcessed) {
            await completeTask(taskId, 'system', 'all_records_processed');
            console.log(`[TaskCompletion] Task ${taskId} completed - all records processed`);
            return true;
        }

        return false;

    } catch (error) {
        console.error('[TaskCompletion] Error checking task completion:', error);
        return false;
    }
}

/**
 * Completa una tarea de asistencia
 */
async function completeTask(
    taskId: string,
    completedBy: string,
    reason: 'all_records_processed' | 'period_closed' | 'no_records'
): Promise<void> {
    try {
        const { firestore } = initializeFirebase();
        const taskRef = doc(firestore, 'tasks', taskId);

        await updateDoc(taskRef, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            completedBy,
            completionReason: reason
        });

    } catch (error) {
        console.error('[TaskCompletion] Error completing task:', error);
        throw error;
    }
}

/**
 * Completa todas las tareas pendientes de un período cuando se cierra
 * Llamar desde prenomina-actions.ts al cerrar período
 */
export async function completeTasksForClosedPeriod(
    batchIds: string[]
): Promise<{ completed: number; errors: number }> {
    try {
        const { firestore } = initializeFirebase();

        let completed = 0;
        let errors = 0;

        // Buscar tareas pendientes de esos batches
        const tasksQuery = query(
            collection(firestore, 'tasks'),
            where('type', '==', 'attendance_justification'),
            where('status', '==', 'pending')
        );

        const tasksSnap = await getDocs(tasksQuery);

        for (const taskDoc of tasksSnap.docs) {
            const task = taskDoc.data() as Task;
            const taskBatchId = task.metadata?.batchId;

            // Verificar si el batch está en la lista de cerrados
            if (taskBatchId && batchIds.includes(taskBatchId)) {
                try {
                    await completeTask(taskDoc.id, 'system', 'period_closed');
                    completed++;
                } catch (error) {
                    console.error(`[TaskCompletion] Error completing task ${taskDoc.id}:`, error);
                    errors++;
                }
            }
        }

        console.log(`[TaskCompletion] Period closure: ${completed} tasks completed, ${errors} errors`);

        return { completed, errors };

    } catch (error) {
        console.error('[TaskCompletion] Error completing tasks for closed period:', error);
        return { completed: 0, errors: 1 };
    }
}

/**
 * Obtiene todas las tareas de un manager específico
 */
export async function getManagerTasks(managerId: string): Promise<Task[]> {
    try {
        const { firestore } = initializeFirebase();

        const tasksQuery = query(
            collection(firestore, 'tasks'),
            where('assignedTo', '==', managerId),
            where('status', '==', 'pending')
        );

        const tasksSnap = await getDocs(tasksQuery);

        return tasksSnap.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        } as Task));

    } catch (error) {
        console.error('[TaskCompletion] Error getting manager tasks:', error);
        return [];
    }
}
