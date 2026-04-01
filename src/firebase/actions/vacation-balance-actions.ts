'use client';

/**
 * vacation-balance-actions.ts
 *
 * Gestión de saldos de vacaciones de empleados (LFT 2023).
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - getVacationBalance
 *  - updateVacationBalance
 *  - resetVacationBalanceOnAnniversary
 *  - adjustVacationBalance
 *  - bulkLoadVacationBalances
 */

import {
    doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Employee, VacationBalance, VacationMovement } from '@/lib/types';
import {
    calculateVacationDays,
    calculateYearsOfService,
    isAnniversaryDate,
    getNextAnniversaryDate,
} from '@/lib/hcm-utils';
import { notifyRole, createNotification } from './notification-actions';

// =========================================================================
// VACATION BALANCE MANAGEMENT
// =========================================================================

export interface VacationBalanceLoad {
    employeeId: string;
    daysEntitled: number;
    daysTaken?: number;
    daysScheduled?: number;
    reason: string;
}

export async function getVacationBalance(
    employeeId: string
): Promise<{ success: boolean; balance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get employee data
        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;

        // Check if balance exists for current period
        const balanceQuery = query(
            collection(firestore, 'vacation_balances'),
            where('employeeId', '==', employeeId),
            orderBy('periodStart', 'desc'),
            limit(1)
        );
        const balanceSnap = await getDocs(balanceQuery);

        if (!balanceSnap.empty) {
            const balance = { id: balanceSnap.docs[0].id, ...balanceSnap.docs[0].data() } as VacationBalance;
            return { success: true, balance };
        }

        // Create new balance if none exists
        const yearsOfService = calculateYearsOfService(employee.hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const periodStart = employee.hireDate;
        const nextAnniversary = getNextAnniversaryDate(employee.hireDate);
        const now = new Date().toISOString();

        const newBalance: Omit<VacationBalance, 'id'> = {
            employeeId,
            periodStart,
            periodEnd: nextAnniversary.toISOString(),
            daysEntitled,
            yearsOfService,
            daysTaken: 0,
            daysScheduled: 0,
            daysAvailable: daysEntitled,
            daysCarriedOver: 0,
            daysPending: 0,
            vacationPremiumPaid: false,
            movements: [{
                id: `mov_init_${Date.now()}`,
                date: now,
                type: 'reset',
                days: daysEntitled,
                description: `Balance inicial - Año ${yearsOfService} de servicio`,
            }],
            lastUpdated: now,
            createdAt: now,
        };

        const balanceRef = await addDoc(collection(firestore, 'vacation_balances'), newBalance);

        return { success: true, balance: { id: balanceRef.id, ...newBalance } };
    } catch (error) {
        console.error('[HCM] Error getting vacation balance:', error);
        return { success: false, error: 'Error obteniendo saldo de vacaciones.' };
    }
}

export async function updateVacationBalance(
    employeeId: string,
    days: number,
    type: 'taken' | 'scheduled' | 'cancelled',
    incidenceId?: string,
    approvedById?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Get current balance
        const balanceResult = await getVacationBalance(employeeId);
        if (!balanceResult.success || !balanceResult.balance) {
            return { success: false, error: balanceResult.error };
        }

        const balance = balanceResult.balance;
        const balanceRef = doc(firestore, 'vacation_balances', balance.id);

        // Calculate new values
        let newDaysTaken = balance.daysTaken;
        let newDaysScheduled = balance.daysScheduled;

        const movement: VacationMovement = {
            id: `mov_${Date.now()}`,
            date: now,
            type,
            days: type === 'cancelled' ? -days : days,
            description: type === 'taken' ? 'Vacaciones tomadas' :
                type === 'scheduled' ? 'Vacaciones programadas' : 'Vacaciones canceladas',
            incidenceId,
            approvedById,
        };

        switch (type) {
            case 'taken':
                newDaysTaken += days;
                if (balance.daysScheduled >= days) newDaysScheduled -= days;
                break;
            case 'scheduled':
                newDaysScheduled += days;
                break;
            case 'cancelled':
                if (balance.daysTaken >= days) newDaysTaken -= days;
                else if (balance.daysScheduled >= days) newDaysScheduled -= days;
                break;
        }

        const newDaysAvailable = balance.daysEntitled - newDaysTaken - newDaysScheduled;

        await updateDoc(balanceRef, {
            daysTaken: newDaysTaken,
            daysScheduled: newDaysScheduled,
            daysAvailable: Math.max(0, newDaysAvailable),
            movements: [...balance.movements, movement].slice(-100),
            lastUpdated: now,
        });

        console.log(`[HCM] Updated vacation balance for ${employeeId}: ${type} ${days} days`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating vacation balance:', error);
        return { success: false, error: 'Error actualizando saldo de vacaciones.' };
    }
}

