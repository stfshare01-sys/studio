'use client';

/**
 * Team Management Actions
 * 
 * Funciones para que los jefes gestionen a su equipo:
 * - Obtener subordinados directos
 * - Justificar retardos y salidas tempranas
 * - Asignar turnos (temporal o permanente)
 * - Cambiar horarios
 * - Aprobar/rechazar horas extras
 */

import {
    doc,
    collection,
    addDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    Timestamp
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '../non-blocking-updates';
import {
    notifyOvertimeApproved,
    notifyOvertimePartial,
    notifyOvertimeRejected,
    notifyEarlyDepartureJustified,
    notifyShiftAssigned,
    notifyScheduleChanged
} from './notification-actions';
import type {
    Employee,
    TardinessRecord,
    OvertimeRequest,
    EarlyDeparture,
    ShiftAssignment,
    ScheduleChange,
    TeamDailyStats,
    EmployeeMonthlyStats,
    CustomShift
} from '@/lib/types';

// =========================================================================
// SUBORDINADOS DIRECTOS
// =========================================================================

/**
 * Obtiene los subordinados directos de un manager
 */
export async function getDirectReports(
    managerId: string
): Promise<{ success: boolean; employees?: Employee[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const employeesQuery = query(
            collection(firestore, 'employees'),
            where('directManagerId', '==', managerId),
            where('status', '==', 'active'),
            orderBy('fullName')
        );

        const snapshot = await getDocs(employeesQuery);
        const employees = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Employee[];

        return { success: true, employees };
    } catch (error) {
        console.error('[Team] Error getting direct reports:', error);
        return { success: false, error: 'Error obteniendo subordinados.' };
    }
}

/**
 * Verifica si un usuario tiene subordinados directos
 */
export async function hasDirectReports(
    managerId: string
): Promise<boolean> {
    try {
        const { firestore } = initializeFirebase();

        const employeesQuery = query(
            collection(firestore, 'employees'),
            where('directManagerId', '==', managerId),
            where('status', '==', 'active')
        );

        const snapshot = await getDocs(employeesQuery);
        return !snapshot.empty;
    } catch (error) {
        console.error('[Team] Error checking direct reports:', error);
        return false;
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
    dateFilter?: string // YYYY-MM-DD o YYYY-MM para mes completo
): Promise<{ success: boolean; records?: TardinessRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Primero obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
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

            const tardinessQuery = query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', 'in', batch),
                where('date', '>=', dateStart),
                where('date', '<=', dateEnd),
                orderBy('date', 'desc')
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
// SALIDAS TEMPRANAS
// =========================================================================

/**
 * Registra una salida temprana
 */
export async function recordEarlyDeparture(
    employeeId: string,
    employeeName: string,
    date: string,
    scheduledEndTime: string,
    actualEndTime: string,
    attendanceRecordId?: string
): Promise<{ success: boolean; departureId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calcular minutos de salida temprana
        const [schedH, schedM] = scheduledEndTime.split(':').map(Number);
        const [actH, actM] = actualEndTime.split(':').map(Number);
        const minutesEarly = (schedH * 60 + schedM) - (actH * 60 + actM);

        if (minutesEarly <= 0) {
            return { success: false, error: 'No es una salida temprana.' };
        }

        const departureData: Record<string, unknown> = {
            employeeId,
            employeeName,
            date,
            scheduledEndTime,
            actualEndTime,
            minutesEarly,
            isJustified: false,
            createdAt: now,
            updatedAt: now
        };

        if (attendanceRecordId) departureData.attendanceRecordId = attendanceRecordId;

        const ref = await addDoc(collection(firestore, 'early_departures'), departureData);
        return { success: true, departureId: ref.id };
    } catch (error) {
        console.error('[Team] Error recording early departure:', error);
        return { success: false, error: 'Error registrando salida temprana.' };
    }
}

/**
 * Justifica una salida temprana
 */
export async function justifyEarlyDeparture(
    departureId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'early_departures', departureId);

        await updateDoc(ref, {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            updatedAt: now
        });

        // Get the departure record to send notification
        const departureSn = await getDoc(ref);
        const departure = departureSn.data() as EarlyDeparture;

        // Send notification to employee
        notifyEarlyDepartureJustified(
            departure.employeeId,
            departure.date,
            justifiedById,
            justifiedByName
        );

        return { success: true };
    } catch (error) {
        console.error('[Team] Error justifying early departure:', error);
        return { success: false, error: 'Error justificando salida temprana.' };
    }
}

