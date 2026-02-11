'use client';

import { useState } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
    Calculator,
    FileSpreadsheet,
    Download,
    RefreshCw,
    CheckCircle2,
    Clock,
    TrendingUp,
    AlertTriangle,
    Lock,
    ArrowLeft
} from 'lucide-react';
import type { PrenominaRecord, Employee } from '@/lib/types';
import { consolidatePrenomina } from '@/firebase/actions/report-actions';
import { callGeneratePayrollReports } from '@/firebase/callable-functions';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import Link from 'next/link';

/**
 * Prenomina Consolidation Page (Operational Only)
 * Focuses on Time & Attendance, Incidences, and Overtime.
 */
export default function PrenominaPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [isConsolidating, setIsConsolidating] = useState(false);
    const [consolidateProgress, setConsolidateProgress] = useState(0);
    const [isConsolidateDialogOpen, setIsConsolidateDialogOpen] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // Consolidation form state
    const [consolidateForm, setConsolidateForm] = useState({
        periodType: 'biweekly' as 'weekly' | 'biweekly' | 'monthly',
        periodStart: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
        periodEnd: format(endOfMonth(new Date()), 'yyyy-MM-dd')
    });

    // Fetch prenomina records
    const prenominaQuery = useMemoFirebase(() => {
        if (!firestore) return null;

        if (statusFilter !== 'all') {
            return query(
                collection(firestore, 'prenomina'),
                where('status', '==', statusFilter),
                orderBy('periodStart', 'desc')
            );
        }

        return query(
            collection(firestore, 'prenomina'),
            orderBy('periodStart', 'desc')
        );
    }, [firestore, statusFilter]);

    const { data: prenominaRecords, isLoading } = useCollection<PrenominaRecord>(prenominaQuery);

    // Calculate totals - Operational only
    const totalDaysWorked = prenominaRecords?.reduce((sum, r) => sum + (r.daysWorked || 0), 0) ?? 0;
    const totalOvertime = prenominaRecords?.reduce((sum, r) =>
        sum + (r.overtimeDoubleHours || 0) + (r.overtimeTripleHours || 0), 0) ?? 0;

    // Get status badge
    const getStatusBadge = (status: PrenominaRecord['status']) => {
        switch (status) {
            case 'reviewed':
                return <Badge className="bg-blue-100 text-blue-800">Revisada</Badge>;
            case 'exported':
                return <Badge className="bg-green-100 text-green-800">Exportada</Badge>;
            case 'locked':
                return <Badge className="bg-gray-100 text-gray-800"><Lock className="w-3 h-3 mr-1" />Bloqueada</Badge>;
            default:
                return <Badge className="bg-yellow-100 text-yellow-800">Borrador</Badge>;
        }
    };

    // Handle consolidation
    const handleConsolidate = async () => {
        if (!user) return;

        setIsConsolidating(true);
        setConsolidateProgress(10);

        try {
            setConsolidateProgress(30);

            const result = await consolidatePrenomina({
                periodStart: consolidateForm.periodStart,
                periodEnd: consolidateForm.periodEnd,
                periodType: consolidateForm.periodType,
                createdById: user.uid
            });

            setConsolidateProgress(100);

            if (result.success) {
                toast({
                    title: 'Consolidación completada',
                    description: `Se generaron ${result.recordIds?.length || 0} registros de asistencia.`,
                });
                setIsConsolidateDialogOpen(false);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo consolidar la asistencia.',
                variant: 'destructive',
            });
        } finally {
            setIsConsolidating(false);
            setConsolidateProgress(0);
        }
    };

    // Handle export to Excel (2 files via Cloud Function)
    const handleExportExcel = async () => {
        if (!user) return;

        setIsExporting(true);

        try {
            const result = await callGeneratePayrollReports({
                periodStart: consolidateForm.periodStart,
                periodEnd: consolidateForm.periodEnd,
            });

            if (result.success && result.downloadUrl) {
                // Trigger browser download
                const link = document.createElement('a');
                link.href = result.downloadUrl;
                link.setAttribute('download', `Reportes_Nomina_${consolidateForm.periodStart}_${consolidateForm.periodEnd}.zip`);
                link.style.visibility = 'hidden';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                toast({
                    title: 'Reportes generados',
                    description: `Se descargó el ZIP con: ${result.file1Name} y ${result.file2Name}`,
                });
            } else {
                throw new Error('No se recibió URL de descarga.');
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error?.message || 'No se pudieron generar los reportes Excel.',
                variant: 'destructive',
            });
        } finally {
            setIsExporting(false);
        }
    };

    // Set period based on type
    const updatePeriodDates = (type: 'weekly' | 'biweekly' | 'monthly') => {
        const today = new Date();
        let start: Date, end: Date;

        switch (type) {
            case 'weekly':
                start = startOfWeek(today, { weekStartsOn: 1 });
                end = endOfWeek(today, { weekStartsOn: 1 });
                break;
            case 'biweekly':
                if (today.getDate() <= 15) {
                    start = new Date(today.getFullYear(), today.getMonth(), 1);
                    end = new Date(today.getFullYear(), today.getMonth(), 15);
                } else {
                    start = new Date(today.getFullYear(), today.getMonth(), 16);
                    end = endOfMonth(today);
                }
                break;
            case 'monthly':
            default:
                start = startOfMonth(today);
                end = endOfMonth(today);
        }

        setConsolidateForm({
            periodType: type,
            periodStart: format(start, 'yyyy-MM-dd'),
            periodEnd: format(end, 'yyyy-MM-dd')
        });
    };

    // Count by status
    const draftCount = prenominaRecords?.filter(r => r.status === 'draft').length ?? 0;

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                        <Link href="/">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Consolidación de Asistencia</h1>
                        <p className="text-muted-foreground mt-1">
                            Revisión y cierre de incidencias para nómina
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExportExcel} disabled={isExporting}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        {isExporting ? 'Generando...' : 'Exportar Reportes Excel'}
                    </Button>
                    <Button onClick={() => setIsConsolidateDialogOpen(true)}>
                        <Calculator className="mr-2 h-4 w-4" />
                        Cerrar Periodo
                    </Button>
                </div>
            </div>

            {/* Stats - Operational Only */}
            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Asistencia Total</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{totalDaysWorked} días</div>
                        <p className="text-xs text-muted-foreground">Días trabajados en periodo</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Horas Extra</CardTitle>
                        <TrendingUp className="h-4 w-4 text-amber-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600">{totalOvertime.toFixed(1)} hrs</div>
                        <p className="text-xs text-muted-foreground">Dobles + Triples</p>
                    </CardContent>
                </Card>
            </div>

            {/* Data Table */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle>Detalle por Empleado</CardTitle>
                            <CardDescription>
                                {prenominaRecords?.length || 0} registros encontrados
                            </CardDescription>
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="Filtrar por estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="draft">Borrador</SelectItem>
                                <SelectItem value="reviewed">Revisada</SelectItem>
                                <SelectItem value="exported">Exportada</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Empleado</TableHead>
                                <TableHead>Periodo</TableHead>
                                <TableHead className="text-center">Días Trab.</TableHead>
                                <TableHead className="text-center">HE Dobles</TableHead>
                                <TableHead className="text-center">HE Triples</TableHead>
                                <TableHead className="text-center">Faltas</TableHead>
                                <TableHead className="text-center">Vacaciones</TableHead>
                                <TableHead className="text-center">Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {prenominaRecords?.map((record) => (
                                <TableRow key={record.id}>
                                    <TableCell>
                                        <div>
                                            <p className="font-medium">{record.employeeName}</p>
                                            <p className="text-xs text-muted-foreground">{record.employeeRfc}</p>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <div className="text-sm">
                                            {format(new Date(record.periodStart), 'dd/MM')} - {format(new Date(record.periodEnd), 'dd/MM')}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-center">{record.daysWorked}</TableCell>
                                    <TableCell className="text-center">{record.overtimeDoubleHours}</TableCell>
                                    <TableCell className="text-center">{record.overtimeTripleHours}</TableCell>
                                    <TableCell className="text-center">{record.absenceDays > 0 ? <span className="text-red-600 font-medium">{record.absenceDays}</span> : 0}</TableCell>
                                    <TableCell className="text-center">{record.vacationDaysTaken}</TableCell>
                                    <TableCell className="text-center">
                                        {getStatusBadge(record.status)}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" asChild>
                                            <Link href={`/hcm/reports/${record.id}`}>Ver Detalle</Link>
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {(!prenominaRecords || prenominaRecords.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                        No hay registros para este periodo.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Consolidate Dialog */}
            <Dialog open={isConsolidateDialogOpen} onOpenChange={setIsConsolidateDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Consolidar Asistencia del Periodo</DialogTitle>
                        <DialogDescription>
                            Esto calculará los días trabajados y horas extra para todos los empleados activos.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Tipo</Label>
                            <Select
                                value={consolidateForm.periodType}
                                onValueChange={(val: any) => updatePeriodDates(val)}
                            >
                                <SelectTrigger className="col-span-3">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="weekly">Semanal</SelectItem>
                                    <SelectItem value="biweekly">Quincenal</SelectItem>
                                    <SelectItem value="monthly">Mensual</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Inicio</Label>
                            <Input
                                type="date"
                                value={consolidateForm.periodStart}
                                onChange={(e) => setConsolidateForm({ ...consolidateForm, periodStart: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label className="text-right">Fin</Label>
                            <Input
                                type="date"
                                value={consolidateForm.periodEnd}
                                onChange={(e) => setConsolidateForm({ ...consolidateForm, periodEnd: e.target.value })}
                                className="col-span-3"
                            />
                        </div>
                    </div>

                    {isConsolidating && (
                        <div className="space-y-2">
                            <Progress value={consolidateProgress} />
                            <p className="text-xs text-center text-muted-foreground">Procesando registros...</p>
                        </div>
                    )}

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsConsolidateDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleConsolidate} disabled={isConsolidating}>
                            {isConsolidating ? 'Procesando...' : 'Consolidar'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