/**
 * Renueva el saldo de vacaciones en el aniversario del empleado
 *
 * Características:
 * - Calcula nuevos días según antigüedad LFT 2023
 * - Arrastra días no tomados del período anterior (carry-over)
 * - Aplica límite de arrastre si está configurado en la ubicación
 * - Crea registro de movimientos para auditoría
 *
 * @param employeeId - ID del empleado
 * @param forceRenewal - Si es true, permite renovación aunque no sea aniversario (para correcciones)
 */
export async function resetVacationBalanceOnAnniversary(
    employeeId: string,
    forceRenewal: boolean = false
): Promise<{ success: boolean; newBalance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // 1. Obtener datos del empleado
        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) return { success: false, error: 'Empleado no encontrado.' };

        const employee = employeeSnap.data() as Employee;

        // 2. Validar fecha de aniversario (a menos que sea forzado)
        if (!forceRenewal && !isAnniversaryDate(employee.hireDate)) {
            return { success: false, error: 'No es fecha de aniversario.' };
        }

        // 3. Calcular nuevos valores según LFT
        const yearsOfService = calculateYearsOfService(employee.hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const nextAnniversary = getNextAnniversaryDate(employee.hireDate);

        // 4. Obtener balance actual para carry-over
        const balancesQuery = query(
            collection(firestore, 'vacation_balances'),
            where('employeeId', '==', employeeId),
            orderBy('periodEnd', 'desc'),
            limit(1)
        );
        const balancesSnap = await getDocs(balancesQuery);

        let daysCarriedOver = 0;
        let maxCarryOverDays: number | undefined;

        // 5. Obtener límite de carry-over de la ubicación
        if (employee.locationId) {
            const locationRef = doc(firestore, 'locations', employee.locationId);
            const locationSnap = await getDoc(locationRef);
            if (locationSnap.exists()) {
                const locationData = locationSnap.data();
                maxCarryOverDays = locationData?.maxVacationCarryOverDays;
            }
        }

        // 6. Calcular días a arrastrar
        if (!balancesSnap.empty) {
            const currentBalance = balancesSnap.docs[0].data() as VacationBalance;
            const unusedDays = currentBalance.daysAvailable;

            // Aplicar límite si existe
            if (maxCarryOverDays !== undefined && maxCarryOverDays >= 0) {
                daysCarriedOver = Math.min(unusedDays, maxCarryOverDays);
            } else {
                // Sin límite, arrastrar todos (según LFT, no prescriben hasta 18 meses)
                daysCarriedOver = Math.max(0, unusedDays);
            }

            console.log(`[HCM] Carry-over for ${employeeId}: ${daysCarriedOver} days (had ${unusedDays} unused)`);
        }

        // 7. Crear movimientos de auditoría
        const movements: VacationMovement[] = [{
            id: `mov_reset_${Date.now()}`,
            date: now,
            type: 'reset',
            days: daysEntitled,
            description: `Renovación aniversario año ${yearsOfService}. Días nuevos: ${daysEntitled}.`,
        }];

        if (daysCarriedOver > 0) {
            movements.push({
                id: `mov_carryover_${Date.now()}`,
                date: now,
                type: 'adjustment',
                days: daysCarriedOver,
                description: `Días arrastrados del período anterior (${maxCarryOverDays !== undefined ? `límite: ${maxCarryOverDays}` : 'sin límite'})`,
            });
        }

        // 8. Calcular total disponible
        const totalAvailable = daysEntitled + daysCarriedOver;

        // 9. Crear nuevo balance
        const newBalance: Omit<VacationBalance, 'id'> = {
            employeeId,
            periodStart: now,
            periodEnd: nextAnniversary.toISOString(),
            daysEntitled,
            yearsOfService,
            daysTaken: 0,
            daysScheduled: 0,
            daysAvailable: totalAvailable,
            daysCarriedOver,
            maxCarryOverDays,
            daysPending: 0,
            vacationPremiumPaid: false,
            movements,
            lastUpdated: now,
            createdAt: now,
        };

        const balanceRef = await addDoc(collection(firestore, 'vacation_balances'), newBalance);

        console.log(`[HCM] Vacation balance renewed for ${employeeId}: ${totalAvailable} days (${daysEntitled} new + ${daysCarriedOver} carry-over)`);

        return { success: true, newBalance: { id: balanceRef.id, ...newBalance } };
    } catch (error) {
        console.error('[HCM] Error resetting vacation balance:', error);
        return { success: false, error: 'Error reseteando saldo de vacaciones.' };
    }
}

