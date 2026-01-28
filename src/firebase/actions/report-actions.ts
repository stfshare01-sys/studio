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

        const existingQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '==', periodStart),
            where('periodEnd', '==', periodEnd),
            where('isLocked', '==', true)
        );
        const existingSnap = await getDocs(existingQuery);

        if (!existingSnap.empty) {
            return { success: false, error: 'Este periodo ya esta bloqueado.' };
        }

        const lockData: Omit<PayrollPeriodLock, 'id'> = {
            periodStart,
            periodEnd,
            periodType,
            locationId,
            isLocked: true,
            lockedAt: now,
            lockedById,
            lockedByName,
            prenominaExportId,
            exportFormat,
            createdAt: now,
            updatedAt: now,
        };

        const lockRef = await addDoc(collection(firestore, 'payroll_period_locks'), lockData);

        console.log(`[HCM] Locked payroll period ${periodStart} - ${periodEnd}`);
        return { success: true, lockId: lockRef.id };
    } catch (error) {
        console.error('[HCM] Error locking payroll period:', error);
        return { success: false, error: 'Error bloqueando periodo de nomina.' };
    }
}

export async function checkPeriodLock(
    periodStart: string,
    periodEnd: string
): Promise<{ isLocked: boolean; lock?: PayrollPeriodLock; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const lockQuery = query(
            collection(firestore, 'payroll_period_locks'),
            where('periodStart', '==', periodStart),
            where('periodEnd', '==', periodEnd),
            where('isLocked', '==', true),
            limit(1)
        );
        const lockSnap = await getDocs(lockQuery);

        if (lockSnap.empty) {
            return { isLocked: false };
        }

        const lock = { id: lockSnap.docs[0].id, ...lockSnap.docs[0].data() } as PayrollPeriodLock;
        return { isLocked: true, lock };
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
