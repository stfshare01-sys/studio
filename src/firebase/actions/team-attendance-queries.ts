'use client';

/**
 * team-attendance-queries.ts
 *
 * Consultas de registros de asistencia del equipo (retardos,
 * marcajes faltantes y lotes de importación).
 * Solo realiza operaciones de lectura (getDocs/getDoc).
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - getAttendanceImportBatches
 *  - getTeamTardiness
 *  - getTeamMissingPunches
 */

import {
    collection,
    getDocs,
    query,
    where,
    orderBy,
    limit
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { getDirectReports, getHierarchicalReports } from './team-queries';
import type { TardinessRecord, AttendanceImportBatch } from '@/lib/types';
import { format } from 'date-fns';

// =========================================================================
// CARGA DE ASISTENCIA (BATCHES)
// =========================================================================

/**
 * Obtiene los lotes de importación de asistencia recientes
 */
export async function getAttendanceImportBatches(
    limitCount: number = 10
): Promise<{ success: boolean; batches?: AttendanceImportBatch[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const batchesQuery = query(
            collection(firestore, 'attendance_imports'),
            orderBy('uploadedAt', 'desc'),
            limit(limitCount)
        );

        const snapshot = await getDocs(batchesQuery);
        const batches = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as AttendanceImportBatch[];

        return { success: true, batches };
    } catch (error) {
        console.error('[Team] Error getting attendance import batches:', error);
        return { success: false, error: 'Error obteniendo lotes de importación.' };
    }
}

// =========================================================================
// RETARDOS DEL EQUIPO
// =========================================================================

/**
 * Obtiene los retardos del equipo.
 * COMPORTAMIENTO: Siempre incluye los registros pendientes de cualquier período,
 * independientemente del filtro de fecha. El filtro de fecha solo controla qué
 * registros ya procesados (justificados/injustificados) se muestran.
 * Los pendientes SIEMPRE son visibles para que el manager no los pierda.
 */
export async function getTeamTardiness(
    managerId: string,
    dateFilter?: string, // YYYY-MM-DD o YYYY-MM para mes completo
    hierarchyDepth?: number
): Promise<{ success: boolean; records?: TardinessRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Primero obtener subordinados (directos o jerárquicos)
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
                // Día específico
                dateStart = dateFilter;
                dateEnd = dateFilter;
            } else if (dateFilter.length === 7) {
                // Mes completo (YYYY-MM)
                dateStart = `${dateFilter}-01`;
                const [year, month] = dateFilter.split('-').map(Number);
                const lastDay = new Date(year, month, 0).getDate();
                dateEnd = `${dateFilter}-${lastDay.toString().padStart(2, '0')}`;
            }
        } else {
            // Por defecto, últimos 30 días
            const today = new Date();
            const thirtyDaysAgo = new Date(today);
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            dateStart = format(thirtyDaysAgo, 'yyyy-MM-dd');
            dateEnd = format(today, 'yyyy-MM-dd');
        }

        // Mapa para deduplicar por ID: los pendientes siempre se incluyen
        const recordsMap = new Map<string, TardinessRecord>();

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            // --- Query 1: Registros dentro del rango de fechas (histórico/filtrado) ---
            const qConstraintsFiltered = [
                where('employeeId', 'in', batch),
                orderBy('date', 'asc')
            ];

            if (dateFilter !== 'all') {
                qConstraintsFiltered.push(where('date', '>=', dateStart));
                qConstraintsFiltered.push(where('date', '<=', dateEnd));
            }

            const filteredQuery = query(
                collection(firestore, 'tardiness_records'),
                ...qConstraintsFiltered
            );

            // --- Query 2: Pendientes de CUALQUIER período (siempre visibles) ---
            // Solo aplica cuando hay un filtro activo (si dateFilter === 'all', ya cargamos todo)
            const pendingQuery = dateFilter !== 'all'
                ? query(
                    collection(firestore, 'tardiness_records'),
                    where('employeeId', 'in', batch),
                    where('isJustified', '==', false)
                )
                : null;

            // Ejecutar ambas queries en paralelo
            const [filteredSnap, pendingSnap] = await Promise.all([
                getDocs(filteredQuery),
                pendingQuery ? getDocs(pendingQuery) : Promise.resolve(null)
            ]);

            // Poblar el mapa (deduplicado por ID)
            filteredSnap.docs.forEach(d => {
                const data = d.data() as Omit<TardinessRecord, 'id'>;
                recordsMap.set(d.id, { id: d.id, ...data } as TardinessRecord);
            });

            if (pendingSnap) {
                pendingSnap.docs.forEach(d => {
                    const data = d.data() as Omit<TardinessRecord, 'id'>;
                    // Solo agregar pendientes reales (no los ya marcados como injustificados)
                    if ((data as any).justificationStatus !== 'unjustified') {
                        recordsMap.set(d.id, { id: d.id, ...data } as TardinessRecord);
                    }
                });
            }
        }

        // Convertir mapa a array y ordenar por fecha descendente
        const allRecords = Array.from(recordsMap.values());
        allRecords.sort((a, b) => b.date.localeCompare(a.date));

        return { success: true, records: allRecords };
    } catch (error) {
        console.error('[Team] Error getting team tardiness:', error);
        return { success: false, error: 'Error obteniendo retardos del equipo.' };
    }
}

