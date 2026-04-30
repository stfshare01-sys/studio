'use client';

/**
 * Hour Bank Actions
 * 
 * Gestión de la bolsa de horas de empleados:
 * - Ver saldo de bolsa de horas
 * - Agregar movimientos (retardos, salidas tempranas)
 * - Compensar con horas extras
 * - Ajustes manuales
 */

import {
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    addDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { HourBank, HourBankMovement, OvertimeCalculation } from "@/types/hcm.types";

// =========================================================================
// CONSULTAS DE BOLSA DE HORAS
// =========================================================================

/**
 * Obtiene la bolsa de horas de un empleado
 * Si no existe, la crea con saldo 0
 */
export async function getHourBank(
    employeeId: string
): Promise<{ success: boolean; hourBank?: HourBank; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const hourBankRef = doc(firestore, 'hourBanks', employeeId);
        const snapshot = await getDoc(hourBankRef);

        if (snapshot.exists()) {
            return {
                success: true,
                hourBank: { id: snapshot.id, ...snapshot.data() } as HourBank,
            };
        }

        // Crear bolsa de horas con saldo 0 si no existe
        const newHourBank: Omit<HourBank, 'id'> = {
            employeeId,
            balanceMinutes: 0,
            hiddenPositiveMinutes: 0,
            totalDebtAccumulated: 0,
            totalCompensated: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        await setDoc(hourBankRef, newHourBank);

        return {
            success: true,
            hourBank: { id: employeeId, ...newHourBank } as HourBank,
        };
    } catch (error) {
        console.error('[getHourBank] Error:', error);
        return { success: false, error: 'Error al obtener bolsa de horas' };
    }
}

/**
 * Obtiene las bolsas de horas de un conjunto de empleados
 * (útil para vista de equipo)
 */
export async function getTeamHourBanks(
    employeeIds: string[]
): Promise<{ success: boolean; hourBanks?: HourBank[]; error?: string }> {
    try {
        if (employeeIds.length === 0) {
            return { success: true, hourBanks: [] };
        }

        console.log(`[getTeamHourBanks] Querying for ${employeeIds.length} employees:`, employeeIds);

        const { firestore } = initializeFirebase();
        const hourBanks: HourBank[] = [];

        // Firestore limita 'in' queries a 30 elementos
        const chunks = [];
        for (let i = 0; i < employeeIds.length; i += 30) {
            chunks.push(employeeIds.slice(i, i + 30));
        }

        for (const chunk of chunks) {
            const q = query(
                collection(firestore, 'hourBanks'),
                where('employeeId', 'in', chunk)
            );
            const snapshot = await getDocs(q);
            console.log(`[getTeamHourBanks] Chunk query returned ${snapshot.size} docs`);
            snapshot.forEach((doc) => {
                const data = { id: doc.id, ...doc.data() } as HourBank;
                console.log(`[getTeamHourBanks] Found hourBank for ${data.employeeId}: balance=${data.balanceMinutes} min`);
                hourBanks.push(data);
            });
        }

        console.log(`[getTeamHourBanks] Total hour banks found: ${hourBanks.length}`);
        return { success: true, hourBanks };
    } catch (error) {
        console.error('[getTeamHourBanks] Error:', error);
        return { success: false, error: 'Error al obtener bolsas de horas' };
    }
}

/**
 * Obtiene los movimientos recientes de una bolsa de horas
 */
export async function getHourBankMovements(
    employeeId: string,
    limitCount: number = 20
): Promise<{ success: boolean; movements?: HourBankMovement[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const q = query(
            collection(firestore, 'hourBankMovements'),
            where('employeeId', '==', employeeId),
            orderBy('createdAt', 'desc'),
            limit(limitCount)
        );

        const snapshot = await getDocs(q);
        const movements: HourBankMovement[] = [];
        snapshot.forEach((doc) => {
            movements.push({ id: doc.id, ...doc.data() } as HourBankMovement);
        });

        return { success: true, movements };
    } catch (error) {
        console.error('[getHourBankMovements] Error:', error);
        return { success: false, error: 'Error al obtener movimientos' };
    }
}

// =========================================================================
// AGREGAR MOVIMIENTOS A BOLSA DE HORAS
// =========================================================================

/**
 * Agrega minutos de deuda a la bolsa de horas (retardo o salida temprana)
 */
export async function addDebtToHourBank(params: {
    employeeId: string;
    employeeName?: string;
    date: string;
    type: 'tardiness' | 'early_departure';
    minutes: number;
    reason: string;
    sourceRecordId: string;
    createdById: string;
    createdByName?: string;
}): Promise<{ success: boolean; movementId?: string; newBalance?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const nowISO = new Date().toISOString();

        // Obtener o crear bolsa de horas
        const hourBankResult = await getHourBank(params.employeeId);
        if (!hourBankResult.success || !hourBankResult.hourBank) {
            return { success: false, error: 'No se pudo obtener bolsa de horas' };
        }

        const hourBank = hourBankResult.hourBank;

        // ------------------------------------------------------------------
        // COMPENSACIÓN AUTOMÁTICA CON BOLSA OCULTA POSITIVA
        // Si el empleado tiene horas a favor "ocultas", se descuentan primero.
        // ------------------------------------------------------------------
        const hiddenPositive = hourBank.hiddenPositiveMinutes || 0;
        let effectiveDebtMinutes = params.minutes; // lo que realmente se suma como deuda
        let minutesCompensatedFromHidden = 0;

        if (hiddenPositive > 0 && effectiveDebtMinutes > 0) {
            minutesCompensatedFromHidden = Math.min(hiddenPositive, effectiveDebtMinutes);
            effectiveDebtMinutes -= minutesCompensatedFromHidden;
        }

        const newBalance = hourBank.balanceMinutes + effectiveDebtMinutes;
        const newHiddenPositive = hiddenPositive - minutesCompensatedFromHidden;

        // Crear movimiento de deuda (el monto original)
        const movement: Omit<HourBankMovement, 'id'> = {
            hourBankId: hourBank.id,
            employeeId: params.employeeId,
            date: params.date,
            type: params.type,
            minutes: params.minutes, // Positivo = registra la deuda total
            reason: params.reason,
            sourceRecordId: params.sourceRecordId,
            sourceRecordType: params.type,
            createdById: params.createdById,
            createdByName: params.createdByName,
            createdAt: serverTimestamp(),
        };

        const movementRef = await addDoc(collection(firestore, 'hourBankMovements'), movement);

        // Si hubo compensación oculta, crear un movimiento separado
        if (minutesCompensatedFromHidden > 0) {
            const compensationMovement: Omit<HourBankMovement, 'id'> = {
                hourBankId: hourBank.id,
                employeeId: params.employeeId,
                date: params.date,
                type: 'hidden_positive_compensation',
                minutes: -minutesCompensatedFromHidden,
                reason: `Compensación automática: ${minutesCompensatedFromHidden} min de bolsa oculta aplicados`,
                sourceRecordId: params.sourceRecordId,
                sourceRecordType: params.type,
                createdById: 'SISTEMA',
                createdByName: 'Sistema',
                createdAt: nowISO,
            };
            await addDoc(collection(firestore, 'hourBankMovements'), compensationMovement);
        }

        // Actualizar bolsa de horas
        await updateDoc(doc(firestore, 'hourBanks', hourBank.id), {
            balanceMinutes: newBalance,
            hiddenPositiveMinutes: newHiddenPositive,
            totalDebtAccumulated: hourBank.totalDebtAccumulated + params.minutes,
            totalCompensated: hourBank.totalCompensated + minutesCompensatedFromHidden,
            lastMovementDate: nowISO,
            updatedAt: serverTimestamp(),
        });

        return {
            success: true,
            movementId: movementRef.id,
            newBalance,
        };
    } catch (error) {
        console.error('[addDebtToHourBank] Error:', error);
        return { success: false, error: 'Error al agregar deuda a bolsa de horas' };
    }
}

