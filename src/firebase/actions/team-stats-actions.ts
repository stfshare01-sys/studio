'use client';

/**
 * team-stats-actions.ts
 *
 * Estadísticas mensuales y diarias del equipo de trabajo.
 * Agrega datos de retardos, salidas, horas extra e incidencias.
 *
 * Optimización: Usa queries batch con operador `in` de Firestore
 * para consultar hasta 30 empleados por query en paralelo.
 * Antes: N×6 queries secuenciales. Ahora: ~12 queries paralelas.
 *
 * Funciones exportadas:
 *  - getTeamMonthlyStats
 *  - getTeamDailyStats
 */

import {
    collection,
    getDocs,
    query,
    where,
    type QueryConstraint
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { getDirectReports, getHierarchicalReports } from './team-queries';
import type { TardinessRecord, OvertimeRequest, EarlyDeparture, TeamDailyStats, EmployeeMonthlyStats } from "@/types/hcm.types";

// =========================================================================
// HELPERS INTERNOS
// =========================================================================

const FIRESTORE_IN_LIMIT = 30;

/** Divide un array en sub-arrays de tamaño `size` */
function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Ejecuta queries batch usando el operador `in` de Firestore.
 * Devuelve un Map<employeeId, docData[]> con los resultados agrupados.
 */
async function batchQueryByEmployee(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    firestore: any,
    collectionName: string,
    idChunks: string[][],
    constraints: QueryConstraint[]
): Promise<Map<string, any[]>> {
    const resultMap = new Map<string, any[]>();

    const snapshots = await Promise.all(
        idChunks.map(chunk =>
            getDocs(query(
                collection(firestore, collectionName),
                where('employeeId', 'in', chunk),
                ...constraints
            ))
        )
    );

    for (const snap of snapshots) {
        for (const d of snap.docs) {
            const data = d.data();
            const empId = data.employeeId as string;
            const existing = resultMap.get(empId);
            if (existing) existing.push(data);
            else resultMap.set(empId, [data]);
        }
    }

    return resultMap;
}

// =========================================================================
// ESTADÍSTICAS DEL EQUIPO
// =========================================================================

/**
 * Obtiene estadísticas mensuales del equipo (batch optimizado).
 */
export async function getTeamMonthlyStats(
    managerId: string,
    year?: number,
    month?: number,
    hierarchyDepth?: number
): Promise<{ success: boolean; stats?: EmployeeMonthlyStats[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = hierarchyDepth === undefined || hierarchyDepth > 1
            ? await getHierarchicalReports(managerId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
            : await getDirectReports(managerId);

        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, stats: [] };
        }

        const isAll = !year || !month || isNaN(year) || isNaN(month);
        let dateStart = '';
        let dateEnd = '';

        if (!isAll) {
            dateStart = `${year}-${month!.toString().padStart(2, '0')}-01`;
            const lastDay = new Date(year!, month!, 0).getDate();
            dateEnd = `${year}-${month!.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;
        }

        const employeeIds = subordinatesResult.employees.map(e => e.id);
        const chunks = chunkArray(employeeIds, FIRESTORE_IN_LIMIT);

        const dateRange: QueryConstraint[] = !isAll
            ? [where('date', '>=', dateStart), where('date', '<=', dateEnd)]
            : [];
        const incidenceDateRange: QueryConstraint[] = !isAll
            ? [where('startDate', '>=', dateStart), where('startDate', '<=', dateEnd)]
            : [];

        // 4 batch queries en paralelo (antes: N×4 secuenciales)
        const [tardinessMap, departureMap, overtimeMap, incidenceMap] = await Promise.all([
            batchQueryByEmployee(firestore, 'tardiness_records', chunks, dateRange),
            batchQueryByEmployee(firestore, 'early_departures', chunks, dateRange),
            batchQueryByEmployee(firestore, 'overtime_requests', chunks, dateRange),
            batchQueryByEmployee(firestore, 'incidences', chunks, incidenceDateRange),
        ]);

        const stats: EmployeeMonthlyStats[] = subordinatesResult.employees.map(employee => {
            const tardinessRecords = (tardinessMap.get(employee.id) || []) as TardinessRecord[];
            const departureRecords = (departureMap.get(employee.id) || []) as EarlyDeparture[];
            const overtimeRecords = (overtimeMap.get(employee.id) || []) as OvertimeRequest[];
            const incidenceDocs = incidenceMap.get(employee.id) || [];

            return {
                employeeId: employee.id,
                employeeName: employee.fullName,
                positionTitle: employee.positionTitle,
                avatarUrl: employee.avatarUrl,
                month,
                year,
                totalTardiness: tardinessRecords.length,
                justifiedTardiness: tardinessRecords.filter(t => t.isJustified).length,
                unjustifiedTardiness: tardinessRecords.filter(t => !t.isJustified).length,
                totalEarlyDepartures: departureRecords.length,
                justifiedEarlyDepartures: departureRecords.filter(d => d.isJustified).length,
                overtimeHoursRequested: overtimeRecords.reduce((sum, r) => sum + r.hoursRequested, 0),
                overtimeHoursApproved: overtimeRecords.filter(r => r.status === 'approved' || r.status === 'partial')
                    .reduce((sum, r) => sum + (r.hoursApproved || 0), 0),
                overtimeHoursRejected: overtimeRecords.filter(r => r.status === 'rejected')
                    .reduce((sum, r) => sum + r.hoursRequested, 0),
                overtimeRequestsPending: overtimeRecords.filter(r => r.status === 'pending').length,
                pendingIncidences: incidenceDocs.filter((d: any) => d.status === 'pending').length,
                approvedIncidences: incidenceDocs.filter((d: any) => d.status === 'approved').length
            };
        });

        return { success: true, stats };
    } catch (error) {
        console.error('[Team] Error getting team monthly stats:', error);
        return { success: false, error: 'Error obteniendo estadísticas del equipo.' };
    }
}

/**
 * Obtiene estadísticas del día para el equipo (batch optimizado).
 *
 * Antes: 6 queries secuenciales × N empleados = N×6 round-trips.
 * Ahora: ceil(N/30) × 6 queries en paralelo ≈ 12 queries para 50 empleados.
 */
export async function getTeamDailyStats(
    managerId: string,
    date: string,
    hierarchyDepth?: number
): Promise<{ success: boolean; stats?: TeamDailyStats[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = hierarchyDepth === undefined || hierarchyDepth > 1
            ? await getHierarchicalReports(managerId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
            : await getDirectReports(managerId);

        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, stats: [] };
        }

        const employeeIds = subordinatesResult.employees.map(e => e.id);
        const chunks = chunkArray(employeeIds, FIRESTORE_IN_LIMIT);
        const dateEq: QueryConstraint[] = [where('date', '==', date)];

        // 6 batch queries en paralelo (antes: N×6 secuenciales)
        const [
            attendanceMap,
            tardinessMap,
            departureMap,
            overtimeMap,
            incidenceMap,
            missingPunchMap
        ] = await Promise.all([
            batchQueryByEmployee(firestore, 'attendance', chunks, dateEq),
            batchQueryByEmployee(firestore, 'tardiness_records', chunks, dateEq),
            batchQueryByEmployee(firestore, 'early_departures', chunks, dateEq),
            batchQueryByEmployee(firestore, 'overtime_requests', chunks, dateEq),
            batchQueryByEmployee(firestore, 'incidences', chunks, [
                where('startDate', '<=', date),
                where('endDate', '>=', date)
            ]),
            batchQueryByEmployee(firestore, 'missing_punches', chunks, dateEq),
        ]);

        const stats: TeamDailyStats[] = subordinatesResult.employees.map(employee => {
            const attendance = (attendanceMap.get(employee.id) ?? [])[0];
            const tardiness = (tardinessMap.get(employee.id) ?? [])[0] as TardinessRecord | undefined;
            const departure = (departureMap.get(employee.id) ?? [])[0] as EarlyDeparture | undefined;
            const overtime = (overtimeMap.get(employee.id) ?? [])[0] as OvertimeRequest | undefined;
            const incidence = (incidenceMap.get(employee.id) ?? [])[0];
            const missingPunch = (missingPunchMap.get(employee.id) ?? [])[0];

            return {
                date,
                employeeId: employee.id,
                employeeName: employee.fullName,
                checkIn: attendance?.checkIn,
                checkOut: attendance?.checkOut,
                isRestDay: attendance?.isRestDay ?? false,
                tardinessMinutes: tardiness?.minutesLate,
                tardinessJustified: tardiness?.isJustified,
                earlyDepartureMinutes: departure?.minutesEarly,
                earlyDepartureJustified: departure?.isJustified,
                overtimeHoursRequested: overtime?.hoursRequested,
                overtimeHoursApproved: overtime?.hoursApproved,
                overtimeStatus: overtime?.status,
                hasIncidence: !!incidence,
                incidenceType: incidence?.type,
                incidenceStatus: incidence?.status,
                hasMissingPunch: !!missingPunch,
                missingPunchType: missingPunch?.missingType,
                missingPunchJustified: missingPunch?.isJustified
            };
        });

        return { success: true, stats };
    } catch (error) {
        console.error('[Team] Error getting team daily stats:', error);
        return { success: false, error: 'Error obteniendo estadísticas del día.' };
    }
}
