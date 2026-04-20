/**
 * Vacation Renewal Scheduler
 *
 * Cloud Function que se ejecuta diariamente para renovar automáticamente
 * los saldos de vacaciones de empleados en su fecha de aniversario.
 *
 * Características:
 * - Detecta empleados cuyo aniversario es HOY
 * - Calcula nuevos días según antigüedad (LFT 2023)
 * - Arrastra días no tomados del período anterior (carry-over)
 * - Aplica límite de arrastre si está configurado
 * - Crea registro de movimiento para auditoría
 * - Notifica al empleado sobre sus nuevos días
 */

import { onSchedule } from 'firebase-functions/v2/scheduler';
import * as admin from 'firebase-admin';
import type { VacationBalance, VacationMovement } from '../types/firestore-types';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Calcula días de vacaciones según antigüedad (Art. 76 LFT - Reforma 2023)
 */
function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;

    // Primeros 5 años: 12 días base + 2 por cada año adicional
    if (yearsOfService <= 5) {
        return 12 + ((yearsOfService - 1) * 2);
    }

    // Años 6-10: continúa +2 por año
    if (yearsOfService <= 10) {
        return 20 + ((yearsOfService - 5) * 2);
    }

    // Año 11-15: 32 días
    if (yearsOfService <= 15) {
        return 32;
    }

    // Año 16-20: 34 días
    if (yearsOfService <= 20) {
        return 34;
    }

    // Año 21-25: 36 días
    if (yearsOfService <= 25) {
        return 36;
    }

    // Año 26-30: 38 días
    if (yearsOfService <= 30) {
        return 38;
    }

    // Año 31+: 40 días (máximo)
    return 40;
}

/**
 * Calcula años de antigüedad a partir de fecha de ingreso
 */
function calculateYearsOfService(hireDate: string, asOfDate: Date = new Date()): number {
    const hire = new Date(hireDate);
    let years = asOfDate.getFullYear() - hire.getFullYear();

    const monthDiff = asOfDate.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && asOfDate.getDate() < hire.getDate())) {
        years--;
    }

    return Math.max(0, years);
}

/**
 * Verifica si hoy es la fecha de aniversario del empleado
 */
function isAnniversaryToday(hireDate: string): boolean {
    const hire = new Date(hireDate);
    const today = new Date();
    return (
        hire.getMonth() === today.getMonth() &&
        hire.getDate() === today.getDate()
    );
}

/**
 * Calcula la fecha del próximo aniversario
 */
function getNextAnniversaryDate(hireDate: string): Date {
    const hire = new Date(hireDate);
    const today = new Date();
    const nextAnniversary = new Date(today.getFullYear() + 1, hire.getMonth(), hire.getDate());
    return nextAnniversary;
}

/**
 * Obtiene el balance actual de vacaciones del empleado
 */
async function getCurrentVacationBalance(employeeId: string): Promise<VacationBalance | null> {
    const balanceQuery = db.collection('vacation_balances')
        .where('employeeId', '==', employeeId)
        .orderBy('periodEnd', 'desc')
        .limit(1);

    const snapshot = await balanceQuery.get();

    if (snapshot.empty) {
        return null;
    }

    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as VacationBalance;
}

/**
 * Renueva el saldo de vacaciones para un empleado
 */
