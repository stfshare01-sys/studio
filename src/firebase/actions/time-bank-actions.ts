'use client';

/**
 * time-bank-actions.ts
 *
 * Gestión de la bolsa de tiempo (time_bank) del sistema HCM.
 * NOTA: Este módulo gestiona el documento `time_bank/{employeeId}` en Firestore,
 * que rastrea horas ganadas/usadas por compensación de retardos en asistencia.
 * Es diferente a `hour-bank-actions.ts` que gestiona movimientos de bolsa de horas
 * para deducciones individuales.
 *
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - updateTimeBank
 */

import { doc, getDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { setDocumentNonBlocking } from '../non-blocking-updates';
import type { TimeBank } from '@/lib/types';

// =========================================================================
// TIME BANK
// =========================================================================

export async function updateTimeBank(
    employeeId: string,
    hours: number,
    type: 'earn' | 'use',
    description: string,
    approvedById?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const timeBankRef = doc(firestore, 'time_bank', employeeId);
        const timeBankSnap = await getDoc(timeBankRef);

        let currentBank: TimeBank;

        if (timeBankSnap.exists()) {
            currentBank = timeBankSnap.data() as TimeBank;
        } else {
            currentBank = {
                id: employeeId,
                employeeId,
                hoursEarned: 0,
                hoursUsed: 0,
                hoursBalance: 0,
                hoursExpired: 0,
                lastUpdated: now,
                movements: []
            };
        }

        const movement = {
            id: `mov_${Date.now()}`,
            type,
            hours,
            date: now,
            description,
            approvedById
        };

        if (type === 'earn') currentBank.hoursEarned += hours;
        else currentBank.hoursUsed += hours;

        currentBank.hoursBalance = currentBank.hoursEarned - currentBank.hoursUsed - currentBank.hoursExpired;
        currentBank.lastUpdated = now;
        currentBank.movements = [...currentBank.movements, movement].slice(-50);

        setDocumentNonBlocking(timeBankRef, currentBank, { merge: true });

        console.log(`[HCM] Updated time bank for ${employeeId}: ${type} ${hours} hours`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating time bank:', error);
        return { success: false, error: 'Error actualizando bolsa de horas.' };
    }
}
