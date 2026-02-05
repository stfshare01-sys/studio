'use client';

/**
 * Auto-Justification Actions
 * 
 * Lógica para vincular automáticamente retardos y salidas tempranas
 * con incidencias (permisos/vacaciones) previamente aprobadas.
 */

import {
    collection,
    doc,
    getDocs,
    updateDoc,
    query,
    where,
    Timestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type {
    Incidence,
    TardinessRecord,
    EarlyDeparture,
} from '@/lib/types';
import { notifyTardinessJustified, notifyEarlyDepartureJustified } from './notification-actions';

/**
 * Intenta justificar automáticamente un registro de retardo o salida
 * buscando incidencias aprobadas coincidentes en la fecha.
 * 
 * @param employeeId ID del empleado
 * @param date Fecha del evento (YYYY-MM-DD)
 * @param recordType Tipo de registro ('tardiness' | 'early_departure')
 * @param recordId ID del registro a justificar
 */
export async function autoJustifyFromIncidences(
    employeeId: string,
    date: string,
    recordType: 'tardiness' | 'early_departure',
    recordId: string
): Promise<{
    autoJustified: boolean;
    linkedIncidenceId?: string;
    incidenceType?: string;
    error?: string;
}> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // 1. Buscar incidencias aprobadas para este empleado que cubran la fecha
        // Las incidencias tienen startDate y endDate
        // Buscamos incidencias donde:
        // - employeeId == employeeId
        // - status == 'approved'
        // - startDate <= date <= endDate

        // Firestore no soporta queries complejas de rango doble fácilmente en una sola cláusula
        // Haremos query por employeeId y status, y filtraremos en memoria (usualmente son pocas incidencias activas)
        // O mejor, query por employeeId, status y startDate <= date, luego verificar endDate

        const incidencesRef = collection(firestore, 'incidences');
        const q = query(
            incidencesRef,
            where('employeeId', '==', employeeId),
            where('status', '==', 'approved'),
            where('startDate', '<=', date)
        );

        const snapshot = await getDocs(q);
        let matchingIncidence: Incidence | undefined;

        for (const doc of snapshot.docs) {
            const incidence = { id: doc.id, ...doc.data() } as Incidence;
            if (incidence.endDate >= date) {
                matchingIncidence = incidence;
                break; // Encontramos una coincidencia
            }
        }

        if (!matchingIncidence) {
            return { autoJustified: false };
        }

        // 2. Si hay coincidencia, actualizar el registro
        const collectionName = recordType === 'tardiness' ? 'tardiness_records' : 'early_departures';
        const recordRef = doc(firestore, collectionName, recordId);

        const updateData: any = {
            isJustified: true, // Legacy compatibility
            justificationStatus: 'auto_justified',
            justificationType: 'other', // Podríamos mapear tipo de incidencia a tipo de justificación si fuera necesario
            justificationReason: `Auto-justificado por incidencia aprobada: ${matchingIncidence.type}`,
            linkedIncidenceId: matchingIncidence.id,
            justifiedAt: now,
            justifiedById: 'SYSTEM',
            justifiedByName: 'Sistema (Automático)',
            updatedAt: now
        };

        await updateDoc(recordRef, updateData);

        // 3. Notificar (opcional, quizás no sea necesario spam de notificaciones si es automático)
        // Pero para mantener consistencia, podríamos notificar
        if (recordType === 'tardiness') {
            await notifyTardinessJustified(
                firestore,
                employeeId,
                date,
                'SYSTEM',
                'Sistema'
            );
        } else {
            await notifyEarlyDepartureJustified(
                firestore,
                employeeId,
                date,
                'SYSTEM',
                'Sistema'
            );
        }

        return {
            autoJustified: true,
            linkedIncidenceId: matchingIncidence.id,
            incidenceType: matchingIncidence.type
        };

    } catch (error) {
        console.error('[autoJustifyFromIncidences] Error:', error);
        return { autoJustified: false, error: 'Error interno al intentar auto-justificar' };
    }
}

/**
 * Procesa masivamente la auto-justificación para un lote de registros importados
 * Útil para llamar al finalizar la importación de asistencia.
 */
