
'use client';

import { useState, useEffect, useMemo } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, getDocs, doc, getDoc } from 'firebase/firestore';
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
    XCircle
} from 'lucide-react';
import type { PrenominaRecord, AttendanceRecord } from '@/lib/types';
import { format, startOfMonth, endOfMonth, parseISO, addMinutes, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { getPendingIncidences } from '@/firebase/actions/prenomina-actions';
import { runGlobalSLAProcessing } from '@/firebase/actions/sla-actions';
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
    const [selectedPeriod, setSelectedPeriod] = useState({
        start: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        end: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });
    const [periodClosures, setPeriodClosures] = useState<any[]>([]);
    const [loadingClosures, setLoadingClosures] = useState(false);

    // Fetch prenomina records for selected period
    const prenominaQuery = useMemoFirebase(() => {
        if (!firestore || !selectedPeriod.start) return null;

        /**
         * Buscamos registros que COMIENCEN dentro del rango seleccionado.
         * En el futuro podríamos mejorar esto para buscar solapamientos (overlap).
         */
        return query(
            collection(firestore, 'prenomina'),
            where('periodStart', '>=', selectedPeriod.start),
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
                const { checkPeriodLock } = await import('@/firebase/actions/report-actions');
                const lockResult = await checkPeriodLock(
                    selectedPeriod.start,
                    selectedPeriod.end
                );

                // For backward compatibility, still show as closure
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

    // Filter records client-side for search
    // Filter records locally to strictly match the selected range (since query is >= start)
    const exactMatchedRecords = useMemo(() => {
        if (!prenominaRecords) return [];
        return (prenominaRecords as PrenominaRecord[]).filter(r =>
            r.periodStart === selectedPeriod.start && r.periodEnd === selectedPeriod.end
        );
    }, [prenominaRecords, selectedPeriod.start, selectedPeriod.end]);

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return exactMatchedRecords;
        return exactMatchedRecords.filter(r =>
            (r.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [exactMatchedRecords, searchTerm]);

    // Calculate totals based on filtered records (NO MONETARY VALUES)
    const totalDaysWorked = filteredRecords.reduce((sum: number, r: PrenominaRecord) => sum + (r.daysWorked || 0), 0);
    const totalOvertimeHours = filteredRecords.reduce((sum: number, r: PrenominaRecord) =>
        sum + (r.overtimeDoubleHours || 0) + (r.overtimeTripleHours || 0), 0);

    // Helper to determine period type based on duration
    const getPeriodType = (start: string, end: string): 'weekly' | 'biweekly' | 'monthly' => {
        const days = differenceInDays(parseISO(end), parseISO(start)) + 1;
        if (days >= 25) return 'monthly';
        if (days >= 12) return 'biweekly';
        return 'weekly';
    };

    // Check if period is already closed (based on exact match of start_end range)
    const currentPeriodKey = `${selectedPeriod.start}_${selectedPeriod.end}`;
    const isPeriodClosed = periodClosures.some(closure => {
        // We match by range key primarily
        return closure.period === currentPeriodKey;
    });

    // Handle consolidation and period closure
    const handleClosePeriod = async () => {
        if (!user || !firestore) return;

        // Check if period is already closed
        if (isPeriodClosed) {
            toast({
                title: "Período ya cerrado",
                description: "Este período ya ha sido consolidado. No se puede volver a cerrar para evitar duplicados.",
                variant: "destructive"
            });
            return;
        }

        // Confirm action
        const confirmed = window.confirm(
            '¿Estás seguro de cerrar el período y consolidar?\n\n' +
            'Este proceso:\n' +
            '1. Validará que no haya incidencias pendientes\n' +
            '2. Ejecutará SLA para infracciones no justificadas\n' +
            '3. Consolidará la prenómina del período\n' +
            '4. Cerrará el período (no se podrá modificar)\n\n' +
            'Esta acción no se puede deshacer.'
        );

        if (!confirmed) return;

        setIsConsolidating(true);
        setValidationErrors([]);

        try {
            // 1. Validate pending incidences
            toast({
                title: "Validando incidencias",
                description: "Verificando que no haya incidencias pendientes...",
            });

            const pendingIncidences = await getPendingIncidences(selectedPeriod.start, selectedPeriod.end);

            if (pendingIncidences.length > 0) {
                setValidationErrors([
                    `Existen ${pendingIncidences.length} incidencias pendientes de aprobar/rechazar en este período.`
                ]);
                toast({
                    title: "Incidencias pendientes",
                    description: `Existen ${pendingIncidences.length} incidencias pendientes. Por favor, revísalas antes de continuar.`,
                    variant: "destructive"
                });
                setIsConsolidating(false);
                return;
            }

            // 2. Execute SLA
            toast({
                title: "Ejecutando SLA",
                description: "Procesando infracciones no justificadas...",
            });

            const slaResult = await runGlobalSLAProcessing(user.uid, user.role as string, user.customRoleId);

            if (!slaResult.success) {
                throw new Error(slaResult.error || 'Error al ejecutar SLA');
            }

            // 3. Consolidate prenomina
            toast({
                title: "Consolidando prenómina",
                description: "Generando registros de prenómina...",
            });

            const effectivePeriodType = getPeriodType(selectedPeriod.start, selectedPeriod.end);

            const consolidateResult = await callConsolidatePrenomina({
                periodStart: selectedPeriod.start,
                periodEnd: selectedPeriod.end,
                periodType: effectivePeriodType
            });

            if (!consolidateResult.success) {
                throw new Error(consolidateResult.errors?.[0]?.message || 'Error al consolidar');
            }

            // 4. Lock the payroll period using granular date-range locks
            toast({
                title: "Bloqueando período",
                description: "Creando bloqueo de período...",
            });

            const { lockPayrollPeriod } = await import('@/firebase/actions/report-actions');
            const lockResult = await lockPayrollPeriod(
                selectedPeriod.start,
                selectedPeriod.end,
                effectivePeriodType,
                user.uid,
                user.fullName || user.email || 'Sistema',
                undefined, // prenominaExportId
                undefined  // exportFormat
            );

            if (!lockResult.success) {
                console.warn('Warning: Could not lock period:', lockResult.error);
                // Don't fail the entire process if lock fails
            }

            // Success toast with summary
            toast({
                title: "Período cerrado exitosamente",
                description: `Se procesaron ${slaResult.stats?.processedTardiness || 0} retardos y ${slaResult.stats?.processedDepartures || 0} salidas tempranas. Se generaron ${consolidateResult.recordIds?.length || 0} registros de prenómina.`,
                variant: "default"
            });

            setIsConsolidateDialogOpen(false);

        } catch (error) {
            console.error('Error closing period:', error);
            toast({
                title: "Error al cerrar período",
                description: error instanceof Error ? error.message : "No se pudo completar el proceso.",
                variant: "destructive"
            });
        } finally {
            setIsConsolidating(false);
        }
    };

    // Handle export to NomiPAQ format (Formato 1: EMPLEADO|FECHA|CODIGO|VALOR)
    const handleExport = async (records: PrenominaRecord[]) => {
        if (!firestore) return;
        setIsExporting(true);

        try {
            toast({
                title: "Generando archivo NomiPAQ",
                description: "Obteniendo detalles de asistencia...",
            });

            // 1. Fetch all attendance for the period to get daily detail
            const attendanceQuery = query(
                collection(firestore, 'attendance'),
                where('date', '>=', selectedPeriod.start),
                where('date', '<=', selectedPeriod.end)
            );
            const attendanceSnap = await getDocs(attendanceQuery);
            const attendanceDocs = attendanceSnap.docs.map(d => ({ id: d.id, ...d.data() } as AttendanceRecord));

            // 2. Fetch all employees to get employeeNumber
            const employeeIds = Array.from(new Set(attendanceDocs.map(a => a.employeeId)));
            const employeesMap: Record<string, any> = {};

            // Fetch in batches if necessary, but for this context assume they fit or fetch as needed
            // For simplicity in this UI, we fetch individual if not many, or bulk
            const employeesSnap = await getDocs(collection(firestore, 'employees'));
            employeesSnap.docs.forEach(d => {
                employeesMap[d.id] = { id: d.id, ...d.data() };
            });

            // 3. Generate Formato 1 lines
            const lines: string[] = [];
            lines.push('EMPLEADO|FECHA|CODIGO|VALOR'); // Header

            for (const att of attendanceDocs as any[]) {
                const emp = employeesMap[att.employeeId];
                if (!emp) continue;

                const employeeNumber = emp.employeeNumber || emp.employeeId || emp.id;
                const date = att.date;

                // Base entry: Worked day
                if (!att.isVoid) {
                    lines.push(`${employeeNumber}|${date}|${NOMIPAQ_CODES.DIA_TRABAJADO}|`);
                }

                // Overtime entries
                if (att.overtimeHours > 0) {
                    const double = att.overtimeDoubleHours || (att.overtimeType === 'double' ? att.overtimeHours : 0);
                    const triple = att.overtimeTripleHours || (att.overtimeType === 'triple' ? att.overtimeHours : 0);

                    if (double > 0) {
                        lines.push(`${employeeNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_DOBLES}|${double}`);
                    }
                    if (triple > 0) {
                        lines.push(`${employeeNumber}|${date}|${NOMIPAQ_CODES.HORAS_EXTRAS_TRIPLES}|${triple}`);
                    }
                }

                // Infractions (if they resulted in absence, they'll have codes)
                // Use status or nomipaqCode if present
                const status = att.status || (att as any).dayStatus;
                if (status === 'absence_unjustified' || att.nomipaqCode === '1FINJ') {
                    lines.push(`${employeeNumber}|${date}|${NOMIPAQ_CODES.FALTA_INJUSTIFICADA}|`);
                } else if (att.hasTardiness || att.nomipaqCode === '1RET') {
                    lines.push(`${employeeNumber}|${date}|${NOMIPAQ_CODES.RETARDO}|`);
                }
            }

            // 4. Download file
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
                description: 'El archivo NomiPAQ (Formato 1) ha sido descargado.',
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
        } catch (error) {
            console.error('Error generating official reports:', error);
            toast({
                title: "Error al generar reportes",
                description: error instanceof Error ? error.message : "Error desconocido",
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
            // parseISO treats "YYYY-MM-DD" as local midnight if no T is present
            // preventing the 1-day shift common with new Date(dateStr)
            return format(parseISO(dateStr), 'dd MMM yyyy', { locale: es });
        } catch {
            return dateStr;
        }
    };

    // Get managers who haven't closed
    const allManagers = Array.from(new Set(filteredRecords.map((r: PrenominaRecord) => r.employeeId))); // This would need manager IDs
    const closedManagers = periodClosures.map((c: any) => c.managerId);
    const pendingManagers = allManagers.filter(m => !closedManagers.includes(m));

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

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-col gap-1.5 mr-2">
                            <Label htmlFor="year-select" className="text-[10px] font-bold uppercase text-gray-400">Año</Label>
                            <Select
                                value={selectedPeriod.start.substring(0, 4)}
                                onValueChange={(year) => {
                                    const monthDay = selectedPeriod.start.substring(5);
                                    const endMonthDay = selectedPeriod.end.substring(5);
                                    setSelectedPeriod({
                                        start: `${year}-${monthDay}`,
                                        end: `${year}-${endMonthDay}`
                                    });
                                }}
                            >
                                <SelectTrigger id="year-select" className="h-9 w-[90px] border-blue-200">
                                    <SelectValue placeholder="Año" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="2024">2024</SelectItem>
                                    <SelectItem value="2025">2025</SelectItem>
                                    <SelectItem value="2026">2026</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

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
                            onClick={() => setIsConsolidateDialogOpen(true)}
                            className="h-9 bg-blue-600 hover:bg-blue-700"
                            disabled={isPeriodClosed}
                        >
                            <Calculator className="mr-2 h-4 w-4" />
                            Cerrar Período
                        </Button>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    {/* Period Selection */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                <div className="flex-1">
                                    <Label>Período a consolidar</Label>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <Input
                                            type="date"
                                            value={selectedPeriod.start}
                                            onChange={(e) => setSelectedPeriod({ ...selectedPeriod, start: e.target.value })}
                                        />
                                        <Input
                                            type="date"
                                            value={selectedPeriod.end}
                                            onChange={(e) => setSelectedPeriod({ ...selectedPeriod, end: e.target.value })}
                                        />
                                    </div>
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

                    {/* Manager Status */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Users className="h-5 w-5" />
                                Estado de Jefes
                            </CardTitle>
                            <CardDescription>
                                Jefes que han cerrado y pendientes de cerrar el período
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <div className="flex items-center gap-2 mb-2">
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                        <span className="font-medium">Jefes que cerraron ({periodClosures.length})</span>
                                    </div>
                                    {loadingClosures ? (
                                        <p className="text-sm text-muted-foreground">Cargando...</p>
                                    ) : periodClosures.length > 0 ? (
                                        <div className="space-y-1">
                                            {periodClosures.map(closure => (
                                                <div key={closure.id} className="text-sm flex items-center justify-between p-2 bg-green-50 rounded">
                                                    <span>{closure.managerName}</span>
                                                    <span className="text-xs text-muted-foreground">
                                                        {formatDate(closure.closedAt)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">Ningún jefe ha cerrado aún</p>
                                    )}
                                </div>
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
                                                <TableCell>
                                                    <Badge className="bg-blue-100 text-blue-800">Consolidado</Badge>
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
                                        <li>• Ejecución de SLA para infracciones</li>
                                        <li>• Consolidación de prenómina</li>
                                        <li>• Cierre del período (no reversible)</li>
                                    </ul>
                                </div>

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
            </div >
        </SiteLayout >
    );
}
