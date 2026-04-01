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
 * Obtiene los retardos pendientes de justificación del equipo
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
            dateStart = thirtyDaysAgo.toISOString().split('T')[0];
            dateEnd = today.toISOString().split('T')[0];
        }

        // Obtener retardos
        // Nota: Firestore no permite where 'in' con más de 30 elementos
        // Así que dividimos si es necesario
        const allRecords: TardinessRecord[] = [];

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

            const tardinessQuery = query(
                collection(firestore, 'tardiness_records'),
                ...qConstraints
            );

            const snapshot = await getDocs(tardinessQuery);
            const records = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as TardinessRecord[];

            allRecords.push(...records);
        }

        // Ordenar por fecha descendente
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
            dateStart = thirtyDaysAgo.toISOString().split('T')[0];
            dateEnd = today.toISOString().split('T')[0];
        }

        const allRecords: any[] = [];

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

            const q = query(
                collection(firestore, 'missing_punches'),
                ...qConstraints
            );

            const snapshot = await getDocs(q);
            snapshot.forEach(doc => {
                const data = doc.data();
                allRecords.push({
                    id: doc.id,
                    ...data,
                    employeeName: subordinateMap.get(data.employeeId) || data.employeeName // Asegurar nombre actualizado
                });
            });
        }

        return { success: true, records: allRecords };

    } catch (error) {
        console.error('Error getting team missing punches:', error);
        return { success: false, error: 'Error al obtener marcajes faltantes del equipo.' };
    }
}