// =========================================================================
// MARCAJES FALTANTES DEL EQUIPO
// =========================================================================

/**
 * Obtiene los marcajes faltantes del equipo.
 * COMPORTAMIENTO: Siempre incluye los marcajes sin procesar de cualquier período,
 * independientemente del filtro de fecha activo.
 */
export async function getTeamMissingPunches(
    managerId: string,
    dateFilter?: string,
    hierarchyDepth?: number
): Promise<{ success: boolean; records?: any[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = hierarchyDepth === undefined || hierarchyDepth > 1
            ? await getHierarchicalReports(managerId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
            : await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, records: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);
        const subordinateMap = new Map(subordinatesResult.employees.map(e => [e.id, e.fullName]));

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
            dateStart = format(thirtyDaysAgo, 'yyyy-MM-dd');
            dateEnd = format(today, 'yyyy-MM-dd');
        }

        // Mapa para deduplicar por ID
        const recordsMap = new Map<string, any>();

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            // --- Query 1: Registros dentro del rango de fechas (filtrado) ---
            const qConstraints = [
                where('employeeId', 'in', batch),
                orderBy('date', 'asc')
            ];

            if (dateFilter !== 'all') {
                qConstraints.push(where('date', '>=', dateStart));
                qConstraints.push(where('date', '<=', dateEnd));
            }

            const filteredQ = query(
                collection(firestore, 'missing_punches'),
                ...qConstraints
            );

            // --- Query 2: Pendientes (no justificados) de CUALQUIER período ---
            // IMPORTANTE: Se usa isJustified==false en lugar de processed==false porque
            // Firestore no devuelve documentos donde el campo 'processed' no existe.
            // Los documentos legacy sin ese campo quedarían excluidos silenciosamente.
            const pendingQ = dateFilter !== 'all'
                ? query(
                    collection(firestore, 'missing_punches'),
                    where('employeeId', 'in', batch),
                    where('isJustified', '==', false)
                )
                : null;

            const [filteredSnap, pendingSnap] = await Promise.all([
                getDocs(filteredQ),
                pendingQ ? getDocs(pendingQ) : Promise.resolve(null)
            ]);

            filteredSnap.forEach(doc => {
                const data = doc.data();
                recordsMap.set(doc.id, {
                    id: doc.id,
                    ...data,
                    employeeName: subordinateMap.get(data.employeeId) || data.employeeName
                });
            });

            if (pendingSnap) {
                pendingSnap.forEach(doc => {
                    const data = doc.data();
                    // Solo pendientes reales: no justificados y que no resultaron en falta
                    if (!data.isJustified && !data.resultedInAbsence) {
                        recordsMap.set(doc.id, {
                            id: doc.id,
                            ...data,
                            employeeName: subordinateMap.get(data.employeeId) || data.employeeName
                        });
                    }
                });
            }
        }

        const allRecords = Array.from(recordsMap.values());
        allRecords.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

        return { success: true, records: allRecords };

    } catch (error) {
        console.error('Error getting team missing punches:', error);
        return { success: false, error: 'Error al obtener marcajes faltantes del equipo.' };
    }
}