/**
 * Ajusta manualmente el saldo de vacaciones de un empleado
 *
 * Casos de uso:
 * - Corrección de errores administrativos
 * - Carga inicial de saldos al migrar de otro sistema
 * - Ajustes por políticas especiales de la empresa
 *
 * @param employeeId - ID del empleado
 * @param adjustmentDays - Días a ajustar (positivo = agregar, negativo = quitar)
 * @param reason - Motivo del ajuste (obligatorio, mínimo 10 caracteres)
 * @param adjustedById - ID del usuario que realiza el ajuste
 * @param adjustedByName - Nombre del usuario que realiza el ajuste
 */
export async function adjustVacationBalance(
    employeeId: string,
    adjustmentDays: number,
    reason: string,
    adjustedById: string,
    adjustedByName: string
): Promise<{ success: boolean; newBalance?: VacationBalance; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Validaciones
        if (!reason || reason.trim().length < 10) {
            return { success: false, error: 'El motivo debe tener al menos 10 caracteres.' };
        }

        if (adjustmentDays === 0) {
            return { success: false, error: 'El ajuste debe ser diferente de cero.' };
        }

        // Validar límite razonable (±365 días)
        if (Math.abs(adjustmentDays) > 365) {
            return { success: false, error: 'El ajuste no puede exceder ±365 días.' };
        }

        // Obtener empleado
        const employeeRef = doc(firestore, 'employees', employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;

        // Obtener o crear balance actual
        const balanceResult = await getVacationBalance(employeeId);
        if (!balanceResult.success || !balanceResult.balance) {
            return { success: false, error: balanceResult.error };
        }

        const currentBalance = balanceResult.balance;
        const balanceRef = doc(firestore, 'vacation_balances', currentBalance.id);

        // Calcular nuevos valores
        const newDaysEntitled = currentBalance.daysEntitled + adjustmentDays;
        const newDaysAvailable = newDaysEntitled - currentBalance.daysTaken - currentBalance.daysScheduled;

        // Validar que no resulte en saldo negativo
        if (newDaysAvailable < 0) {
            return {
                success: false,
                error: `El ajuste resultaría en un saldo negativo (${newDaysAvailable} días). Ajuste máximo permitido: ${currentBalance.daysAvailable} días.`
            };
        }

        // Crear movimiento de ajuste
        const movement: VacationMovement = {
            id: `mov_adj_${Date.now()}`,
            date: now,
            type: 'adjustment',
            days: adjustmentDays,
            description: `Ajuste manual: ${reason.trim()}`,
            approvedById: adjustedById,
        };

        // Actualizar balance
        await updateDoc(balanceRef, {
            daysEntitled: newDaysEntitled,
            daysAvailable: newDaysAvailable,
            movements: [...currentBalance.movements, movement].slice(-100),
            lastUpdated: now,
        });

        // Registrar en auditoría
        await addDoc(collection(firestore, 'vacation_adjustments'), {
            employeeId,
            employeeName: employee.fullName || employeeId,
            adjustmentDays,
            previousBalance: currentBalance.daysAvailable,
            newBalance: newDaysAvailable,
            reason: reason.trim(),
            adjustedById,
            adjustedByName,
            adjustedAt: now,
        });

        // Crear notificación para el empleado
        await createNotification(firestore, employeeId, {
            title: 'Ajuste de Saldo de Vacaciones',
            message: `Tu saldo de vacaciones ha sido ${adjustmentDays > 0 ? 'incrementado' : 'reducido'} en ${Math.abs(adjustmentDays)} días. Nuevo saldo: ${newDaysAvailable} días.`,
            type: 'info',
            link: '/hcm',
        });

        console.log(`[HCM] Adjusted vacation balance for ${employeeId}: ${adjustmentDays > 0 ? '+' : ''}${adjustmentDays} days`);

        const updatedBalance: VacationBalance = {
            ...currentBalance,
            daysEntitled: newDaysEntitled,
            daysAvailable: newDaysAvailable,
            movements: [...currentBalance.movements, movement].slice(-100),
            lastUpdated: now,
        };

        return { success: true, newBalance: updatedBalance };
    } catch (error) {
        console.error('[HCM] Error adjusting vacation balance:', error);
        return { success: false, error: 'Error al ajustar el saldo de vacaciones.' };
    }
}