async function renewVacationBalance(
    employeeId: string,
    employeeName: string,
    hireDate: string,
    maxCarryOverDays?: number
): Promise<{ success: boolean; newBalance?: VacationBalance; error?: string }> {
    const now = new Date().toISOString();

    try {
        // 1. Calcular nuevos valores
        const yearsOfService = calculateYearsOfService(hireDate);
        const daysEntitled = calculateVacationDays(yearsOfService);
        const nextAnniversary = getNextAnniversaryDate(hireDate);

        // 2. Obtener balance actual para carry-over
        const currentBalance = await getCurrentVacationBalance(employeeId);
        let daysCarriedOver = 0;

        if (currentBalance) {
            // Calcular días no tomados del período anterior
            const unusedDays = currentBalance.daysAvailable;

            // Aplicar límite de carry-over si existe
            if (maxCarryOverDays !== undefined && maxCarryOverDays > 0) {
                daysCarriedOver = Math.min(unusedDays, maxCarryOverDays);
            } else {
                // Default: NO arrastrar días. Los días no tomados se pierden.
                // Para habilitar arrastre, configurar maxVacationCarryOverDays en la ubicación.
                daysCarriedOver = 0;
            }

            console.log(`[Vacation Renewal] Employee ${employeeId}: Carrying over ${daysCarriedOver} days (had ${unusedDays} unused)`);
        }

        // 3. Crear movimiento de auditoría
        const movements: VacationMovement[] = [{
            id: `mov_reset_${Date.now()}`,
            date: now,
            type: 'reset',
            days: daysEntitled,
            description: `Renovación aniversario año ${yearsOfService}. Días nuevos: ${daysEntitled}. Arrastre: ${daysCarriedOver}.`,
        }];

        // Si hay carry-over, agregar movimiento adicional
        if (daysCarriedOver > 0) {
            movements.push({
                id: `mov_carryover_${Date.now()}`,
                date: now,
                type: 'adjustment',
                days: daysCarriedOver,
                description: `Días arrastrados del período anterior`,
            });
        }

        // 4. Crear nuevo balance
        const totalAvailable = daysEntitled + daysCarriedOver;

        const newBalanceData: Omit<VacationBalance, 'id'> = {
            employeeId,
            periodStart: now,
            periodEnd: nextAnniversary.toISOString(),
            daysEntitled,
            yearsOfService,
            daysTaken: 0,
            daysScheduled: 0,
            daysAvailable: totalAvailable,
            daysCarriedOver,
            maxCarryOverDays: maxCarryOverDays ?? 0,
            daysPending: 0,
            vacationPremiumPaid: false,
            movements,
            lastUpdated: now,
            createdAt: now,
        };

        // 5. Guardar en Firestore
        const balanceRef = await db.collection('vacation_balances').add(newBalanceData);

        console.log(`[Vacation Renewal] Created new balance for ${employeeName} (${employeeId}): ${totalAvailable} days available (${daysEntitled} new + ${daysCarriedOver} carry-over)`);

        // 6. Crear notificación para el empleado
        await createRenewalNotification(employeeId, employeeName, daysEntitled, daysCarriedOver, yearsOfService);

        return {
            success: true,
            newBalance: { id: balanceRef.id, ...newBalanceData } as VacationBalance
        };

    } catch (error) {
        console.error(`[Vacation Renewal] Error renewing balance for ${employeeId}:`, error);
        return { success: false, error: String(error) };
    }
}

/**
 * Crea notificación para el empleado sobre renovación de vacaciones
 */
async function createRenewalNotification(
    employeeId: string,
    employeeName: string,
    daysEntitled: number,
    daysCarriedOver: number,
    yearsOfService: number
): Promise<void> {
    try {
        const totalDays = daysEntitled + daysCarriedOver;
        const carryOverMessage = daysCarriedOver > 0
            ? ` Además, se arrastran ${daysCarriedOver} días del período anterior.`
            : '';

        const notification = {
            userId: employeeId,
            title: '🎉 Renovación de Vacaciones',
            message: `¡Felicidades por tu aniversario ${yearsOfService}! Tienes ${daysEntitled} nuevos días de vacaciones.${carryOverMessage} Total disponible: ${totalDays} días.`,
            type: 'vacation_renewal',
            isRead: false,
            createdAt: new Date().toISOString(),
            metadata: {
                yearsOfService,
                daysEntitled,
                daysCarriedOver,
                totalAvailable: totalDays
            }
        };

        await db.collection('users').doc(employeeId).collection('notifications').add(notification);

        console.log(`[Vacation Renewal] Notification sent to ${employeeName}`);
    } catch (error) {
        console.error(`[Vacation Renewal] Error creating notification:`, error);
        // No lanzar error para no interrumpir el proceso principal
    }
}

