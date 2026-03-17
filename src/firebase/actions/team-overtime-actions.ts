'use client';

/**
 * team-overtime-actions.ts
 *
 * Gestión de solicitudes de horas extras del equipo:
 * consultas, aprobación (total/parcial) y rechazo.
 * Incluye el cálculo de desglose dobles/triples según LFT.
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - getTeamOvertimeRequests
 *  - approveOvertimeRequest
 *  - rejectOvertimeRequest
 */

import {
    doc,
    collection,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import {
    notifyOvertimeApproved,
    notifyOvertimePartial,
    notifyOvertimeRejected
} from './notification-actions';
import { checkAttendanceTaskCompletion } from './task-completion-actions';
import { getDirectReports } from './team-queries';
import type { OvertimeRequest } from '@/lib/types';
import { calculateOvertimeWithRounding } from '@/lib/hcm-utils';

// =========================================================================
// HORAS EXTRAS
// =========================================================================

interface OvertimeStats {
    pending: number;
    approved: number;
    rejected: number;
    partial: number;
    totalHoursApproved: number;
    totalHoursPending: number;
}

/**
 * Obtiene las solicitudes de horas extras pendientes del equipo
 */
export async function getTeamOvertimeRequests(
    managerId: string,
    statusFilter?: 'pending' | 'approved' | 'rejected' | 'partial' | 'all'
): Promise<{ success: boolean; requests?: OvertimeRequest[]; stats?: OvertimeStats; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, requests: [], stats: { pending: 0, approved: 0, rejected: 0, partial: 0, totalHoursApproved: 0, totalHoursPending: 0 } };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);

        const allRequests: OvertimeRequest[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            let overtimeQuery;
            if (statusFilter && statusFilter !== 'all') {
                overtimeQuery = query(
                    collection(firestore, 'overtime_requests'),
                    where('employeeId', 'in', batch),
                    where('status', '==', statusFilter),
                    orderBy('date', 'asc')
                );
            } else {
                overtimeQuery = query(
                    collection(firestore, 'overtime_requests'),
                    where('employeeId', 'in', batch),
                    orderBy('date', 'asc')
                );
            }

            const snapshot = await getDocs(overtimeQuery);
            const requests = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as OvertimeRequest[];

            allRequests.push(...requests);
        }

        // Calcular estadísticas
        const stats: OvertimeStats = {
            pending: 0,
            approved: 0,
            rejected: 0,
            partial: 0,
            totalHoursApproved: 0,
            totalHoursPending: 0
        };

        allRequests.forEach(req => {
            switch (req.status) {
                case 'pending':
                    stats.pending++;
                    stats.totalHoursPending += req.hoursRequested;
                    break;
                case 'approved':
                    stats.approved++;
                    stats.totalHoursApproved += req.hoursApproved || req.hoursRequested;
                    break;
                case 'rejected':
                    stats.rejected++;
                    break;
                case 'partial':
                    stats.partial++;
                    stats.totalHoursApproved += req.hoursApproved || 0;
                    break;
            }
        });

        return { success: true, requests: allRequests, stats };
    } catch (error) {
        console.error('[Team] Error getting team overtime requests:', error);
        return { success: false, error: 'Error obteniendo solicitudes de horas extras.' };
    }
}

/**
 * Aprueba una solicitud de horas extras (total o parcial)
 */
