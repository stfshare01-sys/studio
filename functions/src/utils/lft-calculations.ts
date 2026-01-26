/**
 * LFT Utilities - Cálculos de Nómina según Ley Federal del Trabajo
 * 
 * ⚠️ CONFIDENTIAL: These formulas are protected server-side business logic.
 * DO NOT expose these functions to client code.
 * 
 * Este módulo contiene funciones para:
 * - Cálculo de Factor de Integración (SDI)
 * - Cálculo de horas extra según "Ley de los 9s"
 * - Validación de jornadas laborales
 * - Cálculo de días de vacaciones por antigüedad
 * - Cálculo de liquidaciones y finiquitos
 */

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

export type ShiftType = 'diurnal' | 'nocturnal' | 'mixed';

export type IncidenceType =
    | 'vacation'
    | 'sick_leave'
    | 'personal_leave'
    | 'maternity'
    | 'paternity'
    | 'bereavement'
    | 'unjustified_absence';

export type TerminationType =
    | 'resignation'              // Renuncia voluntaria
    | 'dismissal_justified'      // Despido justificado (Art. 47 LFT)
    | 'dismissal_unjustified'    // Despido injustificado
    | 'mutual_agreement';        // Mutuo consentimiento

// =========================================================================
// SALARIO DIARIO INTEGRADO (SDI)
// =========================================================================

/**
 * Calcula el Factor de Integración del SDI según LFT
 * 
 * Fórmula: 1 + (Prima Vacacional * Días Vacaciones / 365) + (Aguinaldo / 365)
 * 
 * @param vacationDays - Días de vacaciones según antigüedad (Art. 76 LFT)
 * @param vacationPremium - Prima vacacional (mínimo 25% según Art. 80 LFT)
 * @param aguinaldoDays - Días de aguinaldo (mínimo 15 según Art. 87 LFT)
 * @returns Factor de integración con 4 decimales
 */
export function calculateSDIFactor(
    vacationDays: number,
    vacationPremium: number = 0.25,
    aguinaldoDays: number = 15
): number {
    const factor = 1 +
        ((vacationPremium * vacationDays) / 365) +
        (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000;
}

/**
 * Calcula el Salario Diario Integrado (SDI)
 */
export function calculateSDI(salaryDaily: number, sdiFactor: number): number {
    return Math.round(salaryDaily * sdiFactor * 100) / 100;
}

// =========================================================================
// HORAS EXTRA - "LEY DE LOS 9S"
// =========================================================================

export type OvertimeResult = {
    doubleHours: number;
    tripleHours: number;
    doubleAmount: number;
    tripleAmount: number;
    totalAmount: number;
};

/**
 * Calcula horas extra según "Ley de los 9s" (Art. 66, 67, 68 LFT)
 * 
 * - Primeras 9 horas semanales: 100% de recargo (dobles)
 * - Excedente: 200% de recargo (triples)
 */
export function calculateOvertime(
    weeklyOvertimeHours: number,
    hourlyRate: number
): OvertimeResult {
    const doubleHours = Math.min(weeklyOvertimeHours, 9);
    const tripleHours = Math.max(weeklyOvertimeHours - 9, 0);

    const doubleAmount = Math.round(doubleHours * hourlyRate * 2 * 100) / 100;
    const tripleAmount = Math.round(tripleHours * hourlyRate * 3 * 100) / 100;

    return {
        doubleHours,
        tripleHours,
        doubleAmount,
        tripleAmount,
        totalAmount: doubleAmount + tripleAmount
    };
}

/**
 * Calcula tarifa por hora según tipo de jornada
 */
export function calculateHourlyRate(salaryDaily: number, shiftType: ShiftType): number {
    const maxHours = getMaxHoursForShift(shiftType);
    return Math.round((salaryDaily / maxHours) * 100) / 100;
}

// =========================================================================
// VALIDACIÓN DE JORNADAS LABORALES
// =========================================================================

export type WorkdayValidation = {
    isValid: boolean;
    maxHours: number;
    regularHours: number;
    overtimeHours: number;
    message?: string;
};

export function getMaxHoursForShift(shiftType: ShiftType): number {
    const maxHoursMap: Record<ShiftType, number> = {
        diurnal: 8,
        nocturnal: 7,
        mixed: 7.5
    };
    return maxHoursMap[shiftType];
}

export function validateWorkday(hoursWorked: number, shiftType: ShiftType): WorkdayValidation {
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

// =========================================================================
// VACACIONES Y ANTIGÜEDAD
// =========================================================================

/**
 * Calcula días de vacaciones según antigüedad (Art. 76 LFT - Reforma 2023)
 */
export function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;
    if (yearsOfService <= 5) return 12 + ((yearsOfService - 1) * 2);
    if (yearsOfService <= 10) return 20 + ((yearsOfService - 5) * 2);
    if (yearsOfService <= 15) return 32;
    if (yearsOfService <= 20) return 34;
    if (yearsOfService <= 25) return 36;
    if (yearsOfService <= 30) return 38;
    return 40;
}

export function calculateYearsOfService(hireDate: string, asOfDate: Date = new Date()): number {
    const hire = new Date(hireDate);
    let years = asOfDate.getFullYear() - hire.getFullYear();

    const monthDiff = asOfDate.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < hire.getDate())) {
        years--;
    }

    return Math.max(0, years);
}

