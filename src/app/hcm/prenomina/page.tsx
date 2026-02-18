
'use client';

import { useState, useEffect, useMemo } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Calculator,
    FileSpreadsheet,
    Download,
    CheckCircle2,
    Clock,
    AlertTriangle,
    ArrowLeft,
    Users,
} from 'lucide-react';
import type { PrenominaRecord, AttendanceRecord } from '@/lib/types';
import { format, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { getPendingIncidences } from '@/firebase/actions/prenomina-actions';
import { runGlobalSLAProcessing } from '@/firebase/actions/sla-actions';
import { checkPeriodLock, lockPayrollPeriod } from '@/firebase/actions/report-actions';
import { usePermissions } from '@/hooks/use-permissions';
import { callConsolidatePrenomina, callGeneratePayrollReports } from '@/firebase/callable-functions';
import { NOMIPAQ_CODES } from '@/types/hcm-operational';

/**
 * Consolidación de Asistencia - Revisión y cierre de incidencias para nómina
 * Esta pantalla NO incluye cálculos monetarios, solo datos de asistencia
 */
export default function ConsolidacionAsistenciaPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { permissions } = usePermissions();
    const { toast } = useToast();
    const [searchTerm, setSearchTerm] = useState('');
    const [isConsolidating, setIsConsolidating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isDownloadingReports, setIsDownloadingReports] = useState(false);
    const [isConsolidateDialogOpen, setIsConsolidateDialogOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    // Step 10: Robust period selector
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [periodType, setPeriodType] = useState<'monthly' | 'biweekly_1' | 'biweekly_2' | 'custom'>('monthly');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');

    const selectedPeriod = useMemo(() => {
        if (periodType === 'custom' && customStart && customEnd) {
            return { start: customStart, end: customEnd };
        }
        const [year, month] = selectedMonth.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        if (periodType === 'biweekly_1') {
            return {
                start: format(start, 'yyyy-MM-dd'),
                end: format(new Date(year, month - 1, 15), 'yyyy-MM-dd')
            };
        } else if (periodType === 'biweekly_2') {
            return {
                start: format(new Date(year, month - 1, 16), 'yyyy-MM-dd'),
                end: format(new Date(year, month, 0), 'yyyy-MM-dd')
            };
        }
        return {
            start: format(start, 'yyyy-MM-dd'),
            end: format(endOfMonth(start), 'yyyy-MM-dd')
        };
    }, [selectedMonth, periodType, customStart, customEnd]);

    const [periodClosures, setPeriodClosures] = useState<any[]>([]);
    const [loadingClosures, setLoadingClosures] = useState(false);

    // Step 3: Pending counts state
    const [pendingCounts, setPendingCounts] = useState({ tardiness: 0, departures: 0, overtime: 0, missingPunches: 0 });
    const [managerReviews, setManagerReviews] = useState<any[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

    // Fetch prenomina records for selected period
    // Query: records whose periodStart falls within or before the selected range end
    // Then filter client-side for overlap (Firestore can't do range-overlap in a single query)
    const prenominaQuery = useMemoFirebase(() => {
        if (!firestore || !selectedPeriod.start) return null;

        return query(
            collection(firestore, 'prenomina'),
            where('periodStart', '<=', selectedPeriod.end),
            orderBy('periodStart', 'desc')
        );
    }, [firestore, selectedPeriod.start, selectedPeriod.end]);

    const { data: prenominaRecords, isLoading } = useCollection<PrenominaRecord>(prenominaQuery);

    // Load period locks to show which periods are closed
    useEffect(() => {
        const loadPeriodLocks = async () => {
            if (!selectedPeriod.start) return;

            setLoadingClosures(true);
            try {
                const lockResult = await checkPeriodLock(
                    selectedPeriod.start,
                    selectedPeriod.end
                );

                if (lockResult.isLocked && lockResult.lock) {
                    setPeriodClosures([{
                        id: lockResult.lock.id,
                        period: `${lockResult.lock.periodStart}_${lockResult.lock.periodEnd}`,
                        closedAt: lockResult.lock.lockedAt,
                        managerName: lockResult.lock.lockedByName
                    }]);
                } else {
                    setPeriodClosures([]);
                }
            } catch (error) {
                console.error('Error loading period locks:', error);
                setPeriodClosures([]);
            } finally {
                setLoadingClosures(false);
            }
        };

        loadPeriodLocks();
    }, [selectedPeriod.start, selectedPeriod.end]);

    // Step 3: Load pending counts for the period
    useEffect(() => {
        const loadPendingCounts = async () => {
            if (!firestore || !selectedPeriod.start) return;
            setLoadingPending(true);
            try {
                const [tardinessSnap, departuresSnap, overtimeSnap, missingSnap, reviewsSnap] = await Promise.all([
                    getDocs(query(
                        collection(firestore, 'tardiness_records'),
                        where('justificationStatus', '==', 'pending'),
                        where('date', '>=', selectedPeriod.start),
                        where('date', '<=', selectedPeriod.end)
                    )),
                    getDocs(query(
                        collection(firestore, 'early_departures'),
                        where('justificationStatus', '==', 'pending'),
                        where('date', '>=', selectedPeriod.start),
                        where('date', '<=', selectedPeriod.end)
                    )),
                    getDocs(query(
                        collection(firestore, 'overtime_requests'),
                        where('status', '==', 'pending'),
                        where('date', '>=', selectedPeriod.start),
                        where('date', '<=', selectedPeriod.end)
                    )),
                    getDocs(query(
                        collection(firestore, 'missing_punches'),
                        where('isJustified', '==', false),
                        where('date', '>=', selectedPeriod.start),
                        where('date', '<=', selectedPeriod.end)
                    )),
                    getDocs(query(
                        collection(firestore, 'manager_review_status'),
                        where('periodStart', '>=', selectedPeriod.start),
                        where('periodEnd', '<=', selectedPeriod.end)
                    ))
                ]);

                setPendingCounts({
                    tardiness: tardinessSnap.size,
                    departures: departuresSnap.size,
                    overtime: overtimeSnap.size,
                    missingPunches: missingSnap.size
                });

                setManagerReviews(reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error('Error loading pending counts:', error);
            } finally {
                setLoadingPending(false);
            }
        };

        loadPendingCounts();
    }, [firestore, selectedPeriod.start, selectedPeriod.end]);

    // Filter records client-side: show records that OVERLAP with the selected range
    // Two ranges overlap when: recordStart <= selectedEnd AND recordEnd >= selectedStart
    const matchedRecords = useMemo(() => {
        if (!prenominaRecords) return [];
        return (prenominaRecords as PrenominaRecord[]).filter(r =>
            r.periodStart <= selectedPeriod.end && r.periodEnd >= selectedPeriod.start
        );
    }, [prenominaRecords, selectedPeriod.start, selectedPeriod.end]);

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return matchedRecords;
        return matchedRecords.filter(r =>
            (r.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [matchedRecords, searchTerm]);

    // Calculate totals based on filtered records (NO MONETARY VALUES)
    const totalDaysWorked = filteredRecords.reduce((sum: number, r: PrenominaRecord) => sum + (r.daysWorked || 0), 0);
    const totalOvertimeHours = filteredRecords.reduce((sum: number, r: PrenominaRecord) =>
        sum + (r.overtimeDoubleHours || 0) + (r.overtimeTripleHours || 0), 0);

    // Check if period is already closed (based on exact match of start_end range)
    const currentPeriodKey = `${selectedPeriod.start}_${selectedPeriod.end}`;
    const isPeriodClosed = periodClosures.some(closure => {
        return closure.period === currentPeriodKey;
    });

    const [consolidationStep, setConsolidationStep] = useState('');

    // Handle consolidation and period closure (called from dialog, no window.confirm)
    const handleClosePeriod = async () => {
        if (!user || !firestore) return;

        if (isPeriodClosed) {
            setValidationErrors(['Este período ya ha sido consolidado. No se puede volver a cerrar.']);
            return;
        }

        setIsConsolidating(true);
        setValidationErrors([]);
        setConsolidationStep('Verificando bloqueo del período...');

        try {
            // 0. Fresh server-side lock check to prevent duplicates
            const freshLockCheck = await checkPeriodLock(selectedPeriod.start, selectedPeriod.end);
            if (freshLockCheck.isLocked) {
                setValidationErrors(['Este período ya ha sido consolidado y bloqueado. No se puede volver a cerrar.']);
                setIsConsolidating(false);
                setConsolidationStep('');
                return;
            }

            // 1. Validate pending incidences
            setConsolidationStep('Validando incidencias pendientes...');
            const pendingIncidences = await getPendingIncidences(selectedPeriod.start, selectedPeriod.end);

            if (pendingIncidences.length > 0) {
                setValidationErrors([
                    `Existen ${pendingIncidences.length} incidencias pendientes de aprobar/rechazar en este período. Revísalas antes de continuar.`
                ]);
                setIsConsolidating(false);
                setConsolidationStep('');
                return;
            }

            // 2. Execute SLA with date range filter
            setConsolidationStep('Ejecutando SLA para infracciones no justificadas...');

            const slaResult = await runGlobalSLAProcessing(
                user.uid,
                user.role as string,
                user.customRoleId,
                selectedPeriod.start,
                selectedPeriod.end
            );

            if (!slaResult.success) {
                throw new Error(slaResult.error || 'Error al ejecutar SLA');
            }

            // 3. Consolidate prenomina
            setConsolidationStep('Consolidando prenómina...');

            const effectivePeriodType = periodType === 'monthly' ? 'monthly' : (periodType === 'custom' ? 'monthly' : 'biweekly');

            const consolidateResult = await callConsolidatePrenomina({
                periodStart: selectedPeriod.start,
                periodEnd: selectedPeriod.end,
                periodType: effectivePeriodType
            });

            if (!consolidateResult.success) {
                throw new Error(consolidateResult.errors?.[0]?.message || 'Error al consolidar');
            }

            // 4. Lock the payroll period
            setConsolidationStep('Bloqueando período...');

            const lockResult2 = await lockPayrollPeriod(
                selectedPeriod.start,
                selectedPeriod.end,
                effectivePeriodType,
                user.uid,
                user.fullName || user.email || 'Sistema',
                undefined,
                undefined
            );

            if (!lockResult2.success) {
                throw new Error(lockResult2.error || 'No se pudo bloquear el período.');
            }

            // Update local state so UI reflects the lock immediately
            setPeriodClosures([{
                id: lockResult2.lockId,
                period: currentPeriodKey,
                closedAt: new Date().toISOString(),
                managerName: user.fullName || user.email || 'Sistema'
            }]);

            toast({
                title: "Período cerrado exitosamente",
                description: `Se procesaron ${slaResult.stats?.processedTardiness || 0} retardos y ${slaResult.stats?.processedDepartures || 0} salidas tempranas. Se generaron ${consolidateResult.recordIds?.length || 0} registros de prenómina.`,
                variant: "default"
            });

            setIsConsolidateDialogOpen(false);
            setConsolidationStep('');

        } catch (error) {
            console.error('Error closing period:', error);
            setValidationErrors([
                error instanceof Error ? error.message : 'No se pudo completar el proceso. Revisa la consola para más detalles.'
            ]);
            setConsolidationStep('');
        } finally {
            setIsConsolidating(false);
        }
    };

    // Step 5: Complete NomiPAQ export with ALL 16 codes
    const handleExport = async (records: PrenominaRecord[]) => {
        if (!firestore) return;
        setIsExporting(true);

        try {
            toast({
                title: "Generando archivo NomiPAQ",
                description: "Obteniendo detalles completos del período...",
            });

            // Fetch all needed data in parallel
            const [attendanceSnap, incidencesSnap, employeesSnap, shiftsSnap, calendarsSnap] = await Promise.all([
                getDocs(query(
                    collection(firestore, 'attendance'),
                    where('date', '>=', selectedPeriod.start),
                    where('date', '<=', selectedPeriod.end)
                )),
                getDocs(query(
                    collection(firestore, 'incidences'),
                    where('status', '==', 'approved'),
                    where('startDate', '<=', selectedPeriod.end)
                )),
                getDocs(collection(firestore, 'employees')),
                getDocs(collection(firestore, 'custom_shifts')),
                getDocs(query(
                    collection(firestore, 'holiday_calendars'),
                    where('year', '==', parseInt(selectedPeriod.start.substring(0, 4)))
                ))
            ]);

            const attendanceDocs = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));
            const incidenceDocs = incidencesSnap.docs
                .map(d => ({ id: d.id, ...d.data() } as any))
                .filter((inc: any) => inc.endDate >= selectedPeriod.start);

            const employeesMap: Record<string, any> = {};
            employeesSnap.docs.forEach(d => { employeesMap[d.id] = { id: d.id, ...d.data() }; });

            const shiftsMap: Record<string, any> = {};
            shiftsSnap.docs.forEach(d => { shiftsMap[d.id] = { id: d.id, ...d.data() }; });

            // Build holidays set
            const holidayDates = new Set<string>();
            calendarsSnap.docs.forEach(d => {
                const cal = d.data();
                (cal.holidays || []).forEach((h: any) => holidayDates.add(h.date));
            });

            // Generate lines
            const lines: string[] = [];
            lines.push('EMPLEADO|FECHA|CODIGO|VALOR');

            for (const att of attendanceDocs) {
                const emp = employeesMap[att.employeeId];
                if (!emp) continue;
                const empNumber = emp.employeeNumber || emp.id;
                const date = att.date;
                const dayOfWeek = new Date(date + 'T00:00:00').getDay();

                // Determine rest days from shift
                const shift = emp.customShiftId ? shiftsMap[emp.customShiftId] : null;
                const restDays: number[] = shift?.restDays ?? [0, 6];
                const isRestDay = restDays.includes(dayOfWeek);
                const isHoliday = holidayDates.has(date);
                const isSunday = dayOfWeek === 0;

                if (att.isVoid) continue;

                // ASI - Attendance
                lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_TRABAJADO}|`);

                // HE2/HE3
                if (att.overtimeHours > 0) {
                    const double = (att as any).overtimeDoubleHours || (att.overtimeType === 'double' ? att.overtimeHours : 0);
                    const triple = (att as any).overtimeTripleHours || (att.overtimeType === 'triple' ? att.overtimeHours : 0);
                    if (double > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_DOBLES}|${double}`);
                    if (triple > 0) lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_TRIPLES}|${triple}`);
                }

                // DL - Descanso Laborado
                if (isRestDay) {
                    lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_DESCANSO_LABORADO}|`);
                }

                // DFT - Día Festivo Trabajado
                if (isHoliday) {
                    lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.DIA_FESTIVO_TRABAJADO}|`);
                }

                // PD - Prima Dominical
                if (isSunday) {
                    lines.push(`${empNumber}|${date}|${NOMIPAQ_CODES.PRIMA_DOMINICAL}|`);
                }
            }

            // Incidences
            for (const inc of incidenceDocs) {
                const emp = employeesMap[inc.employeeId];
                if (!emp) continue;
                const empNumber = emp.employeeNumber || emp.id;

                // Generate entry for each day of the incidence within the period
                const incStart = inc.startDate > selectedPeriod.start ? inc.startDate : selectedPeriod.start;
                const incEnd = inc.endDate < selectedPeriod.end ? inc.endDate : selectedPeriod.end;

                let code = '';
                switch (inc.type) {
                    case 'vacation': code = NOMIPAQ_CODES.VACACIONES; break;
                    case 'sick_leave': case 'maternity': code = NOMIPAQ_CODES.INCAPACIDAD; break;
                    case 'personal_leave': case 'paternity': case 'bereavement':
                        code = inc.isPaid ? NOMIPAQ_CODES.PERMISO_CON_SUELDO : NOMIPAQ_CODES.PERMISO_SIN_SUELDO;
                        break;
                    case 'unjustified_absence': code = NOMIPAQ_CODES.FALTA_INJUSTIFICADA; break;
                    case 'abandono_empleo': code = NOMIPAQ_CODES.ABANDONO_EMPLEO; break;
                }

                if (code) {
                    // Output one line per day of the incidence
                    const current = new Date(incStart + 'T00:00:00');
                    const last = new Date(incEnd + 'T00:00:00');
                    while (current <= last) {
                        const d = current.toISOString().substring(0, 10);
                        lines.push(`${empNumber}|${d}|${code}|`);
                        current.setDate(current.getDate() + 1);
                    }
                }
            }

            // BJ - Baja (employees terminated within the period)
            for (const empId of Object.keys(employeesMap)) {
                const emp = employeesMap[empId];
                if (emp.terminationDate && emp.terminationDate >= selectedPeriod.start && emp.terminationDate <= selectedPeriod.end) {
                    const empNumber = emp.employeeNumber || emp.id;
                    lines.push(`${empNumber}|${emp.terminationDate}|${NOMIPAQ_CODES.BAJA}|`);
                }
            }

            // Download file
            const csv = lines.join('\n');
            const blob = new Blob([csv], { type: 'text/plain;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `nomipaq_formato1_${selectedPeriod.start}_${selectedPeriod.end}.txt`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({
                title: 'Exportación completada',
                description: 'El archivo NomiPAQ (Formato 1) ha sido descargado con todas las claves.',
            });
        } catch (error) {
            console.error('Error exporting to NomiPAQ:', error);
            toast({
                title: 'Error en exportación',
                description: 'No se pudieron obtener los detalles de asistencia.',
                variant: 'destructive'
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Handle official payroll reports (Excel/ZIP)
    const handleOfficialReport = async () => {
        setIsDownloadingReports(true);
        try {
            toast({
                title: "Generando reportes oficiales",
                description: "Esto puede tardar unos segundos...",
            });

            const result = await callGeneratePayrollReports({
                periodStart: selectedPeriod.start,
                periodEnd: selectedPeriod.end
            });

            if (result.success && result.downloadUrl) {
                window.open(result.downloadUrl, '_blank');
                toast({
                    title: "Reportes generados",
                    description: "La descarga del archivo ZIP debería comenzar automáticamente.",
                });
            } else {
                throw new Error("No se recibió la URL de descarga.");
            }
        } catch (error: any) {
            console.error('Error generating official reports:', error);
            const isCloudFunctionError = error?.code === 'functions/not-found'
                || error?.code === 'functions/unavailable'
                || error?.code === 'functions/internal'
                || error?.message?.includes('INTERNAL')
                || error?.message?.includes('not found')
                || error?.message?.includes('Could not find');

            toast({
                title: "Error al generar reportes",
                description: isCloudFunctionError
                    ? "Las Cloud Functions no están disponibles. Si estás en modo demo/local, esta función requiere un entorno con Firebase Functions desplegadas."
                    : (error instanceof Error ? error.message : "Error desconocido"),
                variant: "destructive"
            });
        } finally {
            setIsDownloadingReports(false);
        }
    };

    // Format date correctly handling timezone
    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        try {
            return format(parseISO(dateStr), 'dd MMM yyyy', { locale: es });
        } catch {
            return dateStr;
        }
    };

    // Step 8: Status badge helper
    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'locked':
                return <Badge className="bg-red-100 text-red-800">Bloqueado</Badge>;
            case 'exported':
                return <Badge className="bg-purple-100 text-purple-800">Exportado</Badge>;
            case 'reviewed':
                return <Badge className="bg-green-100 text-green-800">Revisado</Badge>;
            case 'draft':
            default:
                return <Badge className="bg-gray-100 text-gray-800">Borrador</Badge>;
        }
    };

    const totalPending = pendingCounts.tardiness + pendingCounts.departures + pendingCounts.overtime + pendingCounts.missingPunches;

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between border-b">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild title="Volver al Dashboard">
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">Consolidación de Asistencia</h1>
                            <p className="text-sm text-muted-foreground">
                                Revisa y cierra el período para procesar la nómina
                            </p>
                        </div>
                    </div>

                    {/* Period selector in header */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col gap-1.5 mr-2">
                            <Label htmlFor="period-type" className="text-[10px] font-bold uppercase text-gray-400">Tipo</Label>
                            <Select
                                value={periodType}
                                onValueChange={(v) => setPeriodType(v as any)}
                            >
                                <SelectTrigger id="period-type" className="h-9 w-[160px] border-blue-200">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                    <SelectItem value="biweekly_1">Quincenal 1ra</SelectItem>
                                    <SelectItem value="biweekly_2">Quincenal 2da</SelectItem>
                                    <SelectItem value="custom">Personalizado</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {periodType !== 'custom' ? (
                            <div className="flex flex-col gap-1.5 mr-2">
                                <Label htmlFor="month-select" className="text-[10px] font-bold uppercase text-gray-400">Mes</Label>
                                <Input
                                    id="month-select"
                                    type="month"
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="h-9 w-[160px] border-blue-200"
                                />
                            </div>
                        ) : (
                            <>
                                <div className="flex flex-col gap-1.5">
                                    <Label htmlFor="custom-start" className="text-[10px] font-bold uppercase text-gray-400">Inicio</Label>
                                    <Input
                                        id="custom-start"
                                        type="date"
                                        value={customStart}
                                        onChange={(e) => setCustomStart(e.target.value)}
                                        className="h-9 w-[150px] border-blue-200"
                                    />
                                </div>
                                <div className="flex flex-col gap-1.5 mr-2">
                                    <Label htmlFor="custom-end" className="text-[10px] font-bold uppercase text-gray-400">Fin</Label>
                                    <Input
                                        id="custom-end"
                                        type="date"
                                        value={customEnd}
                                        onChange={(e) => setCustomEnd(e.target.value)}
                                        className="h-9 w-[150px] border-blue-200"
                                    />
                                </div>
                            </>
                        )}

                        <Button
                            variant="outline"
                            onClick={handleOfficialReport}
                            disabled={isDownloadingReports || filteredRecords.length === 0}
                            className="h-9 border-green-500 text-green-600 hover:bg-green-50"
                        >
                            <FileSpreadsheet className="mr-2 h-4 w-4" />
                            {isDownloadingReports ? 'Generando...' : 'Reporte Oficial'}
                        </Button>
                        <Button
                            variant="outline"
                            onClick={() => handleExport(filteredRecords)}
                            className="h-9"
                            disabled={isExporting || filteredRecords.length === 0}
                        >
                            <Download className="mr-2 h-4 w-4" />
                            {isExporting ? 'Exportando...' : 'NomiPAQ'}
                        </Button>
                        <Button
                            onClick={() => {
                                setValidationErrors([]);
                                setConsolidationStep('');
                                setIsConsolidateDialogOpen(true);
                            }}
                            className="h-9 bg-blue-600 hover:bg-blue-700"
                            disabled={isPeriodClosed}
                        >
                            <Calculator className="mr-2 h-4 w-4" />
                            Cerrar Período
                        </Button>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    {/* Period Info Display */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Período seleccionado</Label>
                                    <p className="text-lg font-semibold">
                                        {formatDate(selectedPeriod.start)} — {formatDate(selectedPeriod.end)}
                                    </p>
                                </div>
                                {isPeriodClosed && (
                                    <Badge className="bg-green-100 text-green-800 h-fit">
                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                        Período Cerrado
                                    </Badge>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Stats (NO MONETARY VALUES) */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Asistencia Total</CardTitle>
                                <Clock className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{totalDaysWorked} días</div>
                                <p className="text-xs text-muted-foreground">Días trabajados en período</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Horas Extra</CardTitle>
                                <Clock className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">{totalOvertimeHours.toFixed(1)} hrs</div>
                                <p className="text-xs text-muted-foreground">Dobles + Triples</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Step 3: Pending Justifications & Manager Review Status */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Pendientes por Justificar
                            </CardTitle>
                            <CardDescription>
                                Infracciones pendientes de justificación por parte de los jefes en este período
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {loadingPending ? (
                                    <p className="text-sm text-muted-foreground">Cargando...</p>
                                ) : (
                                    <>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                            <div className={`p-3 rounded-lg border ${pendingCounts.tardiness > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                                                <div className="text-2xl font-bold">{pendingCounts.tardiness}</div>
                                                <div className="text-xs text-muted-foreground">Retardos</div>
                                            </div>
                                            <div className={`p-3 rounded-lg border ${pendingCounts.departures > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                                                <div className="text-2xl font-bold">{pendingCounts.departures}</div>
                                                <div className="text-xs text-muted-foreground">Salidas Tempranas</div>
                                            </div>
                                            <div className={`p-3 rounded-lg border ${pendingCounts.overtime > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                                                <div className="text-2xl font-bold">{pendingCounts.overtime}</div>
                                                <div className="text-xs text-muted-foreground">Horas Extra</div>
                                            </div>
                                            <div className={`p-3 rounded-lg border ${pendingCounts.missingPunches > 0 ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200'}`}>
                                                <div className="text-2xl font-bold">{pendingCounts.missingPunches}</div>
                                                <div className="text-xs text-muted-foreground">Marcajes Faltantes</div>
                                            </div>
                                        </div>

                                        {totalPending > 0 && (
                                            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                                                <AlertTriangle className="h-4 w-4 text-amber-600" />
                                                <span className="text-amber-800">
                                                    {totalPending} infracciones pendientes. Al cerrar el período, se procesarán automáticamente por SLA.
                                                </span>
                                            </div>
                                        )}

                                        {/* Manager Review Status */}
                                        {managerReviews.length > 0 && (
                                            <div className="mt-4">
                                                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                    Estado de Revisión de Jefes ({managerReviews.length})
                                                </h4>
                                                <div className="space-y-1">
                                                    {managerReviews.map((review: any) => (
                                                        <div key={review.id} className="text-sm flex items-center justify-between p-2 bg-green-50 rounded">
                                                            <span>{review.managerName}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatDate(review.reviewCompletedAt)}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Prenomina Records Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Detalle por Empleado</CardTitle>
                            <CardDescription>
                                {filteredRecords.length} registros encontrados
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead className="text-right">Días Trab.</TableHead>
                                        <TableHead className="text-right">HE Dobles</TableHead>
                                        <TableHead className="text-right">HE Triples</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead>Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
                                                Cargando registros...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredRecords && filteredRecords.length > 0 ? (
                                        filteredRecords.map((record) => (
                                            <TableRow key={record.id}>
                                                <TableCell>
                                                    <div>
                                                        <div className="font-medium">{record.employeeName}</div>
                                                        <div className="text-xs text-muted-foreground">{record.employeeRfc}</div>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="text-sm">
                                                        {formatDate(record.periodStart)} - {formatDate(record.periodEnd)}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-right">{record.daysWorked || 0}</TableCell>
                                                <TableCell className="text-right">
                                                    {record.overtimeDoubleHours > 0 ? `${record.overtimeDoubleHours.toFixed(1)} hrs` : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {record.overtimeTripleHours > 0 ? `${record.overtimeTripleHours.toFixed(1)} hrs` : '-'}
                                                </TableCell>
                                                {/* Step 8: Status-based badges */}
                                                <TableCell>
                                                    {getStatusBadge(record.status)}
                                                </TableCell>
                                                <TableCell>
                                                    <Button variant="ghost" size="sm">Ver detalle</Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                No hay registros para este período
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Consolidate Dialog */}
                    <Dialog open={isConsolidateDialogOpen} onOpenChange={setIsConsolidateDialogOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Cerrar Período y Consolidar</DialogTitle>
                                <DialogDescription>
                                    Este proceso validará incidencias, ejecutará SLA y consolidará la prenómina
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                    <p className="font-medium mb-1">Este proceso realizará:</p>
                                    <ul className="text-muted-foreground space-y-1">
                                        <li>• Validación de incidencias pendientes</li>
                                        <li>• Ejecución de SLA para infracciones del período</li>
                                        <li>• Consolidación de prenómina</li>
                                        <li>• Cierre del período (no reversible)</li>
                                    </ul>
                                </div>

                                {consolidationStep && (
                                    <div className="bg-blue-50 text-blue-800 p-3 rounded-lg text-sm border border-blue-200 flex items-center gap-2">
                                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                                        {consolidationStep}
                                    </div>
                                )}

                                {validationErrors.length > 0 && (
                                    <div className="bg-red-50 text-red-800 p-3 rounded-lg text-sm border border-red-200">
                                        <div className="flex items-center font-bold mb-1">
                                            <AlertTriangle className="h-4 w-4 mr-2" />
                                            No se puede consolidar
                                        </div>
                                        <ul className="list-disc pl-5">
                                            {validationErrors.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsConsolidateDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button
                                    onClick={handleClosePeriod}
                                    disabled={isConsolidating || validationErrors.length > 0}
                                >
                                    {isConsolidating ? 'Procesando...' : 'Cerrar Período'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </SiteLayout>
    );
}