export async function approveOvertimeRequest(
    requestId: string,
    approvedById: string,
    approvedByName: string,
    hoursApproved?: number // Si no se proporciona, se aprueba el total solicitado
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'overtime_requests', requestId);
        const snap = await getDoc(ref);

        if (!snap.exists()) {
            return { success: false, error: 'Solicitud no encontrada.' };
        }

        const request = snap.data() as OvertimeRequest;

        // -----------------------------------------------------------------
        // BLOQUEAR si hay retardos o salidas tempranas pendientes de resolver
        // "Resuelto" = justificado, compensado o injustificado (NO 'pending')
        // -----------------------------------------------------------------
        const [pendingTardinessSnap, pendingDeparturesSnap] = await Promise.all([
            getDocs(query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', '==', request.employeeId),
                where('justificationStatus', '==', 'pending')
            )),
            getDocs(query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', request.employeeId),
                where('isJustified', '==', false)
            ))
        ]);

        // Filtrar early_departures que aún no tienen justificationStatus (pending reales)
        const pendingDepartures = pendingDeparturesSnap.docs.filter(d => {
            const data = d.data();
            return !data.justificationStatus || data.justificationStatus === 'pending';
        });

        const pendingCount = pendingTardinessSnap.size + pendingDepartures.length;
        if (pendingCount > 0) {
            return {
                success: false,
                error: `No se puede aprobar horas extras: el empleado tiene ${pendingTardinessSnap.size} retardo(s) y ${pendingDepartures.length} salida(s) temprana(s) sin resolver. Deben justificarse o marcarse como injustificadas primero.`
            };
        }

        // Determinar si es aprobación total o parcial
        const finalHoursApproved = hoursApproved !== undefined ? hoursApproved : request.hoursRequested;
        const isPartial = finalHoursApproved < request.hoursRequested;

        // --- CALCULAR DESGLOSE DOBLES/TRIPLES (Contexto Semanal) ---
        // 1. Obtener fecha y rango semanal (Lun-Dom) de la solicitud
        const requestDate = new Date(request.date);
        const dayOfWeek = requestDate.getDay(); // 0=Dom, 1=Lun, etc.
        const diffToMon = requestDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const weekStart = new Date(requestDate);
        weekStart.setDate(diffToMon);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];

        // 2. Buscar otras solicitudes APROBADAS en esa semana para el mismo empleado
        const otherRequestsQuery = query(
            collection(firestore, 'overtime_requests'),
            where('employeeId', '==', request.employeeId),
            where('status', '==', 'approved'), // Solo aprobadas
            where('date', '>=', startStr),
            where('date', '<=', endStr)
        );
        const otherDocs = await getDocs(otherRequestsQuery);

        // 3. Construir array de horas diarias
        // Agrupamos por fecha
        const dailyTotals: Record<string, number> = {};

        // Agregar las YA aprobadas
        otherDocs.docs.forEach(d => {
            const r = d.data() as OvertimeRequest;
            // Excluir la actual si por error ya estaba aprobada (idempotencia)
            if (d.id === requestId) return;
            dailyTotals[r.date] = (dailyTotals[r.date] || 0) + (r.hoursApproved || 0);
        });

        // Agregar la ACTUAL con las horas que estamos aprobando
        dailyTotals[request.date] = (dailyTotals[request.date] || 0) + finalHoursApproved;

        // Convertir a array para la función de utilidad
        const dailyOvertimeInput = Object.entries(dailyTotals)
            .map(([date, hours]) => ({ date, hours }))
            .sort((a, b) => a.date.localeCompare(b.date));

        // 4. Calcular desglose con regla 3x3
        // Usamos hourlyRate ficticio 0 porque solo nos interesan las horas
        const calculation = calculateOvertimeWithRounding(dailyOvertimeInput, 0);

        // 5. Extraer el desglose ESPECÍFICO de esta solicitud
        // La función retorna el total semanal desglosado. Necesitamos saber cuánto aportó ESTA solicitud.
        // Estrategia: Calcular SIN esta solicitud y restar, o mirar el dailyBreakdown del día específico.
        // El dailyBreakdown nos dice cuánto de ese día fue doble/triple TOTAL.
        // Si hay múltiples solicitudes el mismo día, esto asume que todas contribuyen proporcionalmente o por orden.
        // Simplificación: Asignamos basándonos en el breakdown del día.

        const dayBreakdown = calculation.dailyBreakdown.find(d => d.date === request.date);

        // Si no hay breakdown (raro), fallback a todo triple
        let doubleHours = 0;
        let tripleHours = 0;

        if (dayBreakdown) {
            // El breakdown tiene el TOTAL del día.
            // Si hubo otras solicitudes ese día, tenemos que ver qué parte nos "toca".
            // Pero simplifiquemos: Recalculamos SÓLO el delta que esta solicitud añade.
            // O mejor: Guardamos lo que el cálculo dice que es ese día, asumiendo que esta solicitud completó ese día.
            // Si ya había horas ese día, el breakdown incluye ambas.

            // Cuántas horas había ANTES de aprobar esta?
            const previousHoursThatDay = (dailyTotals[request.date] || 0) - finalHoursApproved;

            // Corremos cálculo SIN esta solicitud para ver "base"
            const inputWithoutThis = dailyOvertimeInput.map(d => {
                if (d.date === request.date) return { date: d.date, hours: previousHoursThatDay };
                return d;
            }).filter(d => d.hours > 0);

            const calcWithout = calculateOvertimeWithRounding(inputWithoutThis, 0);
            const prevDayBreakdown = calcWithout.dailyBreakdown.find(d => d.date === request.date);
            const prevDouble = prevDayBreakdown ? prevDayBreakdown.doubleHours : 0;
            const prevTriple = prevDayBreakdown ? prevDayBreakdown.tripleHours : 0;

            // El delta son las horas de ESTA solicitud
            doubleHours = dayBreakdown.doubleHours - prevDouble;
            tripleHours = dayBreakdown.tripleHours - prevTriple;

            // Ajustamos por redondeo error:
            // Si la suma no da exacto, lo ponemos en triple (conservador) o doble.
            // O mejor, confiamos en el delta.
        }

        await updateDoc(ref, {
            status: isPartial ? 'partial' : 'approved',
            hoursApproved: finalHoursApproved,
            doubleHours,
            tripleHours,
            approvedById,
            approvedByName,
            approvedAt: now,
            updatedAt: now
        });

        // Send notification to employee
        if (isPartial) {
            notifyOvertimePartial(
                firestore,
                request.employeeId,
                request.date,
                request.hoursRequested,
                finalHoursApproved,
                approvedById,
                approvedByName
            );
        } else {
            notifyOvertimeApproved(
                firestore,
                request.employeeId,
                request.employeeName || 'Empleado',
                request.date,
                finalHoursApproved,
                approvedById,
                approvedByName
            );
        }

        // Check if this completes any pending tasks
        // // Basado en Plan de Implementación de NotebookLM
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === requestId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[Team] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[Team] Error approving overtime request:', error);
        return { success: false, error: 'Error al aprobar horas extras.' };
    }
}

