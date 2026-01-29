'use client';

import { doc, setDoc, collection, query, where, orderBy, limit, updateDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Notification, NotificationType } from '@/lib/types';

/**
 * Creates a notification for a user
 */
export async function createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    options?: {
        relatedId?: string;
        relatedType?: Notification['relatedType'];
        actionUrl?: string;
        createdById?: string;
        createdByName?: string;
    }
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const notificationsRef = collection(firestore, 'notifications');
        const notificationDoc = doc(notificationsRef);

        const notificationData: Omit<Notification, 'id'> & { id: string } = {
            id: notificationDoc.id,
            userId,
            type,
            title,
            message,
            read: false,
            createdAt: new Date().toISOString(),
            ...(options?.relatedId && { relatedId: options.relatedId }),
            ...(options?.relatedType && { relatedType: options.relatedType }),
            ...(options?.actionUrl && { actionUrl: options.actionUrl }),
            ...(options?.createdById && { createdById: options.createdById }),
            ...(options?.createdByName && { createdByName: options.createdByName }),
        };

        await setDoc(notificationDoc, notificationData);

        console.log(`[Notifications] Created notification for user ${userId}: ${title}`);
        return { success: true, notificationId: notificationDoc.id };
    } catch (error) {
        console.error('[Notifications] Error creating notification:', error);
        return { success: false, error: 'No se pudo crear la notificación.' };
    }
}

/**
 * Mark a notification as read
 */
export async function markNotificationAsRead(
    notificationId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const notificationRef = doc(firestore, 'notifications', notificationId);
        await updateDoc(notificationRef, { read: true });

        return { success: true };
    } catch (error) {
        console.error('[Notifications] Error marking as read:', error);
        return { success: false, error: 'No se pudo marcar como leída.' };
    }
}

/**
 * Mark all notifications for a user as read
 */
export async function markAllNotificationsAsRead(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get all unread notifications for user
        const notificationsRef = collection(firestore, 'notifications');
        const q = query(
            notificationsRef,
            where('userId', '==', userId),
            where('read', '==', false)
        );

        const { getDocs } = await import('firebase/firestore');
        const snapshot = await getDocs(q);

        // Update each notification
        const updatePromises = snapshot.docs.map(doc =>
            updateDoc(doc.ref, { read: true })
        );

        await Promise.all(updatePromises);

        console.log(`[Notifications] Marked ${snapshot.size} notifications as read for user ${userId}`);
        return { success: true };
    } catch (error) {
        console.error('[Notifications] Error marking all as read:', error);
        return { success: false, error: 'No se pudo marcar todas como leídas.' };
    }
}

// =========================================================================
// NOTIFICATION HELPERS FOR TEAM MANAGEMENT
// =========================================================================

/**
 * Notify employee when their overtime request is approved
 */
export async function notifyOvertimeApproved(
    employeeId: string,
    employeeName: string,
    requestDate: string,
    hoursApproved: number,
    approvedById: string,
    approvedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'overtime_approved',
        'Horas Extra Aprobadas',
        `Tu solicitud de horas extra del ${requestDate} ha sido aprobada (${hoursApproved}h).`,
        {
            relatedType: 'overtime',
            createdById: approvedById,
            createdByName: approvedByName,
        }
    );
}

/**
 * Notify employee when their overtime request is partially approved
 */
export async function notifyOvertimePartial(
    employeeId: string,
    requestDate: string,
    hoursRequested: number,
    hoursApproved: number,
    approvedById: string,
    approvedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'overtime_partial',
        'Horas Extra Parcialmente Aprobadas',
        `Tu solicitud de ${hoursRequested}h del ${requestDate} fue parcialmente aprobada: ${hoursApproved}h.`,
        {
            relatedType: 'overtime',
            createdById: approvedById,
            createdByName: approvedByName,
        }
    );
}

/**
 * Notify employee when their overtime request is rejected
 */
