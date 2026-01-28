/**
 * HCM Utilities - Cálculos Operativos de RRHH (Sin Impacto en Nómina)
 * 
 * Este módulo contiene funciones para:
 * - Validación de jornadas laborales (Tiempos)
 * - Cálculo de días de vacaciones por antigüedad
 * - Gestión de retardos y asistencia
 * 
 * NOTA: Toda la lógica monetaria (SDI, Sueldos, Finiquitos) ha sido eliminada.
 * Este sistema solo gestiona la operación, no los pagos.
 */

import type { ShiftType, IncidenceType } from './types';

// =========================================================================
// VALIDACIÓN DE JORNADAS LABORALES
// =========================================================================

/**
 * Resultado de validación de jornada
 */
export type WorkdayValidation = {
    isValid: boolean;         // Si cumple con límite legal
    maxHours: number;         // Máximo de horas según tipo de jornada
    regularHours: number;     // Horas dentro de jornada normal
    overtimeHours: number;    // Horas extra
    message?: string;         // Mensaje descriptivo
};

/**
 * Obtiene el máximo de horas según tipo de jornada (Art. 60, 61 LFT)
 * 
 * @param shiftType - Tipo de jornada
 * @returns Máximo de horas permitidas
 */
export function getMaxHoursForShift(shiftType: ShiftType): number {
    const maxHoursMap: Record<ShiftType, number> = {
        diurnal: 8,    // 6:00 - 20:00
        nocturnal: 7,  // 20:00 - 6:00
        mixed: 7.5     // Abarca ambas pero menos de 3.5h nocturnas
    };
    return maxHoursMap[shiftType];
}

/**
 * Valida jornada laboral según tipo de turno (Art. 60, 61 LFT)
 * 
 * @param hoursWorked - Horas trabajadas en el día
 * @param shiftType - Tipo de jornada
 * @returns Objeto de validación con desglose
 */
export function validateWorkday(
    hoursWorked: number,
    shiftType: ShiftType
): WorkdayValidation {
    const maxHours = getMaxHoursForShift(shiftType);
    const overtime = Math.max(hoursWorked - maxHours, 0);

    const shiftNames: Record<ShiftType, string> = {
        diurnal: 'diurna',
        nocturnal: 'nocturna',
        mixed: 'mixta'
    };

    return {
        isValid: hoursWorked <= maxHours,
        maxHours,
        regularHours: Math.min(hoursWorked, maxHours),
        overtimeHours: overtime,
        message: overtime > 0
            ? `Excede jornada ${shiftNames[shiftType]} por ${overtime.toFixed(2)} horas`
            : undefined
    };
}

/**
 * Valida que las horas extra diarias no excedan el límite legal
 * Máximo 3 horas extra diarias (Art. 66 LFT)
 */
export function validateDailyOvertime(dailyOvertimeHours: number): boolean {
    return dailyOvertimeHours <= 3;
}

// =========================================================================
// VACACIONES Y ANTIGÜEDAD
// =========================================================================

/**
 * Calcula días de vacaciones según antigüedad (Art. 76 LFT - Reforma 2023)
 */
export function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;

    // Primeros 5 años: 12 días base + 2 por cada año adicional
    if (yearsOfService <= 5) {
        return 12 + ((yearsOfService - 1) * 2);
    }

    // Años 6-10: continúa +2 por año (20 + 2*años adicionales)
    if (yearsOfService <= 10) {
        return 20 + ((yearsOfService - 5) * 2);
    }

    // Año 11-15: +2 días (32 base)
    if (yearsOfService <= 15) {
        return 32;
    }

    // Año 16-20: +2 días (34 base)
    if (yearsOfService <= 20) {
        return 34;
    }

    // Año 21-25: +2 días (36 base)
    if (yearsOfService <= 25) {
        return 36;
    }

    // Año 26-30: +2 días (38 base)
    if (yearsOfService <= 30) {
        return 38;
    }

    // Año 31+: +2 días (40 base)
    return 40;
}

