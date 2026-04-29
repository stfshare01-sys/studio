'use client';

/**
 * home-office-attendance-utils.ts
 *
 * Adaptador para lógica de Home Office en asistencia.
 * NO modifica tardiness-actions.ts ni ningún archivo core del sistema.
 *
 * Funciones exportadas:
 *  - isHomeOfficeDay        → ¿Es hoy un día de HO configurado para este empleado?
 *  - detectAndRecordHOMissingPunch → Detecta y registra missing_punch si el turno ya pasó
 */

import {
    doc, collection, addDoc, getDocs, query, where, limit, getDoc
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Employee } from '@/lib/types';
import { notifyMissingPunch } from './notification-actions';

// =========================================================================
// HELPER: ¿Es hoy un día de Home Office configurado?
// =========================================================================

/**
 * Determina si una fecha dada corresponde a un día de Home Office
 * configurado para el empleado.
 *
 * @param employee     - Objeto Employee con el campo homeOfficeDays
 * @param date         - Fecha a evaluar (YYYY-MM-DD o Date object)
 * @returns true si el día de la semana de esa fecha está en homeOfficeDays del empleado
 */
export function isHomeOfficeDay(
    employee: Pick<Employee, 'homeOfficeDays'>,
    date: Date | string
): boolean {
    if (!employee.homeOfficeDays || employee.homeOfficeDays.length === 0) {
        return false;
    }

    const dateObj = typeof date === 'string'
        ? (() => {
            const [y, m, d] = (date as string).split('-').map(Number);
            return new Date(y, m - 1, d);
        })()
        : date;

    const dayOfWeek = dateObj.getDay(); // 0=Dom, 1=Lun, ..., 6=Sáb
    return employee.homeOfficeDays.includes(dayOfWeek);
}

// =========================================================================
// DETECCIÓN Y REGISTRO DE MISSING PUNCH (HO)
// =========================================================================

/**
 * Detecta si el empleado debía tener marcaje hoy (turno ya finalizado) y no lo tiene.
 * Si detecta la falta, crea un MissingPunchRecord y notifica al jefe directo.
 *
 * Reglas:
 * - Solo se ejecuta si el turno programado ya terminó (scheduledEnd < now)
 * - Solo aplica para el día actual
 * - No duplica registros (verifica si ya existe un MissingPunchRecord)
 *
 * @param employeeId      - UID del documento en la colección `employees`
 * @param employeeName    - Nombre completo del empleado (para notificación)
 * @param directManagerId - UID del jefe directo (puede ser null)
 * @param today           - Fecha de hoy en formato YYYY-MM-DD
 * @param scheduledEnd    - Hora de fin de turno en formato HH:mm (para decidir si ya terminó)
 * @param isHODay         - Si true, el día está configurado como HO fijo del empleado
 */
export async function detectAndRecordHOMissingPunch(params: {
    employeeId: string;
    employeeName: string;
    directManagerId: string | null;
    today: string;
    scheduledEnd: string;
    isHODay: boolean;
}): Promise<{ detected: boolean; missingType?: 'entry' | 'exit' | 'both' }> {
    const { employeeId, employeeName, directManagerId, today, scheduledEnd, isHODay } = params;

    const { firestore } = initializeFirebase();

    // 1. Verificar si el turno ya terminó (hora actual > scheduledEnd)
    const [schedH, schedM] = scheduledEnd.split(':').map(Number);
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const endMinutes = schedH * 60 + schedM;

    if (currentMinutes < endMinutes) {
        // El turno aún no termina — no generar missing punch todavía
        return { detected: false };
    }

    // 2. Verificar si ya existe un MissingPunchRecord para este día
    const existingMPSnap = await getDocs(query(
        collection(firestore, 'missing_punches'),
        where('employeeId', '==', employeeId),
        where('date', '==', today),
        limit(1)
    ));

    if (!existingMPSnap.empty) {
        // Ya existe — no duplicar
        return { detected: false };
    }

    // 3. Verificar el registro de asistencia del día de hoy
    const attendanceSnap = await getDocs(query(
        collection(firestore, 'attendance'),
        where('employeeId', '==', employeeId),
        where('date', '==', today),
        limit(1)
    ));

    let missingType: 'entry' | 'exit' | 'both' | null = null;
    let attendanceRecordId: string | undefined;

    if (attendanceSnap.empty) {
        // No hay ningún registro — falta total (ambos marcajes)
        missingType = 'both';
    } else {
        const attData = attendanceSnap.docs[0].data();
        attendanceRecordId = attendanceSnap.docs[0].id;

        if (!attData.checkIn && !attData.checkOut) {
            missingType = 'both';
        } else if (!attData.checkIn) {
            missingType = 'entry';
        } else if (!attData.checkOut) {
            missingType = 'exit';
        }
    }

    if (!missingType) {
        // Marcaje completo — no hay falta
        return { detected: false };
    }

    // 4. Crear MissingPunchRecord en Firestore
    const nowISO = new Date().toISOString();
    const mpData = {
        employeeId,
        employeeName,
        date: today,
        ...(attendanceRecordId ? { attendanceRecordId } : {}),
        missingType,
        isJustified: false,
        resultedInAbsence: false,
        isHomeOffice: isHODay,
        createdAt: nowISO,
        updatedAt: nowISO,
    };

    await addDoc(collection(firestore, 'missing_punches'), mpData);

    // 5. Notificar al jefe directo (o fallback a HRManager)
    let notifyTargetId = directManagerId;

    if (!notifyTargetId) {
        // Fallback: notificar a todos los HRManager via notifyRole (simple: buscar el primero)
        try {
            const hrSnap = await getDocs(query(
                collection(firestore, 'users'),
                where('role', '==', 'HRManager'),
                limit(1)
            ));
            if (!hrSnap.empty) {
                notifyTargetId = hrSnap.docs[0].id;
            }
        } catch {
            console.warn('[HO] No se pudo obtener HRManager para notificación de missing punch');
        }
    }

    if (notifyTargetId) {
        await notifyMissingPunch(firestore, notifyTargetId, employeeName, today, missingType, isHODay);
    }

    return { detected: true, missingType };
}
