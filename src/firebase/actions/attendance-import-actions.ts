'use client';

/**
 * attendance-import-actions.ts
 *
 * Importación masiva de asistencia desde ZKTeco y detección de incidencias automáticas.
 * Extraído de incidence-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - processAttendanceImport
 *
 * Helpers privados (solo usados por processAttendanceImport):
 *  - resolveEscalatedManager
 *  - groupRecordsByManager
 *  - createJustificationTask
 */

import {
    doc, collection, addDoc, getDoc, getDocs, query, where, limit,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '../non-blocking-updates';
import type {
    Employee,
    AttendanceRecord,
    AttendanceImportBatch,
    TimeBank,
    VacationBalance,
    TardinessRecord,
    HolidayCalendar,
    OfficialHoliday,
    ShiftType,
    CustomShift,
    TardinessPolicy,
    EarlyDeparture,
    EmployeeShiftAssignment
} from '@/lib/types';
import type { MissingPunchRecord, MissingPunchType } from '@/types/hcm-operational';
import {
    validateWorkday,
    calculateHoursWorked,
} from '@/lib/hcm-utils';
import { batchAutoJustify } from './auto-justification-actions';
import { notifyRole, createNotification } from './notification-actions';
import { recordMissingPunch } from './tardiness-actions';
import { updateTimeBank } from './time-bank-actions';

// =========================================================================
// ATTENDANCE IMPORT
// =========================================================================

interface AttendanceImportRow {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string;
}

interface ProcessAttendanceResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    skippedCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

export type OvertimeMode = 'daily_limit' | 'weekly_only';

// Evita ejecuciones concurrentes por doble clic en la UI
let isProcessingImport = false;

export async function processAttendanceImport(
    rows: AttendanceImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string,
    options?: { overtimeMode?: OvertimeMode }
): Promise<ProcessAttendanceResult> {
    if (isProcessingImport) {
        return {
            success: false,
            errors: [{ row: 0, message: 'Ya hay una importación en curso. Por favor espere a que termine el proceso actual.' }]
        };
    }
    
    isProcessingImport = true;
    
    const overtimeMode: OvertimeMode = options?.overtimeMode ?? 'daily_limit';
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Create import batch record
        const batchRef = collection(firestore, 'attendance_imports');
        const batchData: Omit<AttendanceImportBatch, 'id'> = {
            filename,
            fileSize: 0,
            mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            uploadedById,
            uploadedByName,
            uploadedAt: now,
            recordCount: rows.length,
            successCount: 0,
            skippedCount: 0,
            errorCount: 0,
            status: 'processing',
            errors: [],
            overtimeMode
        };

        const batchDocRef = await addDoc(batchRef, batchData);
        const batchId = batchDocRef.id;

        const errors: Array<{ row: number; message: string }> = [];
        let successCount = 0;
        let skippedCount = 0;
        const newRecordsToJustify: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }> = [];

        // Determine date range for pre-fetching existing records
        let minDate = rows.length > 0 ? rows[0].date : '';
        let maxDate = rows.length > 0 ? rows[0].date : '';

        if (rows.length > 0) {
            for (const r of rows) {
                if (r.date < minDate) minDate = r.date;
                if (r.date > maxDate) maxDate = r.date;
            }
        }

        // Fetch existing attendance records to prevent duplicates
        const existingRecordsMap = new Set<string>();
        const existingTardinessMap = new Set<string>();
        const existingDeparturesMap = new Set<string>();

        if (minDate && maxDate) {
            console.log(`[HCM] Checking for duplicates between ${minDate} and ${maxDate}`);

            const [existingSnap, existingTardinessSnap, existingDeparturesSnap] = await Promise.all([
                getDocs(query(
                    collection(firestore, 'attendance'),
                    where('date', '>=', minDate),
                    where('date', '<=', maxDate)
                )),
                getDocs(query(
                    collection(firestore, 'tardiness_records'),
                    where('date', '>=', minDate),
                    where('date', '<=', maxDate)
                )),
                getDocs(query(
                    collection(firestore, 'early_departures'),
                    where('date', '>=', minDate),
                    where('date', '<=', maxDate)
                ))
            ]);

            existingSnap.docs.forEach(doc => {
                const data = doc.data();
                existingRecordsMap.add(`${data.employeeId}_${data.date}`);
            });
            existingTardinessSnap.docs.forEach(doc => {
                const data = doc.data();
                existingTardinessMap.add(`${data.employeeId}_${data.date}`);
            });
            existingDeparturesSnap.docs.forEach(doc => {
                const data = doc.data();
                existingDeparturesMap.add(`${data.employeeId}_${data.date}`);
            });
            console.log(`[HCM] Found ${existingRecordsMap.size} existing attendance, ${existingTardinessMap.size} tardiness, ${existingDeparturesMap.size} early departures in range`);
        }

        // Get all unique employee IDs and fetch their shift types, location config, and time bank balances
        const employeeIds = [...new Set(rows.map(r => r.employeeId))];
        const employeeShifts: Record<string, {
            type: ShiftType;
            breakMinutes: number;
            fullName: string;
            startTime: string;
            endTime: string;
            toleranceMinutes: number;
            locationId?: string;
            daySchedules?: Record<number, { startTime: string; endTime: string; breakMinutes: number }>;
            customShiftId?: string;
            allowOvertime: boolean;
            workDays: number[];
            restDays: number[];
            realUid: string;
        }> = {};
        const employeeTimeBankBalances: Record<string, number> = {};

        // Cache shifts and locations to avoid redundant reads
        const shiftCache: Record<string, any> = {};
        const locationCache: Record<string, any> = {};
        const positionCache: Record<string, any> = {};

        const employeeAssignments: Record<string, EmployeeShiftAssignment[]> = {};
        const shiftsToFetch = new Set<string>();

        // Pre-scan employees to collect shift IDs
        for (const empId of employeeIds) {
            let empData: Employee | null = null;
            let actualEmpUid = empId;

            const empRef = doc(firestore, 'employees', empId);
            const empSnap = await getDoc(empRef);

            if (empSnap.exists()) {
                empData = empSnap.data() as Employee;
            } else {
                const employeesQuery = query(collection(firestore, 'employees'), where('employeeId', '==', empId), limit(1));
                const employeesSnap = await getDocs(employeesQuery);

                if (!employeesSnap.empty) {
                    empData = employeesSnap.docs[0].data() as Employee;
                    actualEmpUid = employeesSnap.docs[0].id;
                }
            }

            if (empData) {
                if (empData.customShiftId) shiftsToFetch.add(empData.customShiftId);

                if (empData.shiftAssignments?.length) {
                    employeeAssignments[actualEmpUid] = empData.shiftAssignments;
                    empData.shiftAssignments.forEach(sa => shiftsToFetch.add(sa.shiftId));
                }

                const extEmp = empData as any;
                if (extEmp.positionId && !positionCache[extEmp.positionId]) {
                    const posRef = doc(firestore, 'positions', extEmp.positionId);
                    const posSnap = await getDoc(posRef);
                    if (posSnap.exists()) positionCache[extEmp.positionId] = posSnap.data();
                }

                employeeShifts[empId] = {
                    type: empData.shiftType || 'diurnal',
                    breakMinutes: 0,
                    fullName: empData.fullName || actualEmpUid,
                    startTime: '',
                    endTime: '',
                    toleranceMinutes: 10,
                    locationId: empData.locationId || undefined,
                    customShiftId: empData.customShiftId,
                    allowOvertime: extEmp.positionId && positionCache[extEmp.positionId]
                        ? (positionCache[extEmp.positionId].generatesOvertime ?? positionCache[extEmp.positionId].canEarnOvertime ?? true)
                        : true,
                    workDays: [],
                    restDays: [],
                    realUid: actualEmpUid,
                    directManagerId: extEmp.directManagerId || null,
                    overtimeResetDay: locationCache[empData.locationId || '']?.overtimeResetDay || 'sunday'
                } as any;

                if (empData.locationId && !locationCache[empData.locationId]) {
                    const locRef = doc(firestore, 'locations', empData.locationId);
                    const locSnap = await getDoc(locRef);
                    if (locSnap.exists()) locationCache[empData.locationId] = locSnap.data();
                }

                const timeBankRef = doc(firestore, 'time_bank', actualEmpUid);
                const timeBankSnap = await getDoc(timeBankRef);
                employeeTimeBankBalances[actualEmpUid] = timeBankSnap.exists() ? (timeBankSnap.data() as TimeBank).hoursBalance : 0;
            }
        }

        // ---------------------------------------------------------------
        // FETCH SHIFT ASSIGNMENTS FROM shift_assignments COLLECTION
        // ---------------------------------------------------------------
        const allRealUids = Object.values(employeeShifts).map((c: any) => c.realUid).filter(Boolean);
        for (let i = 0; i < allRealUids.length; i += 30) {
            const batch = allRealUids.slice(i, i + 30);
            try {
                const saQuery = query(
                    collection(firestore, 'shift_assignments'),
                    where('employeeId', 'in', batch),
                    where('status', '==', 'active')
                );
                const saSnap = await getDocs(saQuery);
                for (const saDoc of saSnap.docs) {
                    const sa = saDoc.data();
                    const empUid = sa.employeeId as string;
                    const mapped: EmployeeShiftAssignment = {
                        shiftId: sa.newShiftId as string,
                        startDate: sa.startDate as string,
                        endDate: sa.endDate as string | undefined,
                    };
                    if (!employeeAssignments[empUid]) employeeAssignments[empUid] = [];
                    employeeAssignments[empUid].push(mapped);
                    shiftsToFetch.add(mapped.shiftId);
                }
            } catch (saError) {
                console.error('[HCM] Error fetching shift_assignments:', saError);
            }
        }

        // Batch Fetch all needed shifts
        for (const shiftId of Array.from(shiftsToFetch)) {
            if (!shiftCache[shiftId]) {
                const shiftRef = doc(firestore, 'shifts', shiftId);
                const shiftSnap = await getDoc(shiftRef);
                if (shiftSnap.exists()) {
                    shiftCache[shiftId] = shiftSnap.data();
                }
            }
        }

        // Post-process employeeShifts with loaded data
        for (const empId of Object.keys(employeeShifts)) {
            const config = employeeShifts[empId] as any;
            const customShiftId = config.customShiftId;

            if (config.locationId && locationCache[config.locationId]) {
                config.toleranceMinutes = locationCache[config.locationId].toleranceMinutes ?? 10;
            }

            if (customShiftId && shiftCache[customShiftId]) {
                const sData = shiftCache[customShiftId];
                config.startTime = sData.startTime || '';
                config.endTime = sData.endTime || '';
                config.breakMinutes = sData.breakMinutes || 0;
                config.daySchedules = sData.daySchedules || {};
                config.workDays = sData.workDays || [];
                config.restDays = sData.restDays || [];

                if (config.workDays.length === 0 && sData.daySchedules && Object.keys(sData.daySchedules).length > 0) {
                    config.workDays = Object.keys(sData.daySchedules).map(Number);
                    config.restDays = [0, 1, 2, 3, 4, 5, 6].filter((d: number) => !config.workDays.includes(d));
                }
            }
        }

        // ---------------------------------------------------------------
        // HOLIDAY CALENDAR PRE-FETCH
        // ---------------------------------------------------------------
        const officialHolidayDates: Record<string, string> = {};
        try {
            const yearsInRange = new Set<number>();
            rows.forEach(r => {
                if (r.date) yearsInRange.add(parseInt(r.date.substring(0, 4)));
            });

            for (const year of yearsInRange) {
                const calQuery = query(
                    collection(firestore, 'holiday_calendars'),
                    where('year', '==', year)
                );
                const calSnap = await getDocs(calQuery);
                calSnap.docs.forEach(d => {
                    const cal = d.data() as HolidayCalendar;
                    cal.holidays?.forEach((h: OfficialHoliday) => {
                        if (h.date) officialHolidayDates[h.date] = h.name || 'Día Festivo';
                    });
                });
            }
            console.log(`[HCM] Loaded ${Object.keys(officialHolidayDates).length} official holiday dates`);
        } catch (calError) {
            console.warn('[HCM] Error loading holiday calendars, continuing without holiday detection:', calError);
        }

        // Company benefit days per location
        const locationBenefitDatesMap: Record<string, Set<string>> = {};
        const yearsForBenefitDays = new Set<number>();
        rows.forEach(r => { if (r.date) yearsForBenefitDays.add(parseInt(r.date.substring(0, 4))); });

        for (const [locId, locData] of Object.entries(locationCache)) {
            const benefitDays: string[] = (locData as any).companyBenefitDays || [];
            if (benefitDays.length > 0) {
                const dateSet = new Set<string>();
                for (const year of yearsForBenefitDays) {
                    for (const mmdd of benefitDays) {
                        dateSet.add(`${year}-${mmdd}`);
                    }
                }
                locationBenefitDatesMap[locId] = dateSet;
            }
        }

        // -------------------------------------------------------------
        // APPROVED INCIDENCES PRE-FETCH
        // -------------------------------------------------------------
        const approvedIncidencesMap: Record<string, Array<{ startDate: string; endDate: string; type: string }>> = {};
        try {
            for (let i = 0; i < allRealUids.length; i += 30) {
                const batch = allRealUids.slice(i, i + 30);
                const incQuery = query(
                    collection(firestore, 'incidences'),
                    where('employeeId', 'in', batch),
                    where('status', '==', 'approved')
                );
                const incSnap = await getDocs(incQuery);
                for (const incDoc of incSnap.docs) {
                    const data = incDoc.data();
                    const empId = data.employeeId as string;
                    if (!approvedIncidencesMap[empId]) approvedIncidencesMap[empId] = [];
                    approvedIncidencesMap[empId].push({
                        startDate: data.startDate as string,
                        endDate: data.endDate as string,
                        type: data.type as string
                    });
                }
            }
            console.log(`[HCM] Loaded approved incidences for ${Object.keys(approvedIncidencesMap).length} employees`);
        } catch (incError) {
            console.warn('[HCM] Error loading approved incidences, continuing without incidence check:', incError);
        }

        // -------------------------------------------------------------
        // WEEKLY OVERTIME ACCUMULATOR (LFT Art. 67-68)
        // Max 3h dobles/día, Max 9h dobles/semana, excedente → triple.
        // -------------------------------------------------------------
        const weeklyOvertimeAccum: Record<string, { doubleUsed: number; weekKey: string }> = {};

        const getWeekKey = (dateStr: string, resetDay: string): string => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const dateObj = new Date(y, m - 1, d);
            const dayOfWeek = dateObj.getDay();

            let resetDayNum = 0;
            if (resetDay === 'saturday') resetDayNum = 6;
            else if (resetDay === 'sunday') resetDayNum = 0;
            else if (resetDay === 'custom') resetDayNum = 1;

            let diff = dayOfWeek - resetDayNum;
            if (diff < 0) diff += 7;
            const weekStart = new Date(dateObj);
            weekStart.setDate(weekStart.getDate() - diff);

            return weekStart.toISOString().split('T')[0];
        };

        // Sort rows by employeeId then by date (chronological) for correct weekly accumulation
        rows.sort((a, b) => {
            if (a.employeeId !== b.employeeId) return a.employeeId.localeCompare(b.employeeId);
            return a.date.localeCompare(b.date);
        });

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            try {
                if (!employeeShifts[row.employeeId]) {
                    errors.push({ row: rowNum, message: `Empleado ${row.employeeId} (ZKTeco ID) no encontrado` });
                    continue;
                }

                let shiftConfig = employeeShifts[row.employeeId];
                const actualUid = shiftConfig.realUid;

                // DUPLICATE CHECK
                if (existingRecordsMap.has(`${actualUid}_${row.date}`)) {
                    skippedCount++;
                    continue;
                }

                // -------------------------------------------------------------
                // SHIFT RESOLUTION (Effective Shift for Date)
                // -------------------------------------------------------------
                if (employeeAssignments[actualUid] && employeeAssignments[actualUid].length > 0) {
                    // Filter all assignments that cover the exact date
                    const validAssignments = employeeAssignments[actualUid].filter(sa =>
                        sa.startDate <= row.date && (!sa.endDate || sa.endDate >= row.date)
                    );

                    // Sort by start date DESC (newest first).
                    // If we had 'assignmentType' we could prioritize temporary, but since we map to EmployeeShiftAssignment
                    // which only has shiftId, startDate, endDate, we will assume an assignment with an endDate (Temporary)
                    // takes precedence over one without an endDate (Permanent).
                    validAssignments.sort((a, b) => {
                        // 1. Temporary overrides Permanent
                        if (a.endDate && !b.endDate) return -1;
                        if (!a.endDate && b.endDate) return 1;

                        // 2. Newest start date first
                        return b.startDate.localeCompare(a.startDate);
                    });

                    const effectiveAssignment = validAssignments[0];

                    if (effectiveAssignment) {
                        const sData = shiftCache[effectiveAssignment.shiftId];
                        if (sData) {
                            const overrideWorkDays = sData.workDays?.length
                                ? sData.workDays
                                : (sData.daySchedules && Object.keys(sData.daySchedules).length > 0)
                                    ? Object.keys(sData.daySchedules).map(Number)
                                    : [];
                            shiftConfig = {
                                ...shiftConfig,
                                type: sData.shiftType || sData.type || 'diurnal',
                                startTime: sData.startTime || '',
                                endTime: sData.endTime || '',
                                breakMinutes: sData.breakMinutes || 0,
                                daySchedules: sData.daySchedules || {},
                                workDays: overrideWorkDays,
                                restDays: sData.restDays?.length
                                    ? sData.restDays
                                    : [0, 1, 2, 3, 4, 5, 6].filter((d: number) => !overrideWorkDays.includes(d)),
                            };
                        }
                    }
                }

                // DETERMINE IF IT IS A REST DAY
                let isRestDay = false;
                const [year, month, day] = row.date.split('-').map(Number);
                const localDate = new Date(year, month - 1, day);
                const dayOfWeek = localDate.getDay();

                if (shiftConfig.restDays && shiftConfig.restDays.includes(dayOfWeek)) {
                    isRestDay = true;
                } else if (shiftConfig.workDays && shiftConfig.workDays.length > 0 && !shiftConfig.workDays.includes(dayOfWeek)) {
                    isRestDay = true;
                }

                let scheduledStart = shiftConfig.startTime || '';
                let scheduledEnd = shiftConfig.endTime || '';
                let scheduledBreak = shiftConfig.breakMinutes || 0;

                // CHECK FOR DAY-SPECIFIC SCHEDULE
                if (shiftConfig.daySchedules && Object.keys(shiftConfig.daySchedules).length > 0) {
                    const [y, m, d] = row.date.split('-').map(Number);
                    const localDate = new Date(y, m - 1, d);
                    const dayOfWeek = localDate.getDay();

                    if (shiftConfig.daySchedules[dayOfWeek]) {
                        const daily = shiftConfig.daySchedules[dayOfWeek];
                        scheduledStart = daily.startTime;
                        scheduledEnd = daily.endTime;
                        scheduledBreak = daily.breakMinutes;
                    }
                }

                const defaultBreakMinutes = scheduledBreak > 0
                    ? scheduledBreak
                    : (shiftConfig.type === 'diurnal' || shiftConfig.type === 'mixed') ? 60 : 30;

                const grossHours = calculateHoursWorked(row.checkIn, row.checkOut, 0);
                const hoursWorked = calculateHoursWorked(row.checkIn, row.checkOut, defaultBreakMinutes);

                const actualScheduledHours = (scheduledStart && scheduledEnd)
                    ? calculateHoursWorked(scheduledStart, scheduledEnd, 0)
                    : undefined;

                const validation = validateWorkday(
                    grossHours,
                    shiftConfig.type,
                    isRestDay,
                    shiftConfig.allowOvertime,
                    actualScheduledHours
                );

                // -------------------------------------------------------------
                // OVERTIME REDESIGNED: Fuera del Turno & DDL Logic
                // -------------------------------------------------------------
                let rawOvertimeHours = 0;

                if (shiftConfig.allowOvertime && scheduledStart && scheduledEnd) {
                    let earlyArrivalOt = 0;
                    let lateDepartureOt = 0;

                    // 1. Llegada Temprana
                    if (row.checkIn) {
                        const ciDate = new Date(`2000-01-01T${row.checkIn}`);
                        const ssDate = new Date(`2000-01-01T${scheduledStart}`);
                        let diffMs = ssDate.getTime() - ciDate.getTime();
                        // Ajuste por si cruza medianoche al revés
                        if (diffMs < -12 * 3600000) diffMs += 24 * 3600000;
                        earlyArrivalOt = Math.max(0, Math.round((diffMs / 3600000) * 100) / 100);
                    }

                    // 2. Salida Tarde
                    if (row.checkOut) {
                        const coDate = new Date(`2000-01-01T${row.checkOut}`);
                        const seDate = new Date(`2000-01-01T${scheduledEnd}`);
                        let diffMs = coDate.getTime() - seDate.getTime();
                        if (diffMs < -12 * 3600000) diffMs += 24 * 3600000;
                        lateDepartureOt = Math.max(0, Math.round((diffMs / 3600000) * 100) / 100);
                    }

                    rawOvertimeHours = earlyArrivalOt + lateDepartureOt;
                }

                validation.overtimeHours = rawOvertimeHours;

                // -------------------------------------------------------------
                // DEBT COMPENSATION (TIME BANK)
                // -------------------------------------------------------------
                let hoursAppliedToDebt = 0;
                let payableOvertimeHours = validation.overtimeHours;
                let timeBankBalance = employeeTimeBankBalances[actualUid] || 0;

                if (timeBankBalance < 0 && validation.overtimeHours > 0) {
                    const debt = Math.abs(timeBankBalance);
                    const overtime = validation.overtimeHours;
                    hoursAppliedToDebt = Math.min(debt, overtime);
                    payableOvertimeHours = overtime - hoursAppliedToDebt;
                    employeeTimeBankBalances[actualUid] += hoursAppliedToDebt;
                }

                // -------------------------------------------------------------
                // HOLIDAY DETECTION
                // -------------------------------------------------------------
                let isHolidayDate = false;
                let isCompanyBenefitDate = false;
                let holidayName = '';

                if (officialHolidayDates[row.date]) {
                    isHolidayDate = true;
                    holidayName = officialHolidayDates[row.date];
                }

                if (!isHolidayDate && shiftConfig.locationId && locationBenefitDatesMap[shiftConfig.locationId]) {
                    if (locationBenefitDatesMap[shiftConfig.locationId].has(row.date)) {
                        isCompanyBenefitDate = true;
                        holidayName = 'Día de Beneficio Empresa';
                    }
                }

                let attendanceValidationNotes: string | null = null;
                if (isHolidayDate) {
                    attendanceValidationNotes = `DFT: Trabajó en día festivo (${holidayName}). ${validation.message || ''}`;
                } else if (isCompanyBenefitDate) {
                    attendanceValidationNotes = `Día de beneficio empresa trabajado (${holidayName}). ${validation.message || ''}`;
                } else if (isRestDay) {
                    const dlLabel = shiftConfig.allowOvertime ? 'DL (con HE)' : 'DL (sin HE)';
                    attendanceValidationNotes = `${dlLabel}: Día de descanso laborado. ${validation.message || ''}`;
                } else {
                    attendanceValidationNotes = validation.message ?? null;
                }

                // Create attendance record
                const attendanceRef = collection(firestore, 'attendance');
                const attendanceData: Omit<AttendanceRecord, 'id'> = {
                    employeeId: actualUid,
                    employeeName: shiftConfig.fullName,
                    date: row.date,
                    checkIn: row.checkIn,
                    checkOut: row.checkOut,
                    hoursWorked,
                    regularHours: validation.regularHours,
                    overtimeHours: validation.overtimeHours,
                    rawOvertimeHours,
                    payableOvertimeHours,
                    hoursAppliedToDebt,
                    overtimeType: payableOvertimeHours > 0 ? 'double' : null,
                    isValid: validation.isValid,
                    validationNotes: attendanceValidationNotes,
                    scheduledStart,
                    scheduledEnd,
                    ...(isCompanyBenefitDate && { isCompanyBenefitDay: true, holidayName }),
                    ...(isRestDay && { isRestDay: true, isRestDayWorked: true }),
                    importBatchId: batchId,
                    createdAt: now
                };

                const newAttendanceRef = await addDoc(attendanceRef, attendanceData);
                existingRecordsMap.add(`${actualUid}_${row.date}`); // Previene duplicado si el archivo tiene filas repetidas
                successCount++;


                // -------------------------------------------------------------
                // MISSING PUNCHES DETECTION
                // Solo crear si NO hay un permiso aprobado que cubra la fecha.
                // -------------------------------------------------------------
                if (!row.checkIn || !row.checkOut) {
                    const empIncidences = approvedIncidencesMap[actualUid] || [];
                    const coveringIncidence = empIncidences.find(inc =>
                        inc.startDate <= row.date && inc.endDate >= row.date
                    );

                    if (coveringIncidence) {
                        console.log(`[HCM] Skipping missing punch for ${shiftConfig.fullName} on ${row.date} — covered by approved ${coveringIncidence.type}`);
                    } else if (isRestDay) {
                        // Día de descanso: solo registrar si tiene UN registro pero no el otro
                        // (señal de que SÍ fue a trabajar). Si no tiene ninguno, descansó.
                        if ((row.checkIn && !row.checkOut) || (!row.checkIn && row.checkOut)) {
                            const missingType = !row.checkIn ? 'entry' : 'exit';
                            await recordMissingPunch(
                                actualUid,
                                shiftConfig.fullName ?? actualUid,
                                row.date,
                                missingType as any,
                                newAttendanceRef.id
                            );
                        }
                        // Si no tiene ninguno → normal, descansó
                    } else {
                        // Día laboral: siempre registrar si falta alguno
                        const missingType = !row.checkIn && !row.checkOut ? 'both' : (!row.checkIn ? 'entry' : 'exit');
                        await recordMissingPunch(
                            actualUid,
                            shiftConfig.fullName ?? actualUid,
                            row.date,
                            missingType as any,
                            newAttendanceRef.id
                        );
                    }
                }

                // If we applied hours to debt, update Time Bank in Firestore
                if (hoursAppliedToDebt > 0) {
                    await updateTimeBank(
                        actualUid,
                        hoursAppliedToDebt,
                        'earn',
                        `Compensación automática de deuda (Asistencia ${row.date})`,
                        'SISTEMA'
                    );
                }

                // -------------------------------------------------------------
                // OVERTIME REQUEST CREATION (with LFT double/triple breakdown)
                // LFT Art. 67-68: Max 3h dobles/día, Max 9h dobles/semana
                // -------------------------------------------------------------
                if (payableOvertimeHours > 0 && shiftConfig.allowOvertime) {
                    try {
                        const resetDay = (shiftConfig as any).overtimeResetDay || 'sunday';
                        const weekKey = getWeekKey(row.date, resetDay);
                        const accumKey = `${actualUid}_${weekKey}`;

                        if (!weeklyOvertimeAccum[accumKey]) {
                            weeklyOvertimeAccum[accumKey] = { doubleUsed: 0, weekKey };
                        }

                        const accum = weeklyOvertimeAccum[accumKey];

                        // daily_limit: LFT estricta (3h dobles/día + 9h/semana)
                        // weekly_only: sin tope diario, solo 9h dobles/semana
                        const MAX_DAILY_DOUBLE = overtimeMode === 'weekly_only' ? Infinity : 3;
                        const MAX_WEEKLY_DOUBLE = 9;
                        const remainingWeeklyDouble = MAX_WEEKLY_DOUBLE - accum.doubleUsed;
                        const availableDouble = Math.min(MAX_DAILY_DOUBLE, Math.max(remainingWeeklyDouble, 0));

                        let doubleHours = 0;
                        let tripleHours = 0;

                        if (payableOvertimeHours <= availableDouble) {
                            doubleHours = payableOvertimeHours;
                        } else {
                            doubleHours = availableDouble;
                            tripleHours = payableOvertimeHours - availableDouble;
                        }

                        doubleHours = Math.round(doubleHours * 100) / 100;
                        tripleHours = Math.round(tripleHours * 100) / 100;
                        accum.doubleUsed += doubleHours;

                        const overtimeReason = isRestDay
                            ? `Horas extra en día de descanso laborado (${row.date})`
                            : `Horas extra detectadas automáticamente (${row.date})`;

                        const overtimeData: Record<string, unknown> = {
                            employeeId: actualUid,
                            employeeName: shiftConfig.fullName ?? actualUid,
                            date: row.date,
                            hoursRequested: payableOvertimeHours,
                            doubleHours,
                            tripleHours,
                            reason: overtimeReason,
                            status: 'pending',
                            approverLevel: 1,
                            requestedToId: (shiftConfig as any).directManagerId || uploadedById,
                            requestedToName: '',
                            attendanceRecordId: newAttendanceRef.id,
                            importBatchId: batchId,
                            weekKey,
                            weeklyDoubleAccumulated: accum.doubleUsed,
                            createdAt: now,
                            updatedAt: now
                        };

                        await addDoc(collection(firestore, 'overtime_requests'), overtimeData);
                        console.log(`[HCM] Overtime request: ${shiftConfig.fullName} | ${row.date} | ${payableOvertimeHours}h → ${doubleHours}h dobles + ${tripleHours}h triples | week accum: ${accum.doubleUsed}/9`);
                    } catch (otError) {
                        console.error(`[HCM] Error creating overtime request for ${actualUid}:`, otError);
                    }
                }

                // -------------------------------------------------------------
                // REST DAY WORKED INCIDENCE (DL / Prima Dominical)
                // -------------------------------------------------------------
                if (isRestDay && (row.checkIn || row.checkOut)) {
                    const isSunday = dayOfWeek === 0;

                    await addDoc(collection(firestore, 'incidences_auto'), {
                        employeeId: actualUid,
                        employeeName: shiftConfig.fullName ?? actualUid,
                        date: row.date,
                        type: 'worked_rest_day',
                        code: 'DL',
                        hoursWorked,
                        allowOvertime: shiftConfig.allowOvertime ?? false,
                        isSunday,
                        ...(isSunday && { sundayPremium: true, sundayCode: 'PD' }),
                        attendanceRecordId: newAttendanceRef.id,
                        importBatchId: batchId,
                        status: 'auto_generated',
                        createdAt: now
                    });

                    if (!shiftConfig.allowOvertime) {
                        continue;
                    }
                }

                // -------------------------------------------------------------
                // TARDINESS & EARLY DEPARTURE DETECTION
                // -------------------------------------------------------------
                if (!scheduledStart || !scheduledEnd) {
                    switch (shiftConfig.type) {
                        case 'diurnal':
                            scheduledStart = scheduledStart || '09:00';
                            scheduledEnd = scheduledEnd || '18:00';
                            break;
                        case 'mixed':
                            scheduledStart = scheduledStart || '10:00';
                            scheduledEnd = scheduledEnd || '19:00';
                            break;
                        case 'nocturnal':
                            scheduledStart = scheduledStart || '20:00';
                            scheduledEnd = scheduledEnd || '05:00';
                            break;
                        default:
                            scheduledStart = scheduledStart || '09:00';
                            scheduledEnd = scheduledEnd || '18:00';
                    }
                }

                const toleranceMinutes = shiftConfig.toleranceMinutes;

                // Check Tardiness
                if (row.checkIn && (!isRestDay || shiftConfig.allowOvertime)) {
                    const checkInDate = new Date(`2000-01-01T${row.checkIn}`);
                    const scheduledStartDate = new Date(`2000-01-01T${scheduledStart}`);
                    const toleranceDate = new Date(scheduledStartDate.getTime() + toleranceMinutes * 60000);

                    if (checkInDate > toleranceDate) {
                        const empIncidences = approvedIncidencesMap[actualUid] || [];
                        const hasCoveringIncidence = empIncidences.some(inc =>
                            inc.startDate <= row.date && inc.endDate >= row.date
                        );

                        if (hasCoveringIncidence) {
                            // Permiso aprobado cubre esta fecha → no crear retardo
                        } else {
                            // BUG #1 FIX: Check exact database explicitly
                            const duplicateQuery = query(
                                collection(firestore, 'tardiness_records'),
                                where('employeeId', '==', actualUid),
                                where('date', '==', row.date)
                            );
                            const duplicateSnap = await getDocs(duplicateQuery);

                            if (duplicateSnap.empty && !existingTardinessMap.has(`${actualUid}_${row.date}`)) {
                                const diffMs = checkInDate.getTime() - toleranceDate.getTime();
                                const minutesLate = Math.floor(diffMs / 60000);

                                const tardinessData: Omit<TardinessRecord, 'id'> = {
                                    employeeId: actualUid,
                                    employeeName: shiftConfig.fullName ?? actualUid,
                                    date: row.date,
                                    attendanceRecordId: newAttendanceRef.id,
                                    type: 'entry',
                                    scheduledTime: scheduledStart,
                                    actualTime: row.checkIn,
                                    minutesLate,
                                    isJustified: false,
                                    justificationStatus: 'pending',
                                    sanctionApplied: false,
                                    createdAt: now,
                                    updatedAt: now,
                                    importBatchId: batchId
                                } as any;

                                const tRef = await addDoc(collection(firestore, 'tardiness_records'), tardinessData);
                                existingTardinessMap.add(`${actualUid}_${row.date}`);
                                newRecordsToJustify.push({
                                    id: tRef.id,
                                    employeeId: actualUid,
                                    date: row.date,
                                    type: 'tardiness'
                                });
                            }
                        }
                    }
                }

                // Check Early Departure
                if (row.checkOut && (!isRestDay || shiftConfig.allowOvertime)) {
                    const checkOutDate = new Date(`2000-01-01T${row.checkOut}`);
                    const scheduledEndDate = new Date(`2000-01-01T${scheduledEnd}`);

                    if (checkOutDate < scheduledEndDate) {
                        const empIncidences = approvedIncidencesMap[actualUid] || [];
                        const hasCoveringIncidence = empIncidences.some(inc =>
                            inc.startDate <= row.date && inc.endDate >= row.date
                        );

                        if (hasCoveringIncidence) {
                            // Permiso aprobado cubre esta fecha → no crear salida temprana
                        } else if (!existingDeparturesMap.has(`${actualUid}_${row.date}`)) {
                            // Guard de idempotencia: consulta directa a BD antes de insertar
                            const duplicateEDQuery = query(
                                collection(firestore, 'early_departures'),
                                where('employeeId', '==', actualUid),
                                where('date', '==', row.date),
                                limit(1)
                            );
                            const duplicateEDSnap = await getDocs(duplicateEDQuery);

                            if (duplicateEDSnap.empty) {
                                const diffMs = scheduledEndDate.getTime() - checkOutDate.getTime();
                                const minutesEarly = Math.floor(diffMs / 60000);

                                const departureData = {
                                    employeeId: actualUid,
                                    employeeName: shiftConfig.fullName ?? actualUid,
                                    date: row.date,
                                    attendanceRecordId: newAttendanceRef.id,
                                    scheduledTime: scheduledEnd,
                                    actualTime: row.checkOut,
                                    minutesEarly,
                                    isJustified: false,
                                    justificationStatus: 'pending',
                                    createdAt: now,
                                    updatedAt: now,
                                    importBatchId: batchId
                                };

                                const edRef = await addDoc(collection(firestore, 'early_departures'), departureData);
                                // Registrar en map para evitar duplicado si el Excel repite la fila
                                existingDeparturesMap.add(`${actualUid}_${row.date}`);
                                newRecordsToJustify.push({
                                    id: edRef.id,
                                    employeeId: actualUid,
                                    date: row.date,
                                    type: 'early_departure'
                                });
                            }
                        }
                    }
                }
            } catch (rowError) {
                errors.push({ row: rowNum, message: `Error procesando fila: ${rowError}` });
            }
        }

        // Update batch with results
        const finalStatus = errors.length === 0 ? 'completed' :
            successCount === 0 ? 'failed' : 'partial';

        updateDocumentNonBlocking(batchDocRef, {
            status: finalStatus,
            successCount,
            skippedCount,
            errorCount: errors.length,
            errors: errors.slice(0, 50),
            dateRangeStart: rows.length > 0 ? rows.reduce((min, r) => r.date < min ? r.date : min, rows[0].date) : undefined,
            dateRangeEnd: rows.length > 0 ? rows.reduce((max, r) => r.date > max ? r.date : max, rows[0].date) : undefined
        });

        console.log(`[HCM] Processed attendance import: ${successCount} success, ${errors.length} errors`);

        // Auto-justify detected issues
        if (newRecordsToJustify.length > 0) {
            await batchAutoJustify(newRecordsToJustify);

            try {
                const recordsByManager = await groupRecordsByManager(firestore, newRecordsToJustify);

                for (const [managerId, records] of Object.entries(recordsByManager)) {
                    await createJustificationTask(firestore, managerId, records, {
                        batchId,
                        filename,
                        uploadedBy: uploadedById
                    });
                }

                console.log(`[HCM] Created justification tasks for ${Object.keys(recordsByManager).length} managers`);
            } catch (error) {
                console.error('[HCM] Error creating manager tasks:', error);
            }
        }

        // Notify HR Managers
        await notifyRole(firestore, 'HRManager', {
            title: 'Carga de Asistencia Completada',
            message: `Se procesó el archivo ${filename}: ${successCount} registros exitosos, ${errors.length} errores.`,
            type: errors.length > 0 ? 'warning' : 'success',
            link: '/hcm'
        });

        return {
            success: true,
            batchId,
            recordCount: rows.length,
            successCount,
            skippedCount,
            errorCount: errors.length,
            errors
        };
    } catch (error) {
        console.error('[HCM] Error processing attendance import:', error);
        return { success: false, errors: [{ row: 0, message: 'Error general en la importación' }] };
    } finally {
        // Siempre liberar el mutex al terminar (éxito o error)
        isProcessingImport = false;
    }
}