/**
 * Calcula años de antigüedad a partir de fecha de ingreso
 */
export function calculateYearsOfService(
    hireDate: string,
    asOfDate: Date = new Date()
): number {
    const hire = new Date(hireDate);
    let years = asOfDate.getFullYear() - hire.getFullYear();

    // Ajustar si aún no ha llegado el aniversario este año
    const monthDiff = asOfDate.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < hire.getDate())) {
        years--;
    }

    return Math.max(0, years);
}

// =========================================================================
// INCIDENCIAS - HELPERS
// =========================================================================

/**
 * Determina si una incidencia es con goce de sueldo según tipo y política
 */
export function isIncidencePaid(type: IncidenceType): boolean {
    const paidTypes: IncidenceType[] = [
        'vacation',
        'sick_leave',      // Parcialmente cubierto por IMSS
        'maternity',       // Cubierto por IMSS
        'paternity',       // 5 días con goce (Art. 132 LFT)
        'bereavement'      // Generalmente 3 días
    ];
    return paidTypes.includes(type);
}

/**
 * Obtiene días default según tipo de incidencia
 */
export function getDefaultIncidenceDays(type: IncidenceType): number {
    const daysMap: Record<IncidenceType, number> = {
        vacation: 1,               // Variable según antigüedad
        sick_leave: 3,             // Variable según certificado
        personal_leave: 1,         // Variable
        maternity: 84,             // 12 semanas (Art. 170 LFT)
        paternity: 5,              // 5 días (Art. 132 LFT)
        bereavement: 3,            // Generalmente 3 días
        unjustified_absence: 1     // Por día
    };
    return daysMap[type];
}

// =========================================================================
// UTILIDADES DE FORMATO
// =========================================================================

/**
 * Formatea horas a formato HH:mm
 */
export function formatHours(decimalHours: number): string {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Formatea un número como moneda MXN
 */
export function formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(value);
}

/**
 * Parsea hora en formato HH:mm a decimal
 */
export function parseTimeToDecimal(timeString: string): number {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parts[2] ? parseInt(parts[2], 10) : 0;

    return hours + (minutes / 60) + (seconds / 3600);
}

/**
 * Calcula horas trabajadas entre entrada y salida
 */
export function calculateHoursWorked(checkIn: string, checkOut: string): number {
    const inDecimal = parseTimeToDecimal(checkIn);
    let outDecimal = parseTimeToDecimal(checkOut);

    // Si salida es menor que entrada, asumimos que cruzó medianoche
    if (outDecimal < inDecimal) {
        outDecimal += 24;
    }

    return Math.round((outDecimal - inDecimal) * 100) / 100;
}

// =========================================================================
// SISTEMA DE VACACIONES - REFORMA 2023
// =========================================================================

/**
 * Calcula si el empleado tiene la antigüedad requerida para vacaciones
 */