/**
 * Cloud Scheduler - Renovación diaria de vacaciones
 *
 * Se ejecuta diariamente a las 3:00 AM (hora de México)
 * Busca empleados cuyo aniversario es HOY y renueva sus saldos
 */
export const renewVacationBalancesDaily = onSchedule(
    {
        schedule: '0 3 * * *',  // Cron: 3:00 AM todos los días
        timeZone: 'America/Mexico_City',
        retryCount: 3,
        memory: '256MiB',
    },
    async () => {
        console.log('[Vacation Renewal] Starting daily vacation renewal check...');

        try {
            // Obtener todos los empleados activos
            const employeesSnapshot = await db.collection('employees')
                .where('status', '==', 'active')
                .get();

            if (employeesSnapshot.empty) {
                console.log('[Vacation Renewal] No active employees found');
                return;
            }

            console.log(`[Vacation Renewal] Checking ${employeesSnapshot.size} active employees`);

            let renewedCount = 0;
            let errorCount = 0;

            for (const employeeDoc of employeesSnapshot.docs) {
                const employee = employeeDoc.data();
                const employeeId = employeeDoc.id;

                if (!employee.hireDate) {
                    console.warn(`[Vacation Renewal] Employee ${employeeId} has no hireDate, skipping`);
                    continue;
                }

                // Verificar si hoy es su aniversario
                if (isAnniversaryToday(employee.hireDate)) {
                    console.log(`[Vacation Renewal] 🎂 Anniversary today for ${employee.fullName} (${employeeId})`);

                    // Obtener configuración de carry-over de la ubicación o empresa
                    let maxCarryOverDays: number | undefined;

                    if (employee.locationId) {
                        const locationDoc = await db.collection('locations').doc(employee.locationId).get();
                        if (locationDoc.exists) {
                            const locationData = locationDoc.data();
                            maxCarryOverDays = locationData?.maxVacationCarryOverDays;
                        }
                    }

                    // Renovar saldo de vacaciones
                    const result = await renewVacationBalance(
                        employeeId,
                        employee.fullName || 'Unknown',
                        employee.hireDate,
                        maxCarryOverDays
                    );

                    if (result.success) {
                        renewedCount++;
                    } else {
                        errorCount++;
                        console.error(`[Vacation Renewal] Failed to renew for ${employeeId}: ${result.error}`);
                    }
                }
            }

            console.log(`[Vacation Renewal] Completed. Renewed: ${renewedCount}, Errors: ${errorCount}`);

        } catch (error) {
            console.error('[Vacation Renewal] Fatal error in scheduler:', error);
            throw error; // Re-throw para que Firebase registre el error
        }
    }
);

/**
 * Función auxiliar para renovación manual (callable desde admin)
 * Útil para corregir o forzar renovaciones
 */
export async function manualVacationRenewal(
    employeeId: string
): Promise<{ success: boolean; message: string }> {
    try {
        const employeeDoc = await db.collection('employees').doc(employeeId).get();

        if (!employeeDoc.exists) {
            return { success: false, message: 'Empleado no encontrado' };
        }

        const employee = employeeDoc.data()!;

        if (!employee.hireDate) {
            return { success: false, message: 'El empleado no tiene fecha de ingreso' };
        }

        // Obtener configuración de carry-over
        let maxCarryOverDays: number | undefined;
        if (employee.locationId) {
            const locationDoc = await db.collection('locations').doc(employee.locationId).get();
            if (locationDoc.exists) {
                maxCarryOverDays = locationDoc.data()?.maxVacationCarryOverDays;
            }
        }

        const result = await renewVacationBalance(
            employeeId,
            employee.fullName || 'Unknown',
            employee.hireDate,
            maxCarryOverDays
        );

        if (result.success) {
            return {
                success: true,
                message: `Vacaciones renovadas. Nuevo saldo: ${result.newBalance?.daysAvailable} días`
            };
        } else {
            return { success: false, message: result.error || 'Error desconocido' };
        }

    } catch (error) {
        console.error('[Manual Renewal] Error:', error);
        return { success: false, message: String(error) };
    }
}
