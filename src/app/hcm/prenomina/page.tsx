
'use client';

import { useState } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
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
    DollarSign,
    TrendingUp,
    AlertTriangle,
    Lock,
    ArrowLeft,
    Search
} from 'lucide-react';
import type { PrenominaRecord, Employee } from '@/lib/types';
import { callConsolidatePrenomina } from '@/firebase/callable-functions';
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/hcm-utils';
import { getPendingIncidences, lockPrenominaRecords } from '@/firebase/actions/prenomina-actions';
import { usePermissions } from '@/hooks/use-permissions';
import { hasPermission } from '@/firebase/role-actions';

/**
 * Prenomina Consolidation Page
 */
export default function PrenominaPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { permissions, isLoading: loadingPermissions } = usePermissions();
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [isConsolidating, setIsConsolidating] = useState(false);
    const [consolidateProgress, setConsolidateProgress] = useState(0);
    const [isConsolidateDialogOpen, setIsConsolidateDialogOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [isLocking, setIsLocking] = useState(false);

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

    // Filter records client-side for search
    const filteredRecords = prenominaRecords?.filter(record => {
        if (!searchTerm) return true;
        const searchLower = searchTerm.toLowerCase();
        return (
            record.employeeName?.toLowerCase().includes(searchLower) ||
            record.employeeRfc?.toLowerCase().includes(searchLower)
        );
    }) || [];

    // Calculate totals based on filtered records
    const totalGrossPay = filteredRecords.reduce((sum, r) => sum + (r.grossPay || 0), 0);
    const totalNetPay = filteredRecords.reduce((sum, r) => sum + (r.netPay || 0), 0);
    const totalOvertime = filteredRecords.reduce((sum, r) =>
        sum + (r.overtimeDoubleAmount || 0) + (r.overtimeTripleAmount || 0), 0);

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

            const result = await callConsolidatePrenomina({
                periodStart: consolidateForm.periodStart,
                periodEnd: consolidateForm.periodEnd,
                periodType: consolidateForm.periodType
            });

            setConsolidateProgress(100);

            if (result.success) {
                toast({
                    title: 'Consolidación completada',
                    description: `Se generaron ${result.recordIds?.length || 0} registros de pre-nómina.`,
                });
                setIsConsolidateDialogOpen(false);
            } else {
                throw new Error(result.errors?.[0]?.message || 'Error desconocido');
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo consolidar la pre-nómina.',
                variant: 'destructive',
            });
        } finally {
            setIsConsolidating(false);
            setConsolidateProgress(0);
        }
    };

    // Handle Period Validation and Consolidate
    const handleValidateAndConsolidate = async () => {
        setValidationErrors([]);
        setIsConsolidating(true);
        try {
            // 1. Validate
            const pendingIncidences = await getPendingIncidences(consolidateForm.periodStart, consolidateForm.periodEnd);

            if (pendingIncidences.length > 0) {
                setValidationErrors([
                    `Existen ${pendingIncidences.length} incidencias pendientes de aprobar/rechazar en este período.`
                ]);
                setIsConsolidating(false);
                return;
            }

            // 2. Proceed to Consolidate
            handleConsolidate();

        } catch (error) {
            console.error(error);
            setIsConsolidating(false);
        }
    };

    // Handle Locking
    const handleLockPeriod = async () => {
        const recordsToLock = prenominaRecords?.filter(r => r.status === 'reviewed' || r.status === 'exported')
            .map(r => r.id) || [];

        if (recordsToLock.length === 0) return;

        if (!confirm(`¿Estás seguro de bloquear ${recordsToLock.length} registros? Esta acción no se puede deshacer.`)) return;

        setIsLocking(true);
        try {
            await lockPrenominaRecords(recordsToLock);
            toast({
                title: 'Período Bloqueado',
                description: 'Los registros han sido bloqueados para edición.',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo bloquear el período.',
                variant: 'destructive'
            });
        } finally {
            setIsLocking(false);
        }
    };

    // Handle export to Nomipaq format
    const handleExport = (records: PrenominaRecord[]) => {
        // Create CSV content for Nomipaq import
        const headers = [
            'RFC',
            'Nombre',
            'Dias Trabajados',
            'Salario Base',
            'Horas Extra Dobles',
            'Monto HE Dobles',
            'Horas Extra Triples',
            'Monto HE Triples',
            'Prima Dominical',
            'Deducciones',
            'Percepciones',
            'Neto'
        ].join(',');

        const rows = records.map(r => [
            r.employeeRfc || '',
            r.employeeName || '',
            r.daysWorked,
            r.salaryBase.toFixed(2),
            r.overtimeDoubleHours.toFixed(2),
            r.overtimeDoubleAmount.toFixed(2),
            r.overtimeTripleHours.toFixed(2),
            r.overtimeTripleAmount.toFixed(2),
            r.sundayPremiumAmount.toFixed(2),
            r.totalDeductions.toFixed(2),
            r.grossPay.toFixed(2),
            r.netPay.toFixed(2)
        ].join(','));

        const csv = [headers, ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `prenomina_${consolidateForm.periodStart}_${consolidateForm.periodEnd}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        toast({
            title: 'Exportación completada',
            description: 'El archivo CSV ha sido descargado.',
        });
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

    // Format date
    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'dd MMM yyyy', { locale: es });
        } catch {
            return dateStr;
        }
    };

    // Count by status (from full list)
    const draftCount = prenominaRecords?.filter(r => r.status === 'draft').length ?? 0;
    const reviewedCount = prenominaRecords?.filter(r => r.status === 'reviewed').length ?? 0;
    const exportedCount = prenominaRecords?.filter(r => r.status === 'exported').length ?? 0;

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Pre-Nómina</h1>
                            <p className="text-muted-foreground">
                                Consolidación y exportación de pre-nómina para timbrado
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {hasPermission(permissions, 'hcm_prenomina_export', 'write') && (
                            <Button variant="outline" onClick={() => handleExport(filteredRecords.filter(r => r.status === 'draft'))}>
                                <Download className="mr-2 h-4 w-4" />
                                Exportar a Nomipaq
                            </Button>
                        )}
                        {hasPermission(permissions, 'hcm_prenomina_process', 'write') && (
                            <Button onClick={() => setIsConsolidateDialogOpen(true)}>
                                <Calculator className="mr-2 h-4 w-4" />
                                Consolidar Período
                            </Button>
                        )}
                        {hasPermission(permissions, 'hcm_prenomina_close', 'write') && (
                            <Button
                                variant="destructive"
                                onClick={handleLockPeriod}
                                disabled={isLocking || !prenominaRecords?.some(r => r.status === 'reviewed' || r.status === 'exported')}
                            >
                                <Lock className="mr-2 h-4 w-4" />
                                Bloquear
                            </Button>
                        )}
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    {/* Stats */}
                    <div className="grid gap-4 md:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Bruto</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{formatCurrency(totalGrossPay)}</div>
                                <p className="text-xs text-muted-foreground">Percepciones totales</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Total Neto</CardTitle>
                                <TrendingUp className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">{formatCurrency(totalNetPay)}</div>
                                <p className="text-xs text-muted-foreground">Neto a pagar</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Horas Extra</CardTitle>
                                <Clock className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">{formatCurrency(totalOvertime)}</div>
                                <p className="text-xs text-muted-foreground">Monto total HE</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Registros</CardTitle>
                                <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{filteredRecords.length}</div>
                                <p className="text-xs text-muted-foreground">
                                    {draftCount} borrador, {exportedCount} exportados
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filters */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por empleado o RFC..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="Estado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los estados</SelectItem>
                                        <SelectItem value="draft">Borrador</SelectItem>
                                        <SelectItem value="reviewed">Revisada</SelectItem>
                                        <SelectItem value="exported">Exportada</SelectItem>
                                        <SelectItem value="locked">Bloqueada</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Pre-nomina Records Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Registros de Pre-Nómina</CardTitle>
                            <CardDescription>
                                Detalle por empleado para el período seleccionado
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Período</TableHead>
                                        <TableHead className="text-right">Días</TableHead>
                                        <TableHead className="text-right">Salario Base</TableHead>
                                        <TableHead className="text-right">Horas Extra</TableHead>
                                        <TableHead className="text-right">Prima Dom.</TableHead>
                                        <TableHead className="text-right">Deducciones</TableHead>
                                        <TableHead className="text-right">Neto</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8">
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
                                                    <Badge variant="outline" className="mt-1">
                                                        {record.periodType === 'weekly' ? 'Semanal' :
                                                            record.periodType === 'biweekly' ? 'Quincenal' : 'Mensual'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">{record.daysWorked}</TableCell>
                                                <TableCell className="text-right">{formatCurrency(record.salaryBase)}</TableCell>
                                                <TableCell className="text-right">
                                                    {(record.overtimeDoubleHours > 0 || record.overtimeTripleHours > 0) ? (
                                                        <div>
                                                            <div>{formatCurrency(record.overtimeDoubleAmount + record.overtimeTripleAmount)}</div>
                                                            <div className="text-xs text-muted-foreground">
                                                                {record.overtimeDoubleHours > 0 && `${record.overtimeDoubleHours.toFixed(1)}h×2`}
                                                                {record.overtimeDoubleHours > 0 && record.overtimeTripleHours > 0 && ' + '}
                                                                {record.overtimeTripleHours > 0 && `${record.overtimeTripleHours.toFixed(1)}h×3`}
                                                            </div>
                                                        </div>
                                                    ) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {record.sundayPremiumAmount > 0
                                                        ? formatCurrency(record.sundayPremiumAmount)
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right text-red-600">
                                                    {record.totalDeductions > 0
                                                        ? `-${formatCurrency(record.totalDeductions)}`
                                                        : '-'}
                                                </TableCell>
                                                <TableCell className="text-right font-bold text-green-600">
                                                    {formatCurrency(record.netPay)}
                                                </TableCell>
                                                <TableCell>{getStatusBadge(record.status)}</TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                No hay registros de pre-nómina
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
                                <DialogTitle>Consolidar Pre-Nómina</DialogTitle>
                                <DialogDescription>
                                    Genera los registros de pre-nómina para el período seleccionado
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-4">
                                <div>
                                    <Label>Tipo de período</Label>
                                    <Select
                                        value={consolidateForm.periodType}
                                        onValueChange={(v) => updatePeriodDates(v as any)}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="weekly">Semanal</SelectItem>
                                            <SelectItem value="biweekly">Quincenal</SelectItem>
                                            <SelectItem value="monthly">Mensual</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <Label>Fecha inicio</Label>
                                        <Input
                                            type="date"
                                            value={consolidateForm.periodStart}
                                            onChange={(e) => setConsolidateForm({ ...consolidateForm, periodStart: e.target.value })}
                                            className="mt-1"
                                        />
                                    </div>
                                    <div>
                                        <Label>Fecha fin</Label>
                                        <Input
                                            type="date"
                                            value={consolidateForm.periodEnd}
                                            onChange={(e) => setConsolidateForm({ ...consolidateForm, periodEnd: e.target.value })}
                                            className="mt-1"
                                        />
                                    </div>
                                </div>

                                {isConsolidating && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between text-sm">
                                            <span>Consolidando...</span>
                                            <span>{consolidateProgress}%</span>
                                        </div>
                                        <Progress value={consolidateProgress} />
                                    </div>
                                )}

                                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                                    <p className="font-medium mb-1">Este proceso realizará:</p>
                                    <ul className="text-muted-foreground space-y-1">
                                        <li>• Lectura de registros de asistencia del período</li>
                                        <li>• Cálculo de horas extra según "Ley de los 9s"</li>
                                        <li>• Aplicación de incidencias aprobadas</li>
                                        <li>• Cálculo de prima dominical</li>
                                        <li>• Generación de registro por empleado</li>
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
                                    onClick={handleValidateAndConsolidate}
                                    disabled={isConsolidating || validationErrors.length > 0}
                                >
                                    {isConsolidating ? (
                                        <>
                                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                                            Procesando...
                                        </>
                                    ) : (
                                        <>
                                            <Calculator className="mr-2 h-4 w-4" />
                                            Consolidar
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </SiteLayout>
    );
}