/**
 * Obtiene las salidas tempranas del equipo
 */
export async function getTeamEarlyDepartures(
    managerId: string,
    dateFilter?: string
): Promise<{ success: boolean; records?: EarlyDeparture[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, records: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);

        // Preparar filtro de fecha
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

        const allRecords: EarlyDeparture[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const departuresQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', 'in', batch),
                where('date', '>=', dateStart),
                where('date', '<=', dateEnd),
                orderBy('date', 'desc')
            );

            const snapshot = await getDocs(departuresQuery);
            const records = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as EarlyDeparture[];

            allRecords.push(...records);
        }

        allRecords.sort((a, b) => b.date.localeCompare(a.date));

        return { success: true, records: allRecords };
    } catch (error) {
        console.error('[Team] Error getting team early departures:', error);
        return { success: false, error: 'Error obteniendo salidas tempranas del equipo.' };
    }
}

// =========================================================================
// HORAS EXTRAS
// =========================================================================

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
                    orderBy('createdAt', 'desc')
                );
            } else {
                overtimeQuery = query(
                    collection(firestore, 'overtime_requests'),
                    where('employeeId', 'in', batch),
                    orderBy('createdAt', 'desc')
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

interface OvertimeStats {
    pending: number;
    approved: number;
    rejected: number;
    partial: number;
    totalHoursApproved: number;
    totalHoursPending: number;
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

        // Determinar si es aprobación total o parcial
        const finalHoursApproved = hoursApproved !== undefined ? hoursApproved : request.hoursRequested;
        const isPartial = finalHoursApproved < request.hoursRequested;

        await updateDoc(ref, {
            status: isPartial ? 'partial' : 'approved',
            hoursApproved: finalHoursApproved,
            approvedById,
            approvedByName,
            approvedAt: now,
            updatedAt: now
        });

        // Send notification to employee
        if (isPartial) {
            notifyOvertimePartial(
                request.employeeId,
                request.date,
                request.hoursRequested,
                finalHoursApproved,
                approvedById,
                approvedByName
            );
        } else {
            notifyOvertimeApproved(
                request.employeeId,
                request.employeeName || 'Empleado',
                request.date,
                finalHoursApproved,
                approvedById,
                approvedByName
            );
        }

        return { success: true };
    } catch (error) {
        console.error('[Team] Error approving overtime request:', error);
        return { success: false, error: 'Error aprobando solicitud de horas extras.' };
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

        await updateDoc(ref, {
            status: 'rejected',
            hoursApproved: 0,
            approvedById: rejectedById,
            approvedByName: rejectedByName,
            approvedAt: now,
            rejectionReason,
            updatedAt: now
        });

        // Get request data to get employee info
        const reqSnap = await getDoc(ref);
        const request = reqSnap.data() as OvertimeRequest;

        // Send notification to employee
        notifyOvertimeRejected(
            request.employeeId,
            request.date,
            rejectionReason,
            rejectedById,
            rejectedByName
        );

        return { success: true };
    } catch (error) {
        console.error('[Team] Error rejecting overtime request:', error);
        return { success: false, error: 'Error rechazando solicitud de horas extras.' };
    }
}

// =========================================================================
// ASIGNACIÓN DE TURNOS
// =========================================================================

/**
 * Asigna un turno a un empleado (temporal o permanente)
 */
export async function assignShift(
    employeeId: string,
    employeeName: string,
    newShiftId: string,
    newShiftName: string,
    assignmentType: 'temporary' | 'permanent',
    startDate: string,
    reason: string,
    assignedById: string,
    assignedByName: string,
    endDate?: string,
    originalShiftId?: string,
    originalShiftName?: string
): Promise<{ success: boolean; assignmentId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Validar que si es temporal, tenga fecha fin
        if (assignmentType === 'temporary' && !endDate) {
            return { success: false, error: 'Las asignaciones temporales requieren fecha de fin.' };
        }

        // Build assignment data without undefined values (Firestore doesn't accept undefined)
        const assignmentData: Record<string, unknown> = {
            employeeId,
            employeeName,
            newShiftId,
            newShiftName,
            assignmentType,
            startDate,
            reason,
            status: 'active',
            assignedById,
            assignedByName,
            assignedAt: now,
            createdAt: now,
            updatedAt: now
        };

        // Only add optional fields if they have values
        if (originalShiftId) assignmentData.originalShiftId = originalShiftId;
        if (originalShiftName) assignmentData.originalShiftName = originalShiftName;
        if (endDate) assignmentData.endDate = endDate;

        const ref = await addDoc(collection(firestore, 'shift_assignments'), assignmentData);

        // Si es permanente, actualizar el turno del empleado
        if (assignmentType === 'permanent') {
            const employeeRef = doc(firestore, 'employees', employeeId);
            updateDocumentNonBlocking(employeeRef, {
                customShiftId: newShiftId,
                updatedAt: now
            });
        }

        // Send notification to employee
        notifyShiftAssigned(
            employeeId,
            newShiftName,
            startDate,
            endDate,
            assignmentType === 'permanent',
            assignedById,
            assignedByName
        );

        return { success: true, assignmentId: ref.id };
    } catch (error) {
        console.error('[Team] Error assigning shift:', error);
        return { success: false, error: 'Error asignando turno.' };
    }
}

