import type { ShiftType } from "@/types/hcm.types";

// =========================================================================
// VALIDACIÓN DE JORNADAS LABORALES (Art. 60, 61, 66 LFT)
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
 * @param isRestDay - Si es día de descanso del empleado
 * @param allowOvertime - Si el empleado genera horas extras
 * @param scheduledHours - Horas programadas REALES del turno (ej. 9h para 11-20).
 *                         Si se proporciona, se usa en vez del máximo legal LFT.
 * @returns Objeto de validación con desglose
 */
export function validateWorkday(
    hoursWorked: number,
    shiftType: ShiftType,
    isRestDay: boolean = false,
    allowOvertime: boolean = true,
    scheduledHours?: number
): WorkdayValidation {
    if (isRestDay && !allowOvertime) {
        // Si el empleado no genera horas extra, el tiempo trabajado en día de descanso
        // se toma como tiempo normal correspondiente sin generar incidencias ni tiempo extra.
        return {
            isValid: true,
            maxHours: scheduledHours || getMaxHoursForShift(shiftType),
            regularHours: hoursWorked,
            overtimeHours: 0,
            message: 'Día de descanso trabajado (Sin Extra)'
        };
    }

    // Usar horas programadas reales si disponibles, sino el máximo legal LFT
    const maxHours = scheduledHours || getMaxHoursForShift(shiftType);
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
 * Valida que las horas extra diarias no excedan el límite legal.
 * Máximo 3 horas extra diarias (Art. 66 LFT).
 */
export function validateDailyOvertime(dailyOvertimeHours: number): boolean {
    return dailyOvertimeHours <= 3;
}

// =========================================================================
// UTILIDADES DE TIEMPO
// =========================================================================

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
 * Calcula horas trabajadas entre entrada y salida.
 * Maneja cruces de medianoche automáticamente.
 */
export function calculateHoursWorked(checkIn: string, checkOut: string, breakMinutes: number = 0): number {
    const inDecimal = parseTimeToDecimal(checkIn);
    let outDecimal = parseTimeToDecimal(checkOut);

    // Si salida es menor que entrada, asumimos que cruzó medianoche
    if (outDecimal < inDecimal) {
        outDecimal += 24;
    }

    const breakHours = breakMinutes / 60;
    return Math.round((outDecimal - inDecimal - breakHours) * 100) / 100;
}

/**
 * Formatea horas a formato HH:mm
 */
export function formatHours(decimalHours: number): string {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Verifica si una fecha es domingo
 */
export function isSunday(date: Date | string): boolean {
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.getDay() === 0;
}

/**
 * Obtiene el nombre corto del día de la semana
 *
 * @param dayOfWeek - Día de la semana (0-6, 0=Domingo)
 */
export function getDayShortName(dayOfWeek: number): string {
    const days = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
    return days[dayOfWeek] || '';
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
