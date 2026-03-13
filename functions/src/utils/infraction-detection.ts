/**
 * Infraction Detection Utilities
 * 
 * Detecta automáticamente retardos y salidas tempranas basándose en
 * los horarios configurados del empleado y políticas de tolerancia.
 * 
 * Basado en análisis de flujo de asistencia - NotebookLM
 */

import type { AttendanceRecord, Employee, TardinessRecord, EarlyDeparture, Shift } from '../types/firestore-types';
import * as admin from 'firebase-admin';

/**
 * Configuración de políticas de asistencia
 */
const ATTENDANCE_POLICY = {
    tardinessToleranceMinutes: 10,
    earlyDepartureToleranceMinutes: 10,
    defaultStartTime: '09:00:00',
    defaultEndTime: '18:00:00',
    defaultBreakMinutes: 60
};

/**
 * Verifica si una fecha es día de beneficio empresa
 */
async function isCompanyBenefitDay(
    db: admin.firestore.Firestore,
    date: string,
    locationId?: string
): Promise<boolean> {
    if (!locationId) return false;

    try {
        const locationDoc = await db.collection('locations').doc(locationId).get();
        if (!locationDoc.exists) return false;

        const location = locationDoc.data();
        const benefitDays: string[] = location?.companyBenefitDays || [];

        // Formato de fecha del registro: YYYY-MM-DD (ISO 8601 Date part)
        // Se asume date viene como string YYYY-MM-DDT... o YYYY-MM-DD
        const dateObj = new Date(date);
        // Ajustar zona horaria si es necesario, pero asumiendo ISO string y comparación simple día/mes
        // Usamos UTC para consistency si las fechas vienen en ISO UTC
        const month = (dateObj.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = dateObj.getUTCDate().toString().padStart(2, '0');
        const monthDay = `${month}-${day}`;

        return benefitDays.includes(monthDay);
    } catch (error) {
        console.error(`[Infraction] Error checking benefit day:`, error);
        return false;
    }
}

/**
 * Verifica si una fecha es día de descanso según el turno del empleado
 * y si el empleado genera horas extra (desde su puesto).
 * Retorna true si la infracción debe OMITIRSE.
 */
async function shouldSkipInfractionForRestDay(
    employee: Employee,
    dateStr: string,
    db: admin.firestore.Firestore
): Promise<boolean> {
    // 1. Determinar el shiftId activo
    let shiftId = employee.customShiftId;

    // Buscar asignaciones activas en la colección shift_assignments
    if (shiftId) {
        try {
            const assignmentQuery = await db.collection('shift_assignments')
                .where('employeeId', '==', employee.id)
                .where('status', '==', 'active')
                .get();

            for (const aDoc of assignmentQuery.docs) {
                const sa = aDoc.data();
                if (sa.startDate <= dateStr && (!sa.endDate || sa.endDate >= dateStr)) {
                    shiftId = sa.newShiftId as string;
                    break;
                }
            }
        } catch (err) {
            console.warn('[Infraction] Error querying shift_assignments:', err);
        }
    }

    // 2. Obtener workDays / restDays del turno
    let workDays: number[] = [];
    let restDays: number[] = [];

    if (shiftId) {
        try {
            const shiftDoc = await db.collection('shifts').doc(shiftId).get();
            if (shiftDoc.exists) {
                const sData = shiftDoc.data()!;
                workDays = sData.workDays || [];
                restDays = sData.restDays || [];

                // Fallback: derivar de daySchedules si workDays está vacío
                if (workDays.length === 0 && sData.daySchedules && Object.keys(sData.daySchedules).length > 0) {
                    workDays = Object.keys(sData.daySchedules).map(Number);
                    restDays = [0, 1, 2, 3, 4, 5, 6].filter(d => !workDays.includes(d));
                }
            }
        } catch (err) {
            console.warn('[Infraction] Error fetching shift for rest day check:', err);
        }
    }

    // 3. Determinar si es día de descanso
    const [y, m, d] = dateStr.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    const dayOfWeek = localDate.getDay(); // 0=Sun

    let isRestDay = false;
    if (restDays.length > 0 && restDays.includes(dayOfWeek)) {
        isRestDay = true;
    } else if (workDays.length > 0 && !workDays.includes(dayOfWeek)) {
        isRestDay = true;
    }

    if (!isRestDay) return false; // No es descanso, no omitir

    // 4. Verificar si el puesto genera horas extra
    let allowOvertime = true; // Default: sí genera
    if (employee.positionId) {
        try {
            const posDoc = await db.collection('positions').doc(employee.positionId).get();
            if (posDoc.exists) {
                const posData = posDoc.data()!;
                allowOvertime = posData.generatesOvertime ?? posData.canEarnOvertime ?? true;
            }
        } catch (err) {
            console.warn('[Infraction] Error fetching position for overtime check:', err);
        }
    }

    // Si es día de descanso Y NO genera horas extra → omitir infracción
    if (!allowOvertime) {
        console.log(`[Infraction] Skipping infraction on rest day ${dateStr} (dayOfWeek=${dayOfWeek}, allowOvertime=false) for ${employee.fullName}`);
        return true;
    }

    return false;
}

/**
 * Horario de trabajo del empleado
 */
interface EmployeeSchedule {
    startTime: string;
    endTime: string;
    breakMinutes: number;
}

/**
 * Obtiene el horario de trabajo del empleado según su turno
 */
export async function getEmployeeSchedule(
    employee: Employee,
    db: admin.firestore.Firestore,
    dateStr?: string
): Promise<EmployeeSchedule> {
    let startTime = ATTENDANCE_POLICY.defaultStartTime;
    let endTime = ATTENDANCE_POLICY.defaultEndTime;
    let breakMinutes = ATTENDANCE_POLICY.defaultBreakMinutes;

    // 1. Determine active Shift ID directly or via assignments
    let shiftId = employee.customShiftId;

    if (employee.shiftAssignments && employee.shiftAssignments.length > 0 && dateStr) {
        // Find assignment covering dateStr (YYYY-MM-DD)
        const assignment = employee.shiftAssignments.find(sa =>
            sa.startDate <= dateStr && (!sa.endDate || sa.endDate >= dateStr)
        );
        if (assignment) {
            shiftId = assignment.shiftId;
        }
    }

    // 2. Fetch Shift Data if ID exists
    if (shiftId) {
        try {
            const shiftDoc = await db.collection('shifts').doc(shiftId).get();
            if (shiftDoc.exists) {
                const shift = shiftDoc.data() as Shift;
                startTime = shift.startTime;
                endTime = shift.endTime;
                breakMinutes = shift.breakMinutes;

                // 3. Apply Day Schedules if defined
                if (dateStr && shift.daySchedules) {
                    // Calculate day of week properly for YYYY-MM-DD
                    const [y, m, d] = dateStr.split('-').map(Number);
                    const localDate = new Date(y, m - 1, d);
                    const dayOfWeek = localDate.getDay();

                    if (shift.daySchedules[dayOfWeek]) {
                        const daily = shift.daySchedules[dayOfWeek];
                        startTime = daily.startTime;
                        endTime = daily.endTime;
                        breakMinutes = daily.breakMinutes;
                    }
                }

                return { startTime, endTime, breakMinutes };
            }
        } catch (error) {
            console.error(`[Infraction] Error fetching shift ${shiftId}:`, error);
        }
    }

    // Fallback: Default by shiftType
    switch (employee.shiftType) {
        case 'nocturnal':
            return {
                startTime: '22:00:00',
                endTime: '06:00:00',
                breakMinutes: 60
            };
        case 'mixed':
            return {
                startTime: '14:00:00',
                endTime: '22:00:00',
                breakMinutes: 60
            };
        case 'diurnal':
        default:
            return {
                startTime: '09:00:00',
                endTime: '18:00:00',
                breakMinutes: 60
            };
    }
}

/**
 * Parsea una hora en formato HH:mm:ss a minutos desde medianoche
 */
function parseTimeToMinutes(timeStr: string): number {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

/**
 * Calcula la diferencia en minutos entre dos horas
 */
function calculateMinutesDifference(actualTime: string, scheduledTime: string): number {
    const actualMinutes = parseTimeToMinutes(actualTime);
    const scheduledMinutes = parseTimeToMinutes(scheduledTime);

    let diff = actualMinutes - scheduledMinutes;

    // Manejar caso de turnos nocturnos que cruzan medianoche
    if (diff < -12 * 60) {
        diff += 24 * 60;
    } else if (diff > 12 * 60) {
        diff -= 24 * 60;
    }

    return diff;
}

/**
 * Detecta si hay un retardo en el registro de asistencia
 * 
 * @param attendance - Registro de asistencia
 * @param employee - Datos del empleado
 * @returns Registro de retardo si aplica, null si no hay retardo
 */
export async function detectTardiness(
    attendance: AttendanceRecord,
    employee: Employee,
    toleranceMinutes: number,
    db: admin.firestore.Firestore
): Promise<Omit<TardinessRecord, 'id'> | null> {
    // Si no hay hora de entrada, no podemos detectar retardo
    if (!attendance.checkIn) {
        return null;
    }

    // REST DAY CHECK: Skip tardiness on rest days when employee doesn't generate overtime
    if (await shouldSkipInfractionForRestDay(employee, attendance.date, db)) {
        return null;
    }

    // IDEMPOTENCY CHECK: Check if tardiness record already exists for this attendance
    // attendance.id must be populated by the caller
    if (attendance.id) {
        const existingQuery = await db.collection('tardiness_records')
            .where('attendanceRecordId', '==', attendance.id)
            .limit(1)
            .get();

        if (!existingQuery.empty) {
            console.log(`[Infraction] Tardiness record already exists for attendance ${attendance.id}, skipping.`);
            return null;
        }
    }

    const schedule = await getEmployeeSchedule(employee, db, attendance.date);
    const minutesDifference = calculateMinutesDifference(
        attendance.checkIn,
        schedule.startTime
    );

    // Solo es retardo si llegó después de la hora programada
    if (minutesDifference <= 0) {
        return null;
    }

    // Validar si es día de beneficio
    const locationId = employee.locationId || attendance.locationId;
    if (await isCompanyBenefitDay(db, attendance.date, locationId)) {
        console.log(`[Infraction] ${attendance.date} is company benefit day, skipping tardiness detection`);
        return null;
    }

    // Aplicar tolerancia dinámica
    const minutesLate = minutesDifference - toleranceMinutes;

    if (minutesLate <= 0) {
        return null; // Dentro de tolerancia
    }

    const nowISO = new Date().toISOString();

    return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        date: attendance.date,
        attendanceRecordId: attendance.id, // Ensure we link it
        scheduledTime: schedule.startTime,
        actualTime: attendance.checkIn,
        minutesLate,
        isJustified: false,
        justificationStatus: 'pending',
        sanctionApplied: false,
        createdAt: nowISO,
        updatedAt: nowISO
    };
}

/**
 * Detecta si hay una salida temprana en el registro de asistencia
 * 
 * @param attendance - Registro de asistencia
 * @param employee - Datos del empleado
 * @returns Registro de salida temprana si aplica, null si no hay salida temprana
 */
export async function detectEarlyDeparture(
    attendance: AttendanceRecord,
    employee: Employee,
    toleranceMinutes: number,
    db: admin.firestore.Firestore
): Promise<Omit<EarlyDeparture, 'id'> | null> {
    // Si no hay hora de salida, no podemos detectar salida temprana
    if (!attendance.checkOut) {
        return null;
    }

    // REST DAY CHECK: Skip early departure on rest days when employee doesn't generate overtime
    if (await shouldSkipInfractionForRestDay(employee, attendance.date, db)) {
        return null;
    }

    // IDEMPOTENCY CHECK
    if (attendance.id) {
        const existingQuery = await db.collection('early_departures')
            .where('attendanceRecordId', '==', attendance.id)
            .limit(1)
            .get();

        if (!existingQuery.empty) {
            console.log(`[Infraction] Early departure record already exists for attendance ${attendance.id}, skipping.`);
            return null;
        }
    }

    const schedule = await getEmployeeSchedule(employee, db, attendance.date);
    const minutesDifference = calculateMinutesDifference(
        attendance.checkOut,
        schedule.endTime
    );

    // Solo es salida temprana si salió antes de la hora programada
    if (minutesDifference >= 0) {
        return null;
    }

    // Validar si es día de beneficio
    const locationId = employee.locationId || attendance.locationId;
    if (await isCompanyBenefitDay(db, attendance.date, locationId)) {
        console.log(`[Infraction] ${attendance.date} is company benefit day, skipping early departure detection`);
        return null;
    }

    // Aplicar REGLA DE CERO TOLERANCIA (según requerimiento de usuario)
    const minutesEarly = Math.abs(minutesDifference);

    if (minutesEarly <= 0) {
        return null;
    }

    const nowISO = new Date().toISOString();

    // Need to cast because EarlyDeparture type in firestore-types might be missing keys I want to use (attendanceId)
    // I will use 'as any' for extra fields if needed, but prefer to update types.
    return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        date: attendance.date,
        attendanceRecordId: attendance.id,
        scheduledTime: schedule.endTime,
        actualTime: attendance.checkOut,
        minutesEarly,
        isJustified: false,
        justificationStatus: 'pending',
        createdAt: nowISO,
        updatedAt: nowISO
    } as any;
}

/**
 * Procesa un registro de asistencia y detecta todas las infracciones
 * 
 * @param attendance - Registro de asistencia
 * @param employee - Datos del empleado
 * @returns Objeto con retardo y salida temprana detectados
 */
export async function detectAllInfractions(
    attendance: AttendanceRecord,
    employee: Employee,
    toleranceMinutes: number,
    db: admin.firestore.Firestore
): Promise<{
    tardiness: Omit<TardinessRecord, 'id'> | null;
    earlyDeparture: Omit<EarlyDeparture, 'id'> | null;
}> {
    const [tardiness, earlyDeparture] = await Promise.all([
        detectTardiness(attendance, employee, toleranceMinutes, db),
        detectEarlyDeparture(attendance, employee, toleranceMinutes, db)
    ]);

    return { tardiness, earlyDeparture };
}
