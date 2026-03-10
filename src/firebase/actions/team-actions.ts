/**
 * team-actions.ts — BARREL DE RE-EXPORTS
 *
 * Este archivo fue segmentado el 2026-03-09 en 6 módulos cohesivos.
 * Se mantiene como punto de entrada único para garantizar retrocompatibilidad
 * con todos los importadores existentes del proyecto.
 *
 * Módulos:
 *  - team-queries.ts               → getDirectReports, getHierarchicalReports, hasDirectReports
 *  - team-attendance-queries.ts    → getAttendanceImportBatches, getTeamTardiness, getTeamMissingPunches
 *  - team-early-departure-actions.ts → recordEarlyDeparture, justifyEarlyDeparture, markEarlyDepartureUnjustified, getTeamEarlyDepartures
 *  - team-overtime-actions.ts      → getTeamOvertimeRequests, approveOvertimeRequest, rejectOvertimeRequest
 *  - team-shift-actions.ts         → assignShift, cancelShiftAssignment, changeEmployeeSchedule, getAvailableShifts, etc.
 *  - team-stats-actions.ts         → getTeamMonthlyStats, getTeamDailyStats
 */

export * from './team-queries';
export * from './team-attendance-queries';
export * from './team-early-departure-actions';
export * from './team-overtime-actions';
export * from './team-shift-actions';
export * from './team-stats-actions';