// =========================================================================
// ATTENDANCE NOTIFICATION HELPERS (privados — exclusivos de este módulo)
// =========================================================================

async function resolveEscalatedManager(firestore: any, startManagerId: string): Promise<string | null> {
    let currentManagerId = startManagerId;
    const visited = new Set<string>();

    while (currentManagerId && !visited.has(currentManagerId)) {
        visited.add(currentManagerId);

        try {
            const empRef = doc(firestore, 'employees', currentManagerId);
            const empSnap = await getDoc(empRef);

            if (!empSnap.exists()) return null;

            const empData = empSnap.data() as Employee;

            if (empData.positionId) {
                const posRef = doc(firestore, 'positions', empData.positionId);
                const posSnap = await getDoc(posRef);

                if (posSnap.exists()) {
                    const position = posSnap.data();
                    if (position.canApproveIncidences) {
                        return empData.userId || currentManagerId;
                    }
                }
            }

            if (empData.directManagerId) {
                console.log(`[HCM] Manager ${currentManagerId} lacks permission, escalating to ${empData.directManagerId}`);
                currentManagerId = empData.directManagerId;
            } else {
                return null;
            }

        } catch (e) {
            console.error(`[HCM] Error resolving manager escalation for ${currentManagerId}`, e);
            return null;
        }
    }

    return null;
}

