/**
 * incidence-actions.ts — BARREL DE RE-EXPORTS
 *
 * Este archivo fue segmentado el 2026-03-09 en 6 módulos cohesivos.
 * Se mantiene como punto de entrada único para garantizar retrocompatibilidad
 * con todos los importadores existentes del proyecto.
 *
 * Módulos:
 *  - incidence-core-actions.ts     → createIncidence, updateIncidenceStatus
 *  - attendance-import-actions.ts  → processAttendanceImport
 *  - vacation-balance-actions.ts   → getVacationBalance, updateVacationBalance, etc.
 *  - time-bank-actions.ts          → updateTimeBank
 *  - tardiness-actions.ts          → recordTardiness, justifyTardiness, etc.
 *  - overtime-holiday-actions.ts   → createOvertimeRequest, getHolidayCalendar, etc.
 */

export * from './incidence-core-actions';
export * from './attendance-import-actions';
export * from './vacation-balance-actions';
export * from './time-bank-actions';
export * from './tardiness-actions';
export * from './overtime-holiday-actions';
