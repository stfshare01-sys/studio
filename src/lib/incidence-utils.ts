import type { IncidenceType } from "@/types/hcm.types";
import { parseTimeToDecimal } from "./workday-utils";
import { checkVacationEligibility } from "./vacation-utils";

// =========================================================================
// INCIDENCIAS — HELPERS DE NEGOCIO
// =========================================================================

/**
 * Determina si una incidencia es con goce de sueldo según tipo y política.
 */
export function isIncidencePaid(type: IncidenceType): boolean {
    const paidTypes: IncidenceType[] = [
        'vacation',
        'sick_leave',      // Parcialmente cubierto por IMSS
        'maternity',       // Cubierto por IMSS
        'paternity',       // 5 días con goce (Art. 132 LFT)
        'bereavement',     // Generalmente 3 días
        'home_office'      // Trabajo remoto
    ];
    return paidTypes.includes(type);
}

/**
 * Obtiene días default según tipo de incidencia.
 * Nota: Los días reales pueden variar; estos son los valores base del sistema.
 */
export function getDefaultIncidenceDays(type: IncidenceType): number {
    const daysMap: Record<IncidenceType, number> = {
        vacation: 1,               // Variable según antigüedad
        sick_leave: 3,             // Variable según certificado
        personal_leave: 1,
        maternity: 84,             // 12 semanas (Art. 170 LFT)
        paternity: 5,              // 5 días (Art. 132 LFT)
        bereavement: 3,
        unjustified_absence: 1,    // Por día
        abandono_empleo: 1,        // Manual, por CH
        marriage: 5,
        adoption: 15,
        unpaid_leave: 1,
        civic_duty: 1,
        half_day_family: 1,
        home_office: 1
    };
    return daysMap[type];
}

// =========================================================================
// SISTEMA DE RETARDOS
// =========================================================================

/**
 * Resultado del cálculo de retardo
 */
export type TardinessResult = {
    isLate: boolean;              // Si está tarde después de tolerancia
    minutesLate: number;          // Minutos de retardo
    withinTolerance: boolean;     // Dentro de tolerancia (no se marca como retardo)
};

/**
 * Calcula si hay retardo considerando la tolerancia.
 *
 * @param scheduledTime - Hora programada de entrada (HH:mm)
 * @param actualTime - Hora real de entrada (HH:mm)
 * @param toleranceMinutes - Minutos de tolerancia (default: 10)
 */
export function calculateTardiness(
    scheduledTime: string,
    actualTime: string,
    toleranceMinutes: number = 10
): TardinessResult {
    const scheduled = parseTimeToDecimal(scheduledTime);
    const actual = parseTimeToDecimal(actualTime);

    const differenceMinutes = Math.round((actual - scheduled) * 60);

    if (differenceMinutes <= 0) {
        return { isLate: false, minutesLate: 0, withinTolerance: true };
    }

    if (differenceMinutes <= toleranceMinutes) {
        return { isLate: false, minutesLate: differenceMinutes, withinTolerance: true };
    }

    return {
        isLate: true,
        minutesLate: differenceMinutes,
        withinTolerance: false
    };
}

/**
 * Verifica si se debe aplicar sanción por retardos acumulados.
 *
 * @param tardinessCountInPeriod - Total de retardos en el período (30 días)
 * @param tardinessCountInWeek - Total de retardos en la semana
 * @param maxPerMonth - Máximo permitido por mes (default: 3)
 * @param maxPerWeek - Máximo permitido por semana (default: 2)
 */
export function shouldApplyTardinessSanction(
    tardinessCountInPeriod: number,
    tardinessCountInWeek: number,
    maxPerMonth: number = 3,
    maxPerWeek: number = 2
): { applySanction: boolean; reason?: string } {
    if (tardinessCountInWeek >= maxPerWeek) {
        return {
            applySanction: true,
            reason: `${tardinessCountInWeek} retardos en la semana (máximo: ${maxPerWeek})`
        };
    }

    if (tardinessCountInPeriod >= maxPerMonth) {
        return {
            applySanction: true,
            reason: `${tardinessCountInPeriod} retardos en 30 días (máximo: ${maxPerMonth})`
        };
    }

    return { applySanction: false };
}

/**
 * Evalúa la severidad de una salida temprana.
 *
 * @param hoursWorked - Horas trabajadas en el día
 * @param expectedHours - Horas esperadas del turno
 * @returns Nivel de severidad ('minor' | 'major' | 'critical')
 */
export function evaluateEarlyDepartureSeverity(
    hoursWorked: number,
    expectedHours: number
): 'minor' | 'major' | 'critical' {
    const percentage = hoursWorked / expectedHours;

    if (percentage < 0.5) {
        return 'critical'; // Menos del 50% trabajado (posible ausencia)
    }

    if (percentage < 0.8) {
        return 'major';    // Menos del 80% trabajado (salida significativa)
    }

    return 'minor';        // Salida temprana "normal"
}

// =========================================================================
// VALIDACIÓN DE CONFLICTOS DE FECHAS
// =========================================================================

/**
 * Resultado de la verificación de conflicto de fechas
 */
export type DateConflictResult = {
    hasConflict: boolean;
    conflictingRanges: {
        id: string;
        type: IncidenceType;
        startDate: string;
        endDate: string;
        status: string;
    }[];
    message?: string;
};

