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
import type {
    TardinessRecord,
    EarlyDeparture,
    OvertimeRequest,
    Role,
    HourBank,
    Employee
} from "@/lib/types";
import { getUserPermissions, hasPermission } from "../role-actions";

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

        // 4. Procesar Horas Extras - Compensación de Deuda
        // Aquí es más complejo, necesitamos leer la bolsa de horas de cada empleado
        // Para hacerlo en batch de manera segura, lo ideal sería transacciones individuales,
        // pero para un proceso masivo manual, haremos lecturas primero y luego batch updates.
        // Riesgo de race condition bajo, ya que es un proceso administrativo controlado.

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

        // Procesar cada empleado
        for (const employeeId of Object.keys(overtimeByEmployee)) {
            // Empleados dados de baja → transparente
            if (terminatedEmpIds.has(employeeId)) continue;

            // Leer bolsa de horas actual
            const hbRef = doc(firestore, 'hour_banks', employeeId);
            const hbSnap = await getDoc(hbRef);

            let currentDebt = 0;
            if (hbSnap.exists()) {
                const hb = hbSnap.data() as HourBank;
                currentDebt = hb.balanceMinutes < 0 ? Math.abs(hb.balanceMinutes) : 0;
            }

            const recipientRef = doc(firestore, 'employees', employeeId); // Para verificar existencia si es necesario

            for (const { id: reqId, data: req } of overtimeByEmployee[employeeId]) {
                const minutesRequested = req.hoursRequested * 60;
                let minutesToCompensate = 0;
                let minutesToPay = minutesRequested;
                let newStatus: 'approved' | 'partial' = 'approved';

                if (currentDebt > 0) {
                    if (currentDebt >= minutesRequested) {
                        // Toda la solicitud se va a deuda
                        minutesToCompensate = minutesRequested;
                        minutesToPay = 0;
                        currentDebt -= minutesRequested;
                        newStatus = 'approved'; // Se aprueba pero se usa para deuda (técnicamente "approved" como movimiento validado)
                        // O podríamos marcarlo como 'compensated' si existiera el estatus. 
                        // Mantendremos 'approved' pero con 0 horas a pagar y log en movements.
                    } else {
                        // Parcial
                        minutesToCompensate = currentDebt;
                        minutesToPay = minutesRequested - currentDebt;
                        currentDebt = 0;
                        newStatus = 'partial'; // Parcialmente pagada, resto a deuda
                    }
                }

                // Actualizar solicitud
                const reqRef = doc(firestore, 'overtime_requests', reqId);
                const hoursApproved = minutesToPay / 60;

                // Calculate start and end of the week for the request date
                const reqDateObj = new Date(req.date + 'T00:00:00'); // Assuming YYYY-MM-DD
                const dayOfWeek = reqDateObj.getDay(); // 0 is Sunday
                const diffToMonday = reqDateObj.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
                const startOfWeekObj = new Date(reqDateObj.setDate(diffToMonday));
                const endOfWeekObj = new Date(startOfWeekObj);
                endOfWeekObj.setDate(endOfWeekObj.getDate() + 6);

                const startOfWeekStr = startOfWeekObj.toISOString().split('T')[0];
                const endOfWeekStr = endOfWeekObj.toISOString().split('T')[0];

                // Fetch previous overtime requests for this employee in the same week
                const employeeWeeklyOvertimeQuery = query(
                    collection(firestore, 'overtime_requests'),
                    where('employeeId', '==', employeeId),
                    where('date', '>=', startOfWeekStr),
                    where('date', '<=', endOfWeekStr),
                    where('status', 'in', ['approved', 'partial'])
                );

                const weeklyOvertimeDocs = await getDocs(employeeWeeklyOvertimeQuery);
                let previousApprovedHoursThisWeek = 0;
                weeklyOvertimeDocs.forEach(d => {
                    // Do not count the current request if it's already in the DB and we are processing it
                    // Though here we process 'pending' so it shouldn't match 'approved', but just in case:
                    if (d.id !== reqId) {
                        const pastReq = d.data() as OvertimeRequest;
                        previousApprovedHoursThisWeek += (pastReq.hoursApproved || 0);
                    }
                });

                // Calcular dobles/triples reales según LFT (tope 9 horas a la semana)
                let doubleHours = 0;
                let tripleHours = 0;

                if (previousApprovedHoursThisWeek + hoursApproved <= 9) {
                    doubleHours = hoursApproved;
                } else if (previousApprovedHoursThisWeek >= 9) {
                    tripleHours = hoursApproved;
                } else {
                    doubleHours = 9 - previousApprovedHoursThisWeek;
                    tripleHours = hoursApproved - doubleHours;
                }

                batch.update(reqRef, {
                    status: newStatus,
                    hoursApproved: hoursApproved,
                    doubleHours: doubleHours,
                    tripleHours: tripleHours,
                    approvedById: currentUserId,
                    approvedByName: 'SLA Automático',
                    approvedAt: new Date().toISOString(),
                    rejectionReason: minutesToCompensate > 0 ? `Compensación automática de ${minutesToCompensate} min de deuda.` : '',
                    updatedAt: serverTimestamp()
                });

                // Actualizar bolsa de horas (incrementar positivo)
                // Nota: Si se compensó deuda, la bolsa sube (dismuye deuda negativa)
                // Si se paga, no afecta bolsa (se paga en nómina), A MENOS que la política sea "Todo a bolsa".
                // Asumiremos: Lo compensado sube el saldo. Lo pagado NO entra a bolsa.

                if (minutesToCompensate > 0) {
                    // Movimiento de compensación
                    const movementRef = doc(collection(firestore, 'hour_bank_movements'));
                    batch.set(movementRef, {
                        employeeId,
                        amountMinutes: minutesToCompensate,
                        type: 'overtime_compensation',
                        description: `Compensación automática por horas extras del ${req.date}`,
                        referenceId: reqId,
                        createdAt: serverTimestamp(),
                        createdBy: currentUserId
                    });

                    // Actualizar saldo (batch increment funciona atómicamente sobre el campo)
                    // Usamos set con merge true para asegurar que el documento exista o update si estamos seguros
                    if (hbSnap.exists()) {
                        batch.update(hbRef, {
                            balanceMinutes: increment(minutesToCompensate),
                            totalCompensated: increment(minutesToCompensate),
                            updatedAt: serverTimestamp()
                        });
                    } else {
                        // Crear si no existe (raro si tiene deuda, pero posible)
                        batch.set(hbRef, {
                            id: employeeId,
                            employeeId,
                            balanceMinutes: minutesToCompensate,
                            totalCompensated: minutesToCompensate,
                            totalDebtAccumulated: 0,
                            updatedAt: serverTimestamp(),
                            createdAt: serverTimestamp()
                        });
                    }
                }

                processedOvertime++;
            }
        }

        await batch.commit();

        return {
            success: true,
            stats: {
                processedTardiness,
                processedDepartures,
                processedOvertime
            }
        };
    } catch (error) {
        console.error('Error running SLA processing:', error);
        return { success: false, error: 'Error ejecutando el procesamiento SLA.' };
    }
}
