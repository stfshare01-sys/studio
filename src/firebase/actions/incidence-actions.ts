'use client';

import { doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { setDocumentNonBlocking, updateDocumentNonBlocking } from '../non-blocking-updates';
import { callApproveIncidence, CloudFunctionError } from '../callable-functions';
import type {
    Employee,
    AttendanceRecord,
    Incidence,
    AttendanceImportBatch,
    TimeBank,
    VacationBalance,
    VacationMovement,
    TardinessRecord,
    OvertimeRequest,
    HolidayCalendar,
    OfficialHoliday,
    ShiftType,
    CustomShift,
    TardinessPolicy,
    EarlyDeparture,
    EmployeeShiftAssignment
} from '@/lib/types';

import {
    calculateVacationDays,
    calculateYearsOfService,
    validateWorkday,
    calculateHoursWorked,
    isAnniversaryDate,
    getNextAnniversaryDate,
    evaluateEarlyDepartureSeverity
} from '@/lib/hcm-utils';
import { batchAutoJustify, justifyInfractionsFromIncidence } from './auto-justification-actions';

import { addDebtToHourBank } from './hour-bank-actions';
import { notifyRole, createNotification } from './notification-actions';
import { checkAttendanceTaskCompletion } from './task-completion-actions';

// =========================================================================
// INCIDENCE MANAGEMENT
// =========================================================================

interface CreateIncidencePayload {
    employeeId: string;
    employeeName: string;
    type: Incidence['type'];
    startDate: string;
    endDate: string;
    isPaid: boolean;
    notes?: string;
    imssReference?: string;
    submitterId?: string;
    submitterName?: string;
}

import { calculateEffectiveLeaveDays } from '@/lib/hcm-calculations';

// ... other imports ...

export async function createIncidence(
    payload: CreateIncidencePayload
): Promise<{ success: boolean; incidenceId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // VALIDATION: Check if employee is active
        const employeeRef = doc(firestore, 'employees', payload.employeeId);
        const employeeSnap = await getDoc(employeeRef);
        const employeeData = employeeSnap.data() as Employee;

        if (employeeData?.status !== 'active') {
            return { success: false, error: 'No se pueden crear incidencias para empleados inactivos/baja.' };
        }

        // Calculate effective days (excluding weekends and holidays)
        let totalDays = 0;
        let effectiveDetails = null;

        try {
            const calculation = await calculateEffectiveLeaveDays(
                firestore,
                payload.employeeId,
                payload.startDate,
                payload.endDate,
                payload.type
            );
            totalDays = calculation.effectiveDays;
            effectiveDetails = calculation;
        } catch (calcError) {
            console.warn('[HCM] Error calculating effective days, falling back to calendar days:', calcError);
            // Fallback: Calculate total calendar days
            const start = new Date(payload.startDate);
            const end = new Date(payload.endDate);
            totalDays = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        }

        const managerId = employeeData.directManagerId;
        const isAutoApproved = payload.submitterId && (payload.submitterId === managerId);

        const incidenceData: Omit<Incidence, 'id'> = {
            ...payload,
            totalDays,
            status: isAutoApproved ? 'approved' : 'pending',
            createdAt: now,
            updatedAt: now
        };

        const incidenceRef = collection(firestore, 'incidences');
        const docRef = await addDoc(incidenceRef, incidenceData);

        console.log(`[HCM] Created incidence ${docRef.id} for employee ${payload.employeeId}. Auto-approved: ${isAutoApproved}`);

        if (isAutoApproved) {
            // Auto-justify right now
            await justifyInfractionsFromIncidence(
                docRef.id,
                payload.employeeId,
                payload.startDate,
                payload.endDate,
                payload.type
            );

            // Deduct vacation balance if vacation type (matches Cloud Function approval logic)
            if (payload.type === 'vacation' && totalDays > 0) {
                await updateVacationBalance(
                    payload.employeeId,
                    totalDays,
                    'taken',
                    docRef.id,
                    payload.submitterId
                );
                console.log(`[HCM] Auto-approved vacation: deducted ${totalDays} days from ${payload.employeeId}`);
            }

            // Store approver info on the incidence (same as Cloud Function does)
            await updateDoc(docRef, {
                approvedById: payload.submitterId,
                approvedByName: payload.submitterName || 'Manager',
                approvedAt: now,
            });

            // Notify Employee that their manager auto-approved it
            await createNotification(firestore, payload.employeeId, {
                title: `Incidencia Aprobada (Automático)`,
                message: `Tu jefe (${payload.submitterName || 'Manager'}) ha solicitado y aprobado ${payload.type} del ${payload.startDate} al ${payload.endDate}.`,
                type: 'success',
                link: '/hcm'
            });
        } else {
            // [NEW] Create Task for Manager ONLY IF NOT AUTO-APPROVED
            if (managerId) {
                const taskData: any = {
                    requestId: docRef.id,
                    requestTitle: `Incidencia: ${payload.type}`,
                    requestOwnerId: payload.employeeId,
                    stepId: 'incidence-approval',
                    name: `Aprobar ${payload.type} - ${payload.employeeName}`,
                    status: 'pending', // TaskStatus
                    priority: 'high',
                    type: 'incidence_approval',
                    moduleTag: 'HCM', // REQUIRED so it appears in HCM Dashboard Inbox
                    metadata: { incidenceId: docRef.id, employeeId: payload.employeeId },
                    assigneeId: managerId,
                    createdAt: now,
                    link: `/hcm/incidences`
                };
                await addDoc(collection(firestore, 'tasks'), taskData);

                // Notification to Manager
                await createNotification(firestore, managerId, {
                    title: 'Nueva Solicitud de Incidencia',
                    message: `${payload.employeeName} ha solicitado ${payload.type} del ${payload.startDate} al ${payload.endDate}.`,
                    type: 'task',
                    link: '/hcm/incidences'
                });
            } else {
                // Fallback: Notify HR Managers generic
                await notifyRole(firestore, 'HRManager', {
                    title: 'Nueva Solicitud de Incidencia (Sin Manager Directo)',
                    message: `${payload.employeeName} ha solicitado ${payload.type}. Requiere atención de RH.`,
                    type: 'warning',
                    link: '/hcm/incidences'
                });
            }
        }

        return { success: true, incidenceId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating incidence:', error);
        return { success: false, error: 'No se pudo crear la incidencia.' };
    }
}

export async function updateIncidenceStatus(
    incidenceId: string,
    status: 'approved' | 'rejected',
    approvedById: string,
    approvedByName: string,
    rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const result = await callApproveIncidence({
            incidenceId,
            action: status === 'approved' ? 'approve' : 'reject',
            rejectionReason
        });

        if (result.success) {
            const { firestore } = initializeFirebase();
            const incidenceRef = doc(firestore, 'incidences', incidenceId);
            const incidenceSnap = await getDoc(incidenceRef);

            if (incidenceSnap.exists()) {
                const incidence = incidenceSnap.data() as Incidence;

                // Auto-justify if approved
                if (status === 'approved') {
                    await justifyInfractionsFromIncidence(
                        incidenceId,
                        incidence.employeeId,
                        incidence.startDate,
                        incidence.endDate,
                        incidence.type
                    );
                }

                // Notify Employee
                await createNotification(firestore, incidence.employeeId, {
                    title: `Incidencia ${status === 'approved' ? 'Aprobada' : 'Rechazada'}`,
                    message: `Tu solicitud de ${incidence.type} del ${incidence.startDate} ha sido ${status === 'approved' ? 'aprobada' : 'rechazada'}. ${rejectionReason ? `Motivo: ${rejectionReason}` : ''}`,
                    type: status === 'approved' ? 'success' : 'warning',
                    link: '/hcm'
                });

                // [FIX] Complete associated Task
                // Use requestId (which equals incidenceId) — this field has a composite index
                const tasksRef = collection(firestore, 'tasks');
                const q = query(
                    tasksRef,
                    where('requestId', '==', incidenceId),
                    where('status', 'in', ['pending', 'Pending'])
                );
                const taskSnap = await getDocs(q);

                // Mark all matching tasks as completed
                await Promise.all(taskSnap.docs.map(tDoc =>
                    updateDoc(tDoc.ref, {
                        status: 'completed',
                        completedAt: new Date().toISOString(),
                        completedBy: approvedById,
                    })
                ));
            }
        }

        console.log(`[HCM] Updated incidence ${incidenceId} to ${status}`);
        return { success: result.success };
    } catch (error) {
        console.error('[HCM] Error updating incidence:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, error: error.message };
        }
        return { success: false, error: 'No se pudo actualizar la incidencia.' };
    }
}

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
    skippedCount?: number; // Added skippedCount
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}