/**
 * Verifica si dos rangos de fechas se solapan.
 * Usa comparación de strings YYYY-MM-DD para evitar problemas de zona horaria.
 */
export function datesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
): boolean {
    const s1 = start1.substring(0, 10);
    const e1 = end1.substring(0, 10);
    const s2 = start2.substring(0, 10);
    const e2 = end2.substring(0, 10);

    return s1 <= e2 && e1 >= s2;
}

/**
 * Detecta conflictos de fechas con incidencias existentes.
 * Debe llamarse antes de crear o aprobar una incidencia.
 *
 * @param employeeId - ID del empleado
 * @param startDate - Fecha inicio de la nueva incidencia
 * @param endDate - Fecha fin de la nueva incidencia
 * @param existingIncidences - Lista de incidencias existentes del empleado
 * @param excludeIncidenceId - ID de incidencia a excluir (para edición)
 */
export function checkDateConflict(
    employeeId: string,
    startDate: string,
    endDate: string,
    existingIncidences: Array<{
        id: string;
        employeeId: string;
        type: IncidenceType;
        startDate: string;
        endDate: string;
        status: string;
    }>,
    excludeIncidenceId?: string
): DateConflictResult {
    const relevantIncidences = existingIncidences.filter(inc =>
        inc.employeeId === employeeId &&
        ['pending', 'approved'].includes(inc.status) &&
        inc.id !== excludeIncidenceId
    );

    const conflictingRanges: DateConflictResult['conflictingRanges'] = [];

    for (const inc of relevantIncidences) {
        if (datesOverlap(startDate, endDate, inc.startDate, inc.endDate)) {
            conflictingRanges.push({
                id: inc.id,
                type: inc.type,
                startDate: inc.startDate,
                endDate: inc.endDate,
                status: inc.status
            });
        }
    }

    if (conflictingRanges.length === 0) {
        return { hasConflict: false, conflictingRanges: [] };
    }

    const typeNames: Record<IncidenceType, string> = {
        vacation: 'vacaciones',
        sick_leave: 'incapacidad',
        personal_leave: 'permiso personal',
        maternity: 'maternidad',
        paternity: 'paternidad',
        bereavement: 'duelo',
        unjustified_absence: 'falta injustificada',
        abandono_empleo: 'abandono de empleo',
        marriage: 'matrimonio',
        adoption: 'adopción',
        half_day_family: 'permiso medio día',
        civic_duty: 'deber cívico',
        unpaid_leave: 'permiso sin goce',
        home_office: 'home office'
    };

    const conflictDescriptions = conflictingRanges.map(c =>
        `${typeNames[c.type]} del ${formatDateShort(c.startDate)} al ${formatDateShort(c.endDate)} (${c.status === 'pending' ? 'pendiente' : 'aprobada'})`
    );

    const message = conflictingRanges.length === 1
        ? `Ya existe una solicitud de ${conflictDescriptions[0]} en las fechas seleccionadas.`
        : `Las fechas seleccionadas se solapan con ${conflictingRanges.length} incidencias existentes: ${conflictDescriptions.join('; ')}.`;

    return { hasConflict: true, conflictingRanges, message };
}

/**
 * Valida una solicitud de incidencia completa incluyendo:
 * - Elegibilidad de vacaciones (si aplica)
 * - Saldo disponible (si aplica)
 * - Conflictos de fechas
 *
 * @returns { valid: boolean, errors: string[] }
 */
export function validateIncidenceRequest(params: {
    employeeId: string;
    type: IncidenceType;
    startDate: string;
    endDate: string;
    hireDate: string;
    vacationBalance?: {
        daysAvailable: number;
        daysEntitled: number;
    };
    existingIncidences: Array<{
        id: string;
        employeeId: string;
        type: IncidenceType;
        startDate: string;
        endDate: string;
        status: string;
    }>;
    excludeIncidenceId?: string;
}): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    const start = new Date(params.startDate);
    const end = new Date(params.endDate);

    if (end < start) {
        errors.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }

    if (params.type === 'vacation') {
        const eligibility = checkVacationEligibility(params.hireDate);
        if (!eligibility.eligible) {
            errors.push(`No tienes la antigüedad requerida. Faltan ${eligibility.daysUntilEligible} días para cumplir 1 año.`);
        }

        if (params.vacationBalance) {
            const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (daysRequested > params.vacationBalance.daysAvailable) {
                errors.push(`Solo tienes ${params.vacationBalance.daysAvailable} días disponibles. Solicitaste ${daysRequested} días.`);
            }
        }
    }

    const conflictResult = checkDateConflict(
        params.employeeId,
        params.startDate,
        params.endDate,
        params.existingIncidences,
        params.excludeIncidenceId
    );

    if (conflictResult.hasConflict && conflictResult.message) {
        errors.push(conflictResult.message);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

// =========================================================================
// HELPER INTERNO
// =========================================================================

/**
 * Formatea una fecha YYYY-MM-DD a DD/MM/YYYY sin conversión de zona horaria.
 * (función interna, no exportada)
 */
function formatDateShort(dateString: string): string {
    if (!dateString) return '';
    if (dateString.length === 10 && dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
    return new Date(dateString).toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}
