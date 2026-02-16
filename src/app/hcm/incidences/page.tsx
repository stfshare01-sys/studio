
'use client';

import { useState, useMemo, useEffect } from 'react';
import SiteLayout from '@/components/site-layout';
import Link from 'next/link';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Query } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
import { callApproveIncidence } from '@/firebase/callable-functions';
import { checkDateConflict } from '@/lib/hcm-utils';
import { format, differenceInDays, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isSameMonth, isSameDay, isWithinInterval, addMonths, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { NewIncidenceForm } from '@/components/hcm/new-incidence-form';

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



    const hasHRPermissions = useMemo(() => ['Admin', 'HRManager', 'Manager'].includes(user?.role || ''), [user]);

    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user) return null;

        let q = collection(firestore, 'incidences') as Query;

        if (hasHRPermissions) {
            // HR/Admins can see all incidences
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

    }, [firestore, isUserLoading, user, hasHRPermissions, statusFilter]);

    const { data: incidences, isLoading } = useCollection<Incidence>(incidencesQuery);



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
            unjustified_absence: 'Falta Injustificada'
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



    // Format date
    const formatDate = (dateStr: string) => {
        try {
            return format(new Date(dateStr), 'dd MMM yyyy', { locale: es });
        } catch {
            return dateStr;
        }
    };

    // Count by status
    const pendingCount = incidences?.filter(i => i.status === 'pending').length ?? 0;
    const approvedCount = incidences?.filter(i => i.status === 'approved').length ?? 0;
    const rejectedCount = incidences?.filter(i => i.status === 'rejected').length ?? 0;

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
                            <h1 className="text-2xl font-bold tracking-tight">Gestión de Incidencias</h1>
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

                        {viewMode === 'calendar' && (
                            <div className="flex items-center gap-2">
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <span className="font-medium min-w-[150px] text-center capitalize">
                                    {format(currentMonth, 'MMMM yyyy', { locale: es })}
                                </span>
                                <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                            </div>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Pendientes</CardTitle>
                                <Clock className="h-4 w-4 text-yellow-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Aprobadas</CardTitle>
                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-green-600">{approvedCount}</div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Rechazadas</CardTitle>
                                <XCircle className="h-4 w-4 text-red-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
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
                                        placeholder="Buscar por empleado..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                        disabled={!hasHRPermissions}
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
                                        <SelectItem value="sick_leave">Incapacidad</SelectItem>
                                        <SelectItem value="personal_leave">Permiso Personal</SelectItem>
                                        <SelectItem value="maternity">Maternidad</SelectItem>
                                        <SelectItem value="paternity">Paternidad</SelectItem>
                                        <SelectItem value="bereavement">Duelo</SelectItem>
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
                        </CardContent>
                    </Card>


                    {viewMode === 'list' ? (
                        /* Incidences Table */
                        <Card>
                            <CardHeader>
                                <CardTitle>Incidencias</CardTitle>
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
                                                    Cargando incidencias...
                                                </TableCell>
                                            </TableRow>
                                        ) : filteredIncidences.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                    No se encontraron incidencias
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredIncidences.map((incidence) => (
                                                <TableRow key={incidence.id}>
                                                    <TableCell>
                                                        <div>
                                                            <div className="font-medium">{incidence.employeeName}</div>
                                                            <div className="text-xs text-muted-foreground">{incidence.employeeId}</div>
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
                                                        {incidence.status === 'pending' && hasHRPermissions && (
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

                    ) : null}

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

                                    {selectedIncidence.status === 'pending' && hasHRPermissions && (
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

                            {selectedIncidence?.status === 'pending' && hasHRPermissions && (
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
                        </DialogContent>
                    </Dialog>

                    {/* Create Dialog */}
                    <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                        <DialogContent className="max-w-md">
                            <DialogHeader>
                                <DialogTitle>Nueva Solicitud de Incidencia</DialogTitle>
                                <DialogDescription>
                                    Completa los datos para crear tu solicitud
                                </DialogDescription>
                            </DialogHeader>

                            {user && (
                                <NewIncidenceForm
                                    userId={user.uid}
                                    onSuccess={() => setIsCreateDialogOpen(false)}
                                    onCancel={() => setIsCreateDialogOpen(false)}
                                />
                            )}
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </SiteLayout>
    );
}