export async function notifyOvertimeRejected(
    employeeId: string,
    requestDate: string,
    reason: string,
    rejectedById: string,
    rejectedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'overtime_rejected',
        'Horas Extra Rechazadas',
        `Tu solicitud de horas extra del ${requestDate} fue rechazada. Motivo: ${reason}`,
        {
            relatedType: 'overtime',
            createdById: rejectedById,
            createdByName: rejectedByName,
        }
    );
}

/**
 * Notify employee when their tardiness is justified
 */
export async function notifyTardinessJustified(
    employeeId: string,
    date: string,
    justifiedById: string,
    justifiedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'tardiness_justified',
        'Retardo Justificado',
        `Tu retardo del ${date} ha sido justificado por tu supervisor.`,
        {
            relatedType: 'tardiness',
            createdById: justifiedById,
            createdByName: justifiedByName,
        }
    );
}

/**
 * Notify employee when their early departure is justified
 */
export async function notifyEarlyDepartureJustified(
    employeeId: string,
    date: string,
    justifiedById: string,
    justifiedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'early_departure_justified',
        'Salida Temprana Justificada',
        `Tu salida temprana del ${date} ha sido justificada por tu supervisor.`,
        {
            relatedType: 'early_departure',
            createdById: justifiedById,
            createdByName: justifiedByName,
        }
    );
}

/**
 * Notify employee when they are assigned a new shift
 */
export async function notifyShiftAssigned(
    employeeId: string,
    shiftName: string,
    startDate: string,
    endDate: string | undefined,
    isPermanent: boolean,
    assignedById: string,
    assignedByName: string
): Promise<void> {
    const duration = isPermanent
        ? 'de forma permanente'
        : `hasta ${endDate}`;

    await createNotification(
        employeeId,
        'shift_assigned',
        'Nuevo Turno Asignado',
        `Se te ha asignado el turno "${shiftName}" ${duration}, efectivo desde ${startDate}.`,
        {
            relatedType: 'shift',
            createdById: assignedById,
            createdByName: assignedByName,
        }
    );
}

/**
 * Notify employee when their schedule is changed
 */
export async function notifyScheduleChanged(
    employeeId: string,
    newStartTime: string,
    newEndTime: string,
    effectiveDate: string,
    endDate: string | undefined,
    isPermanent: boolean,
    changedById: string,
    changedByName: string
): Promise<void> {
    const duration = isPermanent
        ? 'de forma permanente'
        : `hasta ${endDate}`;

    await createNotification(
        employeeId,
        'schedule_changed',
        'Cambio de Horario',
        `Tu horario ha sido modificado a ${newStartTime} - ${newEndTime} ${duration}, efectivo desde ${effectiveDate}.`,
        {
            relatedType: 'schedule',
            createdById: changedById,
            createdByName: changedByName,
        }
    );
}

/**
 * Notify employee when their incidence is approved
 */
export async function notifyIncidenceApproved(
    employeeId: string,
    incidenceType: string,
    incidenceId: string,
    approvedById: string,
    approvedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'incidence_approved',
        'Incidencia Aprobada',
        `Tu solicitud de ${incidenceType} ha sido aprobada.`,
        {
            relatedId: incidenceId,
            relatedType: 'incidence',
            actionUrl: `/hcm/incidences/${incidenceId}`,
            createdById: approvedById,
            createdByName: approvedByName,
        }
    );
}

/**
 * Notify employee when their incidence is rejected
 */
export async function notifyIncidenceRejected(
    employeeId: string,
    incidenceType: string,
    incidenceId: string,
    reason: string,
    rejectedById: string,
    rejectedByName: string
): Promise<void> {
    await createNotification(
        employeeId,
        'incidence_rejected',
        'Incidencia Rechazada',
        `Tu solicitud de ${incidenceType} fue rechazada. Motivo: ${reason}`,
        {
            relatedId: incidenceId,
            relatedType: 'incidence',
            actionUrl: `/hcm/incidences/${incidenceId}`,
            createdById: rejectedById,
            createdByName: rejectedByName,
        }
    );
}
