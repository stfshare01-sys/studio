'use client';

/**
 * incidence-core-actions.ts
 *
 * Gestión de solicitudes de incidencias (permisos, incapacidades, vacaciones, etc.)
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - createIncidence
 *  - updateIncidenceStatus
 */

import {
    doc, collection, addDoc, getDoc,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { callApproveIncidence, callNotifyNewIncidence, CloudFunctionError } from '../callable-functions';
import type { Employee, Incidence } from '@/lib/types';
import { calculateEffectiveLeaveDays } from '@/lib/hcm-calculations';
import { justifyInfractionsFromIncidence } from './auto-justification-actions';
import { notifyRole, createNotification } from './notification-actions';

// =========================================================================
// INCIDENCE MANAGEMENT
// =========================================================================

interface CreateIncidencePayload {
    employeeId: string;
    employeeName: string;
    type: Incidence['type'];
    startDate: string;
    endDate: string;
    isPaid: boolean;
    notes?: string;
    imssReference?: string;
    submitterId?: string;
    submitterName?: string;
}

export async function createIncidence(
    payload: CreateIncidencePayload
): Promise<{ success: boolean; incidenceId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // VALIDATION: Check if employee is active
        const employeeRef = doc(firestore, 'employees', payload.employeeId);
        const employeeSnap = await getDoc(employeeRef);
        const employeeData = employeeSnap.data() as Employee;

        if (employeeData?.status !== 'active') {
            return { success: false, error: 'No se pueden crear incidencias para empleados inactivos/baja.' };
        }

        // Calculate effective days (excluding weekends and holidays)
        let totalDays = 0;
        let effectiveDetails = null;

        try {
            const calculation = await calculateEffectiveLeaveDays(
                firestore,
                payload.employeeId,
                payload.startDate,
                payload.endDate,
                payload.type
            );
            totalDays = calculation.effectiveDays;
            effectiveDetails = calculation;
        } catch (calcError) {
            console.warn('[HCM] Error calculating effective days, falling back to calendar days:', calcError);
            // Fallback: Calculate total calendar days
            const start = new Date(payload.startDate);
            const end = new Date(payload.endDate);
            totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }

        const managerId = employeeData.directManagerId;
        const isAutoApproved = payload.submitterId && (payload.submitterId === managerId);

        console.log('[HCM] createIncidence IDs →', {
            employeeId: payload.employeeId,
            submitterId: payload.submitterId,
            directManagerId: managerId,
            isAutoApproved,
            type: payload.type,
            totalDays,
        });

        // Always create as 'pending' — auto-approval is handled via Cloud Function
        // which runs with admin privileges and can write to vacation_balances atomically.
        const incidenceData: Omit<Incidence, 'id'> = {
            ...payload,
            totalDays,
            status: 'pending',
            createdAt: now,
            updatedAt: now
        };

        const incidenceRef = collection(firestore, 'incidences');
        const docRef = await addDoc(incidenceRef, incidenceData);

        console.log(`[HCM] Created incidence ${docRef.id} for employee ${payload.employeeId}. Auto-approved: ${isAutoApproved}`);

        if (isAutoApproved) {
            // Delegate approval to Cloud Function — it runs with admin privileges
            // and handles vacation balance deduction in an atomic transaction.
            // This avoids Firestore rules blocking Manager writes to vacation_balances.
            try {
                console.log(`[HCM] Calling CF approveIncidence for ${docRef.id}...`);
                const cfResult = await callApproveIncidence({
                    incidenceId: docRef.id,
                    action: 'approve',
                });
                console.log(`[HCM] ✅ Auto-approved incidence ${docRef.id} via Cloud Function`, cfResult);
            } catch (cfError: any) {
                // If CF fails, incidence stays as 'pending' — manager can approve manually
                console.error('[HCM] ❌ Auto-approval via CF FAILED:', cfError?.message || cfError);
            }

            // Auto-justify infractions (tardiness/absences) covered by this incidence
            await justifyInfractionsFromIncidence(
                docRef.id,
                payload.employeeId,
                payload.startDate,
                payload.endDate,
                payload.type
            );
        } else {
            // Notify the appropriate approver via Cloud Function (handles escalation if manager is absent)
            try {
                const notifyResult = await callNotifyNewIncidence({
                    incidenceId: docRef.id,
                    employeeId: payload.employeeId,
                    employeeName: payload.employeeName,
                    managerId: managerId || '',
                    type: payload.type,
                    startDate: payload.startDate,
                    endDate: payload.endDate,
                });

                if (notifyResult.escalated) {
                    console.log(`[HCM] ⚠️ Notification escalated to ${notifyResult.notifiedName} (absent: ${notifyResult.absentManagerNames?.join(', ')})`);
                } else {
                    console.log(`[HCM] Notification sent to ${notifyResult.notifiedName}`);
                }
            } catch (notifyError: any) {
                console.error('[HCM] Escalation CF failed, falling back to direct notification:', notifyError?.message || notifyError);
                // Fallback: try direct notification to manager or HR
                try {
                    if (managerId) {
                        await createNotification(firestore, managerId, {
                            title: 'Nueva Solicitud de Incidencia',
                            message: `${payload.employeeName} ha solicitado ${payload.type} del ${payload.startDate} al ${payload.endDate}.`,
                            type: 'warning',
                            link: '/hcm/incidences'
                        });
                    } else {
                        await notifyRole(firestore, 'HRManager', {
                            title: 'Nueva Solicitud de Incidencia (Sin Manager Directo)',
                            message: `${payload.employeeName} ha solicitado ${payload.type}. Requiere atención de RH.`,
                            type: 'warning',
                            link: '/hcm/incidences'
                        });
                    }
                } catch (fallbackError) {
                    console.error('[HCM] Fallback notification also failed:', fallbackError);
                    return {
                        success: true,
                        incidenceId: docRef.id,
                        error: 'La solicitud se guardó, pero hubo un error al notificar al manager. Contacte a RH.'
                    };
                }
            }
        }

        return { success: true, incidenceId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating incidence:', error);
        return { success: false, error: 'No se pudo crear la incidencia.' };
    }
}

export async function updateIncidenceStatus(
    incidenceId: string,
    status: 'approved' | 'rejected',
    approvedById: string,
    approvedByName: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await callApproveIncidence({
            incidenceId,
            action: status === 'approved' ? 'approve' : 'reject',
            rejectionReason
        });

        if (result.success) {
            const { firestore } = initializeFirebase();
            const incidenceRef = doc(firestore, 'incidences', incidenceId);
            const incidenceSnap = await getDoc(incidenceRef);

            if (incidenceSnap.exists()) {
                const incidence = incidenceSnap.data() as Incidence;

                // Auto-justify if approved
                if (status === 'approved') {
                    await justifyInfractionsFromIncidence(
                        incidenceId,
                        incidence.employeeId,
                        incidence.startDate,
                        incidence.endDate,
                        incidence.type
                    );
                }

                // Notify Employee
                await createNotification(firestore, incidence.employeeId, {
                    title: `Incidencia ${status === 'approved' ? 'Aprobada' : 'Rechazada'}`,
                    message: `Tu solicitud de ${incidence.type} del ${incidence.startDate} ha sido ${status === 'approved' ? 'aprobada' : 'rechazada'}. ${rejectionReason ? `Motivo: ${rejectionReason}` : ''}`,
                    type: status === 'approved' ? 'success' : 'warning',
                    link: '/hcm'
                });

            }
        }

        console.log(`[HCM] Updated incidence ${incidenceId} to ${status}`);
        return { success: result.success };
    } catch (error) {
        console.error('[HCM] Error updating incidence:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'No se pudo actualizar la incidencia.' };
    }
}
