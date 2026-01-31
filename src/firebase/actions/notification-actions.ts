
import {
    collection,
    doc,
    setDoc,
    getDocs,
    query,
    where,
    addDoc,
    serverTimestamp,
    Firestore
} from "firebase/firestore";
import type { Notification } from "@/lib/types";

/**
 * Creates a notification for a specific user.
 */
export async function createNotification(
    firestore: Firestore,
    userId: string,
    notification: {
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "task";
        link?: string;
    }
) {
    try {
        const notificationsRef = collection(firestore, "users", userId, "notifications");
        await addDoc(notificationsRef, {
            ...notification,
            read: false,
            createdAt: new Date().toISOString()
        });
    } catch (error) {
        console.error("Error creating notification:", error);
    }
}

/**
 * Notifies all users with a specific system role (e.g., 'HRManager', 'Admin').
 */
export async function notifyRole(
    firestore: Firestore,
    role: string,
    notification: {
        title: string;
        message: string;
        type: "info" | "success" | "warning" | "task";
        link?: string;
    }
) {
    try {
        // 1. Find all users with this role (system role or custom role)
        // Note: This assumes users have a 'role' field or 'customRoleId' field matching the input.
        // For System Roles, we check 'role'.

        // We need to query users.
        const usersRef = collection(firestore, "users");
        const q = query(usersRef, where("role", "==", role));
        const snapshot = await getDocs(q);

        const promises = snapshot.docs.map(userDoc => {
            return createNotification(firestore, userDoc.id, notification);
        });

        await Promise.all(promises);
        console.log(`Notified ${snapshot.size} users with role ${role}`);

    } catch (error) {
        console.error("Error notifying role:", error);
    }
}

// =========================================================================
// TEAM MANAGEMENT NOTIFICATIONS
// =========================================================================

export async function notifyOvertimeApproved(
    firestore: Firestore,
    employeeId: string,
    employeeName: string,
    date: string,
    hours: number,
    approverId: string,
    approverName: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Horas Extras Aprobadas',
        message: `Se han aprobado ${hours} horas extras para el día ${date}.`,
        type: 'success',
        link: '/hcm/attendance'
    });
}

export async function notifyOvertimePartial(
    firestore: Firestore,
    employeeId: string,
    date: string,
    requested: number,
    approved: number,
    approverId: string,
    approverName: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Horas Extras Aprobadas Parcialmente',
        message: `Se han aprobado ${approved} de ${requested} horas solicitadas para el día ${date}.`,
        type: 'warning',
        link: '/hcm/attendance'
    });
}

export async function notifyOvertimeRejected(
    firestore: Firestore,
    employeeId: string,
    date: string,
    rejectedById: string,
    rejectedByName: string,
    reason: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Horas Extras Rechazadas',
        message: `Tu solicitud de horas extras para el día ${date} ha sido rechazada. Razón: ${reason}`,
        type: 'warning',
        link: '/hcm/attendance'
    });
}

export async function notifyEarlyDepartureJustified(
    firestore: Firestore,
    employeeId: string,
    date: string,
    justifiedById: string,
    justifiedByName: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Salida Temprana Justificada',
        message: `Tu salida temprana del día ${date} ha sido justificada por ${justifiedByName}.`,
        type: 'info',
        link: '/hcm/attendance'
    });
}

export async function notifyTardinessJustified(
    firestore: Firestore,
    employeeId: string,
    date: string,
    justifiedById: string,
    justifiedByName: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Retardo Justificado',
        message: `Tu retardo del día ${date} ha sido justificado por ${justifiedByName}.`,
        type: 'info',
        link: '/hcm/attendance'
    });
}

export async function notifyShiftAssigned(
    firestore: Firestore,
    employeeId: string,
    shiftName: string,
    startDate: string,
    endDate: string | undefined, // or string
    isPermanent: boolean,
    assignedById: string,
    assignedByName: string
) {
    const period = isPermanent ? `a partir del ${startDate}` : `del ${startDate} al ${endDate}`;
    await createNotification(firestore, employeeId, {
        title: 'Nuevo Turno Asignado',
        message: `Se te ha asignado el turno ${shiftName} ${period}. Asignado por: ${assignedByName}.`,
        type: 'info',
        link: '/hcm/calendar'
    });
}

export async function notifyScheduleChanged(
    firestore: Firestore,
    employeeId: string,
    startTime: string,
    endTime: string,
    effectiveDate: string,
    endDate: string | undefined,
    isPermanent: boolean,
    changedById: string,
    changedByName: string
) {
    const period = isPermanent ? `a partir del ${effectiveDate}` : `para el día ${effectiveDate}`;
    await createNotification(firestore, employeeId, {
        title: 'Cambio de Horario',
        message: `Tu horario ha sido modificado a ${startTime} - ${endTime} ${period}. Modificado por ${changedByName}.`,
        type: 'info',
        link: '/hcm/calendar'
    });
}

export async function notifyShiftCancelled(
    firestore: Firestore,
    employeeId: string,
    startDate: string,
    cancelledById: string,
    cancelledByName: string
) {
    await createNotification(firestore, employeeId, {
        title: 'Asignación de Turno Cancelada',
        message: `La asignación de turno del ${startDate} ha sido cancelada por ${cancelledByName}.`,
        type: 'warning',
        link: '/hcm/calendar'
    });
}
