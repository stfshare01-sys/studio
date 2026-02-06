/**
 * Funciones Auxiliares para el Script de Seeding
 */

import type { AttendanceRecord } from './seed-types';

// =============================================================================
// GENERACIÓN DE FECHAS
// =============================================================================

/**
 * Genera array de fechas laborables entre dos fechas
 * @param startDate Fecha inicio (YYYY-MM-DD)
 * @param endDate Fecha fin (YYYY-MM-DD)
 * @param workDays Días laborables (0=Domingo, 1=Lunes, ..., 6=Sábado)
 * @returns Array de fechas en formato YYYY-MM-DD
 */
export function generateWorkingDays(
    startDate: string,
    endDate: string,
    workDays: number[] = [1, 2, 3, 4, 5] // Lunes a Viernes por defecto
): string[] {
    const dates: string[] = [];
    const start = new Date(startDate);
    const end = new Date(endDate);

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayOfWeek = d.getDay();
        if (workDays.includes(dayOfWeek)) {
            dates.push(d.toISOString().split('T')[0]);
        }
    }

    return dates;
}

/**
 * Obtiene fecha con offset de días
 * @param offsetDays Número de días a sumar/restar
 * @param baseDate Fecha base (default: hoy)
 * @returns Fecha en formato YYYY-MM-DD
 */
export function getDateWithOffset(offsetDays: number, baseDate: Date = new Date()): string {
    const date = new Date(baseDate);
    date.setDate(date.getDate() + offsetDays);
    return date.toISOString().split('T')[0];
}

// =============================================================================
// GENERACIÓN DE HORAS
// =============================================================================

/**
 * Genera hora aleatoria con varianza
 * @param baseTime Hora base (HH:MM)
 * @param varianceMinutes Varianza en minutos (+/-)
 * @returns Hora en formato HH:MM
 */
export function generateRandomTime(baseTime: string, varianceMinutes: number): string {
    const [hours, minutes] = baseTime.split(':').map(Number);
    const baseMinutes = hours * 60 + minutes;

    // Varianza aleatoria
    const variance = Math.floor(Math.random() * (varianceMinutes * 2 + 1)) - varianceMinutes;
    const newMinutes = baseMinutes + variance;

    const newHours = Math.floor(newMinutes / 60);
    const newMins = newMinutes % 60;

    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

/**
 * Suma minutos a una hora
 * @param time Hora base (HH:MM)
 * @param minutesToAdd Minutos a sumar
 * @returns Hora en formato HH:MM
 */
export function addMinutesToTime(time: string, minutesToAdd: number): string {
    const [hours, minutes] = time.split(':').map(Number);
    const totalMinutes = hours * 60 + minutes + minutesToAdd;

    const newHours = Math.floor(totalMinutes / 60) % 24;
    const newMins = totalMinutes % 60;

    return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

/**
 * Calcula diferencia en minutos entre dos horas
 * @param time1 Primera hora (HH:MM)
 * @param time2 Segunda hora (HH:MM)
 * @returns Diferencia en minutos (time2 - time1)
 */
export function getMinutesDifference(time1: string, time2: string): number {
    const [h1, m1] = time1.split(':').map(Number);
    const [h2, m2] = time2.split(':').map(Number);

    const minutes1 = h1 * 60 + m1;
    const minutes2 = h2 * 60 + m2;

    return minutes2 - minutes1;
}

// =============================================================================
// DETECCIÓN DE INFRACCIONES
// =============================================================================

export interface InfractionDetectionResult {
    hasTardiness: boolean;
    hasEarlyDeparture: boolean;
    minutesLate?: number;
    minutesEarly?: number;
}

/**
 * Detecta infracciones en un registro de asistencia
 * @param checkIn Hora de entrada (HH:MM)
 * @param checkOut Hora de salida (HH:MM)
 * @param shiftStart Hora de inicio de turno (HH:MM)
 * @param shiftEnd Hora de fin de turno (HH:MM)
 * @param toleranceMinutes Tolerancia en minutos
 * @returns Resultado de detección
 */
export function detectInfraction(
    checkIn: string,
    checkOut: string,
    shiftStart: string,
    shiftEnd: string,
    toleranceMinutes: number
): InfractionDetectionResult {
    const result: InfractionDetectionResult = {
        hasTardiness: false,
        hasEarlyDeparture: false,
    };

    // Detectar retardo
    const minutesLate = getMinutesDifference(shiftStart, checkIn);
    if (minutesLate > toleranceMinutes) {
        result.hasTardiness = true;
        result.minutesLate = minutesLate - toleranceMinutes;
    }

    // Detectar salida temprana
    const minutesEarly = getMinutesDifference(checkOut, shiftEnd);
    if (minutesEarly > toleranceMinutes) {
        result.hasEarlyDeparture = true;
        result.minutesEarly = minutesEarly - toleranceMinutes;
    }

    return result;
}

// =============================================================================
// GENERACIÓN DE IDS
// =============================================================================

/**
 * Genera ID de batch de importación
 * @param period Período (YYYY-MM)
 * @param batchNumber Número de batch
 * @returns ID de batch
 */
export function createBatchId(period: string, batchNumber: number): string {
    return `batch-${period}-${batchNumber}`;
}

/**
 * Genera ID de cierre de período
 * @param userId ID de usuario
 * @param period Período (YYYY-MM)
 * @returns ID de cierre
 */
export function createPeriodClosureId(userId: string, period: string): string {
    return `${userId}_${period}`;
}

// =============================================================================
// UTILIDADES ALEATORIAS
// =============================================================================

/**
 * Selecciona elemento aleatorio de un array
 * @param array Array de elementos
 * @returns Elemento aleatorio
 */
export function randomElement<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

/**
 * Selecciona elemento aleatorio basado en probabilidades
 * @param items Array de items con probabilidad
 * @returns Elemento seleccionado
 */
export function weightedRandom<T extends { probability: number }>(items: readonly T[]): T {
    const random = Math.random();
    let cumulative = 0;

    for (const item of items) {
        cumulative += item.probability;
        if (random <= cumulative) {
            return item;
        }
    }

    return items[items.length - 1];
}

/**
 * Genera número aleatorio entre min y max (inclusive)
 * @param min Valor mínimo
 * @param max Valor máximo
 * @returns Número aleatorio
 */
export function randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Retorna true con probabilidad dada
 * @param probability Probabilidad (0-1)
 * @returns Boolean aleatorio
 */
export function randomChance(probability: number): boolean {
    return Math.random() < probability;
}

// =============================================================================
// FORMATEO
// =============================================================================

/**
 * Formatea timestamp para Firestore
 * @param dateString Fecha en formato ISO
 * @returns Timestamp de Firestore
 */
export function formatTimestamp(dateString: string): string {
    return new Date(dateString).toISOString();
}

/**
 * Calcula horas trabajadas entre check-in y check-out
 * @param checkIn Hora de entrada (HH:MM)
 * @param checkOut Hora de salida (HH:MM)
 * @returns Horas trabajadas (decimal)
 */
export function calculateHoursWorked(checkIn: string, checkOut: string): number {
    const minutes = getMinutesDifference(checkIn, checkOut);
    return Math.round((minutes / 60) * 100) / 100; // Redondear a 2 decimales
}
