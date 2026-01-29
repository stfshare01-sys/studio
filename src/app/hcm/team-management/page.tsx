'use client';

import { useState, useMemo } from 'react';
import SiteLayout from '@/components/site-layout';
import { useFirebase } from '@/firebase/provider';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
    Users2,
    Clock,
    AlertTriangle,
    Timer,
    CalendarDays,
    Check,
    X,
    Loader2,
    ChevronLeft,
    ChevronRight,
    RefreshCw
} from 'lucide-react';

import {
    getDirectReports,
    getTeamTardiness,
    getTeamEarlyDepartures,
    getTeamOvertimeRequests,
    getTeamMonthlyStats,
    getTeamDailyStats,
    justifyEarlyDeparture,
    approveOvertimeRequest,
    rejectOvertimeRequest,
    assignShift,
    changeEmployeeSchedule,
    getAvailableShifts
} from '@/firebase/actions/team-actions';
import { justifyTardiness } from '@/firebase/actions/incidence-actions';
import { migrateManagerIdField } from '@/firebase/actions/employee-actions';

import type {
    Employee,
    TardinessRecord,
    EarlyDeparture,
    OvertimeRequest,
    EmployeeMonthlyStats,
    TeamDailyStats,
    CustomShift
} from '@/lib/types';

export default function TeamManagementPage() {
    const { user, isUserLoading } = useFirebase();
    const [activeTab, setActiveTab] = useState('overview');

    // Date filters
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });

    // Data states
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [tardiness, setTardiness] = useState<TardinessRecord[]>([]);
    const [earlyDepartures, setEarlyDepartures] = useState<EarlyDeparture[]>([]);
    const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
    const [monthlyStats, setMonthlyStats] = useState<EmployeeMonthlyStats[]>([]);
    const [dailyStats, setDailyStats] = useState<TeamDailyStats[]>([]);
    const [shifts, setShifts] = useState<CustomShift[]>([]);
    const [overtimeStats, setOvertimeStats] = useState({ pending: 0, approved: 0, rejected: 0, partial: 0, totalHoursApproved: 0, totalHoursPending: 0 });

    // Loading states
    const [loadingData, setLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    // Dialog states
    const [justifyTardinessDialog, setJustifyTardinessDialog] = useState<{ open: boolean; record?: TardinessRecord }>({ open: false });
    const [justifyDepartureDialog, setJustifyDepartureDialog] = useState<{ open: boolean; record?: EarlyDeparture }>({ open: false });
    const [overtimeDialog, setOvertimeDialog] = useState<{ open: boolean; request?: OvertimeRequest }>({ open: false });
    const [shiftDialog, setShiftDialog] = useState<{ open: boolean; employee?: Employee }>({ open: false });
    const [scheduleDialog, setScheduleDialog] = useState<{ open: boolean; employee?: Employee }>({ open: false });

    // Form states
    const [justificationReason, setJustificationReason] = useState('');
    const [hoursToApprove, setHoursToApprove] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [shiftForm, setShiftForm] = useState({
        shiftId: '',
        type: 'temporary' as 'temporary' | 'permanent',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        reason: ''
    });
    const [scheduleForm, setScheduleForm] = useState({
        newStartTime: '09:00',
        newEndTime: '18:00',
        type: 'temporary' as 'temporary' | 'permanent',
        effectiveDate: new Date().toISOString().split('T')[0],
        endDate: '',
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);

    // Load initial data
    const loadData = async () => {
        if (!user?.id) return;

        setLoadingData(true);
        try {
            const [empResult, shiftsResult] = await Promise.all([
                getDirectReports(user.id),
                getAvailableShifts()
            ]);

            if (empResult.success && empResult.employees) {
                setEmployees(empResult.employees);
            }
            if (shiftsResult.success && shiftsResult.shifts) {
                setShifts(shiftsResult.shifts);
            }

            // Load tab-specific data
            await loadTabData('overview');
        } catch (error) {
            console.error('Error loading team data:', error);
        } finally {
            setLoadingData(false);
        }
    };

    const loadTabData = async (tab: string) => {
        if (!user?.id) return;

        setRefreshing(true);
        try {
            switch (tab) {
                case 'overview':
                    const [year, month] = selectedMonth.split('-').map(Number);
                    const statsResult = await getTeamMonthlyStats(user.id, year, month);
                    if (statsResult.success && statsResult.stats) {
                        setMonthlyStats(statsResult.stats);
                    }
                    const dailyResult = await getTeamDailyStats(user.id, selectedDate);
                    if (dailyResult.success && dailyResult.stats) {
                        setDailyStats(dailyResult.stats);
                    }
                    break;

                case 'tardiness':
                    const tardinessResult = await getTeamTardiness(user.id, selectedMonth);
                    if (tardinessResult.success && tardinessResult.records) {
                        setTardiness(tardinessResult.records);
                    }
                    break;

                case 'early-departures':
                    const departuresResult = await getTeamEarlyDepartures(user.id, selectedMonth);
                    if (departuresResult.success && departuresResult.records) {
                        setEarlyDepartures(departuresResult.records);
                    }
                    break;

                case 'overtime':
                    const otResult = await getTeamOvertimeRequests(user.id, 'all');
                    if (otResult.success) {
                        setOvertimeRequests(otResult.requests || []);
                        if (otResult.stats) setOvertimeStats(otResult.stats);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error loading tab data:', error);
        } finally {
            setRefreshing(false);
        }
    };

    // Effect to load data on mount and when user changes
    useMemo(() => {
        if (user?.id && !isUserLoading) {
            loadData();
        }
    }, [user?.id, isUserLoading]);

    // Effect to reload data when tab or date changes
    useMemo(() => {
        if (user?.id && !loadingData) {
            loadTabData(activeTab);
        }
    }, [activeTab, selectedDate, selectedMonth]);

    // Handlers
    const handleJustifyTardiness = async () => {
        if (!justifyTardinessDialog.record || !justificationReason.trim() || !user) return;

        setSubmitting(true);
        try {
            const result = await justifyTardiness(
                justifyTardinessDialog.record.id,
                justificationReason,
                user.id || ''
            );

            if (result.success) {
                setJustifyTardinessDialog({ open: false });
                setJustificationReason('');
                loadTabData('tardiness');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleJustifyDeparture = async () => {
        if (!justifyDepartureDialog.record || !justificationReason.trim() || !user) return;

        setSubmitting(true);
        try {
            const result = await justifyEarlyDeparture(
                justifyDepartureDialog.record.id,
                justificationReason,
                user.id || '',
                user.fullName || user.email || ''
            );

            if (result.success) {
                setJustifyDepartureDialog({ open: false });
                setJustificationReason('');
                loadTabData('early-departures');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveOvertime = async (partial: boolean = false) => {
        if (!overtimeDialog.request || !user) return;

        setSubmitting(true);
        try {
            const hours = partial ? parseFloat(hoursToApprove) : undefined;
            const result = await approveOvertimeRequest(
                overtimeDialog.request.id,
                user.id || '',
                user.fullName || user.email || '',
                hours
            );

            if (result.success) {
                setOvertimeDialog({ open: false });
                setHoursToApprove('');
                loadTabData('overtime');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectOvertime = async () => {
        if (!overtimeDialog.request || !rejectionReason.trim() || !user) return;

        setSubmitting(true);
        try {
            const result = await rejectOvertimeRequest(
                overtimeDialog.request.id,
                user.id || '',
                user.fullName || user.email || '',
                rejectionReason
            );

            if (result.success) {
                setOvertimeDialog({ open: false });
                setRejectionReason('');
                loadTabData('overtime');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignShift = async () => {
        if (!shiftDialog.employee || !shiftForm.shiftId || !user) return;

        setSubmitting(true);
        try {
            const selectedShift = shifts.find(s => s.id === shiftForm.shiftId);
            const result = await assignShift(
                shiftDialog.employee.id,
                shiftDialog.employee.fullName,
                shiftForm.shiftId,
                selectedShift?.name || '',
                shiftForm.type,
                shiftForm.startDate,
                shiftForm.reason,
                user.id || '',
                user.fullName || user.email || '',
                shiftForm.type === 'temporary' ? shiftForm.endDate : undefined
            );

            if (result.success) {
                setShiftDialog({ open: false });
                setShiftForm({ shiftId: '', type: 'temporary', startDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleChangeSchedule = async () => {
        if (!scheduleDialog.employee || !user) return;

        setSubmitting(true);
        try {
            const result = await changeEmployeeSchedule(
                scheduleDialog.employee.id,
                scheduleDialog.employee.fullName,
                '09:00', // TODO: Get from employee's current shift
                '18:00',
                scheduleForm.newStartTime,
                scheduleForm.newEndTime,
                scheduleForm.type,
                scheduleForm.effectiveDate,
                scheduleForm.reason,
                user.id || '',
                user.fullName || user.email || '',
                scheduleForm.type === 'temporary' ? scheduleForm.endDate : undefined
            );

            if (result.success) {
                setScheduleDialog({ open: false });
                setScheduleForm({ newStartTime: '09:00', newEndTime: '18:00', type: 'temporary', effectiveDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
            }
        } finally {
            setSubmitting(false);
        }
    };

    // Computed values
    const pendingTardiness = tardiness.filter(t => !t.isJustified);
    const pendingDepartures = earlyDepartures.filter(d => !d.isJustified);
    const pendingOvertime = overtimeRequests.filter(o => o.status === 'pending');

    // Helper to change date
    const changeDate = (days: number) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    if (isUserLoading || loadingData) {
        return (
            <SiteLayout>
                <div className="flex items-center justify-center h-96">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </SiteLayout>
        );
    }

    if (employees.length === 0) {
        const handleMigration = async () => {
            setRefreshing(true);
            try {
                const result = await migrateManagerIdField();
                if (result.success && result.migratedCount > 0) {
                    // Reload data after migration
                    await loadData();
                }
            } finally {
                setRefreshing(false);
            }
        };

        return (
            <SiteLayout>
                <div className="flex flex-col items-center justify-center h-96 text-center">
                    <Users2 className="h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Sin Subordinados</h2>
                    <p className="text-muted-foreground mb-4">
                        No tienes empleados a tu cargo en este momento.
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md mb-4">
                        Si recientemente asignaste jefes directos a empleados y no aparecen aquí,
                        es posible que los datos necesiten ser migrados.
                    </p>
                    <Button variant="outline" onClick={handleMigration} disabled={refreshing}>
                        {refreshing ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Migrando...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Migrar datos de jefes directos
                            </>
                        )}
                    </Button>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-3xl font-bold">Gestión de Equipo</h1>
                        <p className="text-muted-foreground">
                            Administra retardos, horas extras y turnos de tu equipo
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        <Badge variant="outline" className="text-base py-1 px-3">
                            <Users2 className="h-4 w-4 mr-2" />
                            {employees.length} empleados
                        </Badge>
                        <Button variant="outline" onClick={() => loadTabData(activeTab)} disabled={refreshing}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Retardos Pendientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-bold">{pendingTardiness.length}</span>
                                <AlertTriangle className={`h-5 w-5 ${pendingTardiness.length > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Salidas Tempranas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-bold">{pendingDepartures.length}</span>
                                <Clock className={`h-5 w-5 ${pendingDepartures.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">HE Pendientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold">{overtimeStats.pending}</span>
                                    <span className="text-sm text-muted-foreground ml-2">({overtimeStats.totalHoursPending}h)</span>
                                </div>
                                <Timer className={`h-5 w-5 ${overtimeStats.pending > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">HE Aprobadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold text-green-600">{overtimeStats.totalHoursApproved}</span>
                                    <span className="text-sm text-muted-foreground ml-1">horas</span>
                                </div>
                                <Check className="h-5 w-5 text-green-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="overview">Vista General</TabsTrigger>
                        <TabsTrigger value="tardiness">
                            Retardos
                            {pendingTardiness.length > 0 && (
                                <Badge variant="destructive" className="ml-2">{pendingTardiness.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="early-departures">
                            Salidas Tempranas
                            {pendingDepartures.length > 0 && (
                                <Badge variant="secondary" className="ml-2">{pendingDepartures.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="overtime">
                            Horas Extras
                            {pendingOvertime.length > 0 && (
                                <Badge className="ml-2">{pendingOvertime.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="shifts">Turnos y Horarios</TabsTrigger>
                    </TabsList>

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4">
                        {/* Date Navigation */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Vista Diaria</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            className="w-40"
                                        />
                                        <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Retardo</TableHead>
                                            <TableHead>Salida Temprana</TableHead>
                                            <TableHead>Horas Extras</TableHead>
                                            <TableHead>Incidencia</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dailyStats.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                    Sin registros para este día
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dailyStats.map((stat) => (
                                                <TableRow key={stat.employeeId}>
                                                    <TableCell className="font-medium">{stat.employeeName}</TableCell>
                                                    <TableCell>
                                                        {stat.tardinessMinutes ? (
                                                            <Badge variant={stat.tardinessJustified ? 'secondary' : 'destructive'}>
                                                                {stat.tardinessMinutes} min
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.earlyDepartureMinutes ? (
                                                            <Badge variant={stat.earlyDepartureJustified ? 'secondary' : 'outline'}>
                                                                {stat.earlyDepartureMinutes} min
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.overtimeHoursRequested ? (
                                                            <Badge variant={
                                                                stat.overtimeStatus === 'approved' ? 'default' :
                                                                    stat.overtimeStatus === 'rejected' ? 'destructive' :
                                                                        stat.overtimeStatus === 'partial' ? 'secondary' : 'outline'
                                                            }>
                                                                {stat.overtimeHoursApproved || stat.overtimeHoursRequested}h
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.hasIncidence ? (
                                                            <Badge variant={stat.incidenceStatus === 'approved' ? 'default' : 'outline'}>
                                                                {stat.incidenceType}
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Monthly Stats */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Estadísticas Mensuales</CardTitle>
                                    <Input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {monthlyStats.map((stat) => (
                                        <Card key={stat.employeeId} className="border">
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarImage src={stat.avatarUrl} />
                                                        <AvatarFallback>{stat.employeeName.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <CardTitle className="text-base">{stat.employeeName}</CardTitle>
                                                        <CardDescription>{stat.positionTitle}</CardDescription>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span>Retardos</span>
                                                    <span className={stat.unjustifiedTardiness > 0 ? 'text-red-500 font-medium' : ''}>
                                                        {stat.justifiedTardiness}/{stat.totalTardiness}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span>Salidas Tempranas</span>
                                                    <span>
                                                        {stat.justifiedEarlyDepartures}/{stat.totalEarlyDepartures}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span>HE Aprobadas</span>
                                                    <span className="text-green-600 font-medium">
                                                        {stat.overtimeHoursApproved}h
                                                    </span>
                                                </div>
                                                {stat.overtimeRequestsPending > 0 && (
                                                    <Badge variant="outline" className="w-full justify-center">
                                                        {stat.overtimeRequestsPending} solicitudes pendientes
                                                    </Badge>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tardiness Tab */}
                    <TabsContent value="tardiness">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Retardos del Equipo</CardTitle>
                                        <CardDescription>Justifica los retardos pendientes de tu equipo</CardDescription>
                                    </div>
                                    <Input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Hora Prog.</TableHead>
                                            <TableHead>Hora Real</TableHead>
                                            <TableHead>Minutos</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {tardiness.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    Sin retardos en este período
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            tardiness.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell>{new Date(record.date).toLocaleDateString('es-MX')}</TableCell>
                                                    <TableCell className="font-medium">
                                                        {(record as any).employeeName || employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId}
                                                    </TableCell>
                                                    <TableCell>{record.scheduledTime}</TableCell>
                                                    <TableCell>{record.actualTime}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{record.minutesLate} min</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {record.isJustified ? (
                                                            <Badge variant="secondary">Justificado</Badge>
                                                        ) : (
                                                            <Badge variant="destructive">Pendiente</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!record.isJustified && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setJustifyTardinessDialog({ open: true, record });
                                                                    setJustificationReason('');
                                                                }}
                                                            >
                                                                Justificar
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Early Departures Tab */}
                    <TabsContent value="early-departures">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Salidas Tempranas</CardTitle>
                                        <CardDescription>Justifica las salidas tempranas de tu equipo</CardDescription>
                                    </div>
                                    <Input
                                        type="month"
                                        value={selectedMonth}
                                        onChange={(e) => setSelectedMonth(e.target.value)}
                                        className="w-40"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Salida Prog.</TableHead>
                                            <TableHead>Salida Real</TableHead>
                                            <TableHead>Minutos</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {earlyDepartures.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    Sin salidas tempranas en este período
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            earlyDepartures.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell>{new Date(record.date).toLocaleDateString('es-MX')}</TableCell>
                                                    <TableCell className="font-medium">{record.employeeName}</TableCell>
                                                    <TableCell>{record.scheduledEndTime}</TableCell>
                                                    <TableCell>{record.actualEndTime}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{record.minutesEarly} min</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {record.isJustified ? (
                                                            <Badge variant="secondary">Justificado</Badge>
                                                        ) : (
                                                            <Badge variant="outline">Pendiente</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!record.isJustified && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setJustifyDepartureDialog({ open: true, record });
                                                                    setJustificationReason('');
                                                                }}
                                                            >
                                                                Justificar
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Overtime Tab */}
                    <TabsContent value="overtime">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Solicitudes de Horas Extras</CardTitle>
                                        <CardDescription>
                                            Aprobadas: {overtimeStats.totalHoursApproved}h |
                                            Pendientes: {overtimeStats.totalHoursPending}h
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Badge variant="default">{overtimeStats.approved} aprobadas</Badge>
                                        <Badge variant="outline">{overtimeStats.pending} pendientes</Badge>
                                        <Badge variant="destructive">{overtimeStats.rejected} rechazadas</Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Horas Solicitadas</TableHead>
                                            <TableHead>Razón</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead>Horas Aprobadas</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {overtimeRequests.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    Sin solicitudes de horas extras
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            overtimeRequests.map((request) => (
                                                <TableRow key={request.id}>
                                                    <TableCell>{new Date(request.date).toLocaleDateString('es-MX')}</TableCell>
                                                    <TableCell className="font-medium">{request.employeeName}</TableCell>
                                                    <TableCell>{request.hoursRequested}h</TableCell>
                                                    <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={
                                                            request.status === 'approved' ? 'default' :
                                                                request.status === 'rejected' ? 'destructive' :
                                                                    request.status === 'partial' ? 'secondary' : 'outline'
                                                        }>
                                                            {request.status === 'approved' ? 'Aprobada' :
                                                                request.status === 'rejected' ? 'Rechazada' :
                                                                    request.status === 'partial' ? 'Parcial' : 'Pendiente'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {request.hoursApproved !== undefined ? `${request.hoursApproved}h` : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {request.status === 'pending' && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setOvertimeDialog({ open: true, request });
                                                                    setHoursToApprove(request.hoursRequested.toString());
                                                                    setRejectionReason('');
                                                                }}
                                                            >
                                                                Revisar
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Shifts Tab */}
                    <TabsContent value="shifts">
                        <Card>
                            <CardHeader>
                                <CardTitle>Turnos y Horarios del Equipo</CardTitle>
                                <CardDescription>Asigna turnos o modifica horarios de tus subordinados</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Puesto</TableHead>
                                            <TableHead>Turno Actual</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {employees.map((employee) => (
                                            <TableRow key={employee.id}>
                                                <TableCell>
                                                    <div className="flex items-center gap-3">
                                                        <Avatar className="h-8 w-8">
                                                            <AvatarImage src={employee.avatarUrl} />
                                                            <AvatarFallback>{employee.fullName?.charAt(0)}</AvatarFallback>
                                                        </Avatar>
                                                        <span className="font-medium">{employee.fullName}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>{employee.positionTitle}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {employee.shiftType === 'diurnal' ? 'Diurno' :
                                                            employee.shiftType === 'nocturnal' ? 'Nocturno' : 'Mixto'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex gap-2 justify-end">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setShiftDialog({ open: true, employee });
                                                                setShiftForm({ shiftId: '', type: 'temporary', startDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
                                                            }}
                                                        >
                                                            <CalendarDays className="h-4 w-4 mr-1" />
                                                            Cambiar Turno
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => {
                                                                setScheduleDialog({ open: true, employee });
                                                                setScheduleForm({ newStartTime: '09:00', newEndTime: '18:00', type: 'temporary', effectiveDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
                                                            }}
                                                        >
                                                            <Clock className="h-4 w-4 mr-1" />
                                                            Cambiar Horario
                                                        </Button>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Justify Tardiness Dialog */}
            <Dialog open={justifyTardinessDialog.open} onOpenChange={(open) => setJustifyTardinessDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Justificar Retardo</DialogTitle>
                        <DialogDescription>
                            {justifyTardinessDialog.record && (
                                <>
                                    Empleado llegó {justifyTardinessDialog.record.minutesLate} minutos tarde el {new Date(justifyTardinessDialog.record.date).toLocaleDateString('es-MX')}
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Razón de Justificación</Label>
                            <Textarea
                                value={justificationReason}
                                onChange={(e) => setJustificationReason(e.target.value)}
                                placeholder="Describe la razón por la que se justifica el retardo..."
                                rows={4}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustifyTardinessDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button onClick={handleJustifyTardiness} disabled={submitting || !justificationReason.trim()}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Justificar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Justify Early Departure Dialog */}
            <Dialog open={justifyDepartureDialog.open} onOpenChange={(open) => setJustifyDepartureDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Justificar Salida Temprana</DialogTitle>
                        <DialogDescription>
                            {justifyDepartureDialog.record && (
                                <>
                                    {justifyDepartureDialog.record.employeeName} salió {justifyDepartureDialog.record.minutesEarly} minutos antes el {new Date(justifyDepartureDialog.record.date).toLocaleDateString('es-MX')}
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Razón de Justificación</Label>
                            <Textarea
                                value={justificationReason}
                                onChange={(e) => setJustificationReason(e.target.value)}
                                placeholder="Describe la razón por la que se justifica la salida temprana..."
                                rows={4}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustifyDepartureDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button onClick={handleJustifyDeparture} disabled={submitting || !justificationReason.trim()}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Justificar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Overtime Approval Dialog */}
            <Dialog open={overtimeDialog.open} onOpenChange={(open) => setOvertimeDialog({ open })}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Revisar Solicitud de Horas Extras</DialogTitle>
                        <DialogDescription>
                            {overtimeDialog.request && (
                                <>
                                    {overtimeDialog.request.employeeName} solicita {overtimeDialog.request.hoursRequested} horas extras
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm font-medium">Razón:</p>
                            <p className="text-sm text-muted-foreground">{overtimeDialog.request?.reason}</p>
                        </div>
                        <div>
                            <Label>Horas a Aprobar (para aprobación parcial)</Label>
                            <Input
                                type="number"
                                step="0.5"
                                min="0"
                                max={overtimeDialog.request?.hoursRequested}
                                value={hoursToApprove}
                                onChange={(e) => setHoursToApprove(e.target.value)}
                            />
                        </div>
                        <div>
                            <Label>Razón de Rechazo (solo si rechaza)</Label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Solo requerido si rechaza la solicitud..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex gap-2">
                        <Button variant="outline" onClick={() => setOvertimeDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRejectOvertime}
                            disabled={submitting || !rejectionReason.trim()}
                        >
                            <X className="h-4 w-4 mr-1" />
                            Rechazar
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => handleApproveOvertime(true)}
                            disabled={submitting || !hoursToApprove}
                        >
                            Aprobar Parcial
                        </Button>
                        <Button onClick={() => handleApproveOvertime(false)} disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                            Aprobar Total
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Shift Assignment Dialog */}
            <Dialog open={shiftDialog.open} onOpenChange={(open) => setShiftDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Asignar Turno</DialogTitle>
                        <DialogDescription>
                            Asignar nuevo turno a {shiftDialog.employee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Turno</Label>
                            <Select value={shiftForm.shiftId} onValueChange={(v) => setShiftForm(prev => ({ ...prev, shiftId: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar turno" />
                                </SelectTrigger>
                                <SelectContent>
                                    {shifts.map((shift) => (
                                        <SelectItem key={shift.id} value={shift.id}>
                                            {shift.name} ({shift.startTime} - {shift.endTime})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Tipo de Asignación</Label>
                            <Select value={shiftForm.type} onValueChange={(v: 'temporary' | 'permanent') => setShiftForm(prev => ({ ...prev, type: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="temporary">Temporal</SelectItem>
                                    <SelectItem value="permanent">Permanente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Fecha Inicio</Label>
                                <Input
                                    type="date"
                                    value={shiftForm.startDate}
                                    onChange={(e) => setShiftForm(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </div>
                            {shiftForm.type === 'temporary' && (
                                <div>
                                    <Label>Fecha Fin</Label>
                                    <Input
                                        type="date"
                                        value={shiftForm.endDate}
                                        onChange={(e) => setShiftForm(prev => ({ ...prev, endDate: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Razón del Cambio</Label>
                            <Textarea
                                value={shiftForm.reason}
                                onChange={(e) => setShiftForm(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="Describe la razón del cambio de turno..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShiftDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleAssignShift}
                            disabled={submitting || !shiftForm.shiftId || !shiftForm.reason.trim() || (shiftForm.type === 'temporary' && !shiftForm.endDate)}
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Asignar Turno
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Schedule Change Dialog */}
            <Dialog open={scheduleDialog.open} onOpenChange={(open) => setScheduleDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cambiar Horario</DialogTitle>
                        <DialogDescription>
                            Modificar horario de {scheduleDialog.employee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Nueva Hora Entrada</Label>
                                <Input
                                    type="time"
                                    value={scheduleForm.newStartTime}
                                    onChange={(e) => setScheduleForm(prev => ({ ...prev, newStartTime: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label>Nueva Hora Salida</Label>
                                <Input
                                    type="time"
                                    value={scheduleForm.newEndTime}
                                    onChange={(e) => setScheduleForm(prev => ({ ...prev, newEndTime: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div>
                            <Label>Tipo de Cambio</Label>
                            <Select value={scheduleForm.type} onValueChange={(v: 'temporary' | 'permanent') => setScheduleForm(prev => ({ ...prev, type: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="temporary">Temporal</SelectItem>
                                    <SelectItem value="permanent">Permanente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Fecha Efectiva</Label>
                                <Input
                                    type="date"
                                    value={scheduleForm.effectiveDate}
                                    onChange={(e) => setScheduleForm(prev => ({ ...prev, effectiveDate: e.target.value }))}
                                />
                            </div>
                            {scheduleForm.type === 'temporary' && (
                                <div>
                                    <Label>Fecha Fin</Label>
                                    <Input
                                        type="date"
                                        value={scheduleForm.endDate}
                                        onChange={(e) => setScheduleForm(prev => ({ ...prev, endDate: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Razón del Cambio</Label>
                            <Textarea
                                value={scheduleForm.reason}
                                onChange={(e) => setScheduleForm(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="Describe la razón del cambio de horario..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setScheduleDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleChangeSchedule}
                            disabled={submitting || !scheduleForm.reason.trim() || (scheduleForm.type === 'temporary' && !scheduleForm.endDate)}
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Guardar Cambio
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SiteLayout>
    );
}
