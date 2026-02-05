/**
 * Infraction Detection Utilities
 * 
 * Detecta automáticamente retardos y salidas tempranas basándose en
 * los horarios configurados del empleado y políticas de tolerancia.
 * 
 * Basado en análisis de flujo de asistencia - NotebookLM
 */

import type { AttendanceRecord, Employee, TardinessRecord, EarlyDeparture } from '../types/firestore-types';
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
export async function getEmployeeSchedule(employee: Employee): Promise<EmployeeSchedule> {
    // TODO: Implementar carga dinámica desde configuración de turnos
    // Por ahora usamos horarios por defecto según tipo de turno

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
                startTime: ATTENDANCE_POLICY.defaultStartTime,
                endTime: ATTENDANCE_POLICY.defaultEndTime,
                breakMinutes: ATTENDANCE_POLICY.defaultBreakMinutes
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

    const schedule = await getEmployeeSchedule(employee);
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

    const schedule = await getEmployeeSchedule(employee);
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

    // Aplicar tolerancia dinámica (diferencia es negativa, por eso usamos Math.abs)
    const minutesEarly = Math.abs(minutesDifference) - toleranceMinutes;

    if (minutesEarly <= 0) {
        return null; // Dentro de tolerancia
    }

    const nowISO = new Date().toISOString();

    return {
        employeeId: employee.id,
        employeeName: employee.fullName,
        date: attendance.date,
        scheduledTime: schedule.endTime,
        actualTime: attendance.checkOut,
        minutesEarly,
        isJustified: false,
        justificationStatus: 'pending',
        createdAt: nowISO,
        updatedAt: nowISO
    };
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
