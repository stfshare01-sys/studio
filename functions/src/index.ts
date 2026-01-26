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
    calculateSettlement,
    approveIncidence
} from './callable/hcm-operations';

// Utility exports for internal use
export { verifyRole, getUserRole } from './utils/auth-middleware';