/**
 * Cancela una asignación de turno temporal
 */
export async function cancelShiftAssignment(
    assignmentId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'shift_assignments', assignmentId);

        await updateDoc(ref, {
            status: 'cancelled',
            updatedAt: now
        });

        return { success: true };
    } catch (error) {
        console.error('[Team] Error canceling shift assignment:', error);
        return { success: false, error: 'Error cancelando asignación de turno.' };
    }
}

/**
 * Obtiene las asignaciones de turno activas del equipo
 */
export async function getTeamShiftAssignments(
    managerId: string
): Promise<{ success: boolean; assignments?: ShiftAssignment[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, assignments: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);
        const allAssignments: ShiftAssignment[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const assignmentsQuery = query(
                collection(firestore, 'shift_assignments'),
                where('employeeId', 'in', batch),
                where('status', '==', 'active'),
                orderBy('startDate', 'desc')
            );

            const snapshot = await getDocs(assignmentsQuery);
            const assignments = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as ShiftAssignment[];

            allAssignments.push(...assignments);
        }

        return { success: true, assignments: allAssignments };
    } catch (error) {
        console.error('[Team] Error getting team shift assignments:', error);
        return { success: false, error: 'Error obteniendo asignaciones de turno.' };
    }
}

// =========================================================================
// CAMBIO DE HORARIO
// =========================================================================

/**
 * Cambia el horario de un empleado (temporal o permanente)
 */
export async function changeEmployeeSchedule(
    employeeId: string,
    employeeName: string,
    originalStartTime: string,
    originalEndTime: string,
    newStartTime: string,
    newEndTime: string,
    changeType: 'temporary' | 'permanent',
    effectiveDate: string,
    reason: string,
    assignedById: string,
    assignedByName: string,
    endDate?: string
): Promise<{ success: boolean; changeId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Validar que si es temporal, tenga fecha fin
        if (changeType === 'temporary' && !endDate) {
            return { success: false, error: 'Los cambios temporales requieren fecha de fin.' };
        }

        const changeData: Record<string, unknown> = {
            employeeId,
            employeeName,
            originalStartTime,
            originalEndTime,
            newStartTime,
            newEndTime,
            changeType,
            effectiveDate,
            reason,
            status: 'active',
            assignedById,
            assignedByName,
            assignedAt: now,
            createdAt: now,
            updatedAt: now
        };

        if (endDate) changeData.endDate = endDate;

        const ref = await addDoc(collection(firestore, 'schedule_changes'), changeData);

        // Send notification to employee
        notifyScheduleChanged(
            employeeId,
            newStartTime,
            newEndTime,
            effectiveDate,
            endDate,
            changeType === 'permanent',
            assignedById,
            assignedByName
        );

        return { success: true, changeId: ref.id };
    } catch (error) {
        console.error('[Team] Error changing employee schedule:', error);
        return { success: false, error: 'Error cambiando horario.' };
    }
}

/**
 * Cancela un cambio de horario
 */
export async function cancelScheduleChange(
    changeId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const ref = doc(firestore, 'schedule_changes', changeId);

        await updateDoc(ref, {
            status: 'cancelled',
            updatedAt: now
        });

        return { success: true };
    } catch (error) {
        console.error('[Team] Error canceling schedule change:', error);
        return { success: false, error: 'Error cancelando cambio de horario.' };
    }
}

/**
 * Obtiene los cambios de horario activos del equipo
 */
