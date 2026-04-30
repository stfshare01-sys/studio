/**
 * @deprecated Este archivo es un barrel de compatibilidad.
 *
 * Las funciones fueron separadas en módulos por dominio:
 *   - workday-utils.ts    → Validación de jornadas, horas, tiempo
 *   - vacation-utils.ts   → Vacaciones, antigüedad, aniversarios
 *   - incidence-utils.ts  → Incidencias, retardos, conflictos de fechas
 *   - payroll-format-utils.ts → Formato NomiPAQ, moneda
 *   - day-status-utils.ts → Determinación de estado del día para nómina
 *
 * Actualiza tus imports al módulo específico y elimina este archivo.
 */

// workday-utils
export {
    getMaxHoursForShift,
    validateWorkday,
    validateDailyOvertime,
    parseTimeToDecimal,
    calculateHoursWorked,
    formatHours,
    isSunday,
    getDayShortName,
    isTerminatedBeforePeriod,
} from './workday-utils';
export type { WorkdayValidation } from './workday-utils';

// vacation-utils
export {
    calculateVacationDays,
    calculateYearsOfService,
    checkVacationEligibility,
    calculateVacationBalance,
    validateVacationRequest,
    normalizeVacationDays,
    getNextAnniversaryDate,
    isAnniversaryDate,
} from './vacation-utils';

// incidence-utils
export {
    isIncidencePaid,
    getDefaultIncidenceDays,
    calculateTardiness,
    shouldApplyTardinessSanction,
    evaluateEarlyDepartureSeverity,
    datesOverlap,
    checkDateConflict,
    validateIncidenceRequest,
} from './incidence-utils';
export type { TardinessResult, DateConflictResult } from './incidence-utils';

// payroll-format-utils
export {
    normalizeTextForPayroll,
    formatNameForPayroll,
    generateCellDisplay,
    formatCurrency,
} from './payroll-format-utils';

// day-status-utils
export {
    determineDayStatus,
} from './day-status-utils';
export type {
    PunchStatus,
    FinalDayStatus,
    DayPunchData,
    DayStatusResult,
} from './day-status-utils';
