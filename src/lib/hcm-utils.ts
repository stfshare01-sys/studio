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

// =========================================================================
// SISTEMA DE VACACIONES - REFORMA 2023
// =========================================================================

/**
 * Calcula si el empleado tiene la antigüedad requerida para vacaciones
 * Debe tener al menos 1 año completo de servicio
 *
 * @param hireDate - Fecha de ingreso (ISO 8601)
 * @param requestDate - Fecha de solicitud (default: hoy)
 * @returns { eligible: boolean, daysUntilEligible?: number }
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
 *
 * @param daysEntitled - Días que corresponden según antigüedad
 * @param daysTaken - Días ya tomados
 * @param daysScheduled - Días programados (aprobados pero no tomados)
 * @returns Días disponibles
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
 *
 * @param daysRequested - Días solicitados
 * @param daysAvailable - Días disponibles
 * @param hireDate - Fecha de ingreso
 * @returns { valid: boolean, error?: string }
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
 * (Medios días se toman pero el sistema los cuenta como completos)
 *
 * @param requestedDays - Días solicitados
 * @returns Días a descontar (0.5 cuenta como 1)
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
 *
 * @param hireDate - Fecha de ingreso
 * @param asOfDate - Fecha de referencia
 * @returns Fecha del próximo aniversario
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
 *
 * @param hireDate - Fecha de ingreso
 * @param currentDate - Fecha actual
 * @returns true si hoy es el aniversario
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
 *
 * @param scheduledTime - Hora programada (HH:mm)
 * @param actualTime - Hora real (HH:mm)
 * @param toleranceMinutes - Minutos de tolerancia (default: 10)
 * @returns TardinessResult
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
 *
 * @param tardinessCountInPeriod - Retardos en período de 30 días
 * @param tardinessCountInWeek - Retardos en la semana
 * @param maxPerMonth - Máximo permitido por mes (default: 3)
 * @param maxPerWeek - Máximo permitido por semana (default: 2)
 * @returns { applySanction: boolean, reason?: string }
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
