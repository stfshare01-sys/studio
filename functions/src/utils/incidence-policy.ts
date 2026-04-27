
import { differenceInCalendarDays, parseISO, getYear } from 'date-fns';

// Minimal types for server side to avoid importing from src/lib
export type IncidenceType = 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'marriage' | 'adoption' | 'unpaid_leave' | 'civic_duty' | 'half_day_family' | 'unjustified_absence' | 'abandono_empleo' | 'home_office';

export interface Incidence {
    id: string;
    type: IncidenceType;
    startDate: string;
    endDate: string;
    status: string;
    [key: string]: any;
}

export interface IncidenceRule {
    minDays?: number;
    maxDays?: number;
    maxPerYear?: number;
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
        maxDays: 8,
        description: 'Permiso por luto (Máx 8 días)'
    },
    unpaid_leave: {
        minDays: 1,
        maxDays: 30,
        description: 'Permiso sin goce de sueldo'
    },
    half_day_family: {
        maxDays: 1,
        maxPerYear: 1,
        description: 'Permiso de medio día (1 vez al año)'
    },
    civic_duty: {
        minDays: 1,
        description: 'Cumplimiento de deberes cívicos/jurídicos'
    },
    home_office: {
        description: 'Home Office / Trabajo remoto (Requiere Check in / Check out)'
    }
};

export interface ValidationResult {
    isValid: boolean;
    error?: string;
}

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

    if (rule.maxPerYear) {
        const startYear = getYear(parseISO(startDateStr));

        const count = pastIncidences.filter(inc =>
            inc.type === type &&
            inc.status !== 'rejected' &&
            inc.status !== 'cancelled' &&
            inc.id !== currentIncidenceId &&
            getYear(parseISO(inc.startDate)) === startYear
        ).length;

        if (count >= rule.maxPerYear) {
            return {
                isValid: false,
                error: `Este permiso (${type}) solo se permite ${rule.maxPerYear} vez/veces por año y ya se ha utilizado.`
            };
        }
    }

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
