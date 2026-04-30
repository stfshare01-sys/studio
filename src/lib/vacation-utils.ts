// =========================================================================
// VACACIONES Y ANTIGÜEDAD (Art. 76 LFT - Reforma 2023)
// =========================================================================

/**
 * Calcula días de vacaciones según antigüedad (Art. 76 LFT - Reforma 2023)
 *
 * Primeros 5 años: 12 días base + 2 por cada año adicional.
 * Años 6+: 22 días base + 2 días por cada 5 años completos adicionales.
 */
export function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;

    if (yearsOfService <= 5) {
        return 12 + ((yearsOfService - 1) * 2);
    }

    const additionalFiveYearBlocks = Math.floor((yearsOfService - 6) / 5);
    return 22 + (additionalFiveYearBlocks * 2);
}

/**
 * Calcula años de antigüedad a partir de fecha de ingreso.
 *
 * @param hireDate - Fecha de ingreso en formato ISO (YYYY-MM-DD)
 * @param asOfDate - Fecha de referencia (por defecto hoy)
 * @returns Años completos de servicio
 */
export function calculateYearsOfService(
    hireDate: string,
    asOfDate: Date = new Date()
): number {
    const hire = new Date(hireDate);
    let years = asOfDate.getFullYear() - hire.getFullYear();

    const monthDiff = asOfDate.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < hire.getDate())) {
        years--;
    }

    return Math.max(0, years);
}

/**
 * Calcula si el empleado tiene la antigüedad requerida para vacaciones.
 * Se requiere mínimo 1 año de servicio.
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

    const oneYearMark = new Date(hire);
    oneYearMark.setFullYear(oneYearMark.getFullYear() + 1);
    const daysUntilEligible = Math.ceil(
        (oneYearMark.getTime() - requestDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    return { eligible: false, daysUntilEligible, yearsOfService: 0 };
}

/**
 * Calcula el saldo de vacaciones disponible.
 *
 * @param daysEntitled - Días a los que tiene derecho según antigüedad
 * @param daysTaken - Días ya tomados
 * @param daysScheduled - Días programados pendientes
 * @returns Días disponibles (mínimo 0)
 */
export function calculateVacationBalance(
    daysEntitled: number,
    daysTaken: number,
    daysScheduled: number
): number {
    return Math.max(0, daysEntitled - daysTaken - daysScheduled);
}

/**
 * Valida si el empleado puede solicitar las vacaciones solicitadas.
 *
 * @returns { valid, error? }
 */
export function validateVacationRequest(
    daysRequested: number,
    daysAvailable: number,
    hireDate: string
): { valid: boolean; error?: string } {
    const eligibility = checkVacationEligibility(hireDate);
    if (!eligibility.eligible) {
        return {
            valid: false,
            error: `No tienes la antigüedad requerida. Faltan ${eligibility.daysUntilEligible} días para cumplir 1 año.`
        };
    }

    if (daysRequested > daysAvailable) {
        return {
            valid: false,
            error: `Solo tienes ${daysAvailable} días disponibles. Solicitaste ${daysRequested} días.`
        };
    }

    if (daysRequested < 0.5) {
        return {
            valid: false,
            error: 'El mínimo a solicitar es medio día.'
        };
    }

    return { valid: true };
}

/**
 * Convierte medio día a día completo para fines de registro.
 * Si es 0.5, cuenta como 1 en el sistema.
 */
export function normalizeVacationDays(requestedDays: number): number {
    if (requestedDays === 0.5) {
        return 1;
    }
    return Math.ceil(requestedDays);
}

/**
 * Calcula la fecha del próximo aniversario (reset de vacaciones).
 *
 * @param hireDate - Fecha de ingreso
 * @param asOfDate - Fecha de referencia
 * @returns Fecha del próximo aniversario
 */
export function getNextAnniversaryDate(hireDate: string, asOfDate: Date = new Date()): Date {
    const hire = new Date(hireDate);
    const nextAnniversary = new Date(hire);

    nextAnniversary.setFullYear(asOfDate.getFullYear());

    if (nextAnniversary <= asOfDate) {
        nextAnniversary.setFullYear(asOfDate.getFullYear() + 1);
    }

    return nextAnniversary;
}

/**
 * Verifica si hoy es el aniversario del empleado (reset de vacaciones).
 */
export function isAnniversaryDate(hireDate: string, currentDate: Date = new Date()): boolean {
    const hire = new Date(hireDate);
    return (
        hire.getMonth() === currentDate.getMonth() &&
        hire.getDate() === currentDate.getDate()
    );
}