export async function processAttendanceImport(
    rows: AttendanceImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string
): Promise<ProcessAttendanceResult> {
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
            errors: []
        };

        const batchDocRef = await addDoc(batchRef, batchData);
        const batchId = batchDocRef.id;

        const errors: Array<{ row: number; message: string }> = [];
        let successCount = 0;
        let skippedCount = 0;
        const newRecordsToJustify: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }> = [];

        // Determine date range for pre-fetching existing records
        // Important: this assumes rows are somewhat sorted or we iterate all to find min/max
        // To be safe, let's find min/max
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
        // Also fetch existing tardiness and early departure records to prevent duplicates
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
        }> = {};
        const employeeTimeBankBalances: Record<string, number> = {}; // Local cache for processing

        // Cache shifts and locations to avoid redundant reads
        const shiftCache: Record<string, any> = {};
        const locationCache: Record<string, any> = {};

        const employeeAssignments: Record<string, EmployeeShiftAssignment[]> = {};
        const shiftsToFetch = new Set<string>();

        // Pre-scan employees to collect shift IDs
        for (const empId of employeeIds) {
            const empRef = doc(firestore, 'employees', empId);
            const empSnap = await getDoc(empRef);
            if (empSnap.exists()) {
                const empData = empSnap.data() as Employee;

                // 1. Collect Custom Shift ID
                if (empData.customShiftId) shiftsToFetch.add(empData.customShiftId);

                // 2. Collect Historical Shift IDs
                if (empData.shiftAssignments?.length) {
                    employeeAssignments[empId] = empData.shiftAssignments;
                    empData.shiftAssignments.forEach(sa => shiftsToFetch.add(sa.shiftId));
                }

                // Store basic data first
                employeeShifts[empId] = {
                    type: empData.shiftType || 'diurnal',
                    breakMinutes: 0,
                    fullName: empData.fullName || empId,
                    startTime: '',
                    endTime: '',
                    toleranceMinutes: 10,
                    locationId: empData.locationId || undefined,
                    // Store customShiftId for fallback
                    customShiftId: empData.customShiftId
                } as any; // Cast to avoid strict type checks on temp props if needed

                // Location caching
                if (empData.locationId && !locationCache[empData.locationId]) {
                    const locRef = doc(firestore, 'locations', empData.locationId);
                    const locSnap = await getDoc(locRef);
                    if (locSnap.exists()) locationCache[empData.locationId] = locSnap.data();
                }

                // TimeBank caching
                const timeBankRef = doc(firestore, 'time_bank', empId);
                const timeBankSnap = await getDoc(timeBankRef);
                employeeTimeBankBalances[empId] = timeBankSnap.exists() ? (timeBankSnap.data() as TimeBank).hoursBalance : 0;
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

        // Post-process employeeShifts with loaded data (Mocking the old structure for default)
        for (const empId of Object.keys(employeeShifts)) {
            const config = employeeShifts[empId] as any;
            const customShiftId = config.customShiftId;

            // Update tolerance from location
            if (config.locationId && locationCache[config.locationId]) {
                config.toleranceMinutes = locationCache[config.locationId].toleranceMinutes ?? 10;
            }

            // Hydrate default shift data
            if (customShiftId && shiftCache[customShiftId]) {
                const sData = shiftCache[customShiftId];
                config.startTime = sData.startTime || '';
                config.endTime = sData.endTime || '';
                config.breakMinutes = sData.breakMinutes || 0;
                config.daySchedules = sData.daySchedules || {};
            }
        }

        // ---------------------------------------------------------------
        // HOLIDAY CALENDAR PRE-FETCH
        // ---------------------------------------------------------------
        // Fetch all holiday calendars to detect worked holidays (DFT) and company benefit days
        const officialHolidayDates: Record<string, string> = {}; // "YYYY-MM-DD" → holiday name
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
            console.log(`[HCM] Loaded ${Object.keys(officialHolidayDates).length} official holiday dates for years: ${[...yearsInRange].join(', ')}`);
        } catch (calError) {
            console.warn('[HCM] Error loading holiday calendars, continuing without holiday detection:', calError);
        }

        // Build company benefit day dates per location (locationId → Set of "YYYY-MM-DD")
        const locationBenefitDatesMap: Record<string, Set<string>> = {};
        const yearsForBenefitDays = new Set<number>();
        rows.forEach(r => { if (r.date) yearsForBenefitDays.add(parseInt(r.date.substring(0, 4))); });

        for (const [locId, locData] of Object.entries(locationCache)) {
            const benefitDays: string[] = (locData as any).companyBenefitDays || [];
            if (benefitDays.length > 0) {
                const dateSet = new Set<string>();
                for (const year of yearsForBenefitDays) {
                    for (const mmdd of benefitDays) {
                        dateSet.add(`${year}-${mmdd}`); // e.g. "2026-12-24"
                    }
                }
                locationBenefitDatesMap[locId] = dateSet;
            }
        }

        // Process each row
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const rowNum = i + 2;

            try {
                // DUPLICATE CHECK
                if (existingRecordsMap.has(`${row.employeeId}_${row.date}`)) {
                    // console.log(`[HCM] Skipping duplicate for ${row.employeeId} on ${row.date}`);
                    skippedCount++;
                    continue;
                }

                if (!employeeShifts[row.employeeId]) {
                    errors.push({ row: rowNum, message: `Empleado ${row.employeeId} no encontrado` });
                    continue;
                }

                // Calculate hours worked with break deduction
                let shiftConfig = employeeShifts[row.employeeId];

                // -------------------------------------------------------------
                // SHIFT RESOLUTION (Effective Shift for Date)
                // -------------------------------------------------------------
                // If employee has shift assignments, find the one active for this date
                if (employeeAssignments[row.employeeId]) {
                    const effectiveAssignment = employeeAssignments[row.employeeId].find(sa =>
                        sa.startDate <= row.date && (!sa.endDate || sa.endDate >= row.date)
                    );

                    if (effectiveAssignment) {
                        const sData = shiftCache[effectiveAssignment.shiftId];
                        if (sData) {
                            // Clone default config and override with historical shift data
                            shiftConfig = {
                                ...shiftConfig,
                                type: sData.shiftType || 'diurnal',
                                startTime: sData.startTime || '',
                                endTime: sData.endTime || '',
                                breakMinutes: sData.breakMinutes || 0,
                                daySchedules: sData.daySchedules || {},
                            };
                        }
                    }
                }
                // Use break minutes from shift config if available, otherwise use LFT defaults
                // LFT Art. 64: At least 30 min break for shifts > 6 hours. Common: 60 min for diurnal/mixed.

                // Determine schedule: use real shift times if available, fallback to shift type defaults
                let scheduledStart = shiftConfig.startTime || '';
                let scheduledEnd = shiftConfig.endTime || '';
                let scheduledBreak = shiftConfig.breakMinutes || 0;

                // CHECK FOR DAY-SPECIFIC SCHEDULE
                if (shiftConfig.daySchedules && Object.keys(shiftConfig.daySchedules).length > 0) {
                    const [y, m, d] = row.date.split('-').map(Number);
                    const localDate = new Date(y, m - 1, d);
                    const dayOfWeek = localDate.getDay(); // 0=Sun

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

                const hoursWorked = calculateHoursWorked(row.checkIn, row.checkOut, defaultBreakMinutes);

                // Validate workday according to shift type
                const validation = validateWorkday(hoursWorked, shiftConfig.type);

                // -------------------------------------------------------------
                // DEBT COMPENSATION (TIME BANK)
                // -------------------------------------------------------------
                let hoursAppliedToDebt = 0;
                let payableOvertimeHours = validation.overtimeHours;
                let timeBankBalance = employeeTimeBankBalances[row.employeeId] || 0;

                // If user has debt (negative balance) and earned overtime today
                if (timeBankBalance < 0 && validation.overtimeHours > 0) {
                    const debt = Math.abs(timeBankBalance);
                    const overtime = validation.overtimeHours;

                    // Calculate how much overtime applies to debt
                    hoursAppliedToDebt = Math.min(debt, overtime);

                    // Remaining overtime is payable
                    payableOvertimeHours = overtime - hoursAppliedToDebt;

                    // Update local balance cache
                    employeeTimeBankBalances[row.employeeId] += hoursAppliedToDebt;

                    // We will create the movement later or right here?
                    // Better to update TimeBank locally and create a movement record
                    // Note: Ideally we should batch these updates, but for now we do it sequentially
                    // We will add a task to update firestore later in the flow
                }

                // -------------------------------------------------------------
                // HOLIDAY DETECTION
                // Check if this date is an official holiday or company benefit day
                // If employee has a check-in on a holiday → DFT (Día Festivo Trabajado)
                // -------------------------------------------------------------
                let isHolidayDate = false;
                let isCompanyBenefitDate = false;
                let holidayName = '';

                // Check official holidays
                if (officialHolidayDates[row.date]) {
                    isHolidayDate = true;
                    holidayName = officialHolidayDates[row.date];
                }

                // Check company benefit days (per employee's location)
                if (!isHolidayDate && shiftConfig.locationId && locationBenefitDatesMap[shiftConfig.locationId]) {
                    if (locationBenefitDatesMap[shiftConfig.locationId].has(row.date)) {
                        isCompanyBenefitDate = true;
                        holidayName = 'Día de Beneficio Empresa';
                    }
                }

                // Create attendance record
                const attendanceRef = collection(firestore, 'attendance');
                const attendanceData: Omit<AttendanceRecord, 'id'> = {
                    employeeId: row.employeeId,
                    employeeName: employeeShifts[row.employeeId]?.fullName, // Denormalize employee name
                    date: row.date,
                    checkIn: row.checkIn,
                    checkOut: row.checkOut,
                    hoursWorked,
                    regularHours: validation.regularHours,
                    overtimeHours: validation.overtimeHours,
                    payableOvertimeHours,
                    hoursAppliedToDebt,
                    overtimeType: payableOvertimeHours > 0 ? 'double' : null,
                    isValid: validation.isValid,
                    validationNotes: isHolidayDate
                        ? `DFT: Trabajó en día festivo (${holidayName}). ${validation.message || ''}`
                        : isCompanyBenefitDate
                            ? `Día de beneficio empresa trabajado (${holidayName}). ${validation.message || ''}`
                            : (validation.message ?? null),
                    ...(isCompanyBenefitDate && { isCompanyBenefitDay: true, holidayName }),
                    importBatchId: batchId,
                    createdAt: now
                };

                const newAttendanceRef = await addDoc(attendanceRef, attendanceData);
                successCount++;

                // If we applied hours to debt, update Time Bank in Firestore
                if (hoursAppliedToDebt > 0) {
                    await updateTimeBank(
                        row.employeeId,
                        hoursAppliedToDebt,
                        'earn', // 'earn' positive hours cancels out negative balance
                        `Compensación automática de deuda (Asistencia ${row.date})`,
                        'SISTEMA'
                    );
                }

                // -------------------------------------------------------------
                // TARDINESS & EARLY DEPARTURE DETECTION
                // -------------------------------------------------------------

                // Fallback to shift type defaults if no custom shift assigned
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

                // Use location tolerance (loaded from location config, defaults to 10)
                const toleranceMinutes = shiftConfig.toleranceMinutes;

                // Check Tardiness
                if (row.checkIn) {
                    const checkInDate = new Date(`2000-01-01T${row.checkIn}`);
                    const scheduledStartDate = new Date(`2000-01-01T${scheduledStart}`);

                    // Add tolerance
                    const toleranceDate = new Date(scheduledStartDate.getTime() + toleranceMinutes * 60000);

                    if (checkInDate > toleranceDate) {
                        // CHECK FOR APPROVED INCIDENCES FIRST
                        // Logic based on User Requirements: specific permits/vacations override tardiness
                        // We need to check if there is an approved incidence for this employee on this date

                        // Note: ideally we should have prefetched incidences for performance, similar to existingRecordsMap
                        // For now we do it per row but using a query limited to the date
                        // Optimization: Prefetching logic should be added before the loop if performance becomes an issue

                        const incidencesRef = collection(firestore, 'incidences');
                        const q = query(
                            incidencesRef,
                            where('employeeId', '==', row.employeeId),
                            where('startDate', '<=', row.date),
                            where('endDate', '>=', row.date),
                            where('status', '==', 'approved')
                        );

                        const incidenceSnap = await getDocs(q);

                        // If there is an approved incidence covering this date, we skip creating a tardiness record
                        // The user specified: "si ya existían permisos previamente registrados... no lo considerá como tal como una incidencia"
                        if (!incidenceSnap.empty) {
                            // console.log(`[HCM] Skipping tardiness for ${row.employeeId} on ${row.date} due to existing approved incidence`);
                            // We act as if it's justified.
                        } else if (!existingTardinessMap.has(`${row.employeeId}_${row.date}`)) {
                            // Only create if no tardiness already exists for this employee+date
                            const diffMs = checkInDate.getTime() - scheduledStartDate.getTime();
                            const minutesLate = Math.floor(diffMs / 60000);

                            // Create Tardiness Record
                            const tardinessData: Omit<TardinessRecord, 'id'> = {
                                employeeId: row.employeeId,
                                employeeName: employeeShifts[row.employeeId]?.fullName ?? row.employeeId,
                                date: row.date,
                                attendanceRecordId: newAttendanceRef.id,
                                type: 'entry', // 'entry' missing in type definition? No, it's NOT in TardinessRecord interface I saw earlier.
                                // Wait, TardinessRecord interface in firestore-types.ts DOES NOT have 'type'.
                                // Client side interface might have it differently?
                                // I should check types.ts (client) vs firestore-types.ts (functions).
                                // incidence-actions.ts is CLIENT/Server Action, so it uses `src/lib/types.ts`.
                                // Let's assume 'type' is valid or remove it if not.
                                // The code I read earlier had type: 'entry'.
                                scheduledTime: scheduledStart,
                                actualTime: row.checkIn,
                                minutesLate,
                                isJustified: false,
                                justificationStatus: 'pending',
                                // periodStartDate: row.date, // Simplificado // Removed based on interface
                                // tardinessCountInPeriod: 1, // Requiere conteo real // Removed
                                // tardinessCountInWeek: 1, // Requiere conteo real // Removed
                                sanctionApplied: false,
                                createdAt: now,
                                updatedAt: now,
                                importBatchId: batchId
                            } as any; // Cast to avoid partial mismatch during migration

                            const tRef = await addDoc(collection(firestore, 'tardiness_records'), tardinessData);
                            existingTardinessMap.add(`${row.employeeId}_${row.date}`); // Prevent intra-batch duplicates
                            newRecordsToJustify.push({
                                id: tRef.id,
                                employeeId: row.employeeId,
                                date: row.date,
                                type: 'tardiness'
                            });
                        }
                    }
                }

                // Check Early Departure
                // Aplica si checkOut < scheduledEnd y trabajó >= 6 horas (regla de negocio)
                if (row.checkOut && hoursWorked >= 6) {
                    const checkOutDate = new Date(`2000-01-01T${row.checkOut}`);
                    const scheduledEndDate = new Date(`2000-01-01T${scheduledEnd}`);

                    if (checkOutDate < scheduledEndDate) {
                        // CHECK FOR APPROVED INCIDENCES FIRST (EARLY DEPARTURE)
                        const incidencesRef = collection(firestore, 'incidences');
                        const q = query(
                            incidencesRef,
                            where('employeeId', '==', row.employeeId),
                            where('startDate', '<=', row.date),
                            where('endDate', '>=', row.date),
                            where('status', '==', 'approved')
                        );

                        const incidenceSnap = await getDocs(q);

                        if (!incidenceSnap.empty) {
                            // console.log(`[HCM] Skipping early departure for ${row.employeeId} on ${row.date} due to existing approved incidence`);
                        } else if (!existingDeparturesMap.has(`${row.employeeId}_${row.date}`)) {
                            // Only create if no early departure already exists for this employee+date
                            const diffMs = scheduledEndDate.getTime() - checkOutDate.getTime();
                            const minutesEarly = Math.floor(diffMs / 60000);

                            // Create Early Departure Record which IS DIFFERENT from TardinessRecord
                            // But here I'm only fixing the attendance ID usage.

                            const departureData = {
                                employeeId: row.employeeId,
                                employeeName: employeeShifts[row.employeeId]?.fullName ?? row.employeeId,
                                date: row.date,
                                attendanceId: newAttendanceRef.id, // Use newAttendanceRef.id
                                scheduledTime: scheduledEnd,
                                actualTime: row.checkOut,
                                minutesEarly,
                                isJustified: false,
                                justificationStatus: 'pending',
                                createdAt: now,
                                updatedAt: now,
                                importBatchId: batchId
                            };

                            await addDoc(collection(firestore, 'early_departures'), departureData);
                            existingDeparturesMap.add(`${row.employeeId}_${row.date}`);
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

            // Create tasks for managers to review/justify
            // // Basado en Plan de Implementación de NotebookLM
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
                // No bloqueamos el flujo si falla la creación de tareas
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
    }
}

// =========================================================================
// ATTENDANCE NOTIFICATION HELPERS
// =========================================================================

/**
 * Helper to recursively find the first manager with approval permissions
 */
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

            // Check permissions via Position
            if (empData.positionId) {
                const posRef = doc(firestore, 'positions', empData.positionId);
                const posSnap = await getDoc(posRef);

                if (posSnap.exists()) {
                    const position = posSnap.data();
                    // If manager can approve incidences, we found our target
                    if (position.canApproveIncidences) {
                        // Return the Auth User ID if available, otherwise fallback to Employee ID (though we prefer Auth ID)
                        return empData.userId || currentManagerId;
                    }
                }
            }

            // If strictly checking role/system level is needed, add here.
            // For now, we trust the Position 'canApproveIncidences' flag.

            // Escalation: Move to the next manager up
            if (empData.directManagerId) {
                console.log(`[HCM] Manager ${currentManagerId} lacks permission, escalating to ${empData.directManagerId}`);
                currentManagerId = empData.directManagerId;
            } else {
                // No more managers up the chain
                return null;
            }

        } catch (e) {
            console.error(`[HCM] Error resolving manager escalation for ${currentManagerId}`, e);
            return null;
        }
    }

    return null;
}

/**
 * Agrupa registros de retardos/salidas tempranas por manager directo
 * // Basado en Plan de Implementación de NotebookLM
 */
async function groupRecordsByManager(
    firestore: any,
    records: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }>
): Promise<Record<string, Array<{ id: string; employeeId: string; employeeName: string; date: string; type: 'tardiness' | 'early_departure'; minutesLate?: number; minutesEarly?: number }>>> {
    const byManager: Record<string, Array<any>> = {};

    for (const record of records) {
        try {
            // Obtener el manager y datos del empleado
            const empRef = doc(firestore, 'employees', record.employeeId);
            const empSnap = await getDoc(empRef);

            if (empSnap.exists()) {
                const emp = empSnap.data() as Employee;
                const directManagerId = emp.directManagerId;

                if (directManagerId) {
                    // ESCALATION LOGIC:
                    // Find the first manager up the chain who can approve incidences (has 'canApproveIncidences' in Position)
                    // This replaces the simple direct lookup.

                    const targetManagerUserId = await resolveEscalatedManager(firestore, directManagerId);

                    if (targetManagerUserId) {
                        // Obtener detalles del registro (minutos de retardo/salida temprana)
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

/**
 * Crea una tarea en el Buzón para que el manager justifique incidencias
 * // Basado en Plan de Implementación de NotebookLM
 */
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

        // Calcular fecha límite (2 días hábiles)
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + 2);

        // Crear tarea en el Buzón
        const taskData = {
            name: `Justificar Incidencias de Asistencia`,
            description: `Se detectaron ${records.length} incidencias que requieren justificación:\n- ${tardinessCount} retardo${tardinessCount !== 1 ? 's' : ''}\n- ${departureCount} salida${departureCount !== 1 ? 's' : ''} temprana${departureCount !== 1 ? 's' : ''}\n\nEmpleados afectados: ${uniqueEmployees.join(', ')}`,
            type: 'attendance_justification',
            status: 'Active', // Corrected status for visibility
            priority: 'high',
            assigneeId: managerId, // Corrected field name (was assignedTo)
            requestTitle: `Justificar Incidencias - ${metadata.filename}`, // field required by InboxPage
            requestId: 'SYSTEM_GENERATED', // Placeholder for system tasks
            requestOwnerId: metadata.uploadedBy, // Owner is the uploader
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

        // Notificación in-app al manager
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

// =========================================================================
// VACATION BALANCE MANAGEMENT
// =========================================================================

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
            daysCarriedOver: 0,              // Nuevo campo
            daysPending: 0,                   // Nuevo campo
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
 * Interfaz para carga masiva de saldos de vacaciones
 */
export interface VacationBalanceLoad {
    employeeId: string;
    daysEntitled: number;
    daysTaken?: number;
    daysScheduled?: number;
    reason: string;
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
                // Validaciones básicas
                if (!balanceLoad.employeeId || !balanceLoad.employeeId.trim()) {
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

                // Verificar que el empleado existe
                const employeeRef = doc(firestore, 'employees', balanceLoad.employeeId);
                const employeeSnap = await getDoc(employeeRef);

                if (!employeeSnap.exists()) {
                    errors.push({ employeeId: balanceLoad.employeeId, error: 'Empleado no encontrado.' });
                    continue;
                }

                const employee = employeeSnap.data() as Employee;

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
                    where('employeeId', '==', balanceLoad.employeeId),
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
                        employeeId: balanceLoad.employeeId,
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
                    employeeId: balanceLoad.employeeId,
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

// =========================================================================
// TIME BANK
// =========================================================================

export async function updateTimeBank(
    employeeId: string,
    hours: number,
    type: 'earn' | 'use',
    description: string,
    approvedById?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const timeBankRef = doc(firestore, 'time_bank', employeeId);
        const timeBankSnap = await getDoc(timeBankRef);

        let currentBank: TimeBank;

        if (timeBankSnap.exists()) {
            currentBank = timeBankSnap.data() as TimeBank;
        } else {
            currentBank = {
                id: employeeId,
                employeeId,
                hoursEarned: 0,
                hoursUsed: 0,
                hoursBalance: 0,
                hoursExpired: 0,
                lastUpdated: now,
                movements: []
            };
        }

        const movement = {
            id: `mov_${Date.now()}`,
            type,
            hours,
            date: now,
            description,
            approvedById
        };

        if (type === 'earn') currentBank.hoursEarned += hours;
        else currentBank.hoursUsed += hours;

        currentBank.hoursBalance = currentBank.hoursEarned - currentBank.hoursUsed - currentBank.hoursExpired;
        currentBank.lastUpdated = now;
        currentBank.movements = [...currentBank.movements, movement].slice(-50);

        setDocumentNonBlocking(timeBankRef, currentBank, { merge: true });

        console.log(`[HCM] Updated time bank for ${employeeId}: ${type} ${hours} hours`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating time bank:', error);
        return { success: false, error: 'Error actualizando bolsa de horas.' };
    }
}

// =========================================================================
// TARDINESS
// =========================================================================

export async function recordTardiness(
    employeeId: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string
): Promise<{ success: boolean; tardinessId?: string; sanctionApplied?: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        const minutesLate = (actH * 60 + actM) - (schedH * 60 + schedM);

        if (minutesLate <= 0) return { success: false, error: 'No hay retardo.' };

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 7);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0]),
            where('isJustified', '==', false)
        );
        const tardinessSnap = await getDocs(tardinessQuery);
        const records = tardinessSnap.docs.map(d => d.data() as TardinessRecord);

        const countInPeriod = records.length + 1;
        const countInWeek = records.filter(r => new Date(r.date) >= weekStart).length + 1;

        const sanctionApplied = countInPeriod >= 3 || countInWeek >= 2;

        const tardinessData: Omit<TardinessRecord, 'id'> = {
            employeeId,
            date,
            attendanceRecordId,
            type: 'entry',
            scheduledTime,
            actualTime,
            minutesLate,
            isJustified: false,
            justificationStatus: 'pending',
            periodStartDate: thirtyDaysAgo.toISOString().split('T')[0],
            tardinessCountInPeriod: countInPeriod,
            tardinessCountInWeek: countInWeek,
            sanctionApplied,
            sanctionType: sanctionApplied ? 'suspension_1day' : undefined,
            sanctionDate: sanctionApplied ? now : undefined,
            createdAt: now,
            updatedAt: now,
        };

        const tardinessRef = await addDoc(collection(firestore, 'tardiness_records'), tardinessData);
        return { success: true, tardinessId: tardinessRef.id, sanctionApplied };
    } catch (error) {
        console.error('[HCM] Error recording tardiness:', error);
        return { success: false, error: 'Error registrando retardo.' };
    }
}

export async function justifyTardiness(
    tardinessId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string,
    useHourBank: boolean = false,
    justificationType?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        const tardinessSnap = await getDoc(tardinessRef);
        if (!tardinessSnap.exists()) {
            return { success: false, error: 'Registro de retardo no encontrado.' };
        }
        const tardiness = tardinessSnap.data() as TardinessRecord;

        await updateDoc(tardinessRef, {
            isJustified: true,
            justificationStatus: useHourBank ? 'compensated' : 'justified',
            justificationReason: reason,
            justificationType, // Added type
            justifiedById,
            justifiedAt: now,
            sanctionApplied: false,
            updatedAt: now,
            hourBankApplied: useHourBank
        });

        if (useHourBank) {
            await addDebtToHourBank({
                employeeId: tardiness.employeeId,
                date: tardiness.date,
                type: 'tardiness',
                minutes: tardiness.minutesLate,
                reason: `Retardo justificado con bolsa de horas: ${reason}`,
                sourceRecordId: tardinessId,
                createdById: justifiedById,
                createdByName: justifiedByName
            });
        }

        // Check if this completes any pending tasks
        // // Basado en Plan de Implementación de NotebookLM
        try {
            // Find tasks that include this tardiness record
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                // Check if this task includes the current tardiness record
                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
            // Don't fail the justification if task check fails
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying tardiness:', error);
        return { success: false, error: 'Error justificando retardo.' };
    }
}

export async function markTardinessUnjustified(
    tardinessId: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const tardinessRef = doc(firestore, 'tardiness_records', tardinessId);

        await updateDoc(tardinessRef, {
            isJustified: false, // Remains false so it counts as infraction/strike
            justificationStatus: 'unjustified',
            justificationType: 'unjustified',
            justificationReason: 'Marcado como injustificado por supervisor',
            justifiedById,
            // justifiedByName not stored in TardinessRecord type by default but kept for parity if schema evolves or for auditing in logs
            justifiedAt: now,
            updatedAt: now
        });

        // Check if this completes any pending tasks
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === tardinessId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
        }

        return { success: true };
    } catch (error) {
        console.error('[HCM] Error marking tardiness unjustified:', error);
        return { success: false, error: 'Error marcando retardo como injustificado.' };
    }
}

export async function resetTardinessCounter(
    employeeId: string,
    resetById: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const tardinessQuery = query(
            collection(firestore, 'tardiness_records'),
            where('employeeId', '==', employeeId),
            where('date', '>=', thirtyDaysAgo.toISOString().split('T')[0])
        );
        const tardinessSnap = await getDocs(tardinessQuery);

        for (const docSnap of tardinessSnap.docs) {
            await updateDoc(doc(firestore, 'tardiness_records', docSnap.id), {
                sanctionResetById: resetById,
                updatedAt: now,
            });
        }
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error resetting tardiness counter:', error);
        return { success: false, error: 'Error reseteando contador de retardos.' };
    }
}

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
        const now = new Date().toISOString();

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
            createdAt: now,
            updatedAt: now,
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
        const now = new Date().toISOString();
        const requestRef = doc(firestore, 'overtime_requests', requestId);

        const updateData: Partial<OvertimeRequest> = {
            status: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'partial',
            approvedById: processedById,
            approvedByName: processedByName,
            approvedAt: now,
            updatedAt: now,
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

        const now = new Date().toISOString();
        const newCalendar: Omit<HolidayCalendar, 'id'> = {
            name: `México ${year} Oficial`,
            year,
            holidays: defaultHolidays,
            createdAt: now,
            updatedAt: now,
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

// =========================================================================
// SALIDAS TEMPRANAS (EARLY DEPARTURES)
// =========================================================================

/**
 * Tipo importado desde hcm-operational
 * (mantenemos aquí para referencia, el tipo real está en types)
 */
interface EarlyDepartureRecord {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    attendanceRecordId: string;
    scheduledTime: string;
    actualTime: string;
    minutesEarly: number;
    isJustified: boolean;
    justificationReason?: string;
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    resultedInAbsence: boolean;
    linkedAbsenceId?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Registra una salida temprana
 * Se crea cuando un empleado sale antes de su hora programada
 *
 * @param employeeId - ID del empleado
 * @param employeeName - Nombre del empleado
 * @param date - Fecha (YYYY-MM-DD)
 * @param attendanceRecordId - ID del registro de asistencia
 * @param scheduledTime - Hora programada de salida
 * @param actualTime - Hora real de salida
 * @returns Resultado con ID del registro creado
 */
export async function recordEarlyDeparture(
    employeeId: string,
    employeeName: string,
    date: string,
    attendanceRecordId: string,
    scheduledTime: string,
    actualTime: string
): Promise<{ success: boolean; earlyDepartureId?: string; minutesEarly?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Calcular minutos de salida anticipada
        const [schedH, schedM] = scheduledTime.split(':').map(Number);
        const [actH, actM] = actualTime.split(':').map(Number);
        const scheduledMinutes = schedH * 60 + schedM;
        const actualMinutes = actH * 60 + actM;
        const minutesEarly = scheduledMinutes - actualMinutes;

        if (minutesEarly <= 0) {
            return { success: false, error: 'No hay salida temprana (salió a tiempo o después).' };
        }

        const earlyDepartureData: Omit<EarlyDepartureRecord, 'id'> = {
            employeeId,
            employeeName,
            date,
            attendanceRecordId,
            scheduledTime,
            actualTime,
            minutesEarly,
            isJustified: false,
            resultedInAbsence: true, // Por defecto, salida temprano injustificada = falta
            createdAt: now,
            updatedAt: now,
        };

        const earlyDepartureRef = await addDoc(
            collection(firestore, 'early_departures'),
            earlyDepartureData
        );

        console.log(`[HCM] Recorded early departure ${earlyDepartureRef.id} for ${employeeName} - ${minutesEarly} min early`);
        return { success: true, earlyDepartureId: earlyDepartureRef.id, minutesEarly };
    } catch (error) {
        console.error('[HCM] Error recording early departure:', error);
        return { success: false, error: 'No se pudo registrar la salida temprana.' };
    }
}

/**
 * Justifica una salida temprana
 * Si se justifica, el día NO se marca como falta
 *
 * @param earlyDepartureId - ID del registro de salida temprana
 * @param reason - Motivo de justificación
 * @param justifiedById - ID del usuario que justifica
 * @param justifiedByName - Nombre del usuario que justifica
 * @returns Resultado de la operación
 */
export async function justifyEarlyDeparture(
    earlyDepartureId: string,
    reason: string,
    justifiedById: string,
    justifiedByName: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const earlyDepartureRef = doc(firestore, 'early_departures', earlyDepartureId);
        const earlyDepartureSnap = await getDoc(earlyDepartureRef);

        if (!earlyDepartureSnap.exists()) {
            return { success: false, error: 'Registro de salida temprana no encontrado.' };
        }

        await updateDoc(earlyDepartureRef, {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            resultedInAbsence: false, // Ya no es falta
            updatedAt: now,
        });

        console.log(`[HCM] Justified early departure ${earlyDepartureId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error justifying early departure:', error);
        return { success: false, error: 'No se pudo justificar la salida temprana.' };
    }
}

/**
 * Obtiene las salidas tempranas pendientes de justificar para un período
 *
 * @param startDate - Fecha inicio del período
 * @param endDate - Fecha fin del período
 * @param employeeId - Opcional: filtrar por empleado
 * @returns Lista de salidas tempranas pendientes
 */
export async function getPendingEarlyDepartures(
    startDate: string,
    endDate: string,
    employeeId?: string
): Promise<{ success: boolean; records?: EarlyDepartureRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        let earlyDeparturesQuery = query(
            collection(firestore, 'early_departures'),
            where('isJustified', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        if (employeeId) {
            earlyDeparturesQuery = query(
                collection(firestore, 'early_departures'),
                where('employeeId', '==', employeeId),
                where('isJustified', '==', false),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        }

        const snapshot = await getDocs(earlyDeparturesQuery);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as EarlyDepartureRecord[];

        return { success: true, records };
    } catch (error) {
        console.error('[HCM] Error getting pending early departures:', error);
        return { success: false, error: 'Error obteniendo salidas tempranas pendientes.' };
    }
}

// =========================================================================
// MARCAJES FALTANTES (MISSING PUNCHES)
// =========================================================================

/**
 * Tipo de marcaje faltante
 */
type MissingPunchType = 'entry' | 'exit' | 'both';

/**
 * Tipo importado desde hcm-operational
 */
interface MissingPunchRecord {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    attendanceRecordId?: string;
    missingType: MissingPunchType;
    isJustified: boolean;
    justificationReason?: string;
    providedEntryTime?: string;
    providedExitTime?: string;
    generatedTardinessId?: string;
    generatedEarlyDepartureId?: string;
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    resultedInAbsence: boolean;
    linkedAbsenceId?: string;
    createdAt: string;
    updatedAt: string;
}

/**
 * Registra un marcaje faltante
 *
 * @param employeeId - ID del empleado
 * @param employeeName - Nombre del empleado
 * @param date - Fecha (YYYY-MM-DD)
 * @param missingType - Qué marcaje falta
 * @param attendanceRecordId - ID del registro de asistencia (si existe)
 * @returns Resultado con ID del registro creado
 */
export async function recordMissingPunch(
    employeeId: string,
    employeeName: string,
    date: string,
    missingType: MissingPunchType,
    attendanceRecordId?: string
): Promise<{ success: boolean; missingPunchId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Verificar que no exista ya un registro para esta fecha y empleado
        const existingQuery = query(
            collection(firestore, 'missing_punches'),
            where('employeeId', '==', employeeId),
            where('date', '==', date),
            limit(1)
        );
        const existingSnap = await getDocs(existingQuery);

        if (!existingSnap.empty) {
            // Actualizar el registro existente si el tipo de falta es mayor
            const existing = existingSnap.docs[0].data() as MissingPunchRecord;
            if (missingType === 'both' || (existing.missingType !== 'both' && existing.missingType !== missingType)) {
                await updateDoc(existingSnap.docs[0].ref, {
                    missingType: missingType === 'both' ? 'both' : (existing.missingType === 'entry' && missingType === 'exit' ? 'both' : missingType),
                    updatedAt: now,
                });
                return { success: true, missingPunchId: existingSnap.docs[0].id };
            }
            return { success: true, missingPunchId: existingSnap.docs[0].id };
        }

        const missingPunchData: Omit<MissingPunchRecord, 'id'> = {
            employeeId,
            employeeName,
            date,
            attendanceRecordId,
            missingType,
            isJustified: false,
            resultedInAbsence: true, // Por defecto, marcaje faltante = falta
            createdAt: now,
            updatedAt: now,
        };

        const missingPunchRef = await addDoc(
            collection(firestore, 'missing_punches'),
            missingPunchData
        );

        console.log(`[HCM] Recorded missing punch ${missingPunchRef.id} for ${employeeName} - type: ${missingType}`);
        return { success: true, missingPunchId: missingPunchRef.id };
    } catch (error) {
        console.error('[HCM] Error recording missing punch:', error);
        return { success: false, error: 'No se pudo registrar el marcaje faltante.' };
    }
}

/**
 * Justifica un marcaje faltante
 * Requiere proporcionar la hora del marcaje faltante
 * Si la hora no cuadra con el horario, se genera retardo o salida temprana
 *
 * @param missingPunchId - ID del registro de marcaje faltante
 * @param reason - Motivo de justificación
 * @param providedEntryTime - Hora de entrada proporcionada (si faltaba entrada)
 * @param providedExitTime - Hora de salida proporcionada (si faltaba salida)
 * @param scheduledEntryTime - Hora programada de entrada (para comparar)
 * @param scheduledExitTime - Hora programada de salida (para comparar)
 * @param justifiedById - ID del usuario que justifica
 * @param justifiedByName - Nombre del usuario que justifica
 * @param toleranceMinutes - Minutos de tolerancia para entrada
 * @returns Resultado de la operación
 */
export async function justifyMissingPunch(
    missingPunchId: string,
    reason: string,
    providedEntryTime: string | undefined,
    providedExitTime: string | undefined,
    scheduledEntryTime: string,
    scheduledExitTime: string,
    justifiedById: string,
    justifiedByName: string,
    toleranceMinutes: number = 10
): Promise<{
    success: boolean;
    generatedTardinessId?: string;
    generatedEarlyDepartureId?: string;
    error?: string
}> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const missingPunchRef = doc(firestore, 'missing_punches', missingPunchId);
        const missingPunchSnap = await getDoc(missingPunchRef);

        if (!missingPunchSnap.exists()) {
            return { success: false, error: 'Registro de marcaje faltante no encontrado.' };
        }

        const missingPunch = missingPunchSnap.data() as MissingPunchRecord;
        let generatedTardinessId: string | undefined;
        let generatedEarlyDepartureId: string | undefined;

        // Verificar si la hora proporcionada genera retardo
        if (providedEntryTime && (missingPunch.missingType === 'entry' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledEntryTime.split(':').map(Number);
            const [provH, provM] = providedEntryTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const lateMinutes = providedMinutes - scheduledMinutes;

            if (lateMinutes > toleranceMinutes) {
                // Generar registro de retardo
                const tardinessResult = await recordTardiness(
                    missingPunch.employeeId,
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledEntryTime,
                    providedEntryTime
                );
                if (tardinessResult.success && tardinessResult.tardinessId) {
                    generatedTardinessId = tardinessResult.tardinessId;
                }
            }
        }

        // Verificar si la hora proporcionada genera salida temprana
        if (providedExitTime && (missingPunch.missingType === 'exit' || missingPunch.missingType === 'both')) {
            const [schedH, schedM] = scheduledExitTime.split(':').map(Number);
            const [provH, provM] = providedExitTime.split(':').map(Number);
            const scheduledMinutes = schedH * 60 + schedM;
            const providedMinutes = provH * 60 + provM;
            const earlyMinutes = scheduledMinutes - providedMinutes;

            if (earlyMinutes > 0) {
                // Generar registro de salida temprana
                const earlyResult = await recordEarlyDeparture(
                    missingPunch.employeeId,
                    missingPunch.employeeName || '',
                    missingPunch.date,
                    missingPunch.attendanceRecordId || missingPunchId,
                    scheduledExitTime,
                    providedExitTime
                );
                if (earlyResult.success && earlyResult.earlyDepartureId) {
                    generatedEarlyDepartureId = earlyResult.earlyDepartureId;
                }
            }
        }

        // Actualizar el registro de marcaje faltante
        // Only include fields that have values (Firestore rejects undefined)
        const updateData: Record<string, any> = {
            isJustified: true,
            justificationReason: reason,
            justifiedById,
            justifiedByName,
            justifiedAt: now,
            resultedInAbsence: false,
            updatedAt: now,
        };
        if (providedEntryTime !== undefined) updateData.providedEntryTime = providedEntryTime;
        if (providedExitTime !== undefined) updateData.providedExitTime = providedExitTime;
        if (generatedTardinessId !== undefined) updateData.generatedTardinessId = generatedTardinessId;
        if (generatedEarlyDepartureId !== undefined) updateData.generatedEarlyDepartureId = generatedEarlyDepartureId;

        await updateDoc(missingPunchRef, updateData);

        // Check if this completes any pending tasks
        try {
            const tasksQuery = query(
                collection(firestore, 'tasks'),
                where('type', '==', 'attendance_justification'),
                where('status', '==', 'pending')
            );
            const tasksSnap = await getDocs(tasksQuery);

            for (const taskDoc of tasksSnap.docs) {
                const taskData = taskDoc.data();
                const records = taskData.metadata?.records || [];

                if (records.some((r: any) => r.id === missingPunchId)) {
                    await checkAttendanceTaskCompletion(taskDoc.id);
                }
            }
        } catch (taskError) {
            console.error('[HCM] Error checking task completion:', taskError);
        }

        console.log(`[HCM] Justified missing punch ${missingPunchId}`);
        return { success: true, generatedTardinessId, generatedEarlyDepartureId };
    } catch (error) {
        console.error('[HCM] Error justifying missing punch:', error);
        return { success: false, error: 'No se pudo justificar el marcaje faltante.' };
    }
}

/**
 * Obtiene los marcajes faltantes pendientes de justificar para un período
 *
 * @param startDate - Fecha inicio del período
 * @param endDate - Fecha fin del período
 * @param employeeId - Opcional: filtrar por empleado
 * @returns Lista de marcajes faltantes pendientes
 */
export async function getPendingMissingPunches(
    startDate: string,
    endDate: string,
    employeeId?: string
): Promise<{ success: boolean; records?: MissingPunchRecord[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        let missingPunchesQuery = query(
            collection(firestore, 'missing_punches'),
            where('isJustified', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );

        if (employeeId) {
            missingPunchesQuery = query(
                collection(firestore, 'missing_punches'),
                where('employeeId', '==', employeeId),
                where('isJustified', '==', false),
                where('date', '>=', startDate),
                where('date', '<=', endDate)
            );
        }

        const snapshot = await getDocs(missingPunchesQuery);
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as MissingPunchRecord[];

        return { success: true, records };
    } catch (error) {
        console.error('[HCM] Error getting pending missing punches:', error);
        return { success: false, error: 'Error obteniendo marcajes faltantes pendientes.' };
    }
}
