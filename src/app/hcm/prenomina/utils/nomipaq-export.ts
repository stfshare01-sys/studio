import {
    Firestore,
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';
import type { AttendanceRecord } from "@/types/hcm.types";
import { NOMIPAQ_CODES } from "@/types/hcm.types";

/**
 * Genera las líneas del archivo NomiPAQ (Formato 1) para el período indicado.
 * Solo lectura — no hace escrituras en Firestore.
 * Extrae la lógica de exportación del componente prenomina/page.tsx.
 *
 * @param firestore - Instancia de Firestore del cliente
 * @param period - Rango de fechas { start: 'YYYY-MM-DD', end: 'YYYY-MM-DD' }
 * @param legalEntity - Razón social para filtrar empleados ('all' = sin filtro)
 * @returns String CSV con cabecera EMPLEADO|FECHA|CODIGO|VALOR
 */
export async function generateNomipaqLines(
    firestore: Firestore,
    period: { start: string; end: string },
    legalEntity: string
): Promise<string> {
    const [attendanceSnap, incidencesSnap, employeesSnap, shiftsSnap, calendarsSnap, overtimeSnap] =
        await Promise.all([
            getDocs(query(
                collection(firestore, 'attendance'),
                where('date', '>=', period.start),
                where('date', '<=', period.end)
            )),
            getDocs(query(
                collection(firestore, 'incidences'),
                where('status', '==', 'approved'),
                where('startDate', '<=', period.end)
            )),
            getDocs(collection(firestore, 'employees')),
            getDocs(collection(firestore, 'custom_shifts')),
            getDocs(query(
                collection(firestore, 'holiday_calendars'),
                where('year', '==', parseInt(period.start.substring(0, 4)))
            )),
            getDocs(query(
                collection(firestore, 'overtime_requests'),
                where('date', '>=', period.start),
                where('date', '<=', period.end),
                where('status', 'in', ['approved', 'partial'])
            )),
        ]);

    const attendanceDocs = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
    const incidenceDocs = incidencesSnap.docs
        .map(d => ({ id: d.id, ...d.data() } as any))
        .filter((inc: any) => inc.endDate >= period.start);

    const employeesMap: Record<string, any> = {};
    employeesSnap.docs.forEach(d => {
        const empData = d.data();
        if (legalEntity !== 'all' && empData.legalEntity !== legalEntity) return;
        employeesMap[d.id] = { id: d.id, ...empData };
    });

    const shiftsMap: Record<string, any> = {};
    shiftsSnap.docs.forEach(d => { shiftsMap[d.id] = { id: d.id, ...d.data() }; });

    const overtimeMap: Record<string, any> = {};
    overtimeSnap.docs.forEach(d => {
        const req = d.data();
        overtimeMap[`${req.employeeId}_${req.date}`] = req;
    });

    const holidayDates = new Set<string>();
    calendarsSnap.docs.forEach(d => {
        (d.data().holidays || []).forEach((h: any) => holidayDates.add(h.date));
    });

    const processedSundays = new Set<string>();
    const lines: string[] = ['EMPLEADO|FECHA|CODIGO|VALOR'];

    for (const att of attendanceDocs) {
        const emp = employeesMap[att.employeeId];
        if (!emp || att.isVoid) continue;

        const empNumber = emp.employeeNumber || emp.id;
        const date = att.date;
        const dayOfWeek = new Date(date + 'T00:00:00').getDay();
        const shift = emp.customShiftId ? shiftsMap[emp.customShiftId] : null;
        const restDays: number[] = shift?.restDays ?? [0, 6];
        const isRestDay = restDays.includes(dayOfWeek);
        const isHoliday = holidayDates.has(date);
        const isSunday = dayOfWeek === 0;
        const effectivelyWorked =
            (!!att.checkIn && att.checkIn.trim() !== '') ||
            (typeof att.hoursWorked === 'number' && att.hoursWorked > 0);

        if (effectivelyWorked) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_TRABAJADO}|`);

        const otReq = overtimeMap[`${att.employeeId}_${date}`];
        if (otReq) {
            if (otReq.doubleHours > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_DOBLES}|${otReq.doubleHours}`);
            if (otReq.tripleHours > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_TRIPLES}|${otReq.tripleHours}`);
        } else if (att.overtimeHours > 0) {
            const double = (att as any).overtimeDoubleHours || (att.overtimeType === 'double' ? att.overtimeHours : 0);
            const triple = (att as any).overtimeTripleHours || (att.overtimeType === 'triple' ? att.overtimeHours : 0);
            if (double > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_DOBLES}|${double}`);
            if (triple > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_TRIPLES}|${triple}`);
        }

        if (isRestDay && effectivelyWorked) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_DESCANSO_LABORADO}|`);
        if (isHoliday && effectivelyWorked) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_FESTIVO_TRABAJADO}|`);
        if (isSunday && effectivelyWorked) {
            const key = `${att.employeeId}_${date}`;
            if (!processedSundays.has(key)) {
                lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.PRIMA_DOMINICAL}|`);
                processedSundays.add(key);
            }
        }
    }

    for (const inc of incidenceDocs) {
        const emp = employeesMap[inc.employeeId];
        if (!emp) continue;

        const empNumber = emp.employeeNumber || emp.id;
        const incStart = inc.startDate > period.start ? inc.startDate : period.start;
        const incEnd = inc.endDate < period.end ? inc.endDate : period.end;

        let code = '';
        switch (inc.type) {
            case 'vacation': code = NOMIPAQ_CODES.VACACIONES; break;
            case 'sick_leave': case 'maternity': code = NOMIPAQ_CODES.INCAPACIDAD; break;
            case 'personal_leave': case 'paternity': case 'bereavement':
                code = inc.isPaid ? NOMIPAQ_CODES.PERMISO_CON_SUELDO : NOMIPAQ_CODES.PERMISO_SIN_SUELDO; break;
            case 'unpaid_leave': code = NOMIPAQ_CODES.PERMISO_SIN_SUELDO; break;
            case 'unjustified_absence': code = NOMIPAQ_CODES.FALTA_INJUSTIFICADA; break;
            case 'abandono_empleo': code = NOMIPAQ_CODES.ABANDONO_EMPLEO; break;
        }

        if (code) {
            const current = new Date(incStart + 'T00:00:00');
            const last = new Date(incEnd + 'T00:00:00');
            while (current <= last) {
                const d = current.toISOString().substring(0, 10);
                lines.push(`${empNumber}|${d}|${code}|`);
                current.setDate(current.getDate() + 1);
            }
        }
    }

    for (const empId of Object.keys(employeesMap)) {
        const emp = employeesMap[empId];
        if (emp.terminationDate && emp.terminationDate >= period.start && emp.terminationDate <= period.end) {
            lines.push(`${emp.employeeNumber || emp.id}|${emp.terminationDate}|${NOMIPAQ_CODES.BAJA}|`);
        }
    }

    return lines.join('\n');
}

/**
 * Descarga un string como archivo de texto en el navegador.
 * @param content - Contenido del archivo
 * @param filename - Nombre del archivo a descargar
 */
export function downloadTextFile(content: string, filename: string): void {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
