'use client';

import {
    doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where,
    serverTimestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';

export interface EarlyDepartureRecord {
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
    createdAt: any;
    updatedAt: any;
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


        // Verificar si el empleado está exento de asistencia
        let isExempt = false;
        try {
            const empDoc = await getDoc(doc(firestore, 'employees', employeeId));
            if (empDoc.exists()) {
                const empData = empDoc.data();
                if (empData.positionId) {
                    const posDoc = await getDoc(doc(firestore, 'positions', empData.positionId));
                    if (posDoc.exists() && posDoc.data().isExemptFromAttendance) {
                        isExempt = true;
                    }
                }
            }
        } catch (err) {
            console.warn('[HCM] Error checking exemption for early departure:', err);
        }

        if (isExempt) {
            console.log(`[HCM] Skipping early departure for ${employeeName} (Position is exempt)`);
            return { success: true };
        }

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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
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
            justifiedAt: serverTimestamp(),
            resultedInAbsence: false, // Ya no es falta
            updatedAt: serverTimestamp(),
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
