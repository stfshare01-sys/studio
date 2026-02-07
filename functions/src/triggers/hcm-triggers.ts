/**
 * HCM Triggers - Cloud Functions
 * 
 * Triggers automáticos para eventos del módulo de Capital Humano.
 */

import { onDocumentCreated, onDocumentUpdated } from 'firebase-functions/v2/firestore';
import * as admin from 'firebase-admin';
import { detectAllInfractions } from '../utils/infraction-detection';
import { notifyManagerAboutInfractions } from '../utils/notification-utils';
import type { AttendanceRecord, Employee, Incidence } from '../types/firestore-types';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * Trigger: Detección automática de infracciones al crear registro de asistencia
 * 
 * Se ejecuta cuando se crea un nuevo documento en la colección 'attendance'.
 * Detecta retardos y salidas tempranas automáticamente.
 */
export const onAttendanceCreated = onDocumentCreated(
    'attendance/{attendanceId}',
    async (event) => {
        const attendance = event.data?.data() as AttendanceRecord;

        if (!attendance) {
            console.error('[HCM Trigger] No attendance data found');
            return;
        }

        try {
            // 1. Obtener datos del empleado
            const employeeDoc = await db.collection('employees')
                .doc(attendance.employeeId)
                .get();

            if (!employeeDoc.exists) {
                console.error(`[HCM Trigger] Employee not found: ${attendance.employeeId}`);
                return;
            }

            const employee = { id: employeeDoc.id, ...employeeDoc.data() } as Employee;

            // 1.5 Obtener tolerancia de la ubicación
            const locationId = employee.locationId || attendance.locationId;
            let toleranceMinutes = 10; // Fallback default

            if (locationId) {
                try {
                    const locationDoc = await db.collection('locations').doc(locationId).get();
                    if (locationDoc.exists) {
                        const location = locationDoc.data();
                        toleranceMinutes = location?.toleranceMinutes || 10;
                        console.log(`[HCM Trigger] Using tolerance ${toleranceMinutes} min from location ${locationId}`);
                    } else {
                        console.warn(`[HCM Trigger] Location ${locationId} not found, using default tolerance: 10 min`);
                    }
                } catch (error) {
                    console.error(`[HCM Trigger] Error fetching location ${locationId}:`, error);
                }
            } else {
                console.warn(`[HCM Trigger] Employee ${employee.id} has no location, using default tolerance: 10 min`);
            }

            // 2. Detectar infracciones con tolerancia dinámica
            const { tardiness, earlyDeparture } = await detectAllInfractions(attendance, employee, toleranceMinutes, db);

            // 3. Crear registros de infracciones
            const batch = db.batch();
            let tardinessId: string | null = null;
            let earlyDepartureId: string | null = null;

            if (tardiness) {
                const tardinessRef = db.collection('tardiness_records').doc();
                tardinessId = tardinessRef.id;
                batch.set(tardinessRef, { ...tardiness, id: tardinessId });
                console.log(`[HCM Trigger] Tardiness detected for ${employee.fullName}: ${tardiness.minutesLate} min`);
            }

            if (earlyDeparture) {
                const departureRef = db.collection('early_departures').doc();
                earlyDepartureId = departureRef.id;
                batch.set(departureRef, { ...earlyDeparture, id: earlyDepartureId });
                console.log(`[HCM Trigger] Early departure detected for ${employee.fullName}: ${earlyDeparture.minutesEarly} min`);
            }

            // Commit batch
            if (tardinessId || earlyDepartureId) {
                await batch.commit();
                console.log(`[HCM Trigger] Infractions created for ${employee.fullName} on ${attendance.date}`);

                // Notificar al jefe sobre las infracciones
                if (tardinessId) {
                    await notifyManagerAboutInfractions(
                        db,
                        employee.id,
                        employee.fullName,
                        'tardiness',
                        attendance.date
                    );
                }

                if (earlyDepartureId) {
                    await notifyManagerAboutInfractions(
                        db,
                        employee.id,
                        employee.fullName,
                        'early_departure',
                        attendance.date
                    );
                }
            } else {
                console.log(`[HCM Trigger] No infractions detected for ${employee.fullName} on ${attendance.date}`);
            }

        } catch (error) {
            console.error('[HCM Trigger] Error processing attendance:', error);
        }
    }
);

/**
 * Trigger: On Incidence Updated
 *
 * Handles side-effects when an incidence status changes.
 *
 * NOTE: Para vacaciones, la actualización del saldo ahora se hace de forma
 * transaccional en approveIncidence(). Este trigger solo se activa como
 * fallback para incidencias creadas antes de la implementación transaccional,
 * o para otros tipos de incidencias que requieran procesamiento adicional.
 */
export const onIncidenceUpdate = onDocumentUpdated('incidences/{incidenceId}', async (event) => {
    const before = event.data?.before.data() as Incidence | undefined;
    const after = event.data?.after.data() as Incidence | undefined;

    if (!before || !after) return;

    // Check for status change to APPROVED
    if (before.status !== 'approved' && after.status === 'approved') {
        const employeeId = after.employeeId;
        const days = after.totalDays;

        if (after.type === 'vacation') {
            // Solo procesar como fallback si no se actualizó transaccionalmente
            await handleVacationApprovalFallback(employeeId, days, event.params.incidenceId);
        }
    }
});

/**
 * Fallback para actualizar saldo de vacaciones
 *
 * Esta función verifica si el movimiento ya fue registrado por la
 * transacción en approveIncidence() para evitar duplicar la deducción.
 */
async function handleVacationApprovalFallback(
    employeeId: string,
    days: number,
    incidenceId: string
) {
    try {
        console.log(`[Trigger Fallback] Checking vacation approval for ${employeeId}: ${days} days`);

        const balanceQuery = db.collection('vacation_balances')
            .where('employeeId', '==', employeeId)
            .orderBy('periodEnd', 'desc')
            .limit(1);

        const balanceSnap = await balanceQuery.get();

        if (balanceSnap.empty) {
            console.warn(`[Trigger Fallback] No vacation balance found for employee ${employeeId}`);
            return;
        }

        const balanceDoc = balanceSnap.docs[0];
        const balanceData = balanceDoc.data();
        const movements = balanceData.movements || [];

        // Check if movement already exists (fue procesado transaccionalmente)
        const movementExists = movements.some(
            (m: { incidenceId?: string }) => m.incidenceId === incidenceId
        );

        if (movementExists) {
            console.log(`[Trigger Fallback] Movement already recorded for incidence ${incidenceId}, skipping duplicate`);
            return;
        }

        // Fallback: procesar si no existe el movimiento (incidencias legacy)
        console.log(`[Trigger Fallback] Processing legacy incidence ${incidenceId}`);

        const currentTaken = balanceData.daysTaken || 0;
        const currentAvailable = balanceData.daysAvailable || 0;

        // Create movement for audit
        const newMovement = {
            id: `mov_taken_fallback_${Date.now()}`,
            date: new Date().toISOString(),
            type: 'taken',
            days: -days,
            description: `Vacaciones aprobadas (fallback): ${incidenceId}`,
            incidenceId: incidenceId,
        };

        await balanceDoc.ref.update({
            daysTaken: currentTaken + days,
            daysAvailable: currentAvailable - days,
            movements: [...movements, newMovement].slice(-100),
            lastUpdated: new Date().toISOString()
        });

        console.log(`[Trigger Fallback] Updated vacation balance for ${employeeId}. New available: ${currentAvailable - days}`);

    } catch (error) {
        console.error('[Trigger Fallback] Error updating vacation balance:', error);
    }
}
