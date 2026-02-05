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
    approveIncidence
} from './callable/hcm-operations';

// Utility exports for internal use
// Utility exports for internal use
export { verifyRole, getUserRole } from './utils/auth-middleware';

// HCM Triggers
export { onIncidenceUpdate, onAttendanceCreated } from './triggers/hcm-triggers';

// Workflow Triggers
export { onTaskComplete } from './triggers/workflow-triggers';