async function groupRecordsByManager(
    firestore: any,
    records: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }>
): Promise<Record<string, Array<{ id: string; employeeId: string; employeeName: string; date: string; type: 'tardiness' | 'early_departure'; minutesLate?: number; minutesEarly?: number }>>> {
    const byManager: Record<string, Array<any>> = {};

    for (const record of records) {
        try {
            const empRef = doc(firestore, 'employees', record.employeeId);
            const empSnap = await getDoc(empRef);

            if (empSnap.exists()) {
                const emp = empSnap.data() as Employee;
                const directManagerId = emp.directManagerId;

                if (directManagerId) {
                    const targetManagerUserId = await resolveEscalatedManager(firestore, directManagerId);

                    if (targetManagerUserId) {
                        let minutesLate: number | undefined;
                        let minutesEarly: number | undefined;

                        if (record.type === 'tardiness') {
                            const tardinessRef = doc(firestore, 'tardiness_records', record.id);
                            const tardinessSnap = await getDoc(tardinessRef);
                            if (tardinessSnap.exists()) {
                                minutesLate = (tardinessSnap.data() as TardinessRecord).minutesLate;
                            }
                        } else {
                            const departureRef = doc(firestore, 'early_departures', record.id);
                            const departureSnap = await getDoc(departureRef);
                            if (departureSnap.exists()) {
                                minutesEarly = (departureSnap.data() as EarlyDeparture).minutesEarly;
                            }
                        }

                        if (!byManager[targetManagerUserId]) {
                            byManager[targetManagerUserId] = [];
                        }
                        byManager[targetManagerUserId].push({
                            ...record,
                            employeeName: emp.fullName || record.employeeId,
                            minutesLate,
                            minutesEarly
                        });
                    } else {
                        console.warn(`[HCM] Could not find a manager with permissions for employee ${record.employeeId}`);
                    }
                }
            }
        } catch (error) {
            console.error(`[HCM] Error grouping record ${record.id}:`, error);
        }
    }

    return byManager;
}