export function calculateProportionalVacation(vacationDays: number, daysWorked: number): number {
    return Math.round((vacationDays / 365) * daysWorked * 100) / 100;
}

// =========================================================================
// PRIMA DOMINICAL
// =========================================================================

export function calculateSundayPremium(salaryDaily: number, sundaysWorked: number): number {
    return Math.round(salaryDaily * 0.25 * sundaysWorked * 100) / 100;
}

// =========================================================================
// LIQUIDACIÓN Y FINIQUITO
// =========================================================================

export type SettlementResult = {
    salaryPending: number;
    proportionalVacation: number;
    proportionalVacationPremium: number;
    proportionalAguinaldo: number;
    severancePay: number;
    seniorityPremium: number;
    twentyDaysPerYear: number;
    finiquitoTotal: number;
    liquidacionTotal: number;
    grandTotal: number;
};

/**
 * Calcula finiquito y liquidación según tipo de terminación
 */
export function calculateSettlement(
    salaryDaily: number,
    sdi: number,
    yearsOfService: number,
    daysWorkedInYear: number,
    pendingSalaryDays: number,
    terminationType: TerminationType,
    vacationDaysUsed: number = 0
): SettlementResult {
    // FINIQUITO (siempre aplica)
    const salaryPending = Math.round(salaryDaily * pendingSalaryDays * 100) / 100;

    const vacationDaysEntitled = calculateVacationDays(yearsOfService);
    const proportionalVacationDays = calculateProportionalVacation(vacationDaysEntitled, daysWorkedInYear);
    const vacationDaysOwed = Math.max(0, proportionalVacationDays - vacationDaysUsed);
    const proportionalVacation = Math.round(salaryDaily * vacationDaysOwed * 100) / 100;
    const proportionalVacationPremium = Math.round(proportionalVacation * 0.25 * 100) / 100;
    const proportionalAguinaldo = Math.round((salaryDaily * 15 / 365) * daysWorkedInYear * 100) / 100;

    const finiquitoTotal = salaryPending + proportionalVacation + proportionalVacationPremium + proportionalAguinaldo;

    // LIQUIDACIÓN (según tipo)
    let severancePay = 0;
    let seniorityPremium = 0;
    let twentyDaysPerYear = 0;

    switch (terminationType) {
        case 'dismissal_unjustified':
            severancePay = Math.round(sdi * 90 * 100) / 100;
            twentyDaysPerYear = Math.round(sdi * 20 * yearsOfService * 100) / 100;
            seniorityPremium = calculateSeniorityPremium(salaryDaily, yearsOfService);
            break;

        case 'dismissal_justified':
        case 'resignation':
        case 'mutual_agreement':
            if (yearsOfService >= 15) {
                seniorityPremium = calculateSeniorityPremium(salaryDaily, yearsOfService);
            }
            break;
    }

    const liquidacionTotal = severancePay + seniorityPremium + twentyDaysPerYear;

    return {
        salaryPending,
        proportionalVacation,
        proportionalVacationPremium,
        proportionalAguinaldo,
        severancePay,
        seniorityPremium,
        twentyDaysPerYear,
        finiquitoTotal,
        liquidacionTotal,
        grandTotal: finiquitoTotal + liquidacionTotal
    };
}

/**
 * Prima de antigüedad (Art. 162 LFT)
 * 12 días por año, tope: 2 UMAS
 */
export function calculateSeniorityPremium(
    salaryDaily: number,
    yearsOfService: number,
    minimumWage: number = 248.93
): number {
    const cappedSalary = Math.min(salaryDaily, minimumWage * 2);
    return Math.round(cappedSalary * 12 * yearsOfService * 100) / 100;
}

// =========================================================================
// TIME UTILITIES
// =========================================================================

export function parseTimeToDecimal(timeString: string): number {
    const parts = timeString.split(':');
    const hours = parseInt(parts[0], 10);
    const minutes = parseInt(parts[1], 10);
    const seconds = parts[2] ? parseInt(parts[2], 10) : 0;
    return hours + (minutes / 60) + (seconds / 3600);
}

export function calculateHoursWorked(checkIn: string, checkOut: string): number {
    const inDecimal = parseTimeToDecimal(checkIn);
    let outDecimal = parseTimeToDecimal(checkOut);

    if (outDecimal < inDecimal) {
        outDecimal += 24;
    }

    return Math.round((outDecimal - inDecimal) * 100) / 100;
}
