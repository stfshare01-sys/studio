'use client';

/**
 * use-my-attendance.ts
 *
 * Hook para el widget de marcaje personal (Mi Asistencia).
 * Encapsula:
 *  - Lectura del registro de asistencia del día actual
 *  - Captura de geolocalización GPS (auditoría, no bloquea si se deniega)
 *  - Detección de missing punch si el turno ya terminó
 *  - Funciones de check-in y check-out
 *  - Estado de carga y errores
 *
 * workMode soportados:
 *  - 'hybrid'  → días HO configurados (comportamiento original)
 *  - 'remote'  → widget siempre activo, sin validación de día HO
 *  - 'field'   → widget siempre activo, sin validación de día HO
 *  - 'office'  → no debería llegar aquí, el componente no muestra el widget
 */

import { useState, useEffect, useCallback } from 'react';
import { isHomeOfficeDay, detectAndRecordHOMissingPunch } from '@/firebase/actions/home-office-attendance-utils';
import { selfCheckIn, selfCheckOut, getTodayAttendance } from '@/firebase/actions/self-attendance-actions';
import type { Employee } from "@/types/hcm.types";

/** Estado del permiso GPS del navegador */
export type GpsStatus = 'idle' | 'requesting' | 'granted' | 'denied' | 'unavailable';

export interface MyAttendanceState {
    // Datos del día
    todayDate: string;             // YYYY-MM-DD
    isHODay: boolean;             // Si hoy es día de HO configurado (o siempre true para remote/field)
    checkIn?: string;             // Hora de entrada registrada (HH:mm)
    checkOut?: string;            // Hora de salida registrada (HH:mm)
    hoursWorked: number;
    attendanceId?: string;

    // Estado de UI
    isLoading: boolean;
    isSaving: boolean;
    error: string | null;
    successMessage: string | null;

    // GPS
    gpsStatus: GpsStatus;

    // Detección de falta
    missingPunchDetected: boolean;
    missingPunchType?: 'entry' | 'exit' | 'both';

    // Advertencia de HO no programado (solo hybrid)
    showUnscheduledWarning: boolean;
}

interface UseMyAttendanceProps {
    employee: Pick<Employee, 'id' | 'fullName' | 'homeOfficeDays' | 'directManagerId' | 'shiftType' | 'workMode'> & {
        scheduledStart?: string;
        scheduledEnd?: string;
        directManagerId?: string | null;
    };
}

// =========================================================================
// Captura de geolocalización — auditoría, nunca bloquea el flujo
// =========================================================================
async function captureLocation(): Promise<{
    lat: number; lng: number; accuracy: number; capturedAt: string;
} | undefined> {
    if (typeof window === 'undefined' || !navigator.geolocation) return undefined;

    return new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                resolve({
                    lat: pos.coords.latitude,
                    lng: pos.coords.longitude,
                    accuracy: Math.round(pos.coords.accuracy),
                    capturedAt: new Date().toISOString(),
                });
            },
            () => {
                // Permiso denegado o error → no bloquea el marcaje
                resolve(undefined);
            },
            { timeout: 8000, maximumAge: 60000, enableHighAccuracy: true }
        );
    });
}

