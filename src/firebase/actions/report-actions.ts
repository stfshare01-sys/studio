'use client';

import { doc, collection, addDoc, updateDoc, getDocs, query, where, limit } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { callConsolidatePrenomina, CloudFunctionError } from '../callable-functions';
import type { PayrollPeriodLock, HolidayCalendar } from '@/lib/types';

// =========================================================================
// PRENOMINA CONSOLIDATION (OPERATIONAL REPORT)
// =========================================================================

interface ConsolidatePrenominaParams {
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    employeeIds?: string[];
    createdById: string;
}

export async function consolidatePrenomina(
    params: ConsolidatePrenominaParams
): Promise<{ success: boolean; recordIds?: string[]; error?: string }> {
    try {
        const result = await callConsolidatePrenomina({
            periodStart: params.periodStart,
            periodEnd: params.periodEnd,
            periodType: params.periodType,
            employeeIds: params.employeeIds
        });

        if (result.errors && result.errors.length > 0) {
            console.warn(`[HCM] Prenomina consolidation had ${result.errors.length} errors`);
        }

        console.log(`[HCM] Consolidated prenomina: ${result.processedCount} records created, ${result.skippedCount} skipped`);
        return { success: result.success, recordIds: result.recordIds };
    } catch (error) {
        console.error('[HCM] Error consolidating prenomina:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'Error consolidando la pre-nómina.' };
    }
}

// =========================================================================
// PAYROLL PERIOD LOCK MANAGEMENT
// =========================================================================

export async function lockPayrollPeriod(
    periodStart: string,
    periodEnd: string,
    periodType: 'weekly' | 'biweekly' | 'monthly',
    lockedById: string,
    lockedByName: string,
    prenominaExportId?: string,
    exportFormat?: 'nomipaq' | 'excel' | 'json',
    locationId?: string
): Promise<{ success: boolean; lockId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Check for any overlapping locks (not just exact match)
        const existingQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '<=', periodEnd),
            where('isLocked', '==', true)
        );
        const existingSnap = await getDocs(existingQuery);

        // Client-side filter for full overlap: lockEnd >= periodStart
        const hasOverlap = existingSnap.docs.some(d => d.data().periodEnd >= periodStart);
        if (hasOverlap) {
            return { success: false, error: 'Ya existe un período bloqueado que se traslapa con el rango seleccionado.' };
        }

        // Build lock data, omitting undefined fields (Firestore rejects undefined values)
        const lockData: Record<string, any> = {
            periodStart,
            periodEnd,
            periodType,
            isLocked: true,
            lockedAt: now,
            lockedById,
            lockedByName,
            createdAt: now,
            updatedAt: now,
        };
        if (locationId !== undefined) lockData.locationId = locationId;
        if (prenominaExportId !== undefined) lockData.prenominaExportId = prenominaExportId;
        if (exportFormat !== undefined) lockData.exportFormat = exportFormat;

        const lockRef = await addDoc(collection(firestore, 'payroll_period_locks'), lockData);

        console.log(`[HCM] Locked payroll period ${periodStart} - ${periodEnd}`);
        return { success: true, lockId: lockRef.id };
    } catch (error) {
        console.error('[HCM] Error locking payroll period:', error);
        return { success: false, error: 'Error bloqueando periodo de nomina.' };
    }
}

/**
 * Check if any lock overlaps with the given date range.
 * Two ranges overlap when: lockStart <= periodEnd AND lockEnd >= periodStart
 * Firestore can't do a full overlap query in one shot, so we query locks where
 * periodStart <= selectedEnd (one half of overlap), then filter client-side
 * for the other half (lockEnd >= selectedStart).
 * Returns the first overlapping lock found, along with overlap details.
 */
export async function checkPeriodLock(
    periodStart: string,
    periodEnd: string
): Promise<{ isLocked: boolean; lock?: PayrollPeriodLock; overlappingLocks?: PayrollPeriodLock[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get all active locks where lockStart <= our end date (first half of overlap check)
        const lockQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '<=', periodEnd),
            where('isLocked', '==', true)
        );
        const lockSnap = await getDocs(lockQuery);

        if (lockSnap.empty) {
            return { isLocked: false };
        }

        // Client-side filter: check second half of overlap (lockEnd >= periodStart)
        const overlappingLocks: PayrollPeriodLock[] = [];
        for (const doc of lockSnap.docs) {
            const data = doc.data();
            if (data.periodEnd >= periodStart) {
                overlappingLocks.push({ id: doc.id, ...data } as PayrollPeriodLock);
            }
        }

        if (overlappingLocks.length === 0) {
            return { isLocked: false };
        }

        return { isLocked: true, lock: overlappingLocks[0], overlappingLocks };
    } catch (error) {
        console.error('[HCM] Error checking period lock:', error);
        return { isLocked: false, error: 'Error verificando bloqueo de periodo.' };
    }
}

export async function unlockPayrollPeriod(
    lockId: string,
    unlockedById: string,
    unlockReason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const lockRef = doc(firestore, 'payroll_period_locks', lockId);

        await updateDoc(lockRef, {
            isLocked: false,
            unlockedAt: now,
            unlockedById,
            unlockReason,
            updatedAt: now,
        });

        console.log(`[HCM] Unlocked payroll period ${lockId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error unlocking payroll period:', error);
        return { success: false, error: 'Error desbloqueando periodo de nomina.' };
    }
}
