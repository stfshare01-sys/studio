
import {
    doc,
    getDoc,
    collection,
    query,
    where,
    getDocs,
    Firestore
} from 'firebase/firestore';
import type {
    Employee,
    Location,
    HolidayCalendar,
    CustomShift,
    ShiftType,
    OfficialHoliday
} from './types';
import { parseISO, isSameDay, addDays, getDay, isAfter, isBefore } from 'date-fns';

/**
 * Result of the effective days calculation
 */
export type EffectiveDaysResult = {
    totalDays: number;
    effectiveDays: number;
    holidays: number;
    weekendDays: number; // Non-working days based on shift
    details: {
        date: string;
        isWorkingDay: boolean;
        isHoliday: boolean;
        reason?: string; // e.g., "Holiday: Christmas", "Rest Day"
    }[];
};

/**
 * Calculates the effective number of leave days excluding holidays and rest days
 * based on the employee's location and shift configuration.
 */
export async function calculateEffectiveLeaveDays(
    firestore: Firestore,
    employeeId: string,
    startDate: string,
    endDate: string
): Promise<EffectiveDaysResult> {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // 1. Fetch Employee Data
    const empRef = doc(firestore, 'employees', employeeId);
    let empSnap = await getDoc(empRef);

    // Fallback: Check 'users' if not found in 'employees' (consistency check)
    if (!empSnap.exists()) {
        empSnap = await getDoc(doc(firestore, 'users', employeeId));
    }

    if (!empSnap.exists()) {
        throw new Error(`Employee ${employeeId} not found`);
    }

    const employee = empSnap.data() as Employee;

    // 2. Determine Work Days (Schedule)
    let workDays: number[] = [1, 2, 3, 4, 5, 6]; // Default Mon-Sat

    const shiftId = employee.customShiftId || (employee as any).shiftId;

    if (shiftId) {
        // Fetch Custom Shift
        const shiftRef = doc(firestore, 'shifts', shiftId);
        const shiftSnap = await getDoc(shiftRef);
        if (shiftSnap.exists()) {
            const shift = shiftSnap.data() as CustomShift;
            if (shift.workDays && shift.workDays.length > 0) {
                workDays = shift.workDays;
            }
        }
    } else if (employee.shiftType) {
        // Fallback: Try to find a shift definition that matches the type
        const shiftsQuery = query(
            collection(firestore, 'shifts'),
            where('type', '==', employee.shiftType),
            where('isActive', '==', true)
        );
        const shiftDocs = await getDocs(shiftsQuery);

        if (!shiftDocs.empty) {
            // Use the first active shift of this type found
            const shift = shiftDocs.docs[0].data() as CustomShift;
            if (shift.workDays && shift.workDays.length > 0) {
                workDays = shift.workDays;
            }
        } else {
            // Absolute fallback if no shift definition found
            workDays = [1, 2, 3, 4, 5, 6];
        }
    }

    // 3. Fetch Holidays from Location
    let holidays: OfficialHoliday[] = [];
    let locationBenefitDays: string[] = [];

    if (employee.locationId) {
        const locRef = doc(firestore, 'locations', employee.locationId);
        const locSnap = await getDoc(locRef);

        if (locSnap.exists()) {
            const location = locSnap.data() as Location;

            // Extract benefit days
            if (location.companyBenefitDays) {
                locationBenefitDays = location.companyBenefitDays;
            }

            if (location.holidayCalendarId) {
                const calRef = doc(firestore, 'holiday_calendars', location.holidayCalendarId);
                const calSnap = await getDoc(calRef);

                if (calSnap.exists()) {
                    const calendar = calSnap.data() as HolidayCalendar;
                    // Filter holidays for the current year(s) of the request
                    holidays = calendar.holidays || [];
                }
            }
        }
    }

    // 4. Iterate and Count
    let currentDate = start;
    let effectiveDays = 0;
    let holidayCount = 0;
    let restDayCount = 0;
    const details = [];

    // Safety break for infinite loops
    let safetyCounter = 0;
    while ((isBefore(currentDate, end) || isSameDay(currentDate, end)) && safetyCounter < 366) {
        const dateStr = currentDate.toISOString().split('T')[0];
        const dayOfWeek = getDay(currentDate); // 0 = Sunday

        // Check if Rest Day
        const isWorkDay = workDays.includes(dayOfWeek);

        // Check if Holiday
        const holiday = holidays.find(h => h.date === dateStr);

        // Check for Company Benefit Days (MM-DD format)
        const benefitDayMatch = locationBenefitDays.some(bd => {
            const [bMonth, bDay] = bd.split('-').map(Number);
            const dMonth = currentDate.getMonth() + 1; // 0-indexed
            const dDay = currentDate.getDate();
            return bMonth === dMonth && bDay === dDay;
        });

        const isHoliday = !!holiday || benefitDayMatch;

        let countDay = true;
        let reason = "";

        if (!isWorkDay) {
            countDay = false;
            restDayCount++;
            reason = "Día de descanso";
        } else if (isHoliday) {
            countDay = false;
            holidayCount++;
            reason = holiday ? `Festivo: ${holiday.name}` : "Día beneficio empresa";
        }

        if (countDay) {
            effectiveDays++;
        }

        details.push({
            date: dateStr,
            isWorkingDay: isWorkDay,
            isHoliday: isHoliday,
            reason: reason || undefined
        });

        currentDate = addDays(currentDate, 1);
        safetyCounter++;
    }

    // Total span calculation for reference
    const totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    return {
        totalDays, // Calendar days
        effectiveDays, // Paid days (excluding rest days and holidays)
        holidays: holidayCount,
        weekendDays: restDayCount,
        details
    };
}
