import {
    collection,
    query,
    where,
    getDocs,
    getDoc,
    doc,
    writeBatch,
    increment,
    serverTimestamp,
    orderBy,
    limit,
    Timestamp,
    runTransaction
} from "firebase/firestore";
import { initializeFirebase } from "../index";
import type { Role } from '@/types/auth.types';
import { getUserPermissions, hasPermission } from "../role-actions";
import type { TardinessRecord, EarlyDeparture, OvertimeRequest, HourBank, Employee } from "@/types/hcm.types";

/**
 * Ejecuta el procesamiento manual de reglas SLA para todos los registros pendientes.
 * 
 * Reglas:
 * 1. Retardos pendientes (> 24h antigüedad o cierre de periodo):
 *    - Marcar como injustificados
 *    - Aplicar sanción (si aplica política)
 * 2. Salidas Tempranas pendientes:
 *    - Marcar como injustificadas
 * 3. Horas Extras pendientes:
 *    - Verificar deuda en bolsa de horas
 *    - Compensar deuda automáticamente
 *    - Aprobar resto (o marcar parcial)
 */
export async function runGlobalSLAProcessing(
    currentUserId: string,
    userRole: string,
    customRoleId?: string,
    periodStart?: string,
    periodEnd?: string
): Promise<{
    success: boolean;
    stats?: {
        processedTardiness: number;
        processedDepartures: number;
        processedOvertime: number;
        processedMissingPunches: number;
    };
    error?: string;
}> {
    try {
        // 1. Verificar Permisos
        const { firestore } = initializeFirebase();
        const { permissions } = await getUserPermissions(firestore, userRole, customRoleId);
        if (!hasPermission(permissions, 'hcm_sla_processing', 'write')) {
            return { success: false, error: "No tienes permisos para ejecutar el procesamiento de SLA." };
        }

        const batch = writeBatch(firestore);
        let processedTardiness = 0;
        let processedDepartures = 0;
        let processedOvertime = 0;
        let processedMissingPunches = 0;

        // 1b. Obtener IDs de empleados dados de baja para excluirlos del SLA
        const terminatedSnap = await getDocs(
            query(collection(firestore, 'employees'), where('status', 'in', ['terminated', 'disabled']))
        );
        const terminatedEmpIds = new Set(terminatedSnap.docs.map(d => d.id));

        // 2. Procesar Retardos Pendientes
        // Buscamos retardos que no tengan justificationStatus definido o sea 'pending' (si existiera)
        // En el esquema actual, isJustified es boolean. Asumimos !isJustified y sin justificar en 'justificationStatus'

        // NOTA: Para este MVP manual, procesamos TODOS los retardos que no estén justificados y no tengan estatus final
        const tardinessRef = collection(firestore, 'tardiness_records');
        const tardinessConstraints: any[] = [where('justificationStatus', '==', 'pending')];
        if (periodStart) tardinessConstraints.push(where('date', '>=', periodStart));
        if (periodEnd) tardinessConstraints.push(where('date', '<=', periodEnd));
        const tardinessQuery = query(tardinessRef, ...tardinessConstraints);

        const tardinessDocs = await getDocs(tardinessQuery);

        for (const docSnapshot of tardinessDocs.docs) {
            const record = docSnapshot.data() as TardinessRecord;

            // Empleados dados de baja → transparente, no procesamos su retardo
            if (terminatedEmpIds.has(record.employeeId)) continue;

            // Regla: Si ha pasado > 24 horas y sigue pendiente, se marca injustificado
            // O simplemente procesamos todo lo pendiente al momento del corte manual

            const recordRef = doc(firestore, 'tardiness_records', docSnapshot.id);
            batch.update(recordRef, {
                justificationStatus: 'unjustified',
                isJustified: false,
                sanctionApplied: true, // Auto-sanción según regla general
                updatedAt: serverTimestamp()
            });
            processedTardiness++;
        }

        // 3. Procesar Salidas Tempranas Pendientes
        const departuresRef = collection(firestore, 'early_departures');
        const departuresConstraints: any[] = [where('justificationStatus', '==', 'pending')];
        if (periodStart) departuresConstraints.push(where('date', '>=', periodStart));
        if (periodEnd) departuresConstraints.push(where('date', '<=', periodEnd));
        const departuresQuery = query(departuresRef, ...departuresConstraints);

        const departureDocs = await getDocs(departuresQuery);

        for (const docSnapshot of departureDocs.docs) {
            const record = docSnapshot.data() as EarlyDeparture;

            // Empleados dados de baja → transparente
            if (terminatedEmpIds.has(record.employeeId)) continue;

            const recordRef = doc(firestore, 'early_departures', docSnapshot.id);

            batch.update(recordRef, {
                justificationStatus: 'unjustified',
                isJustified: false,
                updatedAt: serverTimestamp()
            });
            processedDepartures++;
        }

        // 4. Procesar Horas Extras - Compensación de Deuda y Rechazo del Sobrante
        const overtimeRef = collection(firestore, 'overtime_requests');
        const overtimeConstraints: any[] = [where('status', '==', 'pending')];
        if (periodStart) overtimeConstraints.push(where('date', '>=', periodStart));
        if (periodEnd) overtimeConstraints.push(where('date', '<=', periodEnd));
        const overtimeQuery = query(overtimeRef, ...overtimeConstraints);

        const overtimeDocs = await getDocs(overtimeQuery);

        // Agrupar por empleado para minimizar lecturas de bolsa de horas
        const overtimeByEmployee: Record<string, { id: string, data: OvertimeRequest }[]> = {};
        overtimeDocs.docs.forEach(d => {
            const data = d.data() as OvertimeRequest;
            if (!overtimeByEmployee[data.employeeId]) overtimeByEmployee[data.employeeId] = [];
            overtimeByEmployee[data.employeeId].push({ id: d.id, data });
        });

        for (const employeeId of Object.keys(overtimeByEmployee)) {
            if (terminatedEmpIds.has(employeeId)) continue;

            const hbRef = doc(firestore, 'hourBanks', employeeId);
            const hbSnap = await getDoc(hbRef);

            let currentDebt = 0;
            if (hbSnap.exists()) {
                const hb = hbSnap.data() as HourBank;
                currentDebt = hb.balanceMinutes > 0 ? hb.balanceMinutes : 0;
            }

            for (const { id: reqId, data: req } of overtimeByEmployee[employeeId]) {
                const minutesRequested = req.hoursRequested * 60;
                let minutesToCompensate = 0;
                let newStatus: 'approved' | 'partial' | 'rejected' = 'rejected';
                let reason = 'Rechazo automático por SLA (no autorizada). No hay deuda pendiente.';

                if (currentDebt > 0) {
                    if (currentDebt >= minutesRequested) {
                        minutesToCompensate = minutesRequested;
                        currentDebt -= minutesRequested;
                        newStatus = 'approved'; 
                        reason = `Consumida por deuda: Se compensaron ${minutesToCompensate} min de deuda pendiente.`;
                    } else {
                        minutesToCompensate = currentDebt;
                        currentDebt = 0;
                        newStatus = 'partial'; 
                        reason = `Compensación parcial: Se usaron ${minutesToCompensate} min para pagar deuda. Resto rechazado.`;
                    }
                }

                const reqRef = doc(firestore, 'overtime_requests', reqId);
                batch.update(reqRef, {
                    status: newStatus,
                    hoursApproved: 0, // 0 horas a nómina, todo se anula o se va a bolsa
                    doubleHours: 0,
                    tripleHours: 0,
                    approvedById: currentUserId,
                    approvedByName: 'SLA Automático',
                    approvedAt: serverTimestamp(),
                    rejectionReason: reason,
                    updatedAt: serverTimestamp()
                });

                if (minutesToCompensate > 0) {
                    const movementRef = doc(collection(firestore, 'hourBankMovements'));
                    batch.set(movementRef, {
                        hourBankId: employeeId,
                        employeeId,
                        date: req.date,
                        minutes: -minutesToCompensate, // Negativo para reducir deuda
                        type: 'overtime_compensation',
                        reason: `Compensación automática por tiempo extra del ${req.date}`,
                        sourceRecordId: reqId,
                        sourceRecordType: 'overtime',
                        createdById: currentUserId,
                        createdByName: 'SLA Automático',
                        createdAt: serverTimestamp()
                    });

                    if (hbSnap.exists()) {
                        batch.update(hbRef, {
                            balanceMinutes: increment(-minutesToCompensate),
                            totalCompensated: increment(minutesToCompensate),
                            updatedAt: serverTimestamp()
                        });
                    }
                }

                processedOvertime++;
            }
        }

        // 5. Procesar Marcajes Faltantes (Missing Punches)
        const missingRef = collection(firestore, 'missing_punches');
        const missingConstraints: any[] = [
            where('isJustified', '==', false),
            where('resultedInAbsence', '==', false)
        ];
        if (periodStart) missingConstraints.push(where('date', '>=', periodStart));
        if (periodEnd) missingConstraints.push(where('date', '<=', periodEnd));
        const missingQuery = query(missingRef, ...missingConstraints);

        const missingDocs = await getDocs(missingQuery);

        for (const docSnapshot of missingDocs.docs) {
            const record = docSnapshot.data() as any;

            if (terminatedEmpIds.has(record.employeeId)) continue;

            const recordRef = doc(firestore, 'missing_punches', docSnapshot.id);

            batch.update(recordRef, {
                resultedInAbsence: true,
                updatedAt: serverTimestamp()
            });
            processedMissingPunches++;
        }

        await batch.commit();

        return {
            success: true,
            stats: {
                processedTardiness,
                processedDepartures,
                processedOvertime,
                processedMissingPunches
            }
        };
    } catch (error) {
        console.error('Error running SLA processing:', error);
        return { success: false, error: 'Error ejecutando el procesamiento SLA.' };
    }
}