/**
 * Compensa deuda de bolsa de horas con horas extras
 * Retorna la información del cálculo para aplicar horas dobles/triples
 */
export async function compensateWithOvertime(params: {
    employeeId: string;
    date: string;
    overtimeMinutes: number;
    weeklyOvertimeAccumulated: number;
    hourlyRate?: number;
    createdById: string;
    createdByName?: string;
    sourceRecordId?: string;
}): Promise<{ success: boolean; calculation?: OvertimeCalculation; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const nowISO = new Date().toISOString();

        // Obtener bolsa de horas
        const hourBankResult = await getHourBank(params.employeeId);
        if (!hourBankResult.success || !hourBankResult.hourBank) {
            return { success: false, error: 'No se pudo obtener bolsa de horas' };
        }

        const hourBank = hourBankResult.hourBank;
        const debt = Math.max(0, hourBank.balanceMinutes); // Solo deuda positiva

        // Calcular compensación
        const minutesCompensated = Math.min(debt, params.overtimeMinutes);
        const netOvertimeMinutes = params.overtimeMinutes - minutesCompensated;
        const remainingDebt = debt - minutesCompensated;

        // Calcular horas dobles y triples según LFT
        // Primeras 9 horas extras semanales = dobles
        // A partir de la hora 10 = triples
        const MAX_DOUBLE_MINUTES_WEEKLY = 9 * 60; // 540 minutos = 9 horas
        const weeklyAccumulatedMinutes = params.weeklyOvertimeAccumulated * 60;

        let doubleHoursMinutes = 0;
        let tripleHoursMinutes = 0;

        if (netOvertimeMinutes > 0) {
            const remainingDoubleCapacity = Math.max(0, MAX_DOUBLE_MINUTES_WEEKLY - weeklyAccumulatedMinutes);
            doubleHoursMinutes = Math.min(netOvertimeMinutes, remainingDoubleCapacity);
            tripleHoursMinutes = Math.max(0, netOvertimeMinutes - doubleHoursMinutes);
        }

        // Calcular montos si se proporciona tarifa
        let doubleHoursAmount: number | undefined;
        let tripleHoursAmount: number | undefined;
        let totalAmount: number | undefined;

        if (params.hourlyRate) {
            const minuteRate = params.hourlyRate / 60;
            doubleHoursAmount = (doubleHoursMinutes * minuteRate) * 2; // Doble
            tripleHoursAmount = (tripleHoursMinutes * minuteRate) * 3; // Triple
            totalAmount = doubleHoursAmount + tripleHoursAmount;
        }

        const calculation: OvertimeCalculation = {
            rawOvertimeMinutes: params.overtimeMinutes,
            hourBankDebt: debt,
            minutesCompensated,
            remainingDebt,
            netOvertimeMinutes,
            doubleHoursMinutes,
            tripleHoursMinutes,
            doubleHoursAmount,
            tripleHoursAmount,
            totalAmount,
            weeklyOvertimeAccumulated: params.weeklyOvertimeAccumulated + (netOvertimeMinutes / 60),
        };

        // Solo crear movimiento si hubo compensación
        if (minutesCompensated > 0) {
            const movement: Omit<HourBankMovement, 'id'> = {
                hourBankId: hourBank.id,
                employeeId: params.employeeId,
                date: params.date,
                type: 'overtime_compensation',
                minutes: -minutesCompensated, // Negativo = reduce deuda
                reason: `Compensación con ${(params.overtimeMinutes / 60).toFixed(1)} horas extras`,
                sourceRecordId: params.sourceRecordId,
                sourceRecordType: 'overtime',
                createdById: params.createdById,
                createdByName: params.createdByName,
                createdAt: serverTimestamp(),
            };

            await addDoc(collection(firestore, 'hourBankMovements'), movement);

            // Actualizar bolsa de horas
            await updateDoc(doc(firestore, 'hourBanks', hourBank.id), {
                balanceMinutes: remainingDebt,
                totalCompensated: hourBank.totalCompensated + minutesCompensated,
                lastMovementDate: nowISO,
                updatedAt: serverTimestamp(),
            });
        }

        return { success: true, calculation };
    } catch (error) {
        console.error('[compensateWithOvertime] Error:', error);
        return { success: false, error: 'Error al procesar compensación' };
    }
}

