import { doc, collection, addDoc, setDoc, getDocs, query, where, limit } from 'firebase/firestore';
import type { AttendanceImportContext, AttendanceImportRow } from './import-types';
import { validateWorkday, calculateHoursWorked } from '@/lib/workday-utils';
import { recordMissingPunch } from '../missing-punch-actions';
import { updateTimeBank } from '../time-bank-actions';
import { accumulateHiddenPositiveHours } from '../hour-bank-actions';
import type { AttendanceRecord } from '@/types/hcm.types';

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

export async function processImportRow(
    row: AttendanceImportRow,
    index: number,
    context: AttendanceImportContext
): Promise<void> {
    const rowNum = index + 2;

    try {
        if (!context.employeeShifts[row.employeeId]) {
            context.errors.push({ row: rowNum, message: `Empleado ${row.employeeId} (ZKTeco ID) no encontrado` });
            return;
        }

        let shiftConfig = context.employeeShifts[row.employeeId];
        const actualUid = shiftConfig.realUid;

        // SKIP IF TERMINATED AND DATE IS STRICTLY AFTER TERMINATION
        if (shiftConfig.status === 'terminated' && shiftConfig.terminationDate) {
            if (row.date > shiftConfig.terminationDate) {
                context.skippedCount++;
                return;
            }
        }

        // DUPLICATE CHECK
        if (context.existingRecordsMap.has(`${actualUid}_${row.date}`)) {
            context.skippedCount++;
            return;
        }

        // SHIFT RESOLUTION
        if (context.employeeAssignments[actualUid] && context.employeeAssignments[actualUid].length > 0) {
            const validAssignments = context.employeeAssignments[actualUid].filter(sa =>
                sa.startDate <= row.date && (!sa.endDate || sa.endDate >= row.date)
            );

            validAssignments.sort((a, b) => {
                if (a.endDate && !b.endDate) return -1;
                if (!a.endDate && b.endDate) return 1;
                return b.startDate.localeCompare(a.startDate);
            });

            const effectiveAssignment = validAssignments[0];

            if (effectiveAssignment) {
                const sData = context.shiftCache[effectiveAssignment.shiftId];
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

        // OFFICE LOCATION
        if (isRestDay && shiftConfig.locationId && context.locationCache[shiftConfig.locationId]?.isOfficeLocation) {
            const hasExplicitAssignment = (context.employeeAssignments[actualUid] || []).some(sa =>
                sa.startDate <= row.date && (!sa.endDate || sa.endDate >= row.date)
            );
            if (!hasExplicitAssignment) {
                console.log(`[HCM] Oficina: Ignorando marcaje de ${shiftConfig.fullName} en día de descanso ${row.date} (sin turno asignado)`);
                context.skippedCount++;
                return;
            }
        }

        let scheduledStart = shiftConfig.startTime || '';
        let scheduledEnd = shiftConfig.endTime || '';
        let scheduledBreak = shiftConfig.breakMinutes || 0;

        if (shiftConfig.daySchedules && Object.keys(shiftConfig.daySchedules).length > 0) {
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

        let rawOvertimeHours = 0;
        if (scheduledStart && scheduledEnd) {
            let earlyArrivalOt = 0;
            let lateDepartureOt = 0;

            if (row.checkIn) {
                const ciDate = new Date(`2000-01-01T${row.checkIn}`);
                const ssDate = new Date(`2000-01-01T${scheduledStart}`);
                let diffMs = ssDate.getTime() - ciDate.getTime();
                if (diffMs < -12 * 3600000) diffMs += 24 * 3600000;
                earlyArrivalOt = Math.max(0, Math.round((diffMs / 3600000) * 100) / 100);
            }

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

        let hoursAppliedToDebt = 0;
        let payableOvertimeHours = validation.overtimeHours;
        let timeBankBalance = context.employeeTimeBankBalances[actualUid] || 0;

        if (timeBankBalance < 0 && validation.overtimeHours > 0) {
            const debt = Math.abs(timeBankBalance);
            const overtime = validation.overtimeHours;
            hoursAppliedToDebt = Math.min(debt, overtime);
            payableOvertimeHours = overtime - hoursAppliedToDebt;
            context.employeeTimeBankBalances[actualUid] += hoursAppliedToDebt;
        }

        let isHolidayDate = false;
        let isCompanyBenefitDate = false;
        let holidayName = '';

        if (context.officialHolidayDates[row.date]) {
            isHolidayDate = true;
            holidayName = context.officialHolidayDates[row.date];
        }

        if (!isHolidayDate && shiftConfig.locationId && context.locationBenefitDatesMap[shiftConfig.locationId]) {
            if (context.locationBenefitDatesMap[shiftConfig.locationId].has(row.date)) {
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

        const newAttendanceRef = doc(collection(context.firestore, 'attendance'));

        let preCreatedTardinessId: string | undefined;
        if (!shiftConfig.isExempt && row.checkIn && (!isRestDay || shiftConfig.allowOvertime) && scheduledStart) {
            const checkInDate = new Date(`2000-01-01T${row.checkIn}`);
            const scheduledStartDate = new Date(`2000-01-01T${scheduledStart}`);
            const toleranceDate = new Date(scheduledStartDate.getTime() + shiftConfig.toleranceMinutes * 60000);

            if (checkInDate > toleranceDate) {
                const empIncidences = context.approvedIncidencesMap[actualUid] || [];
                const hasCovering = empIncidences.some(inc =>
                    inc.startDate <= row.date && inc.endDate >= row.date
                );
                if (!hasCovering && !context.existingTardinessMap.has(`${actualUid}_${row.date}`)) {
                    const dupTSnap = await getDocs(query(
                        collection(context.firestore, 'tardiness_records'),
                        where('employeeId', '==', actualUid),
                        where('date', '==', row.date), limit(1)
                    ));
                    if (dupTSnap.empty) {
                        const diffMs = checkInDate.getTime() - toleranceDate.getTime();
                        const docId = `tard_${actualUid}_${row.date}`;
                        const preRef = doc(context.firestore, 'tardiness_records', docId);
                        await setDoc(preRef, {
                            employeeId: actualUid,
                            employeeName: shiftConfig.fullName ?? actualUid,
                            date: row.date,
                            attendanceRecordId: newAttendanceRef.id,
                            type: 'entry',
                            scheduledTime: scheduledStart,
                            actualTime: row.checkIn,
                            minutesLate: Math.floor(diffMs / 60000),
                            isJustified: false,
                            justificationStatus: 'pending',
                            sanctionApplied: false,
                            importBatchId: context.batchId,
                            createdAt: context.now,
                            updatedAt: context.now,
                        } as any);
                        preCreatedTardinessId = docId;
                        context.existingTardinessMap.add(`${actualUid}_${row.date}`);
                    }
                }
            }
        }

        let preCreatedEarlyId: string | undefined;

        if (!shiftConfig.isExempt && row.checkOut && scheduledEnd && !isCompanyBenefitDate && !isRestDay) {
            const [actH, actM] = row.checkOut.split(':').map(Number);
            const [schedH, schedM] = scheduledEnd.split(':').map(Number);
            
            if (!isNaN(actH) && !isNaN(schedH)) {
                const actualMinutes = actH * 60 + actM;
                const scheduledMinutes = schedH * 60 + schedM;
                const minutesDifference = scheduledMinutes - actualMinutes;

                if (minutesDifference > 0) {
                    const hasCovering = (context.approvedIncidencesMap[actualUid] || []).some(
                        inc => inc.startDate <= row.date && inc.endDate >= row.date
                    );

                    if (!hasCovering && !context.existingDeparturesMap.has(`${actualUid}_${row.date}`)) {
                        const dupEDSnap = await getDocs(query(
                            collection(context.firestore, 'early_departures'),
                            where('employeeId', '==', actualUid),
                            where('date', '==', row.date), 
                            limit(1)
                        ));
                        
                        if (dupEDSnap.empty) {
                            const docId = `ed_${actualUid}_${row.date}`;
                            const preRef = doc(context.firestore, 'early_departures', docId);
                            await setDoc(preRef, {
                                employeeId: actualUid,
                                employeeName: shiftConfig.fullName,
                                date: row.date,
                                attendanceRecordId: newAttendanceRef.id,
                                scheduledTime: scheduledEnd,
                                actualTime: row.checkOut,
                                minutesEarly: minutesDifference,
                                isJustified: false,
                                justificationStatus: 'pending',
                                sanctionApplied: false,
                                importBatchId: context.batchId,
                                createdAt: context.now,
                                updatedAt: context.now,
                            } as any);
                            preCreatedEarlyId = docId;
                            context.existingDeparturesMap.add(`${actualUid}_${row.date}`);
                        }
                    }
                }
            }
        }

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
            importBatchId: context.batchId,
            createdAt: context.now
        };

        await setDoc(newAttendanceRef, attendanceData);
        context.existingRecordsMap.add(`${actualUid}_${row.date}`);
        context.successCount++;

        if (!shiftConfig.isExempt && (!row.checkIn || !row.checkOut)) {
            const empIncidences = context.approvedIncidencesMap[actualUid] || [];
            const coveringIncidence = empIncidences.find(inc =>
                inc.startDate <= row.date && inc.endDate >= row.date
            );

            if (coveringIncidence) {
                console.log(`[HCM] Skipping missing punch for ${shiftConfig.fullName} on ${row.date} — covered by approved ${coveringIncidence.type}`);
            } else if (isRestDay) {
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
            } else {
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

        if (hoursAppliedToDebt > 0) {
            await updateTimeBank(
                actualUid,
                hoursAppliedToDebt,
                'earn',
                `Compensación automática de deuda (Asistencia ${row.date})`,
                'SISTEMA'
            );
        }

        if (payableOvertimeHours > 0 && shiftConfig.allowOvertime) {
            try {
                const resetDay = shiftConfig.overtimeResetDay || 'sunday';
                const weekKey = getWeekKey(row.date, resetDay);
                const accumKey = `${actualUid}_${weekKey}`;

                if (!context.weeklyOvertimeAccum[accumKey]) {
                    context.weeklyOvertimeAccum[accumKey] = { doubleUsed: 0, weekKey };
                }

                const accum = context.weeklyOvertimeAccum[accumKey];

                const MAX_DAILY_DOUBLE = context.overtimeMode === 'weekly_only' ? Infinity : 3;
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
                    requestedToId: shiftConfig.directManagerId || context.uploadedById,
                    requestedToName: '',
                    attendanceRecordId: newAttendanceRef.id,
                    importBatchId: context.batchId,
                    weekKey,
                    weeklyDoubleAccumulated: accum.doubleUsed,
                    createdAt: context.now,
                    updatedAt: context.now
                };

                await addDoc(collection(context.firestore, 'overtime_requests'), overtimeData);
                console.log(`[HCM] Overtime request: ${shiftConfig.fullName} | ${row.date} | ${payableOvertimeHours}h → ${doubleHours}h dobles + ${tripleHours}h triples | week accum: ${accum.doubleUsed}/9`);
            } catch (otError) {
                console.error(`[HCM] Error creating overtime request for ${actualUid}:`, otError);
            }
        }

        if (!shiftConfig.allowOvertime && rawOvertimeHours > 0 && !isRestDay) {
            const extraMinutes = Math.round(rawOvertimeHours * 60);
            if (extraMinutes > 0) {
                try {
                    await accumulateHiddenPositiveHours({
                        employeeId: actualUid,
                        date: row.date,
                        minutes: extraMinutes,
                        reason: `Horas de más sin HE (${row.date}): ${rawOvertimeHours}h acumuladas en bolsa oculta`,
                    });
                    console.log(`[HCM] Bolsa oculta: +${extraMinutes}min para ${shiftConfig.fullName} (${row.date})`);
                } catch (hiddenError) {
                    console.error(`[HCM] Error acumulando bolsa oculta para ${actualUid}:`, hiddenError);
                }
            }
        }

        if (isRestDay && (row.checkIn || row.checkOut)) {
            const isSunday = dayOfWeek === 0;

            if (!context.existingIncidencesAutoMap.has(`${actualUid}_${row.date}`)) {
                await addDoc(collection(context.firestore, 'incidences_auto'), {
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
                    importBatchId: context.batchId,
                    status: 'auto_generated',
                    createdAt: context.now
                });
                context.existingIncidencesAutoMap.add(`${actualUid}_${row.date}`);
            }
        }

        if (preCreatedTardinessId) {
            context.newRecordsToJustify.push({
                id: preCreatedTardinessId,
                employeeId: actualUid,
                date: row.date,
                type: 'tardiness'
            });
        }

        if (preCreatedEarlyId) {
            context.newRecordsToJustify.push({
                id: preCreatedEarlyId,
                employeeId: actualUid,
                date: row.date,
                type: 'early_departure'
            });
        }
    } catch (rowError: any) {
        context.errors.push({ row: rowNum, message: `Error procesando fila: ${rowError.message || rowError}` });
    }
}
