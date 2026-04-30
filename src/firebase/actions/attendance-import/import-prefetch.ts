import { getDocs, getDoc, query, collection, where, limit, doc } from 'firebase/firestore';
import type { AttendanceImportContext, AttendanceImportRow } from './import-types';
import type { Employee, TimeBank, HolidayCalendar, OfficialHoliday, EmployeeShiftAssignment } from '@/types/hcm.types';

export async function preFetchImportData(
    rows: AttendanceImportRow[],
    context: AttendanceImportContext
): Promise<void> {
    const { firestore, minDate, maxDate } = context;

    if (minDate && maxDate) {
        console.log(`[HCM] Checking for duplicates between ${minDate} and ${maxDate}`);

        const [existingSnap, existingTardinessSnap, existingDeparturesSnap, existingAutoIncidSnap] = await Promise.all([
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
            )),
            getDocs(query(
                collection(firestore, 'incidences_auto'),
                where('date', '>=', minDate),
                where('date', '<=', maxDate)
            ))
        ]);

        existingSnap.docs.forEach(doc => {
            const data = doc.data();
            context.existingRecordsMap.add(`${data.employeeId}_${data.date}`);
        });
        existingTardinessSnap.docs.forEach(doc => {
            const data = doc.data();
            context.existingTardinessMap.add(`${data.employeeId}_${data.date}`);
        });
        existingDeparturesSnap.docs.forEach(doc => {
            const data = doc.data();
            context.existingDeparturesMap.add(`${data.employeeId}_${data.date}`);
        });
        existingAutoIncidSnap.docs.forEach(doc => {
            const data = doc.data();
            if (data.type === 'worked_rest_day') {
                context.existingIncidencesAutoMap.add(`${data.employeeId}_${data.date}`);
            }
        });
        console.log(`[HCM] Found ${context.existingRecordsMap.size} existing attendance, ${context.existingTardinessMap.size} tardiness, ${context.existingDeparturesMap.size} early departures, ${context.existingIncidencesAutoMap.size} auto incidences in range`);
    }

    // Get all unique employee IDs and fetch their shift types, location config, and time bank balances
    const employeeIds = [...new Set(rows.map(r => r.employeeId))];
    const shiftsToFetch = new Set<string>();

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
                context.employeeAssignments[actualEmpUid] = empData.shiftAssignments;
                empData.shiftAssignments.forEach(sa => shiftsToFetch.add(sa.shiftId));
            }

            const extEmp = empData as any;
            if (extEmp.positionId && !context.positionCache[extEmp.positionId]) {
                const posRef = doc(firestore, 'positions', extEmp.positionId);
                const posSnap = await getDoc(posRef);
                if (posSnap.exists()) context.positionCache[extEmp.positionId] = posSnap.data();
            }

            context.employeeShifts[empId] = {
                type: empData.shiftType || 'diurnal',
                breakMinutes: 0,
                fullName: empData.fullName || actualEmpUid,
                startTime: '',
                endTime: '',
                toleranceMinutes: 10,
                locationId: empData.locationId || undefined,
                customShiftId: empData.customShiftId,
                allowOvertime: extEmp.positionId && context.positionCache[extEmp.positionId]
                    ? (context.positionCache[extEmp.positionId].generatesOvertime ?? context.positionCache[extEmp.positionId].canEarnOvertime ?? true)
                    : true,
                isExempt: extEmp.positionId && context.positionCache[extEmp.positionId]
                    ? !!context.positionCache[extEmp.positionId].isExemptFromAttendance
                    : false,
                workDays: [],
                restDays: [],
                realUid: actualEmpUid,
                directManagerId: extEmp.directManagerId || null,
                overtimeResetDay: context.locationCache[empData.locationId || '']?.overtimeResetDay || 'sunday',
                status: empData.status,
                terminationDate: empData.terminationDate
            };

            if (empData.locationId && !context.locationCache[empData.locationId]) {
                const locRef = doc(firestore, 'locations', empData.locationId);
                const locSnap = await getDoc(locRef);
                if (locSnap.exists()) context.locationCache[empData.locationId] = locSnap.data();
            }

            const timeBankRef = doc(firestore, 'time_bank', actualEmpUid);
            const timeBankSnap = await getDoc(timeBankRef);
            context.employeeTimeBankBalances[actualEmpUid] = timeBankSnap.exists() ? (timeBankSnap.data() as TimeBank).hoursBalance : 0;
        }
    }

    // FETCH SHIFT ASSIGNMENTS FROM shift_assignments COLLECTION
    const allRealUids = Object.values(context.employeeShifts).map((c: any) => c.realUid).filter(Boolean);
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
                if (!context.employeeAssignments[empUid]) context.employeeAssignments[empUid] = [];
                context.employeeAssignments[empUid].push(mapped);
                shiftsToFetch.add(mapped.shiftId);
            }
        } catch (saError) {
            console.error('[HCM] Error fetching shift_assignments:', saError);
        }
    }

    // Batch Fetch all needed shifts
    for (const shiftId of Array.from(shiftsToFetch)) {
        if (!context.shiftCache[shiftId]) {
            const shiftRef = doc(firestore, 'shifts', shiftId);
            const shiftSnap = await getDoc(shiftRef);
            if (shiftSnap.exists()) {
                context.shiftCache[shiftId] = shiftSnap.data();
            }
        }
    }

    // Post-process employeeShifts with loaded data
    for (const empId of Object.keys(context.employeeShifts)) {
        const config = context.employeeShifts[empId] as any;
        const customShiftId = config.customShiftId;

        if (config.locationId && context.locationCache[config.locationId]) {
            config.toleranceMinutes = context.locationCache[config.locationId].toleranceMinutes ?? 10;
        }

        if (customShiftId && context.shiftCache[customShiftId]) {
            const sData = context.shiftCache[customShiftId];
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

    // HOLIDAY CALENDAR PRE-FETCH
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
                    if (h.date) context.officialHolidayDates[h.date] = h.name || 'Día Festivo';
                });
            });
        }
        console.log(`[HCM] Loaded ${Object.keys(context.officialHolidayDates).length} official holiday dates`);
    } catch (calError) {
        console.warn('[HCM] Error loading holiday calendars, continuing without holiday detection:', calError);
    }

    // Company benefit days per location
    const yearsForBenefitDays = new Set<number>();
    rows.forEach(r => { if (r.date) yearsForBenefitDays.add(parseInt(r.date.substring(0, 4))); });

    for (const [locId, locData] of Object.entries(context.locationCache)) {
        const benefitDays: string[] = (locData as any).companyBenefitDays || [];
        if (benefitDays.length > 0) {
            const dateSet = new Set<string>();
            for (const year of yearsForBenefitDays) {
                for (const mmdd of benefitDays) {
                    dateSet.add(`${year}-${mmdd}`);
                }
            }
            context.locationBenefitDatesMap[locId] = dateSet;
        }
    }

    // APPROVED INCIDENCES PRE-FETCH
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
                if (!context.approvedIncidencesMap[empId]) context.approvedIncidencesMap[empId] = [];
                context.approvedIncidencesMap[empId].push({
                    startDate: data.startDate as string,
                    endDate: data.endDate as string,
                    type: data.type as string
                });
            }
        }
        console.log(`[HCM] Loaded approved incidences for ${Object.keys(context.approvedIncidencesMap).length} employees`);
    } catch (incError) {
        console.warn('[HCM] Error loading approved incidences, continuing without incidence check:', incError);
    }
}