/**
 * Ajuste manual en la bolsa de horas (admin/HR)
 */
export async function manualHourBankAdjustment(params: {
    employeeId: string;
    date: string;
    minutes: number; // Positivo = agrega deuda, Negativo = reduce deuda
    reason: string;
    createdById: string;
    createdByName?: string;
}): Promise<{ success: boolean; movementId?: string; newBalance?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const nowISO = new Date().toISOString();

        // Obtener o crear bolsa de horas
        const hourBankResult = await getHourBank(params.employeeId);
        if (!hourBankResult.success || !hourBankResult.hourBank) {
            return { success: false, error: 'No se pudo obtener bolsa de horas' };
        }

        const hourBank = hourBankResult.hourBank;
        const newBalance = hourBank.balanceMinutes + params.minutes;

        // Crear movimiento
        const movement: Omit<HourBankMovement, 'id'> = {
            hourBankId: hourBank.id,
            employeeId: params.employeeId,
            date: params.date,
            type: 'manual_adjustment',
            minutes: params.minutes,
            reason: params.reason,
            createdById: params.createdById,
            createdByName: params.createdByName,
            createdAt: serverTimestamp(),
        };

        const movementRef = await addDoc(collection(firestore, 'hourBankMovements'), movement);

        // Actualizar bolsa de horas
        const updates: Record<string, any> = {
            balanceMinutes: newBalance,
            lastMovementDate: nowISO,
            updatedAt: serverTimestamp(),
        };

        if (params.minutes > 0) {
            updates.totalDebtAccumulated = hourBank.totalDebtAccumulated + params.minutes;
        } else {
            updates.totalCompensated = hourBank.totalCompensated + Math.abs(params.minutes);
        }

        await updateDoc(doc(firestore, 'hourBanks', hourBank.id), updates);

        return {
            success: true,
            movementId: movementRef.id,
            newBalance,
        };
    } catch (error) {
        console.error('[manualHourBankAdjustment] Error:', error);
        return { success: false, error: 'Error al realizar ajuste manual' };
    }
}

