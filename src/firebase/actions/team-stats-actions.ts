'use client';

/**
 * team-stats-actions.ts
 *
 * Estadísticas mensuales y diarias del equipo de trabajo.
 * Agrega datos de retardos, salidas, horas extra e incidencias.
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - getTeamMonthlyStats
 *  - getTeamDailyStats
 */

import {
    collection,
    getDocs,
    query,
    where
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { getDirectReports } from './team-queries';
import type {
    TardinessRecord,
    OvertimeRequest,
    EarlyDeparture,
    TeamDailyStats,
    EmployeeMonthlyStats
} from '@/lib/types';

// =========================================================================
// ESTADÍSTICAS DEL EQUIPO
// =========================================================================

/**
 * Obtiene estadísticas mensuales del equipo
 */
export async function getTeamMonthlyStats(
    managerId: string,
    year?: number,
    month?: number
): Promise<{ success: boolean; stats?: EmployeeMonthlyStats[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
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

        const stats: EmployeeMonthlyStats[] = [];

        for (const employee of subordinatesResult.employees) {
            // Obtener retardos
            const tardinessQuery = query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', '==', employee.id),
                ...(!isAll ? [where('date', '>=', dateStart), where('date', '<=', dateEnd)] : [])
            );
            const tardinessSnap = await getDocs(tardinessQuery);
            const tardinessRecords = tardinessSnap.docs.map(d => d.data() as TardinessRecord);

            // Obtener salidas tempranas
            const departuresQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', employee.id),
                ...(!isAll ? [where('date', '>=', dateStart), where('date', '<=', dateEnd)] : [])
            );
            const departuresSnap = await getDocs(departuresQuery);
            const departureRecords = departuresSnap.docs.map(d => d.data() as EarlyDeparture);

            // Obtener horas extras
            const overtimeQuery = query(
                collection(firestore, 'overtime_requests'),
                where('employeeId', '==', employee.id),
                ...(!isAll ? [where('date', '>=', dateStart), where('date', '<=', dateEnd)] : [])
            );
            const overtimeSnap = await getDocs(overtimeQuery);
            const overtimeRecords = overtimeSnap.docs.map(d => d.data() as OvertimeRequest);

            // Obtener incidencias
            const incidencesQuery = query(
                collection(firestore, 'incidences'),
                where('employeeId', '==', employee.id),
                ...(!isAll ? [where('startDate', '>=', dateStart), where('startDate', '<=', dateEnd)] : [])
            );
            const incidencesSnap = await getDocs(incidencesQuery);

            const employeeStats: EmployeeMonthlyStats = {
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
                pendingIncidences: incidencesSnap.docs.filter(d => d.data().status === 'pending').length,
                approvedIncidences: incidencesSnap.docs.filter(d => d.data().status === 'approved').length
            };

            stats.push(employeeStats);
        }

        return { success: true, stats };
    } catch (error) {
        console.error('[Team] Error getting team monthly stats:', error);
        return { success: false, error: 'Error obteniendo estadísticas del equipo.' };
    }
}

/**
 * Obtiene estadísticas del día para el equipo
 */
export async function getTeamDailyStats(
    managerId: string,
    date: string
): Promise<{ success: boolean; stats?: TeamDailyStats[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, stats: [] };
        }

        const stats: TeamDailyStats[] = [];

        for (const employee of subordinatesResult.employees) {
            // Obtener asistencia del día (entrada/salida/descanso)
            const attendanceQuery = query(
                collection(firestore, 'attendance'),
                where('employeeId', '==', employee.id),
                where('date', '==', date)
            );
            const attendanceSnap = await getDocs(attendanceQuery);
            const attendance = attendanceSnap.docs[0]?.data();

            // Obtener retardo del día
            const tardinessQuery = query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', '==', employee.id),
                where('date', '==', date)
            );
            const tardinessSnap = await getDocs(tardinessQuery);
            const tardiness = tardinessSnap.docs[0]?.data() as TardinessRecord | undefined;

            // Obtener salida temprana del día
            const departureQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', employee.id),
                where('date', '==', date)
            );
            const departureSnap = await getDocs(departureQuery);
            const departure = departureSnap.docs[0]?.data() as EarlyDeparture | undefined;

            // Obtener solicitud de HE del día
            const overtimeQuery = query(
                collection(firestore, 'overtime_requests'),
                where('employeeId', '==', employee.id),
                where('date', '==', date)
            );
            const overtimeSnap = await getDocs(overtimeQuery);
            const overtime = overtimeSnap.docs[0]?.data() as OvertimeRequest | undefined;

            // Obtener incidencia del día
            const incidenceQuery = query(
                collection(firestore, 'incidences'),
                where('employeeId', '==', employee.id),
                where('startDate', '<=', date),
                where('endDate', '>=', date)
            );
            const incidenceSnap = await getDocs(incidenceQuery);
            const incidence = incidenceSnap.docs[0]?.data();

            // Obtener marcaje faltante del día
            const missingPunchQuery = query(
                collection(firestore, 'missing_punches'),
                where('employeeId', '==', employee.id),
                where('date', '==', date)
            );
            const missingPunchSnap = await getDocs(missingPunchQuery);
            const missingPunch = missingPunchSnap.docs[0]?.data();

            const dayStat: TeamDailyStats = {
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

            stats.push(dayStat);
        }

        return { success: true, stats };
    } catch (error) {
        console.error('[Team] Error getting team daily stats:', error);
        return { success: false, error: 'Error obteniendo estadísticas del día.' };
    }
}
