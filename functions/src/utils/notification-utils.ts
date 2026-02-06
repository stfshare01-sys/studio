/**
 * Notification Utilities
 * 
 * Funciones para crear notificaciones y tareas para jefes cuando
 * se detectan infracciones de asistencia.
 * 
 * Basado en análisis de flujo de asistencia - NotebookLM
 */

import * as admin from 'firebase-admin';
import type { Notification, Task } from '../types/firestore-types';

/**
 * Cuenta las infracciones pendientes del equipo de un jefe
 */
async function countPendingInfractions(
    db: admin.firestore.Firestore,
    managerId: string
): Promise<number> {
    // Obtener empleados del equipo
    const teamQuery = await db.collection('employees')
        .where('managerId', '==', managerId)
        .where('status', '==', 'active')
        .get();

    if (teamQuery.empty) {
        return 0;
    }

    const employeeIds = teamQuery.docs.map(doc => doc.id);

    // Contar retardos pendientes
    let tardinessCount = 0;
    const tardinessQuery = await db.collection('tardiness_records')
        .where('employeeId', 'in', employeeIds.slice(0, 10)) // Firestore limit
        .where('justificationStatus', '==', 'pending')
        .get();
    tardinessCount = tardinessQuery.size;

    // Contar salidas tempranas pendientes
    let departuresCount = 0;
    const departuresQuery = await db.collection('early_departures')
        .where('employeeId', 'in', employeeIds.slice(0, 10))
        .where('justificationStatus', '==', 'pending')
        .get();
    departuresCount = departuresQuery.size;

    return tardinessCount + departuresCount;
}

/**
 * Crea una notificación para el jefe
 */
async function createManagerNotification(
    db: admin.firestore.Firestore,
    managerId: string,
    notification: {
        title: string;
        message: string;
        type: 'info' | 'warning' | 'error' | 'task' | 'alert';
        link?: string;
    }
): Promise<string> {
    const notificationRef = db.collection('users')
        .doc(managerId)
        .collection('notifications')
        .doc();

    const notificationData: Omit<Notification, 'id'> = {
        userId: managerId,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        link: notification.link,
        isRead: false,
        createdAt: new Date().toISOString()
    };

    await notificationRef.set(notificationData);

    console.log(`[Notification] Created notification for manager ${managerId}: ${notification.title}`);

    return notificationRef.id;
}

/**
 * Crea o actualiza una tarea para el jefe
 */
async function createOrUpdateManagerTask(
    db: admin.firestore.Firestore,
    managerId: string,
    pendingCount: number
): Promise<string | null> {
    // Buscar tarea existente pendiente
    const existingTaskQuery = await db.collection('tasks')
        .where('assignedTo', '==', managerId)
        .where('status', '==', 'pending')
        .where('title', '==', 'Revisar infracciones de asistencia')
        .limit(1)
        .get();

    const nowISO = new Date().toISOString();

    if (!existingTaskQuery.empty) {
        // Actualizar tarea existente
        const taskDoc = existingTaskQuery.docs[0];
        await taskDoc.ref.update({
            'metadata.pendingInfractionsCount': pendingCount,
            'metadata.lastUpdated': nowISO,
            updatedAt: nowISO
        });

        console.log(`[Notification] Updated existing task for manager ${managerId}`);
        return taskDoc.id;
    }

    // Crear nueva tarea
    const taskRef = db.collection('tasks').doc();

    const taskData: Omit<Task, 'id'> = {
        title: 'Revisar infracciones de asistencia',
        description: `Tienes ${pendingCount} infracciones pendientes de revisión en tu equipo. Revisa los retardos y salidas tempranas para justificarlos o aplicar sanciones.`,
        assignedTo: managerId,
        status: 'pending',
        priority: pendingCount > 5 ? 'high' : 'medium',
        link: '/hcm/team-management?tab=tardiness',
        metadata: {
            pendingInfractionsCount: pendingCount,
            lastUpdated: nowISO
        },
        createdAt: nowISO,
        updatedAt: nowISO
    };

    await taskRef.set(taskData);

    console.log(`[Notification] Created new task for manager ${managerId}`);

    return taskRef.id;
}

/**
 * Notifica al jefe sobre una infracción detectada
 * 
 * @param db - Firestore instance
 * @param employeeId - ID del empleado con la infracción
 * @param employeeName - Nombre del empleado
 * @param infractionType - Tipo de infracción
 * @param date - Fecha de la infracción
 * @returns IDs de notificación y tarea creados
 */
export async function notifyManagerAboutInfractions(
    db: admin.firestore.Firestore,
    employeeId: string,
    employeeName: string,
    infractionType: 'tardiness' | 'early_departure',
    date: string
): Promise<{ notificationId: string; taskId: string | null }> {
    try {
        // 1. Obtener empleado y su jefe
        const employeeDoc = await db.collection('employees').doc(employeeId).get();

        if (!employeeDoc.exists) {
            console.error(`[Notification] Employee not found: ${employeeId}`);
            return { notificationId: '', taskId: null };
        }

        const employee = employeeDoc.data();
        const managerId = employee?.managerId || employee?.directManagerId;

        if (!managerId) {
            console.warn(`[Notification] No manager found for employee ${employeeId}`);
            return { notificationId: '', taskId: null };
        }

        // 2. Contar infracciones pendientes del equipo
        const pendingCount = await countPendingInfractions(db, managerId);

        // 3. Crear notificación
        const infractionLabel = infractionType === 'tardiness' ? 'un retardo' : 'una salida temprana';
        const tabName = infractionType === 'tardiness' ? 'tardiness' : 'early-departures';

        const notificationId = await createManagerNotification(db, managerId, {
            title: `Nueva infracción detectada`,
            message: `${employeeName} tiene ${infractionLabel} el ${date}. Total pendientes: ${pendingCount}`,
            type: 'task',
            link: `/hcm/team-management?tab=${tabName}`
        });

        // 4. Crear o actualizar tarea
        const taskId = await createOrUpdateManagerTask(db, managerId, pendingCount);

        console.log(`[Notification] Notified manager ${managerId} about ${infractionType} for ${employeeName}`);

        return { notificationId, taskId };

    } catch (error) {
        console.error('[Notification] Error notifying manager:', error);
        return { notificationId: '', taskId: null };
    }
}
