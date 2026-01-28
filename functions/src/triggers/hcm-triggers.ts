import * as admin from 'firebase-admin';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { Incidence } from '../types/firestore-types';

const db = admin.firestore();

/**
 * Trigger: On Incidence Updated
 * 
 * Handles side-effects when an incidence status changes.
 * Specifically:
 * - When 'vacation' is APPROVED -> Deduct days from vacation balance.
 * - When 'vacation' is REJECTED/CANCELLED -> Refund days (if previously deducted? usually deduction happens on consumption or approval. Let's assume on approval).
 */
export const onIncidenceUpdate = onDocumentUpdated('incidences/{incidenceId}', async (event) => {
    const before = event.data?.before.data() as Incidence | undefined;
    const after = event.data?.after.data() as Incidence | undefined;

    if (!before || !after) return; // Deleted or created (not update)

    // Check for status change to APPROVED
    if (before.status !== 'approved' && after.status === 'approved') {
        const employeeId = after.employeeId;
        const days = after.totalDays;

        if (after.type === 'vacation') {
            await handleVacationApproval(employeeId, days, event.params.incidenceId);
        }

        // Future: Check 'catalog-side-effects' if we implement dynamic loading
    }
});

/**
 * Updates the employee's vacation balance
 */
async function handleVacationApproval(employeeId: string, days: number, incidenceId: string) {
    try {
        console.log(`[Trigger] Processing vacation approval for ${employeeId}: -${days} days`);

        // Get current balance record (active/latest)
        const balanceQuery = db.collection('vacation_balances')
            .where('employeeId', '==', employeeId)
            .orderBy('periodEnd', 'desc') // Assuming the latest period is the active one
            .limit(1);

        const balanceSnap = await balanceQuery.get();

        if (balanceSnap.empty) {
            console.warn(`[Trigger] No vacation balance found for employee ${employeeId}`);
            return;
        }

        const balanceDoc = balanceSnap.docs[0];
        const currentTaken = balanceDoc.data().daysTaken || 0;
        const currentAvailable = balanceDoc.data().daysAvailable || 0;

        await balanceDoc.ref.update({
            daysTaken: currentTaken + days,
            daysAvailable: currentAvailable - days, // Simple deduction
            lastUpdated: new Date().toISOString()
        });

        // Log movement
        // const movementRef = balanceDoc.ref.collection('movements').doc();
        // await movementRef.set({ ... }) // If subcollection exists

        console.log(`[Trigger] Updated vacation balance for ${employeeId}. New available: ${currentAvailable - days}`);

    } catch (error) {
        console.error('[Trigger] Error updating vacation balance:', error);
    }
}
