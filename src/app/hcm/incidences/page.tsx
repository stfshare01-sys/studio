
'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Query } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { usePermissions } from '@/hooks/use-permissions';
import { Textarea } from '@/components/ui/textarea';
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
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    Filter,
    Search,
    Plus,
    FileText,
    ArrowLeft,
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    LayoutGrid,
    List
} from 'lucide-react';
import type { Incidence, IncidenceType, IncidenceStatus, Employee, VacationBalance } from '@/lib/types';
import { getEmployeeByUserId } from '@/firebase/actions/employee-actions';
import { createIncidence, getVacationBalance } from '@/firebase/actions/incidence-actions';
import { getDirectReports, getHierarchicalReports } from '@/firebase/actions/team-actions';
import { callApproveIncidence } from '@/firebase/callable-functions';
import { checkDateConflict } from '@/lib/hcm-utils';
import { format, parse, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { NewIncidenceForm } from '@/components/hcm/new-incidence-form';
import { TeamCalendar } from '@/components/hcm/team-calendar';

/**
 * Incidences Management Page
 */
export default function IncidencesPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [selectedIncidence, setSelectedIncidence] = useState<Incidence | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);

    // Bug 7: State for creating incidences on behalf of team members
    const [createForEmployee, setCreateForEmployee] = useState<string>('');
    const [teamEmployees, setTeamEmployees] = useState<Employee[]>([]);



    // URL params — when navigating from task inbox with ?incidentId=<id>
    const searchParams = useSearchParams();
    const lastUrlSync = useRef<string | null>(null);

    const hasHRPermissions = useMemo(() => ['Admin', 'HRManager'].includes(user?.role || ''), [user]);
    const isManagerOnly = useMemo(() => user?.role === 'Manager', [user]);
    const [teamIds, setTeamIds] = useState<string[]>([]);

    // Cargar equipo subordinado si el usuario es manager (para ver sus incidencias)
    // También cargar la lista de empleados para el selector de creación (Bug 7)
    // Reload trigger — incremented after creating/approving incidences to refresh employee lists
    const [teamReloadKey, setTeamReloadKey] = useState(0);

    const { hierarchyDepth, isLoading: isLoadingPermissions } = usePermissions();

    useEffect(() => {
        if (!user?.uid || isLoadingPermissions) return;

        if (isManagerOnly) {
            // Use hierarchical reports, passing the specific hierarchyDepth to respect role limits
            getHierarchicalReports(user.uid, hierarchyDepth).then(res => {
                if (res.success && res.employees) {
                    // Safety net: filter out any non-active employees (e.g. recently terminated)
                    const active = res.employees.filter(e => e.status === 'active');
                    setTeamIds(active.map(e => e.id));
                    setTeamEmployees(active);
                }
            });
        } else if (hasHRPermissions) {
            // HR/Admin can create for anyone — load all active employees
            getDirectReports('all').then(res => {
                if (res.success && res.employees) {
                    const active = res.employees.filter(e => e.status === 'active');
                    setTeamEmployees(active);
                }
            });
        }
    }, [isManagerOnly, hasHRPermissions, user?.uid, teamReloadKey, hierarchyDepth, isLoadingPermissions]);

    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user) return null;

        let q = collection(firestore, 'incidences') as Query;

        if (hasHRPermissions) {
            // HR/Admins can see all incidences
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        } else if (isManagerOnly) {
            // Los managers ven sus propias incidencias y las de su equipo
            // Firestore 'in' soporta hasta 30 elementos.
            const allowedIds = [user.uid, ...teamIds].slice(0, 30);

            if (allowedIds.length > 0) {
                q = query(q, where('employeeId', 'in', allowedIds));
            } else {
                q = query(q, where('employeeId', '==', user.uid));
            }
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        } else {
            // Members are only allowed to see their own incidences
            q = query(q, where('employeeId', '==', user.uid));
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        }

        return query(q, orderBy('createdAt', 'desc'));

    }, [firestore, isUserLoading, user, hasHRPermissions, isManagerOnly, statusFilter, teamIds]);

    const { data: incidences, isLoading } = useCollection<Incidence>(incidencesQuery);

    // Auto-select incidence from URL param (?incidentId=...) when coming from task inbox
    useEffect(() => {
        const incidentId = searchParams.get('incidentId');

        // Only process if param changed (prevent re-triggering)
        if (incidentId === lastUrlSync.current) return;
        lastUrlSync.current = incidentId;

        if (!incidentId || !incidences || incidences.length === 0) return;

        const target = incidences.find(inc => inc.id === incidentId);
        if (target) {
            setSelectedIncidence(target);
            setIsReviewDialogOpen(true);

            // If it's pending, auto-filter to pending for cleaner view
            if (target.status === 'pending') {
                setStatusFilter('pending');
            }
        }
    }, [searchParams, incidences]);

    // Filter incidences client-side for type and search
    const filteredIncidences = useMemo(() => {
        return incidences?.filter(inc => {
            const matchesType = typeFilter === 'all' || inc.type === typeFilter;
            const matchesSearch = searchTerm === '' ||
                inc.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inc.employeeId.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesType && matchesSearch;
        }) ?? [];
    }, [incidences, typeFilter, searchTerm, user]);

    // Calendar logic
    const calendarDays = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth));
        const end = endOfWeek(endOfMonth(currentMonth));
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const getIncidencesForDay = (day: Date) => {
        return filteredIncidences.filter(inc =>
            isWithinInterval(day, {
                start: new Date(inc.startDate),
                end: new Date(inc.endDate)
            })
        );
    };


    // Get incidence type label
    const getTypeLabel = (type: IncidenceType): string => {
        const labels: Record<IncidenceType, string> = {
            vacation: 'Vacaciones',
            sick_leave: 'Incapacidad',
            personal_leave: 'Permiso Personal',
            maternity: 'Maternidad',
            paternity: 'Paternidad',
            bereavement: 'Duelo',
            marriage: 'Matrimonio',
            adoption: 'Adopción',
            civic_duty: 'Deber Cívico',
            half_day_family: 'Permiso Medio Día',
            unpaid_leave: 'Permiso Sin Goce',
            unjustified_absence: 'Falta Injustificada',
            abandono_empleo: 'Abandono de Empleo',
            home_office: 'Home Office'
        };
        return labels[type] || type;
    };

    // Get status badge
    const getStatusBadge = (status: IncidenceStatus) => {
        switch (status) {
            case 'approved':
                return <Badge className="bg-green-100 text-green-800">Aprobada</Badge>;
            case 'rejected':
                return <Badge variant="destructive">Rechazada</Badge>;
            case 'cancelled':
                return <Badge variant="secondary">Cancelada</Badge>;
            default:
                return <Badge className="bg-yellow-100 text-yellow-800">Pendiente</Badge>;
        }
    };

    // Handle approval - Uses Cloud Function for server-side validation
    const handleApprove = async () => {
        if (!selectedIncidence || !user) return;

        setIsSubmitting(true);
        try {
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'approve',
            });

            if (result.success) {
                toast({
                    title: 'Incidencia aprobada',
                    description: 'La solicitud ha sido aprobada exitosamente.',
                });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo aprobar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle rejection - Uses Cloud Function for server-side validation
    const handleReject = async () => {
        if (!selectedIncidence || !user) return;

        // Rejection reason is optional but recommended
        if (!rejectionReason.trim()) {
            toast({
                title: 'Motivo requerido',
                description: 'Por favor ingresa un motivo para el rechazo.',
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'reject',
                rejectionReason: rejectionReason.trim(),
            });

            if (result.success) {
                toast({
                    title: 'Incidencia rechazada',
                    description: 'La solicitud ha sido rechazada.',
                });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
                setRejectionReason('');
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo rechazar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };



    // Open cancel confirmation
    const handleCancel = () => {
        setIsCancelDialogOpen(true);
    };

    // Execute cancellation
    const confirmCancel = async () => {
        if (!selectedIncidence) return;

        setIsSubmitting(true);
        try {
            console.log('Attempting to cancel incidence:', selectedIncidence.id);
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'cancel',
            });

            if (result.success) {
                toast({
                    title: 'Incidencia cancelada',
                    description: 'La incidencia ha sido cancelada exitosamente.',
                });
                setIsReviewDialogOpen(false);
                setIsCancelDialogOpen(false);
                setSelectedIncidence(null);
            }
        } catch (error: any) {
            console.error('Error cancelling incidence:', error);
            toast({
                title: 'Error',
                description: error.message || 'No se pudo cancelar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Format date
    const formatDate = (dateStr: string) => {
        try {
            // Parse as local date to prevent timezone shifting
            const date = parse(dateStr, 'yyyy-MM-dd', new Date());
            return format(date, 'dd MMM yyyy', { locale: es });
        } catch {
            return dateStr;
        }
    };

    // Count by status
    const pendingCount = incidences?.filter(i => i.status === 'pending').length ?? 0;
    const approvedCount = incidences?.filter(i => i.status === 'approved').length ?? 0;
    const rejectedCount = incidences?.filter(i => i.status === 'rejected').length ?? 0;

    // Check if cancellable (Approved and Future/Present)
    // Note: Backend has strict check, frontend can be looser or match backend
    const isCancellable = selectedIncidence?.status === 'approved' && 
                          (hasHRPermissions || isManagerOnly) && 
                          selectedIncidence?.type !== 'unjustified_absence';

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
                            <h1 className="text-2xl font-bold tracking-tight">Gestión de Permisos</h1>
                            <p className="text-muted-foreground">
                                Permisos, vacaciones, incapacidades y ausencias
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => setIsCreateDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Solicitud
                    </Button>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">

                    {/* View Toggle and Controls */}
                    <div className="flex items-center justify-between">
                        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'list' | 'calendar')} className="w-[400px]">
                            <TabsList>
                                <TabsTrigger value="list" className="flex items-center gap-2">
                                    <List className="h-4 w-4" /> Vista Lista
                                </TabsTrigger>
                                <TabsTrigger value="calendar" className="flex items-center gap-2">
                                    <LayoutGrid className="h-4 w-4" /> Calendario
                                </TabsTrigger>
                            </TabsList>
                        </Tabs>
                    </div>

                    {/* Tarjetas KPI Superiores */}
                    <div className="grid grid-cols-1 gap-6 mb-6 sm:grid-cols-2 lg:grid-cols-3 bento-grid">
                        <Card className="bento-item border-l-4 border-l-yellow-500">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                                <Clock className="h-4 w-4 text-yellow-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                            </CardContent>
                        </Card>
                        <Card className="bento-item border-l-4 border-l-green-500">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                            </CardContent>
                        </Card>
                        <Card className="bento-item border-l-4 border-l-red-500">
                            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                                <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
                                <XCircle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Filtros */}
                    <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-center sm:justify-between bg-card p-4 rounded-xl border shadow-sm">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Buscar por empleado..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    className="pl-10"
                                    disabled={!hasHRPermissions && !isManagerOnly}
                                />
                            </div>
                            <Select value={typeFilter} onValueChange={setTypeFilter}>
                                <SelectTrigger className="w-full md:w-[200px]">
                                    <Filter className="mr-2 h-4 w-4" />
                                    <SelectValue placeholder="Tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos los tipos</SelectItem>
                                    <SelectItem value="vacation">Vacaciones</SelectItem>
                                    {hasHRPermissions && <SelectItem value="sick_leave">Incapacidad</SelectItem>}
                                    <SelectItem value="maternity">Maternidad</SelectItem>
                                    <SelectItem value="paternity">Paternidad</SelectItem>
                                    <SelectItem value="bereavement">Duelo</SelectItem>
                                    <SelectItem value="home_office">Home Office</SelectItem>
                                </SelectContent>
                            </Select>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="w-full md:w-[150px]">
                                    <SelectValue placeholder="Estado" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">Todos</SelectItem>
                                    <SelectItem value="pending">Pendientes</SelectItem>
                                    <SelectItem value="approved">Aprobadas</SelectItem>
                                    <SelectItem value="rejected">Rechazadas</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>


                    {viewMode === 'list' ? (
                        /* Incidences Table */
                        <Card>
                            <CardHeader>
                                <CardTitle>Permisos</CardTitle>
                                <CardDescription>
                                    {isLoading ? 'Cargando...' : `${filteredIncidences.length} registros`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Tipo</TableHead>
                                            <TableHead>Período</TableHead>
                                            <TableHead>Días</TableHead>
                                            <TableHead>Con Goce</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead>Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoading ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8">
                                                    Cargando permisos...
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredIncidences.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                    No se encontraron permisos
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredIncidences.map((incidence) => (
                                                <TableRow key={incidence.id}>
                                                    <TableCell>
                                                        <div>
                                                            <div className="font-medium">{incidence.employeeName || teamEmployees.find(e => e.id === incidence.employeeId)?.fullName || 'Falta Automática (Sistema)'}</div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{getTypeLabel(incidence.type)}</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            <span className="text-sm">
                                                                {formatDate(incidence.startDate)} - {formatDate(incidence.endDate)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{incidence.totalDays}</TableCell>
                                                    <TableCell>
                                                        {incidence.isPaid ? (
                                                            <Badge className="bg-green-100 text-green-800">Sí</Badge>
                                                        ) : (
                                                            <Badge variant="secondary">No</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>{getStatusBadge(incidence.status)}</TableCell>
                                                    <TableCell>
                                                        {incidence.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setSelectedIncidence(incidence);
                                                                    setIsReviewDialogOpen(true);
                                                                }}
                                                            >
                                                                Revisar
                                                            </Button>
                                                        )}
                                                        {incidence.status !== 'pending' && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => {
                                                                    setSelectedIncidence(incidence);
                                                                    setIsReviewDialogOpen(true);
                                                                }}
                                                            >
                                                                <FileText className="h-4 w-4" />
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

                    ) : (
                        <div className="mt-4">
                            <TeamCalendar
                                employees={teamEmployees || []}
                                incidences={filteredIncidences || []}
                            />
                        </div>
                    )}

                    {/* Review Dialog */}
                    <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>
                                    {selectedIncidence?.status === 'pending' ? 'Revisar Incidencia' : 'Detalle de Incidencia'}
                                </DialogTitle>
                                <DialogDescription>
                                    {selectedIncidence?.employeeName}
                                </DialogDescription>
                            </DialogHeader>

                            {selectedIncidence && (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-sm text-muted-foreground">Tipo</p>
                                            <p className="font-medium">{getTypeLabel(selectedIncidence.type)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Días</p>
                                            <p className="font-medium">{selectedIncidence.totalDays}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Desde</p>
                                            <p className="font-medium">{formatDate(selectedIncidence.startDate)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Hasta</p>
                                            <p className="font-medium">{formatDate(selectedIncidence.endDate)}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Con goce de sueldo</p>
                                            <p className="font-medium">{selectedIncidence.isPaid ? 'Sí' : 'No'}</p>
                                        </div>
                                        <div>
                                            <p className="text-sm text-muted-foreground">Estado</p>
                                            {getStatusBadge(selectedIncidence.status)}
                                        </div>
                                    </div>

                                    {selectedIncidence.notes && (
                                        <div>
                                            <p className="text-sm text-muted-foreground">Notas</p>
                                            <p className="text-sm">{selectedIncidence.notes}</p>
                                        </div>
                                    )}

                                    {selectedIncidence.rejectionReason && (
                                        <div className="p-3 bg-red-50 rounded-lg">
                                            <p className="text-sm text-red-800 font-medium">Motivo de rechazo:</p>
                                            <p className="text-sm text-red-700">{selectedIncidence.rejectionReason}</p>
                                        </div>
                                    )}

                                    {selectedIncidence.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-sm font-medium">Motivo de rechazo (opcional)</label>
                                                <Textarea
                                                    placeholder="Ingresa el motivo si vas a rechazar..."
                                                    value={rejectionReason}
                                                    onChange={(e) => setRejectionReason(e.target.value)}
                                                    className="mt-1"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {selectedIncidence?.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                <DialogFooter className="gap-2">
                                    <Button
                                        variant="destructive"
                                        onClick={handleReject}
                                        disabled={isSubmitting}
                                    >
                                        <XCircle className="mr-2 h-4 w-4" />
                                        Rechazar
                                    </Button>
                                    <Button
                                        onClick={handleApprove}
                                        disabled={isSubmitting}
                                    >
                                        <CheckCircle2 className="mr-2 h-4 w-4" />
                                        Aprobar
                                    </Button>
                                </DialogFooter>
                            )}

                            {isCancellable && (
                                <DialogFooter className="gap-2">
                                    <Button
                                        variant="secondary"
                                        className="border-red-200 text-red-700 hover:bg-red-50"
                                        onClick={handleCancel}
                                        disabled={isSubmitting}
                                    >
                                        <AlertTriangle className="mr-2 h-4 w-4" />
                                        Cancelar Solicitud
                                    </Button>
                                </DialogFooter>
                            )}
                        </DialogContent>
                    </Dialog>


                    {/* Create Dialog */}
                    <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
                        setIsCreateDialogOpen(open);
                        if (!open) setCreateForEmployee('');
                    }}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Nueva Solicitud de Incidencia</DialogTitle>
                                <DialogDescription>
                                    {(hasHRPermissions || isManagerOnly)
                                        ? 'Crea una solicitud para ti o para un colaborador'
                                        : 'Completa los datos para crear tu solicitud'
                                    }
                                </DialogDescription>
                            </DialogHeader>

                            {/* Bug 7: Employee selector for Managers and HR */}
                            {(hasHRPermissions || isManagerOnly) && teamEmployees.length > 0 && (
                                <div className="space-y-2">
                                    <Label>Crear solicitud para:</Label>
                                    <Select value={createForEmployee || user?.uid || ''} onValueChange={setCreateForEmployee}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Yo mismo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={user?.uid || 'self'}>Yo mismo</SelectItem>
                                            {teamEmployees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>
                                                    {emp.fullName} — {emp.positionTitle || 'Sin puesto'}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            {user && (
                                <NewIncidenceForm
                                    userId={user.uid}
                                    targetUserId={createForEmployee && createForEmployee !== user.uid ? createForEmployee : undefined}
                                    onSuccess={() => {
                                        setIsCreateDialogOpen(false);
                                        setCreateForEmployee('');
                                    }}
                                    onCancel={() => {
                                        setIsCreateDialogOpen(false);
                                        setCreateForEmployee('');
                                    }}
                                />
                            )}
                        </DialogContent>
                    </Dialog>

                    {/* Cancel Confirmation Dialog */}
                    <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>¿Cancelar incidencia aprobada?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Esta acción revertirá los cambios en saldos de vacaciones y marcará la incidencia como cancelada. Esta acción no se puede deshacer.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={isSubmitting}>Volver</AlertDialogCancel>
                                <AlertDialogAction
                                    onClick={(e) => {
                                        e.preventDefault();
                                        confirmCancel();
                                    }}
                                    className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting ? 'Cancelando...' : 'Sí, cancelar solicitud'}
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </main>
            </div>
        </SiteLayout >
    );
}


