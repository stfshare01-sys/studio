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