async function createJustificationTask(
    firestore: any,
    managerId: string,
    records: Array<{ id: string; employeeId: string; employeeName: string; date: string; type: 'tardiness' | 'early_departure'; minutesLate?: number; minutesEarly?: number }>,
    metadata: { batchId: string; filename: string; uploadedBy: string }
): Promise<void> {
    try {
        const now = new Date().toISOString();

        const uniqueEmployees = [...new Set(records.map(r => r.employeeName))];
        const tardinessCount = records.filter(r => r.type === 'tardiness').length;
        const departureCount = records.filter(r => r.type === 'early_departure').length;

        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 2);

        const taskData = {
            name: `Justificar Incidencias de Asistencia`,
            description: `Se detectaron ${records.length} incidencias que requieren justificación:\n- ${tardinessCount} retardo${tardinessCount !== 1 ? 's' : ''}\n- ${departureCount} salida${departureCount !== 1 ? 's' : ''} temprana${departureCount !== 1 ? 's' : ''}\n\nEmpleados afectados: ${uniqueEmployees.join(', ')}`,
            type: 'attendance_justification',
            status: 'Active',
            priority: 'high',
            assigneeId: managerId,
            requestTitle: `Justificar Incidencias - ${metadata.filename}`,
            requestId: 'SYSTEM_GENERATED',
            requestOwnerId: metadata.uploadedBy,
            createdBy: metadata.uploadedBy,
            createdAt: now,
            dueDate: dueDate.toISOString(),
            metadata: {
                batchId: metadata.batchId,
                filename: metadata.filename,
                records: records.map(r => ({
                    id: r.id,
                    employeeId: r.employeeId,
                    employeeName: r.employeeName,
                    date: r.date,
                    type: r.type,
                    minutesLate: r.minutesLate ?? null,
                    minutesEarly: r.minutesEarly ?? null
                }))
            },
            module: 'hcm_team_management',
            link: `/tasks`
        };

        await addDoc(collection(firestore, 'tasks'), taskData);

        await createNotification(firestore, managerId, {
            title: 'Nuevas Incidencias de Asistencia',
            message: `Tienes ${records.length} incidencia${records.length !== 1 ? 's' : ''} pendiente${records.length !== 1 ? 's' : ''} de justificación de tu equipo.`,
            type: 'warning',
            link: `/tasks`
        });

        console.log(`[HCM] Created justification task for manager ${managerId} with ${records.length} records`);
    } catch (error) {
        console.error('[HCM] Error creating justification task:', error);
    }
}
