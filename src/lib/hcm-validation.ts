
import { Incidence, IncidenceType } from './types';
import { differenceInCalendarDays, parseISO, getYear } from 'date-fns';

export interface IncidenceRule {
    minDays?: number;
    maxDays?: number;
    maxPerYear?: number; // How many times can be requested per year
    requiresJustification?: boolean;
    description: string;
}

export const INCIDENCE_RULES: Partial<Record<IncidenceType, IncidenceRule>> = {
    marriage: {
        minDays: 1,
        maxDays: 5,
        maxPerYear: 1,
        description: 'Permiso por matrimonio (Máx 5 días, 1 vez al año)'
    },
    paternity: {
        minDays: 1,
        maxDays: 15,
        description: 'Licencia de paternidad (Máx 15 días)'
    },
    adoption: {
        minDays: 1,
        maxDays: 15,
        description: 'Licencia por adopción (Máx 15 días)'
    },
    bereavement: {
        minDays: 1,
        maxDays: 8, // LFT says 3-5 usually, prompt says "Maximo Y". Assuming 8 as reasonable or placeholder.
        description: 'Permiso por luto (Máx 8 días)'
    },
    unpaid_leave: {
        minDays: 1,
        maxDays: 30, // Policy dependent
        description: 'Permiso sin goce de sueldo'
    },
    half_day_family: {
        maxDays: 1, // Effectively 0.5 but stored as 1 day span on frontend usually, handled specially.
        maxPerYear: 1,
        description: 'Permiso de medio día (1 vez al año)'
    },
    civic_duty: {
        minDays: 1,
        description: 'Cumplimiento de deberes cívicos/jurídicos'
    }
};

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

/**
 * Validates incidence policy rules including duration and frequency.
 * @param type The type of incidence
 * @param startDateStr Start date ISO string
 * @param endDateStr End date ISO string
 * @param effectiveDays Calculated effective days (optional, used for duration check if available)
 * @param pastIncidences List of employee's past incidences for frequency check
 */
export function validateIncidencePolicy(
    type: IncidenceType,
    startDateStr: string,
    endDateStr: string,
    effectiveDays: number,
    pastIncidences: Incidence[]
): ValidationResult {
    const rule = INCIDENCE_RULES[type];
    if (!rule) {
        return { isValid: true };
    }

    // 1. Duration Check
    // If effectiveDays is passed, use it. Otherwise approximate with calendar days?
    // Policy usually refers to "Paid Days" (Effective) or "Calendar Days"?
    // For "Marriage", it's usually consecutive days (Calendar).
    // For "Vacation", it's Effective.
    // I'll use the passed `effectiveDays` as the primary metric if strictly defined, 
    // but for Marriage/Bereavement usually it implies Calendar days count.
    // However, the prompt says "Validar duracion".
    // I'll assume effectiveDays is the paid amount.

    if (rule.maxDays && effectiveDays > rule.maxDays) {
        return {
            isValid: false,
            error: `La duración excede el máximo permitido para ${type} (${rule.maxDays} días).`
        };
    }

    if (rule.minDays && effectiveDays < rule.minDays) {
        return {
            isValid: false,
            error: `La duración es menor al mínimo requerido para ${type} (${rule.minDays} días).`
        };
    }

    // 2. Frequency Check (Max Per Year)
    if (rule.maxPerYear) {
        const startYear = getYear(parseISO(startDateStr));

        // Count Approved past incidences of same type in the same year
        const count = pastIncidences.filter(inc =>
            inc.type === type &&
            inc.status !== 'rejected' &&
            inc.status !== 'cancelled' &&
            getYear(parseISO(inc.startDate)) === startYear
        ).length;

        // If we are creating a new one, count must be < maxPerYear
        if (count >= rule.maxPerYear) {
            return {
                isValid: false,
                error: `Este permiso (${type}) solo se permite ${rule.maxPerYear} vez/veces por año y ya se ha utilizado.`
            };
        }
    }

    // 3. Half Day Specific
    if (type === 'half_day_family') {
        const d1 = parseISO(startDateStr);
        const d2 = parseISO(endDateStr);
        if (differenceInCalendarDays(d2, d1) !== 0) {
            return {
                isValid: false,
                error: `El permiso de medio día debe ser en una sola fecha.`
            };
        }
    }

    return { isValid: true };
}
