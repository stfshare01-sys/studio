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
 * Evalúa la severidad de una salida temprana
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
 * @returns Objeto de validación con desglose
 */
export function validateWorkday(
    hoursWorked: number,
    shiftType: ShiftType,
    isRestDay: boolean = false,
    allowOvertime: boolean = true
): WorkdayValidation {
    if (isRestDay && !allowOvertime) {
        // Si el empleado no genera horas extra, el tiempo trabajado en día de descanso 
        // se toma como tiempo normal correspondiente sin generar incidencias ni tiempo extra.
        return {
            isValid: true,
            maxHours: getMaxHoursForShift(shiftType),
            regularHours: hoursWorked,
            overtimeHours: 0,
            message: 'Día de descanso trabajado (Sin Extra)'
        };
    }

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

    // Años 6+: 22 días base + 2 días por cada 5 años completos adicionales
    // 6-10: 22
    // 11-15: 24
    // 16-20: 26
    // etc.
    const additionalFiveYearBlocks = Math.floor((yearsOfService - 6) / 5);
    return 22 + (additionalFiveYearBlocks * 2);
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
        unjustified_absence: 1,    // Por día
        abandono_empleo: 1,        // Manual, por CH
        marriage: 5,               // Variable
        adoption: 15,              // Variable
        unpaid_leave: 1,           // Variable
        civic_duty: 1,             // Variable
        half_day_family: 1         // Variable
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
 * Política de redondeo de minutos extra según reglas de nómina
 *
 * REGLAS DE REDONDEO (Actualizado):
 * - 0-29 minutos: se redondea a 0 (se descarta)
 * - 30-44 minutos: se redondea a 0.5 (media hora)
 * - 45-60 minutos: se redondea a 1 (hora completa)
 *
 * EJEMPLO:
 * - 1h 15min extra → 1h (los 15min se descartan)
 * - 1h 35min extra → 1.5h (los 35min se redondean a 30min)
 * - 1h 50min extra → 2h (los 50min se redondean a 60min)
 *
 * @param decimalHours - Horas en decimal
 * @returns Horas redondeadas según política
 */
export function roundOvertimeHours(decimalHours: number): number {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    let roundedMinutes: number;
    if (minutes < 30) {
        // 0-29 minutos: se descartan
        roundedMinutes = 0;
    } else if (minutes < 45) {
        // 30-44 minutos: se redondean a media hora
        roundedMinutes = 30;
    } else {
        // 45-60 minutos: se redondean a hora completa
        roundedMinutes = 60;
    }

    return hours + (roundedMinutes / 60);
}

/**
 * Resultado base del cálculo de horas extra
 */
export type OvertimeResult = {
    doubleHours: number;
    tripleHours: number;
    doubleAmount: number;
    tripleAmount: number;
    totalAmount: number;
};

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
// BOLSA DE HORAS - ORDEN DE OPERACIONES
// =========================================================================

/**
 * Resultado del procesamiento de horas extras con bolsa de horas
 */
export type OvertimeWithTimeBankResult = {
    // Horas extras a pagar (después de redondeo)
    paidOvertimeMinutes: number;
    paidOvertimeHours: number;

    // Estado de la bolsa de horas
    previousBalance: number;         // Balance anterior (negativo = debe)
    minutesUsedToPayDebt: number;    // Minutos usados para saldar deuda
    newBalance: number;              // Nuevo balance de la bolsa

    // Minutos descartados
    discardedMinutes: number;        // Minutos < 30 que se descartan

    // Detalle del procesamiento
    processingSteps: string[];
};

/**
 * Procesa minutos extra considerando la bolsa de horas primero
 *
 * ORDEN DE OPERACIONES:
 * 1. Si el empleado debe horas (balance negativo):
 *    - Restar minutos extra de su deuda
 *    - Si sobran minutos después de saldar, pasan al redondeo
 * 2. Si el puesto NO hace horas extras:
 *    - Solo se usa para saldar deuda
 *    - Cualquier excedente se descarta (balance queda en 0 máximo)
 * 3. Aplicar redondeo sobre el remanente:
 *    - 0-29 min: 0 (descartar)
 *    - 30-44 min: 0.5h
 *    - 45-60 min: 1h
 *
 * NOTA: La tolerancia de entrada NO afecta la bolsa de horas
 * (si llegó dentro de tolerancia, esos minutos no se procesan)
 *
 * @param rawOvertimeMinutes - Minutos extra trabajados (ya sin considerar tolerancia)
 * @param timeBankBalance - Balance actual de bolsa (negativo = debe, positivo = favor)
 * @param positionCanEarnOvertime - Si el puesto puede generar horas extras pagadas
 * @returns Resultado del procesamiento con detalle
 *
 * @example
 * // Empleado debe 30 min, trabajó 45 min extra, puesto SÍ genera HE
 * processOvertimeWithTimeBank(45, -30, true)
 * // → { paidOvertimeMinutes: 0, newBalance: 0, discardedMinutes: 15 }
 * // Explicación: 45 - 30 = 15 min restantes → se descartan (< 30)
 *
 * @example
 * // Empleado debe 30 min, trabajó 90 min extra, puesto SÍ genera HE
 * processOvertimeWithTimeBank(90, -30, true)
 * // → { paidOvertimeMinutes: 60, newBalance: 0, discardedMinutes: 0 }
 * // Explicación: 90 - 30 = 60 min restantes → 1h pagada
 */
export function processOvertimeWithTimeBank(
    rawOvertimeMinutes: number,
    timeBankBalance: number,
    positionCanEarnOvertime: boolean
): OvertimeWithTimeBankResult {
    const steps: string[] = [];
    let remainingMinutes = rawOvertimeMinutes;
    let minutesUsedToPayDebt = 0;
    let newBalance = timeBankBalance;

    steps.push(`Minutos extra trabajados: ${rawOvertimeMinutes}`);
    steps.push(`Balance de bolsa actual: ${timeBankBalance} (${timeBankBalance < 0 ? 'debe' : 'favor'})`);

    // Paso 1: Cruce con bolsa de horas si hay deuda
    if (timeBankBalance < 0) {
        const debt = Math.abs(timeBankBalance);
        minutesUsedToPayDebt = Math.min(remainingMinutes, debt);
        remainingMinutes -= minutesUsedToPayDebt;
        newBalance += minutesUsedToPayDebt;

        steps.push(`Deuda en bolsa: ${debt} min`);
        steps.push(`Minutos usados para saldar: ${minutesUsedToPayDebt}`);
        steps.push(`Minutos restantes: ${remainingMinutes}`);
        steps.push(`Nuevo balance de bolsa: ${newBalance}`);
    }

    // Paso 2: Si el puesto NO hace horas extras
    if (!positionCanEarnOvertime) {
        steps.push('Puesto NO genera horas extras');

        // Si aún hay deuda, los minutos extra la reducen
        // Si no hay deuda, los minutos positivos se descartan (no se guardan)
        if (newBalance < 0 && remainingMinutes > 0) {
            // Sigue saldando deuda
            const additionalPayment = Math.min(remainingMinutes, Math.abs(newBalance));
            newBalance += additionalPayment;
            const discarded = remainingMinutes - additionalPayment;

            steps.push(`Minutos adicionales para deuda: ${additionalPayment}`);
            steps.push(`Minutos descartados (puesto no genera HE): ${discarded}`);

            return {
                paidOvertimeMinutes: 0,
                paidOvertimeHours: 0,
                previousBalance: timeBankBalance,
                minutesUsedToPayDebt: minutesUsedToPayDebt + additionalPayment,
                newBalance: Math.min(newBalance, 0), // No puede quedar positivo
                discardedMinutes: discarded,
                processingSteps: steps,
            };
        }

        // No hay deuda y no genera HE: todo se descarta
        steps.push(`Minutos descartados (sin deuda, puesto no genera HE): ${remainingMinutes}`);
        return {
            paidOvertimeMinutes: 0,
            paidOvertimeHours: 0,
            previousBalance: timeBankBalance,
            minutesUsedToPayDebt,
            newBalance: 0, // Queda en 0, no se acumulan a favor
            discardedMinutes: remainingMinutes,
            processingSteps: steps,
        };
    }

    // Paso 3: Puesto SÍ hace horas extras - aplicar redondeo
    steps.push('Puesto SÍ genera horas extras');
    steps.push(`Aplicando redondeo a ${remainingMinutes} minutos`);

    let paidMinutes = 0;
    let discardedMinutes = 0;

    if (remainingMinutes < 30) {
        // 0-29 min: se descartan
        discardedMinutes = remainingMinutes;
        paidMinutes = 0;
        steps.push(`Redondeo: ${remainingMinutes} min < 30 → 0 (descartados)`);
    } else if (remainingMinutes < 45) {
        // 30-44 min: media hora
        paidMinutes = 30;
        discardedMinutes = remainingMinutes - 30;
        steps.push(`Redondeo: ${remainingMinutes} min → 30 min (0.5h)`);
    } else if (remainingMinutes < 60) {
        // 45-59 min: hora completa
        paidMinutes = 60;
        discardedMinutes = remainingMinutes - 60; // Puede ser negativo, lo manejamos
        if (discardedMinutes < 0) discardedMinutes = 0;
        steps.push(`Redondeo: ${remainingMinutes} min → 60 min (1h)`);
    } else {
        // 60+ minutos: hora completa + redondeo del resto
        const fullHours = Math.floor(remainingMinutes / 60);
        const fractionalMinutes = remainingMinutes % 60;

        paidMinutes = fullHours * 60;

        // Aplicar redondeo a la fracción
        if (fractionalMinutes >= 45) {
            paidMinutes += 60;
            discardedMinutes = fractionalMinutes - 60;
            if (discardedMinutes < 0) discardedMinutes = 0;
        } else if (fractionalMinutes >= 30) {
            paidMinutes += 30;
            discardedMinutes = fractionalMinutes - 30;
        } else {
            discardedMinutes = fractionalMinutes;
        }

        steps.push(`${remainingMinutes} min = ${fullHours}h + ${fractionalMinutes} min`);
        steps.push(`Redondeo fracción: ${fractionalMinutes} min → ${paidMinutes - (fullHours * 60)} min`);
    }

    steps.push(`Total a pagar: ${paidMinutes} min (${paidMinutes / 60}h)`);
    steps.push(`Descartados: ${discardedMinutes} min`);

    return {
        paidOvertimeMinutes: paidMinutes,
        paidOvertimeHours: paidMinutes / 60,
        previousBalance: timeBankBalance,
        minutesUsedToPayDebt,
        newBalance,
        discardedMinutes,
        processingSteps: steps,
    };
}

/**
 * Registra tiempo en la bolsa de horas (para deuda por salir temprano, etc.)
 *
 * @param currentBalance - Balance actual
 * @param minutesToAdd - Minutos a agregar (positivo = favor, negativo = deuda)
 * @returns Nuevo balance
 */
export function updateTimeBankBalance(
    currentBalance: number,
    minutesToAdd: number
): number {
    return currentBalance + minutesToAdd;
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
    // Para evitar falsos positivos por husos horarios (UTC vs Local),
    // comparamos asumiendo el formato YYYY-MM-DD extraído de los strings.
    const s1 = start1.substring(0, 10);
    const e1 = end1.substring(0, 10);
    const s2 = start2.substring(0, 10);
    const e2 = end2.substring(0, 10);

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
        unjustified_absence: 'falta injustificada',
        abandono_empleo: 'abandono de empleo',
        marriage: 'matrimonio',
        adoption: 'adopción',
        half_day_family: 'permiso medio día',
        civic_duty: 'deber cívico',
        unpaid_leave: 'permiso sin goce'
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
 * @param dateString - Fecha en formato ISO o YYYY-MM-DD
 * @returns Fecha formateada
 */
function formatDate(dateString: string): string {
    if (!dateString) return '';
    // Para evitar desfase de zona horaria con fechas "YYYY-MM-DD", la separamos manualmente
    if (dateString.length === 10 && dateString.includes('-')) {
        const parts = dateString.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
    }
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

// =========================================================================
// DETERMINACIÓN DE ESTADO DEL DÍA - REGLA DE ORO
// =========================================================================

/**
 * Estado de un marcaje (entrada o salida)
 */
export type PunchStatus = 'on_time' | 'late' | 'early' | 'justified' | 'missing';

/**
 * Estado final del día para nómina
 */
export type FinalDayStatus =
    | 'worked_complete'      // Día trabajado completo (ASI)
    | 'worked_with_tardiness' // Día trabajado con retardo (ASI + RET)
    | 'absence_unjustified'  // Falta injustificada (FINJ)
    | 'absence_justified'    // Permiso/Incidencia aprobada
    | 'pending_justification'; // Pendiente de justificar

/**
 * Datos de entrada y salida del día
 */
export type DayPunchData = {
    // Estado de entrada
    entryStatus: PunchStatus;
    entryIsJustified: boolean;

    // Estado de salida
    exitStatus: PunchStatus;
    exitIsJustified: boolean;

    // Si hay incidencia aprobada que cubre el día
    hasApprovedIncidence: boolean;
    incidenceType?: IncidenceType;
};

/**
 * Resultado de la evaluación del día
 */
export type DayStatusResult = {
    status: FinalDayStatus;
    primaryNomipaqCode: string;
    additionalCodes: string[];
    hasTardiness: boolean;
    hasEarlyDeparture: boolean;
    isFault: boolean;               // Si el día cuenta como falta
    requiresAction: boolean;        // Si requiere acción del jefe
    explanation: string;
};

/**
 * Determina el estado final de un día para efectos de nómina
 *
 * REGLA DE ORO - Día Trabajado Completo SOLO si:
 * - (Entrada OK + Salida OK)
 * - (Entrada OK + Salida Justificada)
 * - (Retardo Justificado + Salida OK)
 * - (Retardo Justificado + Salida Justificada)
 *
 * ESCENARIOS DE CONFLICTO:
 * - Retardo Justificado + Salida Injustificada = FALTA
 * - Entrada OK + Salida Injustificada = FALTA
 * - Retardo Injustificado + Salida OK/Justificada = RETARDO (no falta)
 * - Retardo Injustificado + Salida Injustificada = FALTA
 *
 * PRIORIDAD: La FALTA siempre domina sobre el día trabajado
 *
 * @param dayData - Datos de entrada y salida del día
 * @returns Resultado con estado y códigos de nómina
 *
 * @example
 * // Entrada tarde justificada + Salida temprano injustificada = FALTA
 * determineDayStatus({
 *   entryStatus: 'late',
 *   entryIsJustified: true,
 *   exitStatus: 'early',
 *   exitIsJustified: false,
 *   hasApprovedIncidence: false
 * })
 * // → { status: 'absence_unjustified', primaryNomipaqCode: '1FINJ', isFault: true }
 */
export function determineDayStatus(dayData: DayPunchData): DayStatusResult {
    // Caso 1: Hay incidencia aprobada que cubre el día
    if (dayData.hasApprovedIncidence && dayData.incidenceType) {
        const incidenceCodeMap: Record<IncidenceType, { code: string; name: string }> = {
            vacation: { code: 'VAC', name: 'Vacaciones' },
            sick_leave: { code: 'INC', name: 'Incapacidad' },
            personal_leave: { code: '1PCS', name: 'Permiso con sueldo' },
            maternity: { code: 'INC', name: 'Maternidad' },
            paternity: { code: '1PCS', name: 'Paternidad' },
            bereavement: { code: '1PCS', name: 'Duelo' },
            unjustified_absence: { code: '1FINJ', name: 'Falta injustificada' },
            abandono_empleo: { code: 'AE', name: 'Abandono de empleo' },
            marriage: { code: '1PCS', name: 'Matrimonio' },
            adoption: { code: '1PCS', name: 'Adopción' },
            unpaid_leave: { code: 'PSGS', name: 'Permiso sin goce' },
            civic_duty: { code: '1PCS', name: 'Deber Cívico' },
            half_day_family: { code: '1PCS', name: 'Medio día' }
        };

        const incidenceInfo = incidenceCodeMap[dayData.incidenceType];
        return {
            status: 'absence_justified',
            primaryNomipaqCode: incidenceInfo.code,
            additionalCodes: [],
            hasTardiness: false,
            hasEarlyDeparture: false,
            isFault: dayData.incidenceType === 'unjustified_absence',
            requiresAction: false,
            explanation: `Día cubierto por ${incidenceInfo.name}`,
        };
    }

    // Caso 2: Falta algún marcaje (entrada o salida)
    if (dayData.entryStatus === 'missing' || dayData.exitStatus === 'missing') {
        const missingEntry = dayData.entryStatus === 'missing';
        const missingExit = dayData.exitStatus === 'missing';
        const bothMissing = missingEntry && missingExit;

        // Si alguno está justificado, el otro determina el estado
        if (bothMissing) {
            if (dayData.entryIsJustified && dayData.exitIsJustified) {
                return {
                    status: 'worked_complete',
                    primaryNomipaqCode: 'ASI',
                    additionalCodes: [],
                    hasTardiness: false,
                    hasEarlyDeparture: false,
                    isFault: false,
                    requiresAction: false,
                    explanation: 'Ambos marcajes faltantes justificados',
                };
            }
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Faltan ambos marcajes - pendiente de justificar',
            };
        }

        // Solo falta uno
        if (missingEntry && !dayData.entryIsJustified) {
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Falta marcaje de entrada - pendiente de justificar',
            };
        }

        if (missingExit && !dayData.exitIsJustified) {
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Falta marcaje de salida - pendiente de justificar',
            };
        }
    }

    // Caso 3: Evaluar combinación de entrada y salida
    const entryOK = dayData.entryStatus === 'on_time' ||
        (dayData.entryStatus === 'late' && dayData.entryIsJustified);

    const exitOK = dayData.exitStatus === 'on_time' ||
        (dayData.exitStatus === 'early' && dayData.exitIsJustified);

    const hasUnjustifiedTardiness = dayData.entryStatus === 'late' && !dayData.entryIsJustified;
    const hasUnjustifiedEarlyDeparture = dayData.exitStatus === 'early' && !dayData.exitIsJustified;

    // REGLA: Salida temprano injustificada = FALTA (siempre)
    if (hasUnjustifiedEarlyDeparture) {
        return {
            status: 'absence_unjustified',
            primaryNomipaqCode: '1FINJ',
            additionalCodes: hasUnjustifiedTardiness ? ['1RET'] : [],
            hasTardiness: hasUnjustifiedTardiness,
            hasEarlyDeparture: true,
            isFault: true,
            requiresAction: false, // Ya se registró como falta
            explanation: 'Salida temprano injustificada - día se marca como FALTA',
        };
    }

    // REGLA: Retardo injustificado + Salida OK/Justificada = Solo retardo (no falta)
    if (hasUnjustifiedTardiness && exitOK) {
        return {
            status: 'worked_with_tardiness',
            primaryNomipaqCode: 'ASI',
            additionalCodes: ['1RET'],
            hasTardiness: true,
            hasEarlyDeparture: false,
            isFault: false,
            requiresAction: false,
            explanation: 'Día trabajado con retardo injustificado',
        };
    }

    // REGLA: Entrada OK + Salida OK = Día completo
    if (entryOK && exitOK) {
        return {
            status: 'worked_complete',
            primaryNomipaqCode: 'ASI',
            additionalCodes: [],
            hasTardiness: false,
            hasEarlyDeparture: false,
            isFault: false,
            requiresAction: false,
            explanation: 'Día trabajado completo',
        };
    }

    // Caso por defecto: algo está pendiente
    return {
        status: 'pending_justification',
        primaryNomipaqCode: '1FINJ',
        additionalCodes: [],
        hasTardiness: hasUnjustifiedTardiness,
        hasEarlyDeparture: hasUnjustifiedEarlyDeparture,
        isFault: true,
        requiresAction: true,
        explanation: 'Estado del día pendiente de resolver',
    };
}