export function checkVacationEligibility(
    hireDate: string,
    requestDate: Date = new Date()
): { eligible: boolean; daysUntilEligible?: number; yearsOfService: number } {
    const hire = new Date(hireDate);
    const yearsOfService = calculateYearsOfService(hireDate, requestDate);

    if (yearsOfService >= 1) {
        return { eligible: true, yearsOfService };
    }

    // Calcular días hasta cumplir 1 año
    const oneYearMark = new Date(hire);
    oneYearMark.setFullYear(oneYearMark.getFullYear() + 1);
    const daysUntilEligible = Math.ceil(
        (oneYearMark.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return { eligible: false, daysUntilEligible, yearsOfService: 0 };
}

/**
 * Calcula el saldo de vacaciones disponible
 */
export function calculateVacationBalance(
    daysEntitled: number,
    daysTaken: number,
    daysScheduled: number
): number {
    return Math.max(0, daysEntitled - daysTaken - daysScheduled);
}

/**
 * Valida si el empleado puede solicitar vacaciones
 */
export function validateVacationRequest(
    daysRequested: number,
    daysAvailable: number,
    hireDate: string
): { valid: boolean; error?: string } {
    // Verificar antigüedad
    const eligibility = checkVacationEligibility(hireDate);
    if (!eligibility.eligible) {
        return {
            valid: false,
            error: `No tienes la antigüedad requerida. Faltan ${eligibility.daysUntilEligible} días para cumplir 1 año.`
        };
    }

    // Verificar saldo disponible
    if (daysRequested > daysAvailable) {
        return {
            valid: false,
            error: `Solo tienes ${daysAvailable} días disponibles. Solicitaste ${daysRequested} días.`
        };
    }

    // Mínimo medio día (pero cuenta como día completo)
    if (daysRequested < 0.5) {
        return {
            valid: false,
            error: 'El mínimo a solicitar es medio día.'
        };
    }

    return { valid: true };
}

/**
 * Convierte medio día a día completo para fines de registro
 */
export function normalizeVacationDays(requestedDays: number): number {
    // Si es medio día (0.5), cuenta como día completo en el sistema
    if (requestedDays === 0.5) {
        return 1;
    }
    return Math.ceil(requestedDays);
}

/**
 * Calcula la fecha del próximo aniversario (reset de vacaciones)
 */
export function getNextAnniversaryDate(hireDate: string, asOfDate: Date = new Date()): Date {
    const hire = new Date(hireDate);
    const nextAnniversary = new Date(hire);

    nextAnniversary.setFullYear(asOfDate.getFullYear());

    // Si ya pasó este año, el próximo es el siguiente año
    if (nextAnniversary <= asOfDate) {
        nextAnniversary.setFullYear(asOfDate.getFullYear() + 1);
    }

    return nextAnniversary;
}

/**
 * Verifica si es momento de hacer reset de vacaciones (aniversario)
 */
export function isAnniversaryDate(hireDate: string, currentDate: Date = new Date()): boolean {
    const hire = new Date(hireDate);
    return (
        hire.getMonth() === currentDate.getMonth() &&
        hire.getDate() === currentDate.getDate()
    );
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
 * Calcula si hay retardo considerando la tolerancia
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
 * Verifica si se debe aplicar sanción por retardos
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

// =========================================================================
// HORAS EXTRAS - REGLA 3x3 CON REDONDEO
// =========================================================================

/**
 * Política de redondeo basada en fracciones de 30 minutos
 * - 1-14 minutos: se redondea a 0
 * - 15-44 minutos: se redondea a 0.5 (media hora)
 * - 45-59 minutos: se redondea a 1 (hora completa)
 *
 * @param decimalHours - Horas en decimal
 * @returns Horas redondeadas según política
 */
export function roundOvertimeHours(decimalHours: number): number {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    let roundedMinutes: number;
    if (minutes < 15) {
        roundedMinutes = 0;
    } else if (minutes < 45) {
        roundedMinutes = 30;
    } else {
        roundedMinutes = 60;
    }

    return hours + (roundedMinutes / 60);
}

/**
 * Resultado extendido del cálculo de horas extra con desglose diario
 */
export type OvertimeResultExtended = OvertimeResult & {
    dailyBreakdown: {
        date: string;
        doubleHours: number;
        tripleHours: number;
        carryoverMinutes: number; // Minutos sobrantes para bolsa de tiempo
    }[];
    totalCarryoverMinutes: number;
};

/**
 * Calcula horas extra con regla 3x3 y política de redondeo
 *
 * Reglas:
 * - Máximo 3 horas dobles diarias
 * - Máximo 9 horas dobles semanales
 * - Excedente se paga como triples
 * - Redondeo según política de 30 minutos
 *
 * @param dailyOvertimeHours - Array de horas extra por día
 * @param hourlyRate - Tarifa por hora
 * @returns OvertimeResultExtended
 */
export function calculateOvertimeWithRounding(
    dailyOvertimeHours: { date: string; hours: number }[],
    hourlyRate: number
): OvertimeResultExtended {
    let weeklyDoubleHoursUsed = 0;
    let totalDoubleHours = 0;
    let totalTripleHours = 0;
    let totalCarryoverMinutes = 0;

    const dailyBreakdown: OvertimeResultExtended['dailyBreakdown'] = [];

    for (const day of dailyOvertimeHours) {
        const roundedHours = roundOvertimeHours(day.hours);
        const carryoverMinutes = Math.round((day.hours - roundedHours) * 60);

        let dayDoubleHours = 0;
        let dayTripleHours = 0;

        // Máximo 3 horas dobles por día
        const maxDailyDouble = 3;
        const remainingWeeklyDouble = 9 - weeklyDoubleHoursUsed;
        const availableDouble = Math.min(maxDailyDouble, remainingWeeklyDouble);

        if (roundedHours <= availableDouble) {
            dayDoubleHours = roundedHours;
        } else {
            dayDoubleHours = availableDouble;
            dayTripleHours = roundedHours - availableDouble;
        }

        weeklyDoubleHoursUsed += dayDoubleHours;
        totalDoubleHours += dayDoubleHours;
        totalTripleHours += dayTripleHours;
        totalCarryoverMinutes += carryoverMinutes;

        dailyBreakdown.push({
            date: day.date,
            doubleHours: dayDoubleHours,
            tripleHours: dayTripleHours,
            carryoverMinutes
        });
    }

    const doubleAmount = Math.round(totalDoubleHours * hourlyRate * 2 * 100) / 100;
    const tripleAmount = Math.round(totalTripleHours * hourlyRate * 3 * 100) / 100;

    return {
        doubleHours: totalDoubleHours,
        tripleHours: totalTripleHours,
        doubleAmount,
        tripleAmount,
        totalAmount: doubleAmount + tripleAmount,
        dailyBreakdown,
        totalCarryoverMinutes
    };
}

/**
 * Convierte minutos de bolsa de tiempo a horas pagables
 * Solo se pagan cuando se acumulan 30 minutos o más
 *
 * @param minutes - Minutos acumulados
 * @returns { payableHours: number, remainingMinutes: number }
 */
export function convertCarryoverToPayable(minutes: number): {
    payableHours: number;
    remainingMinutes: number;
} {
    if (minutes < 30) {
        return { payableHours: 0, remainingMinutes: minutes };
    }

    const halfHours = Math.floor(minutes / 30);
    const payableHours = halfHours * 0.5;
    const remainingMinutes = minutes % 30;

    return { payableHours, remainingMinutes };
}

// =========================================================================
// FORMATO DE TEXTO PARA PRE-NÓMINA
// =========================================================================

/**
 * Mapa de caracteres acentuados a sin acento
 */
const ACCENT_MAP: Record<string, string> = {
    'Á': 'A', 'É': 'E', 'Í': 'I', 'Ó': 'O', 'Ú': 'U',
    'á': 'A', 'é': 'E', 'í': 'I', 'ó': 'O', 'ú': 'U',
    'Ñ': 'N', 'ñ': 'N',
    'Ü': 'U', 'ü': 'U'
};

/**
 * Normaliza texto para pre-nómina
 * - Convierte a MAYÚSCULAS
 * - Elimina acentos
 * - Cambia Ñ por N
 * - Elimina caracteres especiales
 *
 * @param text - Texto original
 * @returns Texto normalizado
 */
export function normalizeTextForPayroll(text: string): string {
    if (!text) return '';

    let normalized = text.toUpperCase();

    // Reemplazar caracteres acentuados
    for (const [accented, plain] of Object.entries(ACCENT_MAP)) {
        normalized = normalized.replace(new RegExp(accented, 'g'), plain);
    }

    // Eliminar caracteres especiales (mantener solo letras, números y espacios)
    normalized = normalized.replace(/[^A-Z0-9\s]/g, '');

    // Normalizar espacios múltiples
    normalized = normalized.replace(/\s+/g, ' ').trim();

    return normalized;
}

/**
 * Formatea el nombre para pre-nómina (APELLIDOS, NOMBRE)
 *
 * @param fullName - Nombre completo
 * @returns Nombre formateado
 */
export function formatNameForPayroll(fullName: string): string {
    const normalized = normalizeTextForPayroll(fullName);
    const parts = normalized.split(' ');

    if (parts.length <= 2) {
        return normalized;
    }

    // Asumimos: NOMBRE(S) APELLIDO_PATERNO APELLIDO_MATERNO
    // Convertir a: APELLIDO_PATERNO APELLIDO_MATERNO, NOMBRE(S)
    const names = parts.slice(0, -2).join(' ');
    const surnames = parts.slice(-2).join(' ');

    return `${surnames}, ${names}`;
}

/**
 * Genera el código de celda para una entrada de pre-nómina
 * Ej: "3HE2, 0.5HE3" o "DL, PD"
 *
 * @param entry - Datos del día
 * @returns Texto para mostrar en la celda
 */
export function generateCellDisplay(entry: {
    primaryCode: string;
    additionalCodes?: string[];
    overtimeDoubleHours?: number;
    overtimeTripleHours?: number;
}): string {
    const parts: string[] = [];

    // Si hay horas extras, mostrar formato especial
    if (entry.overtimeDoubleHours && entry.overtimeDoubleHours > 0) {
        parts.push(`${entry.overtimeDoubleHours}HE2`);
    }
    if (entry.overtimeTripleHours && entry.overtimeTripleHours > 0) {
        parts.push(`${entry.overtimeTripleHours}HE3`);
    }

    // Si hay horas extras, no mostrar ASI (asistencia implícita)
    if (parts.length === 0) {
        // Si es DL o PD, mostrar esos códigos
        if (entry.primaryCode === 'DL' || entry.primaryCode === 'PD') {
            parts.push(entry.primaryCode);
        } else if (entry.primaryCode !== 'ASI' || !entry.additionalCodes?.length) {
            // Solo mostrar ASI si no hay otros códigos
            parts.push(entry.primaryCode);
        }
    }

    // Agregar códigos adicionales
    if (entry.additionalCodes) {
        for (const code of entry.additionalCodes) {
            if (!parts.includes(code)) {
                parts.push(code);
            }
        }
    }

    return parts.join(', ');
}

/**
 * Obtiene el nombre corto del día de la semana
 *
 * @param dayOfWeek - Día de la semana (0-6, 0=Domingo)
 * @returns Nombre corto del día
 */
export function getDayShortName(dayOfWeek: number): string {
    const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    return days[dayOfWeek] || '';
}

/**
 * Verifica si una fecha es domingo
 *
 * @param date - Fecha a verificar
 * @returns true si es domingo
 */
export function isSunday(date: Date | string): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.getDay() === 0;
}

/**
 * Verifica si un empleado está de baja durante todo un período
 *
 * @param terminationDate - Fecha de baja
 * @param periodStart - Inicio del período
 * @returns true si la baja fue antes del inicio del período
 */
export function isTerminatedBeforePeriod(
    terminationDate: string | undefined,
    periodStart: string
): boolean {
    if (!terminationDate) return false;
    return new Date(terminationDate) < new Date(periodStart);
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
 * Verifica si dos rangos de fechas se solapan
 *
 * @param start1 - Fecha inicio del primer rango
 * @param end1 - Fecha fin del primer rango
 * @param start2 - Fecha inicio del segundo rango
 * @param end2 - Fecha fin del segundo rango
 * @returns true si hay solapamiento
 */
export function datesOverlap(
    start1: string,
    end1: string,
    start2: string,
    end2: string
): boolean {
    const s1 = new Date(start1);
    const e1 = new Date(end1);
    const s2 = new Date(start2);
    const e2 = new Date(end2);

    // Dos rangos se solapan si:
    // El inicio de uno es antes o igual al fin del otro Y
    // El fin de uno es después o igual al inicio del otro
    return s1 <= e2 && e1 >= s2;
}

/**
 * Detecta conflictos de fechas con incidencias existentes
 *
 * Esta función debe ser llamada antes de crear o aprobar una incidencia
 * para verificar que no hay solapamiento de fechas.
 *
 * @param employeeId - ID del empleado
 * @param startDate - Fecha inicio de la nueva incidencia
 * @param endDate - Fecha fin de la nueva incidencia
 * @param existingIncidences - Lista de incidencias existentes del empleado
 * @param excludeIncidenceId - ID de incidencia a excluir (para edición)
 * @returns DateConflictResult
 *
 * @example
 * // Verificar antes de crear nueva incidencia
 * const result = checkDateConflict(
 *   'emp123',
 *   '2024-03-15',
 *   '2024-03-20',
 *   existingIncidences
 * );
 * if (result.hasConflict) {
 *   console.error(result.message);
 * }
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
    // Filtrar incidencias relevantes:
    // - Del mismo empleado
    // - Con status pending o approved (no rechazadas ni canceladas)
    // - Excluyendo la incidencia actual si se proporciona
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

    // Generar mensaje descriptivo
    const typeNames: Record<IncidenceType, string> = {
        vacation: 'vacaciones',
        sick_leave: 'incapacidad',
        personal_leave: 'permiso personal',
        maternity: 'maternidad',
        paternity: 'paternidad',
        bereavement: 'duelo',
        unjustified_absence: 'falta injustificada'
    };

    const conflictDescriptions = conflictingRanges.map(c =>
        `${typeNames[c.type]} del ${formatDate(c.startDate)} al ${formatDate(c.endDate)} (${c.status === 'pending' ? 'pendiente' : 'aprobada'})`
    );

    const message = conflictingRanges.length === 1
        ? `Ya existe una solicitud de ${conflictDescriptions[0]} en las fechas seleccionadas.`
        : `Las fechas seleccionadas se solapan con ${conflictingRanges.length} incidencias existentes: ${conflictDescriptions.join('; ')}.`;

    return {
        hasConflict: true,
        conflictingRanges,
        message
    };
}

/**
 * Formatea una fecha en formato legible DD/MM/YYYY
 *
 * @param dateString - Fecha en formato ISO
 * @returns Fecha formateada
 */
function formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

/**
 * Valida una solicitud de incidencia completa incluyendo:
 * - Elegibilidad de vacaciones (si aplica)
 * - Saldo disponible (si aplica)
 * - Conflictos de fechas
 *
 * @param params - Parámetros de validación
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

    // Validar fechas básicas
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);

    if (end < start) {
        errors.push('La fecha de fin no puede ser anterior a la fecha de inicio.');
    }

    // Para vacaciones, validar elegibilidad y saldo
    if (params.type === 'vacation') {
        // Verificar antigüedad
        const eligibility = checkVacationEligibility(params.hireDate);
        if (!eligibility.eligible) {
            errors.push(`No tienes la antigüedad requerida. Faltan ${eligibility.daysUntilEligible} días para cumplir 1 año.`);
        }

        // Verificar saldo disponible
        if (params.vacationBalance) {
            const daysRequested = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
            if (daysRequested > params.vacationBalance.daysAvailable) {
                errors.push(`Solo tienes ${params.vacationBalance.daysAvailable} días disponibles. Solicitaste ${daysRequested} días.`);
            }
        }
    }

    // Verificar conflictos de fechas
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
