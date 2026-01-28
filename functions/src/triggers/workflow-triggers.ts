import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';

const db = admin.firestore();

/**
 * Side Effects Registry
 * Mirrors the catalog-definitions.ts from the client side
 */
type ServiceSideEffect =
    | 'update_vacation_balance'
    | 'create_employee_record'
    | 'register_attendance_correction'
    | 'trigger_payroll_incident'
    | 'none';

interface CatalogEntry {
    moduleTag: string;
    sideEffects: ServiceSideEffect[];
}

// Simplified catalog for Cloud Functions (subset of client catalog)
const CATALOG_SIDE_EFFECTS: Record<string, CatalogEntry> = {
    'tpl_vacation_v1': { moduleTag: 'HCM', sideEffects: ['update_vacation_balance', 'trigger_payroll_incident'] },
    'tpl_sick_leave_v1': { moduleTag: 'HCM', sideEffects: ['trigger_payroll_incident'] },
    'tpl_overtime_v1': { moduleTag: 'HCM', sideEffects: ['trigger_payroll_incident'] },
    'tpl_data_update_v1': { moduleTag: 'HCM', sideEffects: ['none'] },
    'tpl_it_access_v1': { moduleTag: 'IT', sideEffects: ['none'] },
    'tpl_hardware_v1': { moduleTag: 'IT', sideEffects: ['none'] },
};

/**
 * Task Interface
 */
interface Task {
    id: string;
    requestId: string;
    requestOwnerId: string;
    templateId?: string;
    status: 'Pending' | 'Active' | 'Completed';
    name: string;
    completedAt?: string;
    formData?: Record<string, unknown>;
}

/**
 * Trigger: On Task Complete
 * 
 * When a task status changes to 'Completed':
 * 1. Look up the associated template from the request
 * 2. Find side-effects from the catalog
 * 3. Execute appropriate actions (update employee records, balances, etc.)
 * 4. Log the action to audit_logs
 */
export const onTaskComplete = onDocumentUpdated('tasks/{taskId}', async (event) => {
    const before = event.data?.before.data() as Task | undefined;
    const after = event.data?.after.data() as Task | undefined;

    if (!before || !after) return;

    // Only trigger on status change to Completed
    if (before.status !== 'Completed' && after.status === 'Completed') {
        console.log(`[onTaskComplete] Task ${event.params.taskId} completed`);

        try {
            // Get the associated request to find templateId
            const requestRef = db.doc(`users/${after.requestOwnerId}/requests/${after.requestId}`);
            const requestSnap = await requestRef.get();

            if (!requestSnap.exists) {
                console.warn(`[onTaskComplete] Request ${after.requestId} not found`);
                return;
            }

            const request = requestSnap.data();
            const templateId = request?.templateId as string | undefined;

            if (!templateId) {
                console.log('[onTaskComplete] No templateId found on request');
                return;
            }

            // Look up side effects from catalog
            const catalogEntry = CATALOG_SIDE_EFFECTS[templateId];
            if (!catalogEntry) {
                console.log(`[onTaskComplete] No catalog entry for template: ${templateId}`);
                return;
            }

            console.log(`[onTaskComplete] Processing side-effects for ${templateId}:`, catalogEntry.sideEffects);

            // Execute each side effect
            for (const effect of catalogEntry.sideEffects) {
                await executeSideEffect(effect, {
                    taskId: event.params.taskId,
                    requestId: after.requestId,
                    requestOwnerId: after.requestOwnerId,
                    formData: after.formData || request?.formData || {},
                    moduleTag: catalogEntry.moduleTag,
                });
            }

            // Log to audit
            await logAuditEntry({
                action: 'TASK_SIDE_EFFECTS_EXECUTED',
                taskId: event.params.taskId,
                requestId: after.requestId,
                templateId,
                sideEffects: catalogEntry.sideEffects,
                moduleTag: catalogEntry.moduleTag,
                timestamp: new Date().toISOString(),
            });

        } catch (error) {
            console.error('[onTaskComplete] Error processing side-effects:', error);
        }
    }
});

/**
 * Execute a single side-effect
 */