export async function batchAutoJustify(
    records: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }>
): Promise<{ processed: number; justified: number }> {
    let justifiedCount = 0;

    // Ejecutar en paralelo limitando concurrencia si fuera necesario, 
    // pero para < 100 registros Promise.all está bien
    const promises = records.map(async (record) => {
        const result = await autoJustifyFromIncidences(
            record.employeeId,
            record.date,
            record.type,
            record.id
        );
        if (result.autoJustified) {
            justifiedCount++;
        }
    });

    await Promise.all(promises);

    return {
        processed: records.length,
        justified: justifiedCount
    };
}

/**
 * Justifica retroactivamente retardos y salidas existentes cuando se aprueba una incidencia.
 * Busca infracciones en el rango de fechas de la incidencia.
 */
export async function justifyInfractionsFromIncidence(
    incidenceId: string,
    employeeId: string,
    startDate: string,
    endDate: string,
    incidenceType: string
): Promise<{ justifiedCount: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        let justifiedCount = 0;

        // 1. Justificar Retardos en el rango
        const tardinessRef = collection(firestore, 'tardiness_records');
        const tardinessQuery = query(
            tardinessRef,
            where('employeeId', '==', employeeId),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            where('isJustified', '==', false) // Solo no justificados
        );

        const tardinessSnap = await getDocs(tardinessQuery);

        const tardinessPromises = tardinessSnap.docs.map(async (docSnap) => {
            const recordData = docSnap.data();
            // Doble check de fecha (firestore range filters son confiables pero por seguridad)
            if (recordData.date >= startDate && recordData.date <= endDate) {
                await updateDoc(doc(firestore, 'tardiness_records', docSnap.id), {
                    isJustified: true,
                    justificationStatus: 'auto_justified',
                    justificationType: 'other',
                    justificationReason: `Auto-justificado por incidencia retroactiva: ${incidenceType}`,
                    linkedIncidenceId: incidenceId,
                    justifiedAt: now,
                    justifiedById: 'SYSTEM',
                    justifiedByName: 'Sistema (Automático)',
                    updatedAt: now
                });

                // Notificar
                await notifyTardinessJustified(
                    firestore,
                    employeeId,
                    recordData.date,
                    'SYSTEM',
                    'Sistema'
                );
                return 1;
            }
            return 0;
        });

        const infoResults = await Promise.all(tardinessPromises);
        justifiedCount += infoResults.reduce((a: number, b: number) => a + b, 0);

        // 2. Justificar Salidas Tempranas en el rango
        const departuresRef = collection(firestore, 'early_departures');
        const departuresQuery = query(
            departuresRef,
            where('employeeId', '==', employeeId),
            where('date', '>=', startDate),
            where('date', '<=', endDate),
            where('isJustified', '==', false)
        );

        const departuresSnap = await getDocs(departuresQuery);

        const departurePromises = departuresSnap.docs.map(async (docSnap) => {
            const recordData = docSnap.data();
            if (recordData.date >= startDate && recordData.date <= endDate) {
                await updateDoc(doc(firestore, 'early_departures', docSnap.id), {
                    isJustified: true,
                    justificationStatus: 'auto_justified',
                    justificationType: 'other',
                    justificationReason: `Auto-justificado por incidencia retroactiva: ${incidenceType}`,
                    linkedIncidenceId: incidenceId,
                    justifiedAt: now,
                    justifiedById: 'SYSTEM',
                    justifiedByName: 'Sistema (Automático)',
                    updatedAt: now
                });

                await notifyEarlyDepartureJustified(
                    firestore,
                    employeeId,
                    recordData.date,
                    'SYSTEM',
                    'Sistema'
                );
                return 1;
            }
            return 0;
        });

        const departureResults = await Promise.all(departurePromises);
        justifiedCount += departureResults.reduce((a: number, b: number) => a + b, 0);

        console.log(`[AutoJustify] Automatically justified ${justifiedCount} infractions for approved incidence ${incidenceId}`);

        return { justifiedCount };

    } catch (error) {
        console.error('[justifyInfractionsFromIncidence] Error:', error);
        return { justifiedCount: 0, error: 'Error procesando justificación retroactiva.' };
    }
}
