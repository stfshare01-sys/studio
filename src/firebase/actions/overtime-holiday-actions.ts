'use client';

/**
 * overtime-holiday-actions.ts
 *
 * Gestión de solicitudes de horas extra y calendario de días festivos.
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - createOvertimeRequest
 *  - processOvertimeRequest
 *  - getHolidayCalendar
 *  - isHoliday
 */

import {
    doc, collection, addDoc, updateDoc, getDocs, query, where, limit,
    serverTimestamp,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { OvertimeRequest, HolidayCalendar, OfficialHoliday } from "@/types/hcm.types";

// =========================================================================
// OVERTIME REQUESTS
// =========================================================================

export async function createOvertimeRequest(
    employeeId: string,
    employeeName: string,
    date: string,
    hoursRequested: number,
    reason: string,
    requestedToId: string,
    requestedToName: string
): Promise<{ success: boolean; requestId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const requestData: Omit<OvertimeRequest, 'id'> = {
            employeeId,
            employeeName,
            date,
            hoursRequested,
            reason,
            status: 'pending',
            approverLevel: 1,
            requestedToId,
            requestedToName,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const requestRef = await addDoc(collection(firestore, 'overtime_requests'), requestData);
        return { success: true, requestId: requestRef.id };
    } catch (error) {
        console.error('[HCM] Error creating overtime request:', error);
        return { success: false, error: 'Error creando solicitud de horas extras.' };
    }
}

export async function processOvertimeRequest(
    requestId: string,
    action: 'approve' | 'reject' | 'partial',
    processedById: string,
    processedByName: string,
    hoursApproved?: number,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const requestRef = doc(firestore, 'overtime_requests', requestId);

        const updateData: Partial<OvertimeRequest> = {
            status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'partial',
            approvedById: processedById,
            approvedByName: processedByName,
            approvedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        if (action === 'partial' && hoursApproved !== undefined) updateData.hoursApproved = hoursApproved;
        if (action === 'reject' && rejectionReason) updateData.rejectionReason = rejectionReason;

        await updateDoc(requestRef, updateData);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error processing overtime request:', error);
        return { success: false, error: 'Error procesando solicitud de horas extras.' };
    }
}

// =========================================================================
// HOLIDAY CALENDAR
// =========================================================================

export async function getHolidayCalendar(
    year: number,
    locationId?: string
): Promise<{ success: boolean; calendar?: HolidayCalendar; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        if (locationId) {
            const locCalendarQuery = query(
                collection(firestore, 'holiday_calendars'),
                where('year', '==', year),
                where('locationId', '==', locationId),
                limit(1)
            );
            const locSnap = await getDocs(locCalendarQuery);
            if (!locSnap.empty) {
                return { success: true, calendar: { id: locSnap.docs[0].id, ...locSnap.docs[0].data() } as HolidayCalendar };
            }
        }

        const globalCalendarQuery = query(
            collection(firestore, 'holiday_calendars'),
            where('year', '==', year),
            limit(1)
        );
        const globalSnap = await getDocs(globalCalendarQuery);

        if (!globalSnap.empty) {
            return { success: true, calendar: { id: globalSnap.docs[0].id, ...globalSnap.docs[0].data() } as HolidayCalendar };
        }

        // Create default
        const defaultHolidays: OfficialHoliday[] = [
            { date: `${year}-01-01`, name: 'Año Nuevo', isObligatory: true, premiumRequired: true },
            { date: `${year}-02-05`, name: 'Dia de la Constitucion', isObligatory: true, premiumRequired: true },
            { date: `${year}-03-21`, name: 'Natalicio de Benito Juarez', isObligatory: true, premiumRequired: true },
            { date: `${year}-05-01`, name: 'Dia del Trabajo', isObligatory: true, premiumRequired: true },
            { date: `${year}-09-16`, name: 'Dia de la Independencia', isObligatory: true, premiumRequired: true },
            { date: `${year}-11-20`, name: 'Dia de la Revolucion', isObligatory: true, premiumRequired: true },
            { date: `${year}-12-25`, name: 'Navidad', isObligatory: true, premiumRequired: true },
        ];

        const newCalendar: Omit<HolidayCalendar, 'id'> = {
            name: `México ${year} Oficial`,
            year,
            holidays: defaultHolidays,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        };

        const calendarRef = await addDoc(collection(firestore, 'holiday_calendars'), newCalendar);
        return { success: true, calendar: { id: calendarRef.id, ...newCalendar } };
    } catch (error) {
        console.error('[HCM] Error getting holiday calendar:', error);
        return { success: false, error: 'Error obteniendo calendario de dias festivos.' };
    }
}

export async function isHoliday(
    date: string,
    locationId?: string
): Promise<{ isHoliday: boolean; holiday?: OfficialHoliday; error?: string }> {
    try {
        const year = new Date(date).getFullYear();
        const calendarResult = await getHolidayCalendar(year, locationId);
        if (!calendarResult.success || !calendarResult.calendar) return { isHoliday: false };

        const holiday = calendarResult.calendar.holidays.find(h => h.date === date);
        return { isHoliday: !!holiday, holiday };
    } catch (error) {
        console.error('[HCM] Error checking holiday:', error);
        return { isHoliday: false, error: 'Error verificando dia festivo.' };
    }
}
