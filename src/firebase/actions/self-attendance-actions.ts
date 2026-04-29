'use client';

/**
 * self-attendance-actions.ts
 *
 * Mutations para el auto-marcaje personal de empleados sin acceso a biométrico.
 * Escribe a la colección `attendance` con source: 'self_reported'.
 * Aplica para: workMode 'hybrid' (días HO), 'remote' y 'field' (siempre activo).
 *
 * Funciones exportadas:
 *  - selfCheckIn   → Registra la hora de entrada del empleado
 *  - selfCheckOut  → Registra la hora de salida del empleado
 *  - getTodayAttendance → Lee el registro de asistencia del día actual
 */

import {
    doc, collection, addDoc, updateDoc, getDocs, query, where, limit
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { notifyUnscheduledHomeOffice } from './notification-actions';

/** Coordenadas GPS capturadas en el momento del marcaje */
interface GeoLocation {
    lat: number;
    lng: number;
    accuracy: number;   // metros
    capturedAt: string; // ISO timestamp
}

// =========================================================================
// SELF CHECK-IN
// =========================================================================

/**
 * Registra la hora de entrada de un empleado (self-reported).
 *
 * - Para workMode 'hybrid': si el día no es HO configurado, añade isUnscheduledHO: true
 *   y notifica al jefe directo.
 * - Para workMode 'remote' y 'field': isHomeOfficeDay siempre true → sin notificación de no programado.
 * - location: coordenadas GPS opcionales (auditoría, no bloquea si no están disponibles).
 *
 * @returns { success: boolean; attendanceId?: string; isUnscheduledHO: boolean }
 */
export async function selfCheckIn(params: {
    employeeId: string;
    employeeName: string;
    directManagerId: string | null;
    isHomeOfficeDay: boolean;
    scheduledStart?: string;
    scheduledEnd?: string;
    importBatchId?: string;
    location?: GeoLocation;
}): Promise<{ success: boolean; attendanceId?: string; isUnscheduledHO: boolean; error?: string }> {
    const {
        employeeId, employeeName, directManagerId,
        isHomeOfficeDay, scheduledStart, scheduledEnd,
        importBatchId = 'self_reported',
        location,
    } = params;

    const { firestore } = initializeFirebase();

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const checkInTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowISO = now.toISOString();

    try {
        // Verificar si ya hay registro para hoy
        const existingSnap = await getDocs(query(
            collection(firestore, 'attendance'),
            where('employeeId', '==', employeeId),
            where('date', '==', today),
            limit(1)
        ));

        const isUnscheduled = !isHomeOfficeDay;

        if (!existingSnap.empty) {
            // Ya hay registro — solo actualizar checkIn si falta
            const existingDoc = existingSnap.docs[0];
            const existingData = existingDoc.data();

            if (existingData.checkIn) {
                return { success: false, error: 'Ya tienes un check-in registrado para hoy.', isUnscheduledHO: false };
            }

            await updateDoc(doc(firestore, 'attendance', existingDoc.id), {
                checkIn: checkInTime,
                source: 'self_reported',
                isHomeOffice: isHomeOfficeDay,
                isUnscheduledHO: isUnscheduled,
                updatedAt: nowISO,
                ...(location ? { location } : {}),
            });

            if (isUnscheduled && directManagerId) {
                await notifyUnscheduledHomeOffice(firestore, directManagerId, employeeName, today);
            }

            return { success: true, attendanceId: existingDoc.id, isUnscheduledHO: isUnscheduled };
        }

        // Crear nuevo registro de asistencia
        const newRecord = {
            employeeId,
            employeeName,
            date: today,
            checkIn: checkInTime,
            checkOut: null,
            hoursWorked: 0,
            regularHours: 0,
            overtimeHours: 0,
            isValid: false,
            source: 'self_reported' as const,
            isHomeOffice: isHomeOfficeDay,
            isUnscheduledHO: isUnscheduled,
            importBatchId,
            ...(scheduledStart ? { scheduledStart } : {}),
            ...(scheduledEnd ? { scheduledEnd } : {}),
            ...(location ? { location } : {}),
            createdAt: nowISO,
        };

        const docRef = await addDoc(collection(firestore, 'attendance'), newRecord);

        if (isUnscheduled && directManagerId) {
            await notifyUnscheduledHomeOffice(firestore, directManagerId, employeeName, today);
        }

        return { success: true, attendanceId: docRef.id, isUnscheduledHO: isUnscheduled };

    } catch (error) {
        console.error('[SelfAttendance] Error en selfCheckIn:', error);
        return { success: false, error: 'Error al registrar entrada. Intenta de nuevo.', isUnscheduledHO: false };
    }
}

// =========================================================================
// SELF CHECK-OUT
// =========================================================================

/**
 * Registra la hora de salida del empleado y calcula hoursWorked básico.
 * checkOutLocation: coordenadas GPS opcionales (auditoría, no bloquea si no están disponibles).
 *
 * @returns { success: boolean; hoursWorked?: number }
 */
export async function selfCheckOut(params: {
    employeeId: string;
    scheduledEnd?: string;
    checkOutLocation?: GeoLocation;
}): Promise<{ success: boolean; hoursWorked?: number; error?: string }> {
    const { employeeId, scheduledEnd, checkOutLocation } = params;

    const { firestore } = initializeFirebase();

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const checkOutTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const nowISO = now.toISOString();

    try {
        const existingSnap = await getDocs(query(
            collection(firestore, 'attendance'),
            where('employeeId', '==', employeeId),
            where('date', '==', today),
            limit(1)
        ));

        if (existingSnap.empty) {
            return { success: false, error: 'No tienes check-in registrado para hoy. Registra tu entrada primero.' };
        }

        const existingDoc = existingSnap.docs[0];
        const existingData = existingDoc.data();

        if (existingData.checkOut) {
            return { success: false, error: 'Ya tienes un check-out registrado para hoy.' };
        }

        // Calcular horas trabajadas (simple, sin descanso — el motor principal calcula con más detalle)
        let hoursWorked = 0;
        if (existingData.checkIn) {
            const [inH, inM] = existingData.checkIn.split(':').map(Number);
            const [outH, outM] = checkOutTime.split(':').map(Number);
            hoursWorked = Math.max(0, (outH * 60 + outM - inH * 60 - inM) / 60);
            hoursWorked = Math.round(hoursWorked * 100) / 100;
        }

        await updateDoc(doc(firestore, 'attendance', existingDoc.id), {
            checkOut: checkOutTime,
            hoursWorked,
            regularHours: hoursWorked,
            isValid: hoursWorked > 0,
            updatedAt: nowISO,
            ...(checkOutLocation ? { checkOutLocation } : {}),
        });

        return { success: true, hoursWorked };

    } catch (error) {
        console.error('[SelfAttendance] Error en selfCheckOut:', error);
        return { success: false, error: 'Error al registrar salida. Intenta de nuevo.' };
    }
}

// =========================================================================
// LEER REGISTRO DE HOY
// =========================================================================

/**
 * Obtiene el registro de asistencia del día actual para el empleado.
 * Retorna null si no existe ninguno.
 */
export async function getTodayAttendance(employeeId: string): Promise<{
    id: string;
    checkIn?: string;
    checkOut?: string;
    hoursWorked: number;
    source?: string;
    isHomeOffice?: boolean;
    isUnscheduledHO?: boolean;
    location?: { lat: number; lng: number; accuracy: number; capturedAt: string };
    checkOutLocation?: { lat: number; lng: number; accuracy: number; capturedAt: string };
} | null> {
    const { firestore } = initializeFirebase();

    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    try {
        const snap = await getDocs(query(
            collection(firestore, 'attendance'),
            where('employeeId', '==', employeeId),
            where('date', '==', today),
            limit(1)
        ));

        if (snap.empty) return null;

        const d = snap.docs[0].data();
        return {
            id: snap.docs[0].id,
            checkIn: d.checkIn,
            checkOut: d.checkOut,
            hoursWorked: d.hoursWorked ?? 0,
            source: d.source,
            isHomeOffice: d.isHomeOffice,
            isUnscheduledHO: d.isUnscheduledHO,
            location: d.location,
            checkOutLocation: d.checkOutLocation,
        };
    } catch (error) {
        console.error('[SelfAttendance] Error al leer asistencia de hoy:', error);
        return null;
    }
}
