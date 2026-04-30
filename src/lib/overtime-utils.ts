/**
 * Overtime Utils — Cálculos de horas extra con regla 3x3 y bolsa de horas
 *
 * Extraído de hcm-utils.ts para cumplir SRP. Contiene únicamente lógica
 * de horas extra: redondeo, breakdown doble/triple y cruce con bolsa de tiempo.
 * Sin dependencias externas ni side effects.
 */

// =========================================================================
// HORAS EXTRAS - REGLA 3x3 CON REDONDEO
// =========================================================================

/**
 * Política de redondeo de minutos extra según reglas de nómina
 *
 * REGLAS DE REDONDEO:
 * - 0-29 minutos: se redondea a 0 (se descarta)
 * - 30-44 minutos: se redondea a 0.5 (media hora)
 * - 45-60 minutos: se redondea a 1 (hora completa)
 */
export function roundOvertimeHours(decimalHours: number): number {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    let roundedMinutes: number;
    if (minutes < 30) {
        roundedMinutes = 0;
    } else if (minutes < 45) {
        roundedMinutes = 30;
    } else {
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
        carryoverMinutes: number;
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
 */
export function calculateOvertimeWithRounding(
    dailyOvertimeHours: { date: string; hours: number }[],
    hourlyRate: number,
    overtimeMode: 'daily_limit' | 'weekly_only' = 'daily_limit'
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

        const maxDailyDouble = overtimeMode === 'weekly_only' ? Infinity : 3;
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
    paidOvertimeMinutes: number;
    paidOvertimeHours: number;
    previousBalance: number;
    minutesUsedToPayDebt: number;
    newBalance: number;
    discardedMinutes: number;
    processingSteps: string[];
};

/**
 * Procesa minutos extra considerando la bolsa de horas primero
 *
 * ORDEN DE OPERACIONES:
 * 1. Si el empleado debe horas (balance negativo): restar minutos extra de su deuda
 * 2. Si el puesto NO hace horas extras: solo saldar deuda, excedente se descarta
 * 3. Aplicar redondeo sobre el remanente: 0-29 min → 0, 30-44 → 0.5h, 45-60 → 1h
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

    if (!positionCanEarnOvertime) {
        steps.push('Puesto NO genera horas extras');

        if (newBalance < 0 && remainingMinutes > 0) {
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
                newBalance: Math.min(newBalance, 0),
                discardedMinutes: discarded,
                processingSteps: steps,
            };
        }

        steps.push(`Minutos descartados (sin deuda, puesto no genera HE): ${remainingMinutes}`);
        return {
            paidOvertimeMinutes: 0,
            paidOvertimeHours: 0,
            previousBalance: timeBankBalance,
            minutesUsedToPayDebt,
            newBalance: 0,
            discardedMinutes: remainingMinutes,
            processingSteps: steps,
        };
    }

    steps.push('Puesto SÍ genera horas extras');
    steps.push(`Aplicando redondeo a ${remainingMinutes} minutos`);

    let paidMinutes = 0;
    let discardedMinutes = 0;

    if (remainingMinutes < 30) {
        discardedMinutes = remainingMinutes;
        paidMinutes = 0;
        steps.push(`Redondeo: ${remainingMinutes} min < 30 → 0 (descartados)`);
    } else if (remainingMinutes < 45) {
        paidMinutes = 30;
        discardedMinutes = remainingMinutes - 30;
        steps.push(`Redondeo: ${remainingMinutes} min → 30 min (0.5h)`);
    } else if (remainingMinutes < 60) {
        paidMinutes = 60;
        discardedMinutes = Math.max(0, remainingMinutes - 60);
        steps.push(`Redondeo: ${remainingMinutes} min → 60 min (1h)`);
    } else {
        const fullHours = Math.floor(remainingMinutes / 60);
        const fractionalMinutes = remainingMinutes % 60;

        paidMinutes = fullHours * 60;

        if (fractionalMinutes >= 45) {
            paidMinutes += 60;
            discardedMinutes = Math.max(0, fractionalMinutes - 60);
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
 * Registra tiempo en la bolsa de horas
 * @param minutesToAdd - positivo = favor, negativo = deuda
 */
export function updateTimeBankBalance(
    currentBalance: number,
    minutesToAdd: number
): number {
    return currentBalance + minutesToAdd;
}
