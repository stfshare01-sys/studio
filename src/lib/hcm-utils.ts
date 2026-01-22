/**
 * HCM Utilities - Cálculos de Nómina según Ley Federal del Trabajo (LFT)
 * 
 * Este módulo contiene funciones para:
 * - Cálculo de Factor de Integración (SDI)
 * - Cálculo de horas extra según "Ley de los 9s"
 * - Validación de jornadas laborales
 * - Cálculo de días de vacaciones por antigüedad
 * - Cálculo de liquidaciones y finiquitos
 */

import type { ShiftType, IncidenceType } from './types';

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
 * 
 * @example
 * // Primer año de trabajo (12 días vacaciones)
 * calculateSDIFactor(12, 0.25, 15) // Returns: 1.0493
 */
export function calculateSDIFactor(
    vacationDays: number,
    vacationPremium: number = 0.25,
    aguinaldoDays: number = 15
): number {
    const factor = 1 +
        ((vacationPremium * vacationDays) / 365) +
        (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000; // 4 decimales para precisión fiscal
}

/**
 * Calcula el Salario Diario Integrado (SDI)
 * 
 * @param salaryDaily - Salario diario base
 * @param sdiFactor - Factor de integración calculado
 * @returns SDI redondeado a 2 decimales
 */
export function calculateSDI(salaryDaily: number, sdiFactor: number): number {
    return Math.round(salaryDaily * sdiFactor * 100) / 100;
}

// =========================================================================
// HORAS EXTRA - "LEY DE LOS 9S"
// =========================================================================

/**
 * Estructura de resultado para cálculo de horas extra
 */
export type OvertimeResult = {
    doubleHours: number;      // Horas al 100% de recargo (dobles)
    tripleHours: number;      // Horas al 200% de recargo (triples)
    doubleAmount: number;     // Monto por horas dobles
    tripleAmount: number;     // Monto por horas triples
    totalAmount: number;      // Monto total de horas extra
};

/**
 * Calcula horas extra según "Ley de los 9s" (Art. 66, 67, 68 LFT)
 * 
 * Reglas:
 * - Primeras 9 horas semanales: 100% de recargo (se pagan dobles)
 * - Máximo 3 horas diarias, 3 veces por semana
 * - Excedente de 9 horas semanales: 200% de recargo (se pagan triples)
 * 
 * @param weeklyOvertimeHours - Total de horas extra en la semana
 * @param hourlyRate - Tarifa por hora (salario diario / 8)
 * @returns Objeto con desglose de horas y montos
 * 
 * @example
 * // 12 horas extra semanales con tarifa de $50/hora
 * calculateOvertime(12, 50)
 * // Returns: { doubleHours: 9, tripleHours: 3, doubleAmount: 900, tripleAmount: 450, totalAmount: 1350 }
 */
export function calculateOvertime(
    weeklyOvertimeHours: number,
    hourlyRate: number
): OvertimeResult {
    const doubleHours = Math.min(weeklyOvertimeHours, 9);
    const tripleHours = Math.max(weeklyOvertimeHours - 9, 0);

    // Horas dobles: se paga hora normal + 100% = 2x
    const doubleAmount = Math.round(doubleHours * hourlyRate * 2 * 100) / 100;

    // Horas triples: se paga hora normal + 200% = 3x
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
 * Calcula la tarifa por hora a partir del salario diario
 * Jornada normal: 8 horas diurna, 7 nocturna, 7.5 mixta
 * 
 * @param salaryDaily - Salario diario
 * @param shiftType - Tipo de jornada
 * @returns Tarifa por hora
 */
export function calculateHourlyRate(
    salaryDaily: number,
    shiftType: ShiftType
): number {
    const maxHours = getMaxHoursForShift(shiftType);
    return Math.round((salaryDaily / maxHours) * 100) / 100;
}

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
 * 
 * @example
 * validateWorkday(9.5, 'diurnal')
 * // Returns: { isValid: false, maxHours: 8, regularHours: 8, overtimeHours: 1.5, message: "Excede jornada diurna..." }
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
 * 
 * @param dailyOvertimeHours - Horas extra trabajadas en el día
 * @returns Si cumple con el límite
 */
export function validateDailyOvertime(dailyOvertimeHours: number): boolean {
    return dailyOvertimeHours <= 3;
}

// =========================================================================
// VACACIONES Y ANTIGÜEDAD
// =========================================================================

/**
 * Calcula días de vacaciones según antigüedad (Art. 76 LFT - Reforma 2023)
 * 
 * Nueva tabla de vacaciones según reforma:
 * - 1 año: 12 días
 * - 2 años: 14 días
 * - 3 años: 16 días
 * - 4 años: 18 días
 * - 5 años: 20 días
 * - 6-10 años: +2 días cada año
 * - 11+ años: +2 días cada 5 años
 * 
 * @param yearsOfService - Años de servicio completos
 * @returns Días de vacaciones correspondientes
 * 
 * @example
 * calculateVacationDays(1)  // Returns: 12
 * calculateVacationDays(5)  // Returns: 20
 * calculateVacationDays(10) // Returns: 30
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
 * 
 * @param hireDate - Fecha de ingreso (ISO 8601)
 * @param asOfDate - Fecha de referencia (default: hoy)
 * @returns Años completos de antigüedad
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

/**
 * Calcula días proporcionales de vacaciones para un período parcial
 * 
 * @param vacationDays - Días de vacaciones que corresponden al año completo
 * @param daysWorked - Días trabajados en el período
 * @returns Días proporcionales de vacaciones
 */
export function calculateProportionalVacation(
    vacationDays: number,
    daysWorked: number
): number {
    return Math.round((vacationDays / 365) * daysWorked * 100) / 100;
}

// =========================================================================
// PRIMA DOMINICAL
// =========================================================================

/**
 * Calcula prima dominical (Art. 71 LFT)
 * 25% adicional sobre el salario diario
 * 
 * @param salaryDaily - Salario diario
 * @param sundaysWorked - Cantidad de domingos trabajados
 * @returns Monto de prima dominical
 */
export function calculateSundayPremium(
    salaryDaily: number,
    sundaysWorked: number
): number {
    const premiumRate = 0.25; // 25%
    return Math.round(salaryDaily * premiumRate * sundaysWorked * 100) / 100;
}

// =========================================================================
// LIQUIDACIÓN Y FINIQUITO
// =========================================================================

/**
 * Tipo de terminación laboral
 */
export type TerminationType =
    | 'resignation'              // Renuncia voluntaria
    | 'dismissal_justified'      // Despido justificado (Art. 47 LFT)
    | 'dismissal_unjustified'    // Despido injustificado
    | 'mutual_agreement';        // Mutuo consentimiento

/**
 * Resultado del cálculo de finiquito/liquidación
 */
export type SettlementResult = {
    // Conceptos de finiquito (siempre aplican)
    salaryPending: number;              // Salario pendiente
    proportionalVacation: number;       // Vacaciones proporcionales
    proportionalVacationPremium: number; // Prima vacacional proporcional
    proportionalAguinaldo: number;      // Aguinaldo proporcional

    // Conceptos de liquidación (según tipo de terminación)
    severancePay: number;               // 3 meses de indemnización constitucional
    seniorityPremium: number;           // Prima de antigüedad (12 días/año)
    twentyDaysPerYear: number;          // 20 días por año trabajado

    // Totales
    finiquitoTotal: number;             // Total finiquito
    liquidacionTotal: number;           // Total liquidación
    grandTotal: number;                 // Total general
};

/**
 * Calcula finiquito y liquidación según tipo de terminación
 * 
 * Finiquito (siempre aplica):
 * - Salario pendiente
 * - Vacaciones proporcionales + prima vacacional
 * - Aguinaldo proporcional
 * 
 * Liquidación (según caso):
 * - Despido injustificado: 3 meses + 20 días/año + prima antigüedad
 * - Despido justificado: Solo prima de antigüedad (si aplica)
 * - Renuncia: Solo finiquito + prima antigüedad (si > 15 años)
 * 
 * @param salaryDaily - Salario diario
 * @param sdi - Salario Diario Integrado
 * @param yearsOfService - Años de antigüedad
 * @param daysWorkedInYear - Días trabajados en el año actual
 * @param pendingSalaryDays - Días de salario pendiente
 * @param terminationType - Tipo de terminación
 * @param vacationDaysUsed - Días de vacaciones ya tomados en el año
 * @returns Desglose completo del finiquito/liquidación
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
    // ========== FINIQUITO (siempre aplica) ==========

    // Salario pendiente
    const salaryPending = Math.round(salaryDaily * pendingSalaryDays * 100) / 100;

    // Vacaciones proporcionales
    const vacationDaysEntitled = calculateVacationDays(yearsOfService);
    const proportionalVacationDays = calculateProportionalVacation(vacationDaysEntitled, daysWorkedInYear);
    const vacationDaysOwed = Math.max(0, proportionalVacationDays - vacationDaysUsed);
    const proportionalVacation = Math.round(salaryDaily * vacationDaysOwed * 100) / 100;

    // Prima vacacional (25% mínimo)
    const proportionalVacationPremium = Math.round(proportionalVacation * 0.25 * 100) / 100;

    // Aguinaldo proporcional (15 días mínimo / 365 * días trabajados)
    const proportionalAguinaldo = Math.round((salaryDaily * 15 / 365) * daysWorkedInYear * 100) / 100;

    const finiquitoTotal = salaryPending + proportionalVacation + proportionalVacationPremium + proportionalAguinaldo;

    // ========== LIQUIDACIÓN (según tipo) ==========

    let severancePay = 0;        // 3 meses (Art. 48 LFT)
    let seniorityPremium = 0;    // Prima antigüedad (Art. 162 LFT)
    let twentyDaysPerYear = 0;   // 20 días por año (Art. 50 LFT)

    switch (terminationType) {
        case 'dismissal_unjustified':
            // Indemnización constitucional: 3 meses de salario
            severancePay = Math.round(sdi * 90 * 100) / 100;

            // 20 días por año trabajado
            twentyDaysPerYear = Math.round(sdi * 20 * yearsOfService * 100) / 100;

            // Prima de antigüedad: 12 días por año (tope: 2 UMAS)
            seniorityPremium = calculateSeniorityPremium(salaryDaily, yearsOfService);
            break;

        case 'dismissal_justified':
            // Solo finiquito, sin indemnización
            // Prima de antigüedad solo si tiene más de 15 años
            if (yearsOfService >= 15) {
                seniorityPremium = calculateSeniorityPremium(salaryDaily, yearsOfService);
            }
            break;

        case 'resignation':
            // Solo finiquito
            // Prima de antigüedad solo si tiene más de 15 años
            if (yearsOfService >= 15) {
                seniorityPremium = calculateSeniorityPremium(salaryDaily, yearsOfService);
            }
            break;

        case 'mutual_agreement':
            // Generalmente se negocia, pero como mínimo:
            // Prima de antigüedad si > 15 años
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
 * Calcula prima de antigüedad (Art. 162 LFT)
 * 12 días de salario por año de servicio
 * Tope: El salario para cálculo no puede exceder 2 veces el salario mínimo
 * 
 * @param salaryDaily - Salario diario
 * @param yearsOfService - Años de servicio
 * @param minimumWage - Salario mínimo vigente (default: $248.93 para 2024)
 * @returns Monto de prima de antigüedad
 */
export function calculateSeniorityPremium(
    salaryDaily: number,
    yearsOfService: number,
    minimumWage: number = 248.93
): number {
    // Tope: 2 veces el salario mínimo
    const cappedSalary = Math.min(salaryDaily, minimumWage * 2);
    return Math.round(cappedSalary * 12 * yearsOfService * 100) / 100;
}

// =========================================================================
// INCIDENCIAS - HELPERS
// =========================================================================

/**
 * Determina si una incidencia es con goce de sueldo según tipo y política
 * 
 * @param type - Tipo de incidencia
 * @returns Si generalmente es con goce de sueldo
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
 * 
 * @param type - Tipo de incidencia
 * @returns Días típicos de la incidencia
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
 * Formatea un monto a pesos mexicanos
 * 
 * @param amount - Monto numérico
 * @returns String formateado como moneda
 */
export function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('es-MX', {
        style: 'currency',
        currency: 'MXN'
    }).format(amount);
}

/**
 * Formatea horas a formato HH:mm
 * 
 * @param decimalHours - Horas en formato decimal (ej: 8.5)
 * @returns String formateado (ej: "8:30")
 */
export function formatHours(decimalHours: number): string {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

/**
 * Parsea hora en formato HH:mm a decimal
 * 
 * @param timeString - Hora en formato HH:mm o HH:mm:ss
 * @returns Horas en formato decimal
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
 * 
 * @param checkIn - Hora de entrada (HH:mm:ss)
 * @param checkOut - Hora de salida (HH:mm:ss)
 * @returns Horas trabajadas en decimal
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