/**
 * Carga masiva de saldos de vacaciones
 *
 * Útil para:
 * - Migración inicial desde otro sistema
 * - Carga de saldos históricos
 * - Correcciones masivas por auditoría
 *
 * @param balances - Array de saldos a cargar
 * @param loadedById - ID del usuario que realiza la carga
 * @param loadedByName - Nombre del usuario que realiza la carga
 */
export async function bulkLoadVacationBalances(
    balances: VacationBalanceLoad[],
    loadedById: string,
    loadedByName: string
): Promise<{
    success: boolean;
    successCount: number;
    errorCount: number;
    errors: Array<{ employeeId: string; error: string }>
}> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        let successCount = 0;
        const errors: Array<{ employeeId: string; error: string }> = [];

        // Validar límite de registros
        if (balances.length > 500) {
            return {
                success: false,
                successCount: 0,
                errorCount: 1,
                errors: [{ employeeId: 'GLOBAL', error: 'Máximo 500 registros por lote.' }],
            };
        }

        // Procesar cada balance
        for (const balanceLoad of balances) {
            try {
                // Convertir explícitamente a string y limpiar espacios, previene errores si el Excel lo lee como número
                if (balanceLoad.employeeId !== undefined && balanceLoad.employeeId !== null) {
                    balanceLoad.employeeId = String(balanceLoad.employeeId).trim();
                }

                // Validaciones básicas
                if (!balanceLoad.employeeId) {
                    errors.push({ employeeId: 'UNKNOWN', error: 'ID de empleado vacío.' });
                    continue;
                }

                if (!balanceLoad.reason || balanceLoad.reason.trim().length < 10) {
                    errors.push({ employeeId: balanceLoad.employeeId, error: 'Motivo debe tener al menos 10 caracteres.' });
                    continue;
                }

                if (balanceLoad.daysEntitled < 0) {
                    errors.push({ employeeId: balanceLoad.employeeId, error: 'Días otorgados no puede ser negativo.' });
                    continue;
                }

                const daysTaken = balanceLoad.daysTaken || 0;
                const daysScheduled = balanceLoad.daysScheduled || 0;

                if (daysTaken < 0 || daysScheduled < 0) {
                    errors.push({ employeeId: balanceLoad.employeeId, error: 'Días tomados/programados no pueden ser negativos.' });
                    continue;
                }

                // Buscar empleado por número de NomiPAQ (campo employeeId), NO por document ID
                // Firestore es estricto con tipos: "72529" (string) != 72529 (number)
                // Intentamos primero como string, luego como número
                let employeeSnap = await getDocs(query(
                    collection(firestore, 'employees'),
                    where('employeeId', '==', balanceLoad.employeeId),
                    limit(1)
                ));

                // Si no se encontró como string, intentar como número
                if (employeeSnap.empty && !isNaN(Number(balanceLoad.employeeId))) {
                    employeeSnap = await getDocs(query(
                        collection(firestore, 'employees'),
                        where('employeeId', '==', Number(balanceLoad.employeeId)),
                        limit(1)
                    ));
                }

                if (employeeSnap.empty) {
                    errors.push({ employeeId: balanceLoad.employeeId, error: 'Empleado no encontrado.' });
                    continue;
                }

                const employeeDoc = employeeSnap.docs[0];
                const firestoreEmployeeId = employeeDoc.id; // ID real del documento en Firestore
                const employee = employeeDoc.data() as Employee;

                // Calcular días disponibles
                const daysAvailable = balanceLoad.daysEntitled - daysTaken - daysScheduled;

                if (daysAvailable < 0) {
                    errors.push({
                        employeeId: balanceLoad.employeeId,
                        error: `Días disponibles resultantes serían negativos (${daysAvailable}).`
                    });
                    continue;
                }

                // Verificar si ya existe un balance
                const existingBalanceQuery = query(
                    collection(firestore, 'vacation_balances'),
                    where('employeeId', '==', firestoreEmployeeId),
                    orderBy('periodStart', 'desc'),
                    limit(1)
                );
                const existingBalanceSnap = await getDocs(existingBalanceQuery);

                const yearsOfService = calculateYearsOfService(employee.hireDate);
                const nextAnniversary = getNextAnniversaryDate(employee.hireDate);

                const movement: VacationMovement = {
                    id: `mov_load_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    date: now,
                    type: 'adjustment',
                    days: balanceLoad.daysEntitled,
                    description: `Carga inicial: ${balanceLoad.reason.trim()}`,
                    approvedById: loadedById,
                };

                if (!existingBalanceSnap.empty) {
                    // Actualizar balance existente
                    const existingBalance = existingBalanceSnap.docs[0];
                    const balanceData = existingBalance.data() as VacationBalance;

                    await updateDoc(doc(firestore, 'vacation_balances', existingBalance.id), {
                        daysEntitled: balanceLoad.daysEntitled,
                        daysTaken,
                        daysScheduled,
                        daysAvailable,
                        movements: [...balanceData.movements, movement].slice(-100),
                        lastUpdated: now,
                    });
                } else {
                    // Crear nuevo balance
                    const newBalance: Omit<VacationBalance, 'id'> = {
                        employeeId: firestoreEmployeeId,
                        periodStart: employee.hireDate,
                        periodEnd: nextAnniversary.toISOString(),
                        daysEntitled: balanceLoad.daysEntitled,
                        yearsOfService,
                        daysTaken,
                        daysScheduled,
                        daysAvailable,
                        daysCarriedOver: 0,
                        daysPending: 0,
                        vacationPremiumPaid: false,
                        movements: [movement],
                        lastUpdated: now,
                        createdAt: now,
                    };

                    await addDoc(collection(firestore, 'vacation_balances'), newBalance);
                }

                // Registrar en auditoría
                await addDoc(collection(firestore, 'vacation_adjustments'), {
                    employeeId: firestoreEmployeeId,
                    employeeName: employee.fullName || balanceLoad.employeeId,
                    adjustmentDays: balanceLoad.daysEntitled,
                    previousBalance: 0,
                    newBalance: daysAvailable,
                    reason: `Carga masiva: ${balanceLoad.reason.trim()}`,
                    adjustedById: loadedById,
                    adjustedByName: loadedByName,
                    adjustedAt: now,
                });

                successCount++;
            } catch (error) {
                console.error(`[HCM] Error loading balance for ${balanceLoad.employeeId}:`, error);
                errors.push({
                    employeeId: balanceLoad.employeeId,
                    error: error instanceof Error ? error.message : 'Error desconocido'
                });
            }
        }

        // Notificar a RH sobre el resultado
        await notifyRole(firestore, 'HRManager', {
            title: 'Carga Masiva de Vacaciones Completada',
            message: `Se procesaron ${balances.length} registros: ${successCount} exitosos, ${errors.length} errores.`,
            type: errors.length > 0 ? 'warning' : 'success',
            link: '/hcm/admin/vacation-management',
        });

        console.log(`[HCM] Bulk load completed: ${successCount} success, ${errors.length} errors`);

        return {
            success: errors.length < balances.length,
            successCount,
            errorCount: errors.length,
            errors,
        };
    } catch (error) {
        console.error('[HCM] Error in bulk load:', error);
        return {
            success: false,
            successCount: 0,
            errorCount: 1,
            errors: [{ employeeId: 'GLOBAL', error: 'Error general en la carga masiva.' }],
        };
    }
}