export async function getTeamScheduleChanges(
    managerId: string
): Promise<{ success: boolean; changes?: ScheduleChange[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, changes: [] };
        }

        const subordinateIds = subordinatesResult.employees.map(e => e.id);
        const allChanges: ScheduleChange[] = [];

        for (let i = 0; i < subordinateIds.length; i += 30) {
            const batch = subordinateIds.slice(i, i + 30);

            const changesQuery = query(
                collection(firestore, 'schedule_changes'),
                where('employeeId', 'in', batch),
                where('status', '==', 'active'),
                orderBy('effectiveDate', 'desc')
            );

            const snapshot = await getDocs(changesQuery);
            const changes = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data()
            })) as ScheduleChange[];

            allChanges.push(...changes);
        }

        return { success: true, changes: allChanges };
    } catch (error) {
        console.error('[Team] Error getting team schedule changes:', error);
        return { success: false, error: 'Error obteniendo cambios de horario.' };
    }
}

// =========================================================================
// ESTADÍSTICAS DEL EQUIPO
// =========================================================================

/**
 * Obtiene estadísticas mensuales del equipo
 */
export async function getTeamMonthlyStats(
    managerId: string,
    year: number,
    month: number
): Promise<{ success: boolean; stats?: EmployeeMonthlyStats[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Obtener subordinados
        const subordinatesResult = await getDirectReports(managerId);
        if (!subordinatesResult.success || !subordinatesResult.employees?.length) {
            return { success: true, stats: [] };
        }

        const dateStart = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDay = new Date(year, month, 0).getDate();
        const dateEnd = `${year}-${month.toString().padStart(2, '0')}-${lastDay.toString().padStart(2, '0')}`;

        const stats: EmployeeMonthlyStats[] = [];

        for (const employee of subordinatesResult.employees) {
            // Obtener retardos
            const tardinessQuery = query(
                collection(firestore, 'tardiness_records'),
                where('employeeId', '==', employee.id),
                where('date', '>=', dateStart),
                where('date', '<=', dateEnd)
            );
            const tardinessSnap = await getDocs(tardinessQuery);
            const tardinessRecords = tardinessSnap.docs.map(d => d.data() as TardinessRecord);

            // Obtener salidas tempranas
            const departuresQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', employee.id),
                where('date', '>=', dateStart),
                where('date', '<=', dateEnd)
            );
            const departuresSnap = await getDocs(departuresQuery);
            const departureRecords = departuresSnap.docs.map(d => d.data() as EarlyDeparture);

            // Obtener horas extras
            const overtimeQuery = query(
                collection(firestore, 'overtime_requests'),
                where('employeeId', '==', employee.id),
                where('date', '>=', dateStart),
                where('date', '<=', dateEnd)
            );
            const overtimeSnap = await getDocs(overtimeQuery);
            const overtimeRecords = overtimeSnap.docs.map(d => d.data() as OvertimeRequest);

            // Obtener incidencias
            const incidencesQuery = query(
                collection(firestore, 'incidences'),
                where('employeeId', '==', employee.id),
                where('startDate', '>=', dateStart),
                where('startDate', '<=', dateEnd)
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

            const dayStat: TeamDailyStats = {
                date,
                employeeId: employee.id,
                employeeName: employee.fullName,
                tardinessMinutes: tardiness?.minutesLate,
                tardinessJustified: tardiness?.isJustified,
                earlyDepartureMinutes: departure?.minutesEarly,
                earlyDepartureJustified: departure?.isJustified,
                overtimeHoursRequested: overtime?.hoursRequested,
                overtimeHoursApproved: overtime?.hoursApproved,
                overtimeStatus: overtime?.status,
                hasIncidence: !!incidence,
                incidenceType: incidence?.type,
                incidenceStatus: incidence?.status
            };

            stats.push(dayStat);
        }

        return { success: true, stats };
    } catch (error) {
        console.error('[Team] Error getting team daily stats:', error);
        return { success: false, error: 'Error obteniendo estadísticas del día.' };
    }
}

/**
 * Obtiene los turnos disponibles para asignar
 */
export async function getAvailableShifts(): Promise<{ success: boolean; shifts?: CustomShift[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const shiftsQuery = query(
            collection(firestore, 'shifts'),
            where('isActive', '==', true),
            orderBy('name')
        );

        const snapshot = await getDocs(shiftsQuery);
        const shifts = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as CustomShift[];

        return { success: true, shifts };
    } catch (error) {
        console.error('[Team] Error getting available shifts:', error);
        return { success: false, error: 'Error obteniendo turnos disponibles.' };
    }
}
