
'use client';

import { useState, useMemo } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
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
import {
    Calendar,
    CheckCircle2,
    XCircle,
    Clock,
    Filter,
    Search,
    Plus,
    FileText
} from 'lucide-react';
import type { Incidence, IncidenceType, IncidenceStatus } from '@/lib/types';
import { updateIncidenceStatus, createIncidence } from '@/firebase/hcm-actions';
import { format, differenceInDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';

/**
 * Incidences Management Page
 */
export default function IncidencesPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { toast } = useToast();
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIncidence, setSelectedIncidence] = useState<Incidence | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // New incidence form state
    const [newIncidence, setNewIncidence] = useState({
        type: 'vacation' as IncidenceType,
        startDate: '',
        endDate: '',
        notes: '',
        isPaid: true
    });

    // Fetch incidences - only if user is loaded and has Admin role
    const hasHRPermissions = user?.role === 'Admin';

    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user || !hasHRPermissions) return null;

        const baseQuery = collection(firestore, 'incidences');

        // Admin users can see all incidences
        if (statusFilter !== 'all') {
            return query(baseQuery, where('status', '==', statusFilter), orderBy('createdAt', 'desc'));
        }

        return query(baseQuery, orderBy('createdAt', 'desc'));

    }, [firestore, isUserLoading, user, hasHRPermissions, statusFilter]);

    const { data: incidences, isLoading } = useCollection<Incidence>(incidencesQuery);

    // Filter incidences client-side for type and search
    const filteredIncidences = useMemo(() => {
        return incidences?.filter(inc => {
            // Admin users can see all incidences
            const isAdmin = user?.role === 'Admin';

            // If user is not admin, they should only see their own
            if (!isAdmin && inc.employeeId !== user?.uid) {
                return false;
            }

            const matchesType = typeFilter === 'all' || inc.type === typeFilter;
            const matchesSearch = searchTerm === '' ||
                inc.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inc.employeeId.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesType && matchesSearch;
        }) ?? [];
    }, [incidences, typeFilter, searchTerm, user]);


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

    // Handle approval
    const handleApprove = async () => {
        if (!selectedIncidence || !user) return;

        setIsSubmitting(true);
        try {
            const result = await updateIncidenceStatus(
                selectedIncidence.id,
                'approved',
                user.uid,
                user.fullName || user.email || 'Unknown'
            );

            if (result.success) {
                toast({
                    title: 'Incidencia aprobada',
                    description: 'La solicitud ha sido aprobada exitosamente.',
                });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo aprobar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle rejection
    const handleReject = async () => {
        if (!selectedIncidence || !user || !rejectionReason) return;

        setIsSubmitting(true);
        try {
            const result = await updateIncidenceStatus(
                selectedIncidence.id,
                'rejected',
                user.uid,
                user.fullName || user.email || 'Unknown',
                rejectionReason
            );

            if (result.success) {
                toast({
                    title: 'Incidencia rechazada',
                    description: 'La solicitud ha sido rechazada.',
                });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
                setRejectionReason('');
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo rechazar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle create new incidence
    const handleCreateIncidence = async () => {
        if (!user || !newIncidence.startDate || !newIncidence.endDate) return;

        setIsSubmitting(true);
        try {
            const result = await createIncidence({
                employeeId: user.uid,
                employeeName: user.fullName || user.email || 'Unknown',
                type: newIncidence.type,
                startDate: newIncidence.startDate,
                endDate: newIncidence.endDate,
                isPaid: newIncidence.isPaid,
                notes: newIncidence.notes
            });

            if (result.success) {
                toast({
                    title: 'Solicitud creada',
                    description: 'Tu solicitud ha sido enviada para aprobación.',
                });
                setIsCreateDialogOpen(false);
                setNewIncidence({
                    type: 'vacation',
                    startDate: '',
                    endDate: '',
                    notes: '',
                    isPaid: true
                });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo crear la solicitud.',
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
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Gestión de Incidencias</h1>
                    <p className="text-muted-foreground mt-1">
                        Permisos, vacaciones, incapacidades y ausencias
                    </p>
                </div>
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Nueva Solicitud
                </Button>
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

            {/* Incidences Table */}
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
                                            {incidence.status === 'pending' && (
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

                            {selectedIncidence.status === 'pending' && (
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

                    {selectedIncidence?.status === 'pending' && (
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

                    <div className="space-y-4">
                        <div>
                            <Label>Tipo de incidencia</Label>
                            <Select
                                value={newIncidence.type}
                                onValueChange={(v) => setNewIncidence({ ...newIncidence, type: v as IncidenceType })}
                            >
                                <SelectTrigger className="mt-1">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="vacation">Vacaciones</SelectItem>
                                    <SelectItem value="sick_leave">Incapacidad</SelectItem>
                                    <SelectItem value="personal_leave">Permiso Personal</SelectItem>
                                    <SelectItem value="bereavement">Duelo</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Fecha inicio</Label>
                                <Input
                                    type="date"
                                    value={newIncidence.startDate}
                                    onChange={(e) => setNewIncidence({ ...newIncidence, startDate: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                            <div>
                                <Label>Fecha fin</Label>
                                <Input
                                    type="date"
                                    value={newIncidence.endDate}
                                    onChange={(e) => setNewIncidence({ ...newIncidence, endDate: e.target.value })}
                                    className="mt-1"
                                />
                            </div>
                        </div>

                        <div>
                            <Label>Notas (opcional)</Label>
                            <Textarea
                                placeholder="Información adicional..."
                                value={newIncidence.notes}
                                onChange={(e) => setNewIncidence({ ...newIncidence, notes: e.target.value })}
                                className="mt-1"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleCreateIncidence}
                            disabled={isSubmitting || !newIncidence.startDate || !newIncidence.endDate}
                        >
                            Enviar Solicitud
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
