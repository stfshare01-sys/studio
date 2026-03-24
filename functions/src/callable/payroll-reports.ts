/**
 * Payroll Reports - Cloud Function
 *
 * Generates two Excel reports for payroll processing:
 * 1. "Reporte de Tiempos y Ausentismos" (Overtime & Absences)
 * 2. "Reporte de Asistencia y Estatus" (Attendance & Status)
 *
 * Both files cover the same date range and employee list.
 * Returns a signed URL to a ZIP containing both Excel files.
 */

import { onCall, HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import * as admin from 'firebase-admin';
import { verifyRole, HCM_ROLES } from '../utils/auth-middleware';
import type {
    Employee,
    AttendanceRecord,
    Incidence,
    TardinessRecord,
} from '../types/firestore-types';

// =========================================================================
// TYPES
// =========================================================================

interface GeneratePayrollReportsRequest {
    periodStart: string; // YYYY-MM-DD
    periodEnd: string;   // YYYY-MM-DD
}

interface GeneratePayrollReportsResponse {
    success: boolean;
    downloadUrl: string;
    file1Name: string;
    file2Name: string;
}

interface CustomShift {
    id: string;
    workDays: number[];
    restDays: number[];
}

interface HolidayCalendar {
    holidays: { date: string; name: string }[];
    countryCode?: string;
}

interface Location {
    overtimeResetDay: 'sunday' | 'saturday' | 'custom';
    customOvertimeResetDay?: number;
    holidayCalendarId?: string;
    companyBenefitDays?: string[];
}

/** Data collected per employee per day */
interface DayData {
    file1Codes: string[];  // Codes for Report 1 (HE2, HE3, FINJ, RET, PSS, PCS)
    file2Codes: string[];  // Codes for Report 2 (ASI, VAC, INC, BJ, DL, DFT, PD)
    he2Hours: number;
    he3Hours: number;
}

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

const DAY_NAMES = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIER', 'SAB'];

/**
 * Generates all dates in a range (inclusive)
 */
function getDateRange(start: string, end: string): string[] {
    const dates: string[] = [];
    const current = new Date(start + 'T00:00:00');
    const last = new Date(end + 'T00:00:00');

    while (current <= last) {
        const y = current.getFullYear();
        const m = String(current.getMonth() + 1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        dates.push(`${y}-${m}-${d}`);
        current.setDate(current.getDate() + 1);
    }

    return dates;
}

/**
 * Calculate vacation days by seniority (Art. 76 LFT - 2023 Reform)
 * Duplicated from vacation-renewal.ts (not exported)
 */
function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;
    if (yearsOfService <= 5) return 12 + ((yearsOfService - 1) * 2);
    if (yearsOfService <= 10) return 20 + ((yearsOfService - 5) * 2);
    if (yearsOfService <= 15) return 32;
    if (yearsOfService <= 20) return 34;
    if (yearsOfService <= 25) return 36;
    if (yearsOfService <= 30) return 38;
    return 40;
}

/**
 * Calculate years of service from hire date
 * Duplicated from vacation-renewal.ts (not exported)
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
 * Check if an employee's anniversary falls within a date range
 */
function isAnniversaryInRange(hireDate: string, periodStart: string, periodEnd: string): boolean {
    const hire = new Date(hireDate);
    const start = new Date(periodStart + 'T00:00:00');
    const end = new Date(periodEnd + 'T00:00:00');

    // Check each year that could contain an anniversary in the range
    for (let year = start.getFullYear(); year <= end.getFullYear(); year++) {
        const anniversary = new Date(year, hire.getMonth(), hire.getDate());
        if (anniversary >= start && anniversary <= end) {
            return true;
        }
    }
    return false;
}

/**
 * Check if a date string falls on a specific day of week
 */
function getDayOfWeek(dateStr: string): number {
    return new Date(dateStr + 'T00:00:00').getDay();
}

// =========================================================================
// MAIN CLOUD FUNCTION
// =========================================================================

const db = admin.firestore();

export const generatePayrollReports = onCall<GeneratePayrollReportsRequest>(
    { region: 'us-central1', timeoutSeconds: 300, memory: '512MiB' },
    async (request: CallableRequest<GeneratePayrollReportsRequest>): Promise<GeneratePayrollReportsResponse> => {
        await verifyRole(request.auth?.uid, HCM_ROLES, 'generar reportes de nómina');

        const { periodStart, periodEnd } = request.data;

        if (!periodStart || !periodEnd) {
            throw new HttpsError('invalid-argument', 'Se requiere periodStart y periodEnd.');
        }

        console.log(`[PayrollReports] Generating reports for ${periodStart} to ${periodEnd}`);

        try {
            // Lazy load heavy dependencies to avoid Firebase function initialization timeout > 10s
            const xlsxModule = await import('xlsx');
            const XLSX = xlsxModule.default || xlsxModule;
            const archiverModule = await import('archiver');
            const archiver = archiverModule.default || archiverModule;

            // =====================================================
            // PHASE 1: FETCH ALL REQUIRED DATA
            // =====================================================

            const dates = getDateRange(periodStart, periodEnd);
            const year = parseInt(periodStart.substring(0, 4));

            // 1a. Get employees: active + terminated within range
            const [activeSnap, terminatedSnap] = await Promise.all([
                db.collection('employees').where('status', '==', 'active').get(),
                db.collection('employees').where('status', '==', 'terminated').get(),
            ]);

            const activeEmployees = activeSnap.docs.map(d => ({ id: d.id, ...d.data() } as Employee & { id: string; terminationDate?: string; hireDate: string; customShiftId?: string; locationId?: string }));
            const terminatedEmployees = terminatedSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Employee & { id: string; terminationDate?: string; hireDate: string; customShiftId?: string; locationId?: string }))
                .filter(emp => emp.terminationDate && emp.terminationDate >= periodStart);

            const allEmployees = [...activeEmployees, ...terminatedEmployees];

            if (allEmployees.length === 0) {
                throw new HttpsError('not-found', 'No se encontraron empleados para el periodo.');
            }

            // 1b. Fetch holiday calendars for the year
            const calendarsSnap = await db.collection('holiday_calendars').where('year', '==', year).get();
            const holidaysByCountry: Record<string, string[]> = {};
            const holidaysByCalendarId: Record<string, string[]> = {};

            calendarsSnap.docs.forEach(doc => {
                const data = doc.data() as HolidayCalendar;
                const holidayDates = (data.holidays || []).map(h => h.date);
                if (data.countryCode) {
                    holidaysByCountry[data.countryCode] = [...(holidaysByCountry[data.countryCode] || []), ...holidayDates];
                }
                holidaysByCalendarId[doc.id] = holidayDates;
            });

            // 1c. Fetch all attendance records for the period (non-voided)
            const attendanceSnap = await db.collection('attendance')
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .get();
            const allAttendance = attendanceSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as AttendanceRecord))
                .filter(a => !a.isVoid);

            // Index by employeeId+date
            const attendanceMap = new Map<string, AttendanceRecord[]>();
            for (const a of allAttendance) {
                const key = a.employeeId;
                if (!attendanceMap.has(key)) attendanceMap.set(key, []);
                attendanceMap.get(key)!.push(a);
            }

            // 1d. Fetch all approved incidences overlapping with the period
            const incidencesSnap = await db.collection('incidences')
                .where('status', '==', 'approved')
                .where('startDate', '<=', periodEnd)
                .get();
            const allIncidences = incidencesSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as Incidence))
                .filter(inc => inc.endDate >= periodStart);

            // Index by employeeId
            const incidenceMap = new Map<string, Incidence[]>();
            for (const inc of allIncidences) {
                const key = inc.employeeId;
                if (!incidenceMap.has(key)) incidenceMap.set(key, []);
                incidenceMap.get(key)!.push(inc);
            }

            // 1e. Fetch unjustified tardiness records
            const tardinessSnap = await db.collection('tardiness_records')
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .where('isJustified', '==', false)
                .get();
            const allTardiness = tardinessSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as TardinessRecord));

            // Index by employeeId+date
            const tardinessMap = new Map<string, Map<string, boolean>>();
            for (const t of allTardiness) {
                if (!tardinessMap.has(t.employeeId)) tardinessMap.set(t.employeeId, new Map());
                tardinessMap.get(t.employeeId)!.set(t.date, true);
            }

            // 1f. Fetch overtime requests
            const overtimeSnap = await db.collection('overtime_requests')
                .where('date', '>=', periodStart)
                .where('date', '<=', periodEnd)
                .where('status', 'in', ['approved', 'partial'])
                .get();

            const overtimeMap = new Map<string, any>();
            for (const doc of overtimeSnap.docs) {
                const req = doc.data();
                overtimeMap.set(`${req.employeeId}_${req.date}`, req);
            }

            // 1f. Fetch locations and shifts (cache to avoid N+1)
            const locationCache = new Map<string, Location>();
            const shiftCache = new Map<string, CustomShift>();

            const uniqueLocationIds = [...new Set(allEmployees.map(e => e.locationId).filter(Boolean))] as string[];
            const uniqueShiftIds = [...new Set(allEmployees.map(e => e.customShiftId).filter(Boolean))] as string[];

            await Promise.all([
                ...uniqueLocationIds.map(async (locId) => {
                    const doc = await db.collection('locations').doc(locId).get();
                    if (doc.exists) locationCache.set(locId, doc.data() as Location);
                }),
                ...uniqueShiftIds.map(async (shiftId) => {
                    const doc = await db.collection('custom_shifts').doc(shiftId).get();
                    if (doc.exists) shiftCache.set(shiftId, { id: doc.id, ...doc.data() } as CustomShift);
                }),
            ]);

            // =====================================================
            // PHASE 2: PROCESS EACH EMPLOYEE DAY-BY-DAY
            // =====================================================

            // Structure: employeeId -> date -> DayData
            const employeeDayData = new Map<string, Map<string, DayData>>();

            for (const emp of allEmployees) {
                const empDays = new Map<string, DayData>();
                const empAttendance = attendanceMap.get(emp.id) || [];
                const empIncidences = incidenceMap.get(emp.id) || [];
                const empTardiness = tardinessMap.get(emp.id) || new Map<string, boolean>();
                
                // Track processed Sundays for PD to avoid duplicate counting
                const processedSundays = new Set<string>();

                // Determine employee's rest days from shift
                const shift = emp.customShiftId ? shiftCache.get(emp.customShiftId) : null;
                const restDays = shift?.restDays ?? [0, 6]; // Default: Sunday + Saturday

                // Determine employee's holiday dates
                let employeeHolidayDates: string[] = [];
                if (emp.locationId) {
                    const loc = locationCache.get(emp.locationId);
                    if (loc?.holidayCalendarId && holidaysByCalendarId[loc.holidayCalendarId]) {
                        employeeHolidayDates = holidaysByCalendarId[loc.holidayCalendarId];
                    } else if (holidaysByCountry['mx']) {
                        employeeHolidayDates = holidaysByCountry['mx'];
                    }
                } else if (holidaysByCountry['mx']) {
                    employeeHolidayDates = holidaysByCountry['mx'];
                }

                // Index attendance by date
                const attendanceByDate = new Map<string, AttendanceRecord>();
                for (const a of empAttendance) {
                    attendanceByDate.set(a.date, a);
                }

                for (const date of dates) {
                    const dayData: DayData = {
                        file1Codes: [],
                        file2Codes: [],
                        he2Hours: 0,
                        he3Hours: 0,
                    };

                    const isTerminated = emp.status === 'terminated' && emp.terminationDate;
                    const isAfterTermination = isTerminated && date > emp.terminationDate!;
                    const isTerminationDay = isTerminated && date === emp.terminationDate;

                    // After termination: leave cells empty
                    if (isAfterTermination) {
                        empDays.set(date, dayData);
                        continue;
                    }

                    // Termination day: only BJ in file 2
                    if (isTerminationDay) {
                        dayData.file2Codes.push('BJ');
                        empDays.set(date, dayData);
                        continue;
                    }

                    const attendance = attendanceByDate.get(date);
                    const dayOfWeek = getDayOfWeek(date);
                    const isRestDay = restDays.includes(dayOfWeek);
                    const isHoliday = employeeHolidayDates.includes(date);
                    const isSunday = dayOfWeek === 0;

                    // Find incidences covering this date
                    const dayIncidences = empIncidences.filter(
                        inc => inc.startDate <= date && inc.endDate >= date
                    );

                    // Process incidences for File 1 (FINJ, RET, PSS, PCS)
                    for (const inc of dayIncidences) {
                        switch (inc.type) {
                            case 'unjustified_absence':
                                dayData.file1Codes.push('1FINJ');
                                dayData.file2Codes.push('FINJ');
                                break;
                            case 'personal_leave':
                            case 'paternity':
                            case 'bereavement':
                                if (inc.isPaid) {
                                    dayData.file1Codes.push('1PCS');
                                    dayData.file2Codes.push('PCS');
                                } else {
                                    dayData.file1Codes.push('1PSS');
                                    dayData.file2Codes.push('PSS');
                                }
                                break;
                            case 'unpaid_leave':
                                dayData.file1Codes.push('1PSS');
                                dayData.file2Codes.push('PSS');
                                break;
                        }
                    }

                    // Process incidences for File 2 (VAC, INC)
                    for (const inc of dayIncidences) {
                        switch (inc.type) {
                            case 'vacation':
                                dayData.file2Codes.push('VAC');
                                break;
                            case 'sick_leave':
                            case 'maternity':
                                dayData.file2Codes.push('INC');
                                break;
                        }
                    }

                    // Process attendance record
                    if (attendance) {
                        const effectivelyWorked = (!!attendance.checkIn && attendance.checkIn.trim() !== '') || (typeof attendance.hoursWorked === 'number' && attendance.hoursWorked > 0);

                        // File 1: Overtime (HE2/HE3) per day
                        const otReq = overtimeMap.get(`${emp.id}_${date}`);
                        if (otReq) {
                            const double = Math.round((otReq.doubleHours || 0) * 2) / 2;
                            const triple = Math.round((otReq.tripleHours || 0) * 2) / 2;
                            if (double > 0) {
                                dayData.he2Hours = double;
                                dayData.file1Codes.push(`${double}HE2`);
                            }
                            if (triple > 0) {
                                dayData.he3Hours = triple;
                                dayData.file1Codes.push(`${triple}HE3`);
                            }
                        } else if (attendance.overtimeHours > 0) {
                            // Backwards compatibility if no matching overtime_request
                            const rawDouble = (attendance as any).overtimeDoubleHours || (attendance.overtimeType === 'double' ? attendance.overtimeHours : 0);
                            const rawTriple = (attendance as any).overtimeTripleHours || (attendance.overtimeType === 'triple' ? attendance.overtimeHours : 0);
                            const double = Math.round(rawDouble * 2) / 2;
                            const triple = Math.round(rawTriple * 2) / 2;
                            if (double > 0) {
                                dayData.he2Hours = double;
                                dayData.file1Codes.push(`${double}HE2`);
                            }
                            if (triple > 0) {
                                dayData.he3Hours = triple;
                                dayData.file1Codes.push(`${triple}HE3`);
                            }
                        }

                        // File 1: Tardiness (RET)
                        // Only add 1RET if there isn't already a full-day incidence (FINJ, PSS, PCS)
                        if (empTardiness.has(date)) {
                            if (!dayData.file1Codes.some(code => code.includes('FINJ') || code.includes('PSS') || code.includes('PCS'))) {
                                dayData.file1Codes.push('1RET');
                            }
                        }

                        // File 2: Determine status codes
                        if (isHoliday) {
                            if (effectivelyWorked) {
                                dayData.file2Codes.push('DDDL');
                            }
                        }
                        if (isRestDay) {
                            if (effectivelyWorked) {
                                dayData.file2Codes.push('DDL');
                            } else if (dayData.file2Codes.length === 0) {
                                dayData.file2Codes.push('DESCANSO');
                            }
                        }
                        if (isSunday && effectivelyWorked && !processedSundays.has(date)) {
                            dayData.file2Codes.push('PD');
                            processedSundays.add(date);
                        }

                        // ASI only if no other File 2 codes exist
                        if (dayData.file2Codes.length === 0 && effectivelyWorked) {
                            dayData.file2Codes.push('ASI');
                        }
                    } else {
                        // No attendance record - check if tardiness without attendance
                        if (empTardiness.has(date)) {
                            if (!dayData.file1Codes.some(code => code.includes('FINJ') || code.includes('PSS') || code.includes('PCS'))) {
                                dayData.file1Codes.push('1RET');
                            }
                        }
                        
                        // Fill in DESCANSO if it's a rest day without other marks
                        if (isRestDay && dayData.file2Codes.length === 0) {
                            dayData.file2Codes.push('DESCANSO');
                        }
                    }

                    empDays.set(date, dayData);
                }

                employeeDayData.set(emp.id, empDays);
            }

            // =====================================================
            // PHASE 3: GENERATE EXCEL FILES
            // =====================================================

            const wb1 = XLSX.utils.book_new();
            const wb2 = XLSX.utils.book_new();

            // --- FILE 1: Reporte de Tiempos y Ausentismos ---
            const file1Data: (string | number)[][] = [];

            // Header row 1: day names
            const header1Row1: string[] = ['N. De Empleado', 'Nombre Completo del Colaborador'];
            for (const date of dates) {
                header1Row1.push(DAY_NAMES[getDayOfWeek(date)]);
            }
            header1Row1.push('SUMA HRS EXT DOB', 'SUMA HRS EXT TRIP');
            file1Data.push(header1Row1);

            // Header row 2: day numbers
            const header1Row2: (string | number)[] = ['', ''];
            for (const date of dates) {
                header1Row2.push(parseInt(date.substring(8, 10)));
            }
            header1Row2.push('', '');
            file1Data.push(header1Row2);

            // Employee rows
            for (const emp of allEmployees) {
                const empDays = employeeDayData.get(emp.id)!;
                const row: (string | number)[] = [emp.id, emp.fullName];
                let sumHE2 = 0;
                let sumHE3 = 0;

                for (const date of dates) {
                    const dayData = empDays.get(date)!;
                    const cellValue = dayData.file1Codes.join(', ');
                    row.push(cellValue);
                    sumHE2 += dayData.he2Hours;
                    sumHE3 += dayData.he3Hours;
                }

                row.push(sumHE2 > 0 ? sumHE2 : '', sumHE3 > 0 ? sumHE3 : '');
                file1Data.push(row);
            }

            const ws1 = XLSX.utils.aoa_to_sheet(file1Data);
            XLSX.utils.book_append_sheet(wb1, ws1, 'Tiempos y Ausentismos');

            // --- FILE 2: Reporte de Asistencia y Estatus ---
            const file2Data: (string | number)[][] = [];

            // Header row 1: day names
            const header2Row1: string[] = ['N. De Empleado', 'Nombre Completo'];
            for (const date of dates) {
                header2Row1.push(DAY_NAMES[getDayOfWeek(date)]);
            }
            header2Row1.push('Vacaciones', 'Faltas', 'Permisos sin goce', 'Permisos con goce', 'Prima Vacacional', 'Días Festivos Trabajados', 'Descanso Laborado', 'Prima Dominical', 'Comentarios');
            file2Data.push(header2Row1);

            // Header row 2: day numbers
            const header2Row2: (string | number)[] = ['', ''];
            for (const date of dates) {
                header2Row2.push(parseInt(date.substring(8, 10)));
            }
            header2Row2.push('', '', '', '', '', '', '', '', '');
            file2Data.push(header2Row2);

            // Employee rows
            for (const emp of allEmployees) {
                const empDays = employeeDayData.get(emp.id)!;
                const row: (string | number)[] = [emp.id, emp.fullName];
                let countDFT = 0;
                let countDL = 0;
                let countPD = 0;
                let countVac = 0;
                let countFaltas = 0;
                let countPSS = 0;
                let countPCS = 0;

                for (const date of dates) {
                    const dayData = empDays.get(date)!;
                    const cellValue = dayData.file2Codes.join(', ');
                    row.push(cellValue);

                    // Count for summary columns
                    if (dayData.file2Codes.includes('DDDL')) countDFT++;
                    if (dayData.file2Codes.includes('DDL')) countDL++;
                    if (dayData.file2Codes.includes('PD')) countPD++;
                    if (dayData.file2Codes.includes('VAC')) countVac++;
                    
                    // Summarize occurrences dynamically by checking File 1 codes for the same day
                    if (dayData.file1Codes.includes('1FINJ')) countFaltas++;
                    if (dayData.file1Codes.includes('1PSS')) countPSS++;
                    if (dayData.file1Codes.includes('1PCS')) countPCS++;
                }

                // Prima Vacacional: check if anniversary falls in range
                let primaVacacional: string | number = '';
                if (emp.hireDate && isAnniversaryInRange(emp.hireDate, periodStart, periodEnd)) {
                    const endDate = new Date(periodEnd + 'T00:00:00');
                    const years = calculateYearsOfService(emp.hireDate, endDate);
                    const vacDays = calculateVacationDays(years);
                    if (vacDays > 0) primaVacacional = vacDays;
                }

                row.push(
                    countVac > 0 ? countVac : '',
                    countFaltas > 0 ? countFaltas : '',
                    countPSS > 0 ? countPSS : '',
                    countPCS > 0 ? countPCS : '',
                    primaVacacional,
                    countDFT > 0 ? countDFT : '',
                    countDL > 0 ? countDL : '',
                    countPD > 0 ? countPD : '',
                    '' // Comentarios
                );
                file2Data.push(row);
            }

            const ws2 = XLSX.utils.aoa_to_sheet(file2Data);
            XLSX.utils.book_append_sheet(wb2, ws2, 'Asistencia y Estatus');

            // =====================================================
            // PHASE 4: CREATE ZIP AND UPLOAD TO STORAGE
            // =====================================================

            const file1Name = `Tiempos_Ausentismos_${periodStart}_${periodEnd}.xlsx`;
            const file2Name = `Asistencia_Estatus_${periodStart}_${periodEnd}.xlsx`;
            const zipName = `Reportes_Nomina_${periodStart}_${periodEnd}.zip`;

            const buf1 = XLSX.write(wb1, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
            const buf2 = XLSX.write(wb2, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

            // Create ZIP in memory
            const zipBuffer = await new Promise<Buffer>((resolve, reject) => {
                const archive = archiver.create('zip', { zlib: { level: 9 } });
                const chunks: Buffer[] = [];

                archive.on('data', (chunk: Buffer) => chunks.push(chunk));
                archive.on('end', () => resolve(Buffer.concat(chunks)));
                archive.on('error', (err: Error) => reject(err));

                archive.append(buf1, { name: file1Name });
                archive.append(buf2, { name: file2Name });
                archive.finalize();
            });

            // Upload to Cloud Storage
            const bucket = admin.storage().bucket();
            const file = bucket.file(`payroll-reports/${zipName}`);

            await file.save(zipBuffer, {
                contentType: 'application/zip',
                metadata: {
                    metadata: {
                        periodStart,
                        periodEnd,
                        generatedAt: new Date().toISOString(),
                        generatedBy: request.auth?.uid,
                    }
                }
            });

            // Generate download URL
            let downloadUrl = '';
            try {
                const [url] = await file.getSignedUrl({
                    action: 'read',
                    expires: Date.now() + 7 * 24 * 60 * 60 * 1000,
                });
                downloadUrl = url;
            } catch (err) {
                // Fallback for emulator (Local development)
                if (process.env.FUNCTIONS_EMULATOR || process.env.FIREBASE_STORAGE_EMULATOR_HOST) {
                    const host = process.env.FIREBASE_STORAGE_EMULATOR_HOST || 'localhost:9199';
                    downloadUrl = `http://${host}/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;
                    console.log(`[PayrollReports] Using emulator download URL: ${downloadUrl}`);
                } else {
                    throw err;
                }
            }

            console.log(`[PayrollReports] Generated ZIP: ${zipName} (${allEmployees.length} employees, ${dates.length} days)`);

            return {
                success: true,
                downloadUrl,
                file1Name,
                file2Name,
            };

        } catch (error: any) {
            console.error('[PayrollReports] Error generating reports:', error);
            if (error instanceof HttpsError) throw error;
            throw new HttpsError('internal', `Error generando reportes: ${error.message}`);
        }
    }
);
