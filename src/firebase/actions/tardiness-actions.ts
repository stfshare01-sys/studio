'use client';

/**
 * tardiness-actions.ts
 *
 * Gestión de retardos.
 *
 * Funciones exportadas:
 *  - recordTardiness
 *  - justifyTardiness
 *  - markTardinessUnjustified
 *  - resetTardinessCounter
 */

import {
    doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where,
    serverTimestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { addDebtToHourBank } from './hour-bank-actions';
import { checkAttendanceTaskCompletion } from './task-completion-actions';
import { format } from 'date-fns';
import type { TardinessRecord } from "@/types/hcm.types";

// =========================================================================
// TARDINESS
// =========================================================================

export async function recordTardiness(
    employeeId: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string,
    toleranceMinutes: number = 0
): Promise<{ success: boolean; tardinessId?: string; sanctionApplied?: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Verificar si el empleado está exento de asistencia
        let isExempt = false;
        try {
            const empDoc = await getDoc(doc(firestore, 'employees', employeeId));
            if (empDoc.exists()) {
                const empData = empDoc.data();
                if (empData.positionId) {
                    const posDoc = await getDoc(doc(firestore, 'positions', empData.positionId));
                    if (posDoc.exists() && posDoc.data().isExemptFromAttendance) {
                        isExempt = true;
                    }
                }
            }
        } catch (err) {
            console.warn('[HCM] Error checking exemption for tardiness:', err);
        }

        if (isExempt) {
            console.log(`[HCM] Skipping tardiness for ${employeeId} (Position is exempt)`);
            return { success: true };
        }

        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        // Restar tolerancia del retardo: solo cuentan los minutos DESPUÉS de la tolerancia
        const minutesLate = (actH * 60 + actM) - (schedH * 60 + schedM) - toleranceMinutes;

        if (minutesLate <= 0) return { success: false, error: 'No hay retardo.' };

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);

        // ⚠️ REGLA CRÍTICA (team-management-module):
        // Firestore NO puede combinar where('date','>=') con where('isJustified','==') en campos
        // diferentes sin un índice compuesto de 3 campos específico.
        // Solución permanente: filtrar solo por employeeId + date en Firestore,
        // aplicar el filtro isJustified en memoria. NO revertir a filtro Firestore.
        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', format(thirtyDaysAgo, 'yyyy-MM-dd'))
        );
        const tardinessSnap = await getDocs(tardinessQuery);
        // Filtro en memoria: solo retardos no justificados (evita índice compuesto imposible)
        const records = tardinessSnap.docs
            .map(d => d.data() as TardinessRecord)
            .filter(r => !r.isJustified);

        const countInPeriod = records.length + 1;
        const countInWeek = records.filter(r => new Date(r.date) >= weekStart).length + 1;

        const sanctionApplied = countInPeriod >= 3 || countInWeek >= 2;

        const tardinessData: Omit<TardinessRecord, 'id' | 'createdAt' | 'updatedAt' | 'sanctionDate'> & { createdAt: any; updatedAt: any; sanctionDate?: any } = {
            employeeId,
            date,
            attendanceRecordId,
            type: 'entry',
            scheduledTime,
            actualTime,
            minutesLate,
            isJustified: false,
            justificationStatus: 'pending',
            periodStartDate: format(thirtyDaysAgo, 'yyyy-MM-dd'),
            tardinessCountInPeriod: countInPeriod,
            tardinessCountInWeek: countInWeek,
            sanctionApplied,
            // ⚠️ REGLA: Firestore no acepta campos con valor undefined en addDoc.
            // Usar spread condicional para omitir campos opcionales cuando no aplican.
            // NO revertir a: sanctionType: sanctionApplied ? '...' : undefined
            ...(sanctionApplied && {
                sanctionType: 'suspension_1day',
                sanctionDate: serverTimestamp(),
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const tardinessRef = await addDoc(collection(firestore, 'tardiness_records'), tardinessData);
        return { success: true, tardinessId: tardinessRef.id, sanctionApplied };
    } catch (error) {
        console.error('[HCM] Error recording tardiness:', error);
        return { success: false, error: 'Error registrando retardo.' };
    }
}

export async function justifyTardiness(
    tardinessId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string,
    useHourBank: boolean = false,
    justificationType?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        const tardinessSnap = await getDoc(tardinessRef);
        if (!tardinessSnap.exists()) {
            return { success: false, error: 'Registro de retardo no encontrado.' };
        }
        const tardiness = tardinessSnap.data() as TardinessRecord;

        await updateDoc(tardinessRef, {
            isJustified: true,
            justificationStatus: useHourBank ? 'compensated' : 'justified',
            justificationReason: reason,
            justificationType,
            justifiedById,
            justifiedAt: serverTimestamp(),
            sanctionApplied: false,
            updatedAt: serverTimestamp(),
            hourBankApplied: useHourBank
        });

        // NOTA: Overtime ya NO se recalcula al justificar retardo.
        // Overtime siempre es checkOut - scheduledEnd (sin descontar retardos).
        // El mecanismo de bolsa de horas maneja los descuentos por separado.

        if (useHourBank) {
            console.log(`[HCM] Adding ${tardiness.minutesLate} min debt to hour bank for employee ${tardiness.employeeId}`);
            const hbResult = await addDebtToHourBank({
                employeeId: tardiness.employeeId,
                date: tardiness.date,
                type: 'tardiness',
                minutes: tardiness.minutesLate,
                reason: `Retardo justificado con bolsa de horas: ${reason}`,
                sourceRecordId: tardinessId,
                createdById: justifiedById,
                createdByName: justifiedByName
            });
            if (!hbResult.success) {
                console.error('[HCM] Failed to add debt to hour bank:', hbResult.error);
                return { success: false, error: `Retardo justificado, pero no se pudo registrar en bolsa de horas: ${hbResult.error}` };
            }
            console.log(`[HCM] Hour bank updated. New balance: ${hbResult.newBalance} min, movement: ${hbResult.movementId}`);
        }

        // Check if this completes any pending tasks
        // Basado en Plan de Implementación de NotebookLM
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
            // Don't fail the justification if task check fails
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying tardiness:', error);
        return { success: false, error: 'Error justificando retardo.' };
    }
}

export async function markTardinessUnjustified(
    tardinessId: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        await updateDoc(tardinessRef, {
            isJustified: false, // Remains false so it counts as infraction/strike
            justificationStatus: 'unjustified',
            justificationType: 'unjustified',
            justificationReason: 'Marcado como injustificado por supervisor',
            justifiedById,
            justifiedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Check if this completes any pending tasks
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error marking tardiness unjustified:', error);
        return { success: false, error: 'Error marcando retardo como injustificado.' };
    }
}

export async function resetTardinessCounter(
    employeeId: string,
    resetById: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', format(thirtyDaysAgo, 'yyyy-MM-dd'))
        );
        const tardinessSnap = await getDocs(tardinessQuery);

        for (const docSnap of tardinessSnap.docs) {
            await updateDoc(doc(firestore, 'tardiness_records', docSnap.id), {
                sanctionResetById: resetById,
                updatedAt: serverTimestamp(),
            });
        }
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error resetting tardiness counter:', error);
        return { success: false, error: 'Error reseteando contador de retardos.' };
    }
}
