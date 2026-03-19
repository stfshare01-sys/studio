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
import type { OvertimeRequest, Employee, Location, AttendanceRecord, AttendanceImportBatch } from '@/lib/types';
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

        // Simplemente actualizamos el documento con las horas aprobadas.
        // Las horas dobles y triples se calcularán en `recalculateWeeklyOvertime`
        await updateDoc(ref, {
            status: isPartial ? 'partial' : 'approved',
            hoursApproved: finalHoursApproved,
            approvedById,
            approvedByName,
            approvedAt: now,
            updatedAt: now
        });

        // Recalcular la semana completa con la configuración correcta de la ubicación
        await recalculateWeeklyOvertime(
            firestore,
            request.employeeId,
            request.date,
            request.attendanceRecordId
        );

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
            doubleHours: 0,
            tripleHours: 0,
            approvedById: rejectedById,
            approvedByName: rejectedByName,
            approvedAt: now,
            rejectionReason,
            updatedAt: now
        });

        // Recalcular la semana completa, por si había otras solicitudes que ahora deben ajustarse
        await recalculateWeeklyOvertime(
            firestore,
            request.employeeId,
            request.date,
            request.attendanceRecordId
        );

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

        return { success: true };
    } catch (error) {
        console.error('[Team] Error rejecting overtime request:', error);
        return { success: false, error: 'Error rechazando solicitud de horas extras.' };
    }
}

/**
 * Recalcula y redistribuye las horas dobles/triples de una semana para todas las
 * solicitudes aprobadas/parciales de un empleado, respetando la configuración de la ubicación.
 */
async function recalculateWeeklyOvertime(
    firestore: any,
    employeeId: string,
    requestDateStr: string,
    attendanceRecordId?: string
): Promise<void> {
    try {
        // 1. Obtener location para reset day
        const empRef = doc(firestore, 'employees', employeeId);
        const empSnap = await getDoc(empRef);
        const employee = empSnap.exists() ? empSnap.data() as Employee : null;

        let resetDay = 1; // Default Monday
        if (employee?.locationId) {
            const locRef = doc(firestore, 'locations', employee.locationId);
            const locSnap = await getDoc(locRef);
            if (locSnap.exists()) {
                const loc = locSnap.data() as Location;
                if (loc.overtimeResetDay === 'sunday') resetDay = 0;
                else if (loc.overtimeResetDay === 'saturday') resetDay = 6;
                else if (loc.overtimeResetDay === 'custom' && loc.customOvertimeResetDay !== undefined) resetDay = loc.customOvertimeResetDay;
            }
        }

        // 2. Obtener overtimeMode
        let overtimeMode: 'daily_limit' | 'weekly_only' = 'daily_limit';
        if (attendanceRecordId) {
            const attRef = doc(firestore, 'attendance_records', attendanceRecordId);
            const attSnap = await getDoc(attRef);
            if (attSnap.exists()) {
                const att = attSnap.data() as AttendanceRecord;
                if (att.importBatchId) {
                    const batchRef = doc(firestore, 'attendance_import_batches', att.importBatchId);
                    const batchSnap = await getDoc(batchRef);
                    if (batchSnap.exists()) {
                        overtimeMode = (batchSnap.data() as AttendanceImportBatch).overtimeMode || 'daily_limit';
                    }
                }
            }
        }

        // 3. Determinar el rango de la semana
        const requestDate = new Date(requestDateStr);
        const dayOfWeek = requestDate.getDay();
        let diffToStart = requestDate.getDate() - dayOfWeek + resetDay;
        if (dayOfWeek < resetDay) {
            diffToStart -= 7;
        }
        const weekStart = new Date(requestDate);
        weekStart.setDate(diffToStart);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);

        const startStr = weekStart.toISOString().split('T')[0];
        const endStr = weekEnd.toISOString().split('T')[0];

        // 4. Obtener solicitudes aprobadas/parciales en esa semana
        const requestsQuery = query(
            collection(firestore, 'overtime_requests'),
            where('employeeId', '==', employeeId),
            where('status', 'in', ['approved', 'partial']),
            where('date', '>=', startStr),
            where('date', '<=', endStr),
            orderBy('date', 'asc') // Simple index
        );
        const snapshot = await getDocs(requestsQuery);
        const requests = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as OvertimeRequest[];

        // Agregamos un sort explícito adicional por createdAt para desempatar mismo día
        requests.sort((a, b) => {
            if (a.date === b.date) {
                return a.createdAt.localeCompare(b.createdAt);
            }
            return a.date.localeCompare(b.date);
        });

        if (requests.length === 0) return;

        // 5. Agrupar por día
        const dailyTotals: Record<string, number> = {};
        requests.forEach(r => {
            dailyTotals[r.date] = (dailyTotals[r.date] || 0) + (r.hoursApproved || 0);
        });

        const dailyInput = Object.entries(dailyTotals)
            .map(([date, hours]) => ({ date, hours }))
            .sort((a, b) => a.date.localeCompare(b.date));
        
        // 6. Calcular desglose usando utility
        const calculation = calculateOvertimeWithRounding(dailyInput, 0, overtimeMode);

        const dailyAvailability = calculation.dailyBreakdown.reduce((acc, curr) => {
            acc[curr.date] = { double: curr.doubleHours, triple: curr.tripleHours };
            return acc;
        }, {} as Record<string, { double: number, triple: number }>);

        // 7. Actualizar documentos
        for (const req of requests) {
            let reqDouble = 0;
            let reqTriple = 0;
            let remaining = req.hoursApproved || 0;
            
            const avail = dailyAvailability[req.date];
            if (avail) {
                const takeDouble = Math.min(remaining, avail.double);
                reqDouble += takeDouble;
                avail.double -= takeDouble;
                remaining -= takeDouble;

                const takeTriple = Math.min(remaining, avail.triple);
                reqTriple += takeTriple;
                avail.triple -= takeTriple;
                remaining -= takeTriple;
            }

            if (req.doubleHours !== reqDouble || req.tripleHours !== reqTriple) {
                await updateDoc(doc(firestore, 'overtime_requests', req.id), {
                    doubleHours: reqDouble,
                    tripleHours: reqTriple,
                    updatedAt: new Date().toISOString()
                });
            }
        }
    } catch (error) {
        console.error('[Team] Error recalculating weekly overtime:', error);
    }
}