// =========================================================================
// UTILIDADES
// =========================================================================

/**
 * Formatea minutos a formato legible (ej: "1h 30min")
 */
export function formatMinutesToReadable(minutes: number): string {
    const absMinutes = Math.abs(minutes);
    const hours = Math.floor(absMinutes / 60);
    const mins = absMinutes % 60;

    const sign = minutes < 0 ? '-' : '';

    if (hours === 0) {
        return `${sign}${mins}min`;
    }
    if (mins === 0) {
        return `${sign}${hours}h`;
    }
    return `${sign}${hours}h ${mins}min`;
}

/**
 * Calcula el saldo de bolsa de horas para display
 * Retorna un objeto con formato para UI
 */
export function formatHourBankBalance(balanceMinutes: number): {
    text: string;
    isDebt: boolean;
    colorClass: string;
} {
    const isDebt = balanceMinutes > 0;
    const text = formatMinutesToReadable(balanceMinutes);

    // La bolsa oculta NUNCA muestra saldos positivos (crédito).
    // Solo se muestra deuda (números rojos) o "Sin saldo".
    return {
        text: isDebt ? `Debe: ${text}` : 'Sin saldo',
        isDebt,
        colorClass: isDebt ? 'text-red-600' : 'text-gray-500',
    };
}

// =========================================================================
// BOLSA OCULTA - ACUMULACIÓN Y RESET
// =========================================================================

/**
 * Acumula minutos positivos "ocultos" en la bolsa de horas.
 * Se usa cuando un empleado SIN derecho a HE trabaja de más.
 * Estos minutos NO se muestran en la UI.
 */
