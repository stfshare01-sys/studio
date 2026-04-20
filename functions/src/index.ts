/**
 * Cloud Functions Entry Point
 * 
 * This module exports all callable functions, triggers, and scheduled functions.
 * Functions are organized by domain:
 * - HCM (Human Capital Management) operations
 * - Workflow automation
 * - Scheduled maintenance tasks
 */

// HCM callable functions
export {
    consolidatePrenomina,
    processEmployeeImport,
    approveIncidence,
    notifyNewIncidence,
    createSystemUser
} from './callable/hcm-operations';

// Payroll report generation
export { generatePayrollReports } from './callable/payroll-reports';

// Utility exports for internal use
export { verifyRole, getUserRole } from './utils/auth-middleware';

// HCM Triggers
export { onIncidenceUpdate, onAttendanceCreated } from './triggers/hcm-triggers';

// Workflow Triggers
export { onTaskComplete } from './triggers/workflow-triggers';

// Scheduled Functions - Vacation Renewal
export { renewVacationBalancesDaily, triggerVacationRenewal } from './scheduled/vacation-renewal';

// Notification Triggers
export { onNotificationCreated } from './triggers/notifications';
