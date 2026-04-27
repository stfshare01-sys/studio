
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
        maxDays: 3, // Policy rule per User Requirement (Feb 2026)
        description: 'Permiso sin goce de sueldo (Máx 3 días)'
    },
    half_day_family: {
        maxDays: 1, // Effectively 0.5 but stored as 1 day span on frontend usually, handled specially.
        maxPerYear: 1,
        description: 'Permiso de medio día (1 vez al año)'
    },
    civic_duty: {
        minDays: 1,
        description: 'Cumplimiento de deberes cívicos/jurídicos'
    },
    home_office: {
        description: 'Día de trabajo remoto (Home Office)'
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
    pastIncidences: Incidence[],
    currentIncidenceId?: string
): ValidationResult {
    const rule = INCIDENCE_RULES[type];
    if (!rule) {
        return { isValid: true };
    }

    // 1. Duration Check
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

        // Count Approved/Pending past incidences of same type in the same year.
        // Ignore the current incidence being evaluated to avoid false positive limits.
        const count = pastIncidences.filter(inc =>
            inc.type === type &&
            inc.status !== 'rejected' &&
            inc.status !== 'cancelled' &&
            inc.id !== currentIncidenceId &&
            getYear(parseISO(inc.startDate)) === startYear
        ).length;

        // If we are creating/approving the incidence, count must be <= maxPerYear
        // We use >= here because 'count' now purely represents OTHER incidences
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