async function executeSideEffect(
    effect: ServiceSideEffect,
    context: {
        taskId: string;
        requestId: string;
        requestOwnerId: string;
        formData: Record<string, unknown>;
        moduleTag: string;
    }
) {
    switch (effect) {
        case 'update_vacation_balance':
            await updateVacationBalance(context);
            break;

        case 'trigger_payroll_incident':
            await createPayrollIncident(context);
            break;

        case 'register_attendance_correction':
            await registerAttendanceCorrection(context);
            break;

        case 'create_employee_record':
            await createEmployeeRecord(context);
            break;

        case 'none':
        default:
            // No action needed
            break;
    }
}

/**
 * Update vacation balance when a vacation request is approved
 */
async function updateVacationBalance(context: { requestOwnerId: string; formData: Record<string, unknown> }) {
    const employeeId = context.requestOwnerId;
    const days = (context.formData.totalDays as number) || (context.formData.days as number) || 0;

    if (days <= 0) {
        console.log('[updateVacationBalance] No days found in formData');
        return;
    }

    console.log(`[updateVacationBalance] Deducting ${days} days from employee ${employeeId}`);

    // Find active vacation balance
    const balanceQuery = db.collection('vacation_balances')
        .where('employeeId', '==', employeeId)
        .orderBy('periodEnd', 'desc')
        .limit(1);

    const balanceSnap = await balanceQuery.get();

    if (balanceSnap.empty) {
        console.warn(`[updateVacationBalance] No vacation balance for employee ${employeeId}`);
        return;
    }

    const balanceDoc = balanceSnap.docs[0];
    const currentTaken = balanceDoc.data().daysTaken || 0;
    const currentAvailable = balanceDoc.data().daysAvailable || 0;

    await balanceDoc.ref.update({
        daysTaken: currentTaken + days,
        daysAvailable: currentAvailable - days,
        lastUpdated: new Date().toISOString()
    });

    console.log(`[updateVacationBalance] Updated. New available: ${currentAvailable - days}`);
}

/**
 * Create a payroll incident record for Prenomina processing
 */
async function createPayrollIncident(context: { taskId: string; requestId: string; requestOwnerId: string; formData: Record<string, unknown> }) {
    const incidentRef = db.collection('payroll_incidents').doc();

    await incidentRef.set({
        id: incidentRef.id,
        employeeId: context.requestOwnerId,
        requestId: context.requestId,
        taskId: context.taskId,
        type: context.formData.type || 'general',
        data: context.formData,
        status: 'pending_prenomina',
        createdAt: new Date().toISOString(),
    });

    console.log(`[createPayrollIncident] Created incident ${incidentRef.id}`);
}

/**
 * Register an attendance correction
 */
async function registerAttendanceCorrection(context: { requestOwnerId: string; formData: Record<string, unknown> }) {
    const correctionRef = db.collection('attendance_corrections').doc();

    await correctionRef.set({
        id: correctionRef.id,
        employeeId: context.requestOwnerId,
        date: context.formData.date,
        originalCheckIn: context.formData.originalCheckIn,
        originalCheckOut: context.formData.originalCheckOut,
        correctedCheckIn: context.formData.correctedCheckIn,
        correctedCheckOut: context.formData.correctedCheckOut,
        reason: context.formData.reason,
        status: 'approved',
        createdAt: new Date().toISOString(),
    });

    console.log(`[registerAttendanceCorrection] Created correction ${correctionRef.id}`);
}

/**
 * Create a new employee record (for onboarding flows)
 */
async function createEmployeeRecord(context: { formData: Record<string, unknown> }) {
    const employeeRef = db.collection('employees').doc();

    await employeeRef.set({
        id: employeeRef.id,
        fullName: context.formData.fullName,
        email: context.formData.email,
        department: context.formData.department,
        positionTitle: context.formData.positionTitle,
        employmentType: context.formData.employmentType || 'full_time',
        shiftType: context.formData.shiftType || 'diurnal',
        hireDate: context.formData.hireDate,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });

    console.log(`[createEmployeeRecord] Created employee ${employeeRef.id}`);
}

/**
 * Log audit entry for side-effect execution
 */
async function logAuditEntry(entry: Record<string, unknown>) {
    const auditRef = db.collection('system_audit_logs').doc();
    await auditRef.set({
        id: auditRef.id,
        ...entry,
    });
}