// =========================================================================
// Hook principal
// =========================================================================
export function useMyAttendance({ employee }: UseMyAttendanceProps) {
    const today = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    // Para remote y field, el widget siempre está activo (isHODay = true)
    const isAlwaysActive = employee.workMode === 'remote' || employee.workMode === 'field';
    const isHODay = isAlwaysActive ? true : isHomeOfficeDay(employee, today);

    const [state, setState] = useState<MyAttendanceState>({
        todayDate: today,
        isHODay,
        hoursWorked: 0,
        isLoading: true,
        isSaving: false,
        error: null,
        successMessage: null,
        gpsStatus: 'idle',
        missingPunchDetected: false,
        showUnscheduledWarning: false,
    });

    // -------------------------------------------------------------------------
    // Cargar registro del día al montar
    // -------------------------------------------------------------------------
    const loadTodayRecord = useCallback(async () => {
        setState(s => ({ ...s, isLoading: true, error: null }));
        try {
            const record = await getTodayAttendance(employee.id);
            setState(s => ({
                ...s,
                isLoading: false,
                checkIn: record?.checkIn,
                checkOut: record?.checkOut,
                hoursWorked: record?.hoursWorked ?? 0,
                attendanceId: record?.id,
            }));
        } catch {
            setState(s => ({ ...s, isLoading: false, error: 'Error al cargar tu registro de asistencia.' }));
        }
    }, [employee.id]);

    useEffect(() => {
        loadTodayRecord();
    }, [loadTodayRecord]);

    // -------------------------------------------------------------------------
    // Solicitar permiso GPS al montar (solo remote y field)
    // No bloquea nada — solo actualiza gpsStatus para la UI
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (!isAlwaysActive) return;
        if (typeof window === 'undefined' || !navigator.geolocation) {
            setState(s => ({ ...s, gpsStatus: 'unavailable' }));
            return;
        }
        setState(s => ({ ...s, gpsStatus: 'requesting' }));
        navigator.geolocation.getCurrentPosition(
            () => setState(s => ({ ...s, gpsStatus: 'granted' })),
            () => setState(s => ({ ...s, gpsStatus: 'denied' })),
            { timeout: 5000, maximumAge: 60000 }
        );
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAlwaysActive]);

    // -------------------------------------------------------------------------
    // Detección de missing punch — solo si hay scheduledEnd
    // -------------------------------------------------------------------------
    useEffect(() => {
        if (state.isLoading) return;
        if (!employee.scheduledEnd) return;
        if (state.checkIn && state.checkOut) return;

        (async () => {
            const result = await detectAndRecordHOMissingPunch({
                employeeId: employee.id,
                employeeName: employee.fullName,
                directManagerId: employee.directManagerId ?? null,
                today,
                scheduledEnd: employee.scheduledEnd!,
                isHODay,
            });

            if (result.detected) {
                setState(s => ({
                    ...s,
                    missingPunchDetected: true,
                    missingPunchType: result.missingType,
                }));
            }
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [state.isLoading]);

    // -------------------------------------------------------------------------
    // CHECK-IN
    // -------------------------------------------------------------------------
    const handleCheckIn = useCallback(async (confirmed = false) => {
        // Solo hybrid pide confirmación para días no programados
        if (!isHODay && !isAlwaysActive && !confirmed) {
            setState(s => ({ ...s, showUnscheduledWarning: true }));
            return;
        }

        setState(s => ({ ...s, isSaving: true, error: null, successMessage: null, showUnscheduledWarning: false }));
        try {
            // Capturar GPS en paralelo (auditoría — no bloquea si falla)
            const location = await captureLocation();

            const result = await selfCheckIn({
                employeeId: employee.id,
                employeeName: employee.fullName,
                directManagerId: employee.directManagerId ?? null,
                isHomeOfficeDay: isHODay,
                scheduledStart: employee.scheduledStart,
                scheduledEnd: employee.scheduledEnd,
                location,
            });

            if (result.success) {
                const now = new Date();
                const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                setState(s => ({
                    ...s,
                    isSaving: false,
                    checkIn: time,
                    attendanceId: result.attendanceId,
                    gpsStatus: location ? 'granted' : s.gpsStatus,
                    successMessage: `✅ Entrada registrada a las ${time}${location ? ' 📍' : ''}`,
                }));
            } else {
                setState(s => ({ ...s, isSaving: false, error: result.error ?? 'Error al registrar entrada.' }));
            }
        } catch {
            setState(s => ({ ...s, isSaving: false, error: 'Error inesperado al registrar entrada.' }));
        }
    }, [employee, isHODay, isAlwaysActive]);

    // -------------------------------------------------------------------------
    // CHECK-OUT
    // -------------------------------------------------------------------------
    const handleCheckOut = useCallback(async () => {
        setState(s => ({ ...s, isSaving: true, error: null, successMessage: null }));
        try {
            // Capturar GPS en paralelo (auditoría — no bloquea si falla)
            const checkOutLocation = await captureLocation();

            const result = await selfCheckOut({
                employeeId: employee.id,
                scheduledEnd: employee.scheduledEnd,
                checkOutLocation,
            });

            if (result.success) {
                const now = new Date();
                const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
                setState(s => ({
                    ...s,
                    isSaving: false,
                    checkOut: time,
                    hoursWorked: result.hoursWorked ?? 0,
                    successMessage: `✅ Salida registrada a las ${time} — ${result.hoursWorked?.toFixed(1) ?? 0}h trabajadas${checkOutLocation ? ' 📍' : ''}`,
                }));
            } else {
                setState(s => ({ ...s, isSaving: false, error: result.error ?? 'Error al registrar salida.' }));
            }
        } catch {
            setState(s => ({ ...s, isSaving: false, error: 'Error inesperado al registrar salida.' }));
        }
    }, [employee]);

    // -------------------------------------------------------------------------
    // Descartar advertencia de HO no programado (solo hybrid)
    // -------------------------------------------------------------------------
    const dismissUnscheduledWarning = useCallback(() => {
        setState(s => ({ ...s, showUnscheduledWarning: false }));
    }, []);

    const confirmUnscheduledCheckIn = useCallback(() => {
        handleCheckIn(true);
    }, [handleCheckIn]);

    return {
        ...state,
        handleCheckIn,
        handleCheckOut,
        dismissUnscheduledWarning,
        confirmUnscheduledCheckIn,
    };
}