/**
 * Rechaza una solicitud de horas extras
 */
export async function rejectOvertimeRequest(
    requestId: string,
    rejectedById: string,
    rejectedByName: string,
    rejectionReason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'overtime_requests', requestId);
        const snap = await getDoc(ref);
        if (!snap.exists()) {
            return { success: false, error: 'Solicitud no encontrada.' };
        }
        const request = snap.data() as OvertimeRequest;

        // Bloquear si hay incidencias pendientes
        const [pendingTardinessSnap, pendingDeparturesSnap] = await Promise.all([
            getDocs(query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', '==', request.employeeId),
                where('justificationStatus', '==', 'pending')
            )),
            getDocs(query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', request.employeeId),
                where('isJustified', '==', false)
            ))
        ]);

        const pendingDepartures = pendingDeparturesSnap.docs.filter(d => {
            const data = d.data();
            return !data.justificationStatus || data.justificationStatus === 'pending';
        });

        const pendingCount = pendingTardinessSnap.size + pendingDepartures.length;
        if (pendingCount > 0) {
            return {
                success: false,
                error: `No se puede rechazar horas extras: el empleado tiene ${pendingTardinessSnap.size} retardo(s) y ${pendingDepartures.length} salida(s) temprana(s) sin resolver.`
            };
        }

        await updateDoc(ref, {
            status: 'rejected',
            hoursApproved: 0,
            approvedById: rejectedById,
            approvedByName: rejectedByName,
            approvedAt: now,
            rejectionReason,
            updatedAt: now
        });

        // request ya disponible del pre-check arriba

        // Send notification to employee
        notifyOvertimeRejected(
            firestore,
            request.employeeId,
            request.date,
            rejectedById,
            rejectedByName,
            rejectionReason
        );

    } catch (error) {
        console.error('[Team] Error rejecting overtime request:', error);
        return { success: false, error: 'Error rechazando solicitud de horas extras.' };
    }
}