export async function accumulateHiddenPositiveHours(params: {
    employeeId: string;
    date: string;
    minutes: number;
    reason: string;
}): Promise<{ success: boolean; newHiddenBalance?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const nowISO = new Date().toISOString();

        const hourBankResult = await getHourBank(params.employeeId);
        if (!hourBankResult.success || !hourBankResult.hourBank) {
            return { success: false, error: 'No se pudo obtener bolsa de horas' };
        }

        const hourBank = hourBankResult.hourBank;
        const newHiddenPositive = (hourBank.hiddenPositiveMinutes || 0) + params.minutes;

        // ------------------------------------------------------------------
        // COMPENSACIÓN BIDIRECCIONAL: si ya hay deuda, descontar automáticamente
        // ------------------------------------------------------------------
        let finalHiddenPositive = newHiddenPositive;
        let finalBalance = hourBank.balanceMinutes;
        let autoCompensated = 0;

        if (finalBalance > 0 && finalHiddenPositive > 0) {
            autoCompensated = Math.min(finalBalance, finalHiddenPositive);
            finalBalance -= autoCompensated;
            finalHiddenPositive -= autoCompensated;
            console.log(`[accumulateHiddenPositiveHours] Auto-compensación: ${autoCompensated}min de deuda existente compensada. Deuda: ${hourBank.balanceMinutes} → ${finalBalance}min, Oculta: ${newHiddenPositive} → ${finalHiddenPositive}min`);
        }

        // Crear movimiento de acumulación (interno, para auditoría)
        const movement: Omit<HourBankMovement, 'id'> = {
            hourBankId: hourBank.id,
            employeeId: params.employeeId,
            date: params.date,
            type: 'hidden_positive_accumulation',
            minutes: params.minutes,
            reason: params.reason,
            createdById: 'SISTEMA',
            createdByName: 'Sistema',
            createdAt: nowISO,
        };

        await addDoc(collection(firestore, 'hourBankMovements'), movement);

        // Si hubo compensación automática, registrar movimiento de auditoría
        if (autoCompensated > 0) {
            const compensationMovement: Omit<HourBankMovement, 'id'> = {
                hourBankId: hourBank.id,
                employeeId: params.employeeId,
                date: params.date,
                type: 'hidden_positive_compensation',
                minutes: -autoCompensated,
                reason: `Compensación automática retroactiva: ${autoCompensated}min de bolsa oculta aplicados a deuda existente`,
                createdById: 'SISTEMA',
                createdByName: 'Sistema',
                createdAt: nowISO,
            };
            await addDoc(collection(firestore, 'hourBankMovements'), compensationMovement);
        }

        // Actualizar bolsa con valores finales (incluye compensación)
        await updateDoc(doc(firestore, 'hourBanks', hourBank.id), {
            hiddenPositiveMinutes: finalHiddenPositive,
            balanceMinutes: finalBalance,
            totalCompensated: hourBank.totalCompensated + autoCompensated,
            lastMovementDate: nowISO,
            updatedAt: serverTimestamp(),
        });

        return { success: true, newHiddenBalance: finalHiddenPositive };
    } catch (error) {
        console.error('[accumulateHiddenPositiveHours] Error:', error);
        return { success: false, error: 'Error al acumular horas ocultas' };
    }
}

/**
 * Resetea la bolsa oculta positiva a 0 para un empleado.
 * Se invoca al cerrar/consolidar el periodo.
 * Las deudas (balanceMinutes > 0) se MANTIENEN.
 */
export async function resetHiddenPositiveBalance(
    employeeId: string
): Promise<{ success: boolean; previousHidden?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const nowISO = new Date().toISOString();

        const hourBankResult = await getHourBank(employeeId);
        if (!hourBankResult.success || !hourBankResult.hourBank) {
            return { success: false, error: 'No se pudo obtener bolsa de horas' };
        }

        const hourBank = hourBankResult.hourBank;
        const previousHidden = hourBank.hiddenPositiveMinutes || 0;

        if (previousHidden > 0) {
            // Registrar movimiento de reset (para auditoría)
            const movement: Omit<HourBankMovement, 'id'> = {
                hourBankId: hourBank.id,
                employeeId,
                date: nowISO.split('T')[0],
                type: 'hidden_positive_compensation',
                minutes: -previousHidden,
                reason: `Reset de bolsa oculta al cerrar periodo (${previousHidden} min expirados)`,
                createdById: 'SISTEMA',
                createdByName: 'Sistema',
                createdAt: nowISO,
            };
            await addDoc(collection(firestore, 'hourBankMovements'), movement);

            // Resetear solo las horas ocultas, mantener deudas intactas
            await updateDoc(doc(firestore, 'hourBanks', hourBank.id), {
                hiddenPositiveMinutes: 0,
                lastMovementDate: nowISO,
                updatedAt: serverTimestamp(),
            });
        }

        return { success: true, previousHidden };
    } catch (error) {
        console.error('[resetHiddenPositiveBalance] Error:', error);
        return { success: false, error: 'Error al resetear bolsa oculta' };
    }
}
