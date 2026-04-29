'use client';

import SiteLayout from '@/components/site-layout';
import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, orderBy, limit } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import {
    ArrowLeft,
    Mail,
    Building2,
    Briefcase,
    User,
    Calendar,
    FileText,
    Clock,
    AlertCircle,
    XCircle,
    Loader2,
    UserX,
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';

import { VacationBalanceCard } from '@/components/hcm/vacation-balance-card';
import { deactivateEmployee } from '@/firebase/actions/employee-actions';
import { callApproveIncidence } from '@/firebase/callable-functions';

import type { Employee, AttendanceRecord, Incidence, ShiftAssignment, CustomShift } from '@/lib/types';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: employeeId } = use(params);
    const { toast } = useToast();

    // 0. Auth state
    const { firestore, user, isUserLoading } = useFirebase();

    // -------------------------------------------------------------------------
    // Dialog state: "Dar de Baja"
    // -------------------------------------------------------------------------
    const [isBajaDialogOpen, setIsBajaDialogOpen] = useState(false);
    const [terminationDate, setTerminationDate] = useState(() =>
        new Date().toISOString().split('T')[0]
    );
    const [isDeactivating, setIsDeactivating] = useState(false);

    // -------------------------------------------------------------------------
    // Dialog state: Cancel incidence
    // -------------------------------------------------------------------------
    const [cancellingIncidenceId, setCancellingIncidenceId] = useState<string | null>(null);

    // 1. Fetch Employee Details
    const employeeRef = useMemoFirebase(() => {
        return firestore && !isUserLoading ? doc(firestore, 'employees', employeeId) : null;
    }, [firestore, isUserLoading, employeeId]);

    const { data: employee, isLoading: isLoadingEmployee } = useDoc<Employee>(employeeRef);

    // 2. Fetch Manager Details (if employee has directManagerId)
    const managerRef = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !employee?.directManagerId) return null;
        return doc(firestore, 'employees', employee.directManagerId);
    }, [firestore, isUserLoading, employee?.directManagerId]);

    const { data: manager } = useDoc<Employee>(managerRef);

    // 3. Fetch Recent Attendance
    const attendanceQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(
            collection(firestore, 'attendance'),
            where('employeeId', '==', employeeId),
            orderBy('date', 'desc'),
            limit(10)
        );
    }, [firestore, isUserLoading, employeeId]);

    const { data: attendance, isLoading: isLoadingAttendance } = useCollection<AttendanceRecord>(attendanceQuery);

    // 4. Fetch Incidences
    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(
            collection(firestore, 'incidences'),
            where('employeeId', '==', employeeId),
            orderBy('startDate', 'desc'),
            limit(20)
        );
    }, [firestore, isUserLoading, employeeId]);

    const { data: incidences, isLoading: isLoadingIncidences } = useCollection<Incidence>(incidencesQuery);

    // 6. Fetch Active Shift Assignments
    const shiftAssignmentsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;

        return query(
            collection(firestore, 'shift_assignments'),
            where('employeeId', '==', employeeId),
            where('status', '==', 'active')
        );
    }, [firestore, isUserLoading, employeeId]);

    const { data: shiftAssignments } = useCollection<ShiftAssignment>(shiftAssignmentsQuery);

    // 7. Fetch Shifts (to resolve names)
    const shiftsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'shifts'));
    }, [firestore]);

    const { data: shifts } = useCollection<CustomShift>(shiftsQuery);

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    const getCurrentShift = () => {
        if (!employee) return 'No asignado';

        const today = new Date().toISOString().split('T')[0];

        const activeTempShift = shiftAssignments?.find(assignment =>
            assignment.assignmentType === 'temporary' &&
            assignment.startDate <= today &&
            (assignment.endDate ? assignment.endDate >= today : true)
        );

        if (activeTempShift && shifts) {
            const shiftDetails = shifts.find(s => s.id === activeTempShift.newShiftId);
            if (shiftDetails) return `${shiftDetails.name} (Temporal)`;
        }

        if (employee.customShiftId && shifts) {
            const shiftDetails = shifts.find(s => s.id === employee.customShiftId);
            if (shiftDetails) return shiftDetails.name;
        }

        return employee.shiftType === 'diurnal' ? 'Diurno' :
            employee.shiftType === 'nocturnal' ? 'Nocturno' : 'Mixto';
    };

    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

    const hasHRPermissions = ['Admin', 'HRManager', 'Manager'].includes(user?.role || '');

    const today = new Date().toISOString().split('T')[0];

    // -------------------------------------------------------------------------
    // Action: Dar de Baja
    // -------------------------------------------------------------------------
    const handleDeactivate = async () => {
        if (!terminationDate) return;
        setIsDeactivating(true);
        try {
            const result = await deactivateEmployee(employeeId, terminationDate);
            if (result.success) {
                toast({
                    title: 'Empleado dado de baja',
                    description: `Fecha de baja registrada: ${format(new Date(terminationDate + 'T12:00:00'), 'PPP', { locale: es })}. Aparecerá como BJ en el cierre de nómina.`,
                });
                setIsBajaDialogOpen(false);
            } else {
                throw new Error(result.error ?? 'Error desconocido');
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo dar de baja al empleado.',
                variant: 'destructive',
            });
        } finally {
            setIsDeactivating(false);
        }
    };

    // -------------------------------------------------------------------------
    // Action: Cancel Incidence
    // -------------------------------------------------------------------------
    const handleCancelIncidence = async (incidenceId: string) => {
        setCancellingIncidenceId(incidenceId);
        try {
            const result = await callApproveIncidence({
                incidenceId,
                action: 'cancel',
            });
            if (result.success) {
                toast({
                    title: 'Incidencia cancelada',
                    description: 'La incidencia fue cancelada y el saldo de vacaciones fue restaurado (si aplica).',
                });
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo cancelar la incidencia.',
                variant: 'destructive',
            });
        } finally {
            setCancellingIncidenceId(null);
        }
    };

    // -------------------------------------------------------------------------
    // Loading / Not Found states
    // -------------------------------------------------------------------------
    if (isLoadingEmployee) {
        return (
            <SiteLayout>
                <div className="flex-1 flex-col p-4 sm:p-6">
                    <div className="space-y-6">
                        <div className="flex items-center gap-4">
                            <Skeleton className="h-10 w-10 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-8 w-64" />
                                <Skeleton className="h-4 w-48" />
                            </div>
                        </div>
                        <Skeleton className="h-[200px] w-full" />
                    </div>
                </div>
            </SiteLayout>
        );
    }

    if (!employee) {
        return (
            <SiteLayout>
                <div className="flex-1 flex-col p-4 sm:p-6">
                    <div className="container mx-auto py-12 text-center">
                        <h2 className="text-2xl font-bold">Empleado no encontrado</h2>
                        <p className="text-muted-foreground mb-4">El empleado que buscas no existe o ha sido eliminado.</p>
                        <Button onClick={() => router.push('/hcm/employees')}>Volver al directorio</Button>
                    </div>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                            <Link href="/hcm/employees">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <Avatar className="h-16 w-16 border-2 border-primary/10">
                            <AvatarImage src={employee.avatarUrl} alt={employee.fullName} />
                            <AvatarFallback className="text-xl">{getInitials(employee.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">{employee.fullName}</h1>
                            <div className="flex flex-wrap gap-2 text-muted-foreground items-center">
                                <span>{employee.positionTitle}</span>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                    <Building2 className="h-3 w-3" />
                                    {employee.department}
                                </span>
                                <Badge variant={employee.status === 'active' ? 'default' : 'secondary'} className="ml-2">
                                    {employee.status === 'active' ? 'Activo' : 'Inactivo'}
                                </Badge>
                            </div>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild>
                            <Link href={`/hcm/employees/${employeeId}/edit`}>Editar Perfil</Link>
                        </Button>
                        {/* Only show Dar de Baja if employee is still active and user has HR permissions */}
                        {hasHRPermissions && employee.status === 'active' && (
                            <Button
                                variant="destructive"
                                onClick={() => setIsBajaDialogOpen(true)}
                            >
                                <UserX className="mr-2 h-4 w-4" />
                                Dar de Baja
                            </Button>
                        )}
                        {employee.status !== 'active' && employee.terminationDate && (
                            <Badge variant="destructive" className="self-center px-3 py-1">
                                Baja: {format(new Date(employee.terminationDate + 'T12:00:00'), 'PP', { locale: es })}
                            </Badge>
                        )}
                    </div>
                </header>
                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="attendance">Asistencia</TabsTrigger>
                            <TabsTrigger value="incidences">Permisos</TabsTrigger>
                        </TabsList>

                        {/* Tab: General Information */}
                        <TabsContent value="general" className="space-y-6 mt-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Información General</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-muted rounded-full">
                                                <Mail className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">Correo Electrónico</p>
                                                <p className="text-sm text-muted-foreground">{employee.email}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-muted rounded-full">
                                                <Building2 className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">RFC</p>
                                                <p className="text-sm text-muted-foreground">{employee.rfc || employee.rfc_curp?.split(' ')[0] || 'No registrado'}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-muted rounded-full">
                                                <User className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium">CURP</p>
                                                <p className="text-sm text-muted-foreground">{employee.curp || employee.rfc_curp?.split(' ')[1] || 'No registrado'}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Información Laboral</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Fecha de Ingreso</p>
                                                <div className="flex items-center gap-2">
                                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                                    <span>{format(new Date(employee.hireDate + (employee.hireDate?.includes('T') ? '' : 'T12:00:00')), 'PPP', { locale: es })}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Tipo de Contrato</p>
                                                <div className="flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                                                    <span className="capitalize">{employee.employmentType?.replace('_', ' ') || 'N/A'}</span>
                                                </div>
                                            </div>
                                            <div className="col-span-1">
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Turnos Asignados</p>
                                                <div className="flex flex-col gap-1">
                                                    {shiftAssignments && shiftAssignments.length > 0 ? (
                                                        shiftAssignments.map(assignment => {
                                                            const shiftName = shifts?.find(s => s.id === assignment.newShiftId)?.name || 'Turno desconocido';
                                                            return (
                                                                <div key={assignment.id} className="flex items-center gap-2 text-sm">
                                                                    <Clock className="h-3 w-3 text-muted-foreground" />
                                                                    <span>
                                                                        {shiftName}
                                                                        {assignment.assignmentType === 'temporary' && (
                                                                            <span className="text-xs text-muted-foreground ml-1">
                                                                                ({format(new Date(assignment.startDate), 'dd/MM', { locale: es })} - {assignment.endDate ? format(new Date(assignment.endDate), 'dd/MM', { locale: es }) : 'Indefinido'})
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <div className="flex items-center gap-2">
                                                            <Clock className="h-4 w-4 text-muted-foreground" />
                                                            <span className="capitalize">{getCurrentShift()}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Jefe Directo</p>
                                                <div className="flex items-center gap-2">
                                                    <User className="h-4 w-4 text-muted-foreground" />
                                                    <span>{manager?.fullName || employee.directManagerId || 'Sin asignar'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2">
                                            <Clock className="h-5 w-5 text-primary" />
                                            Configuración de Asistencia
                                        </CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Modalidad de Trabajo</p>
                                                <div className="flex items-center gap-2">
                                                    <Building2 className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium">
                                                        {employee.workMode === 'office' ? '🏢 Oficina' :
                                                            employee.workMode === 'hybrid' ? '🏠 Híbrido' :
                                                                employee.workMode === 'remote' ? '💻 Trabajo Remoto' :
                                                                    employee.workMode === 'field' ? '🚗 En Campo' : '🏢 Oficina'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Tiempo por Tiempo</p>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                    <span className="font-medium">{employee.allowTimeForTime ? '✅ Permitido' : '❌ No permitido'}</span>
                                                </div>
                                            </div>
                                            {(employee.workMode === 'hybrid' || !employee.workMode) && (
                                                <div className="col-span-full pt-2 border-t">
                                                    <p className="text-sm font-medium text-muted-foreground mb-1">Días de Home Office Programados</p>
                                                    <div className="flex flex-wrap gap-2 mt-2">
                                                        {!employee.homeOfficeDays || employee.homeOfficeDays.length === 0 ? (
                                                            <span className="text-sm text-muted-foreground italic">Sin días programados</span>
                                                        ) : (
                                                            employee.homeOfficeDays.map((d: number) => (
                                                                <Badge key={d} variant="outline" className="bg-primary/5 text-primary border-primary/20">
                                                                    {['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][d]}
                                                                </Badge>
                                                            ))
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card className="md:col-span-2">
                                    <CardHeader>
                                        <CardTitle>Información Fiscal (SAT / IMSS)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">RFC con Homoclave</p>
                                                <p className="text-lg font-mono mt-1">{employee.rfc || employee.rfc_curp?.split(' ')[0] || 'No registrado'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">CURP</p>
                                                <p className="text-lg font-mono mt-1">{employee.curp || employee.rfc_curp?.split(' ')[1] || 'No registrado'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">NSS (IMSS)</p>
                                                <p className="text-lg font-mono mt-1">{employee.nss || 'No registrado'}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Vacation Balance Card */}
                                <div className="md:col-span-2">
                                    <VacationBalanceCard
                                        employeeId={employeeId}
                                        employeeName={employee.fullName || 'Empleado'}
                                    />
                                </div>
                            </div>
                        </TabsContent>

                        {/* Tab: Attendance */}
                        <TabsContent value="attendance" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Registro de Asistencia Reciente</CardTitle>
                                    <CardDescription>Últimos 10 registros de asistencia</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-1">
                                        {attendance?.map((record) => (
                                            <div key={record.id} className="flex items-center justify-between p-3 border-b last:border-0 hover:bg-muted/50 transition-colors">
                                                <div className="flex items-center gap-4">
                                                    <div className={`p-2 rounded-full ${record.isValid ? 'bg-green-100' : 'bg-red-100'}`}>
                                                        <Clock className={`h-4 w-4 ${record.isValid ? 'text-green-600' : 'text-red-600'}`} />
                                                    </div>
                                                    <div>
                                                        <p className="font-medium capitalize">
                                                            {format(new Date(record.date + 'T12:00:00'), 'EEEE, d MMMM', { locale: es })}
                                                        </p>
                                                        <p className="text-xs text-muted-foreground">
                                                            Entrada: {record.checkIn} • Salida: {record.checkOut}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="font-medium">{record.hoursWorked} hrs</p>
                                                    {record.overtimeHours > 0 && (
                                                        <Badge variant="secondary" className="text-[10px]">
                                                            +{record.overtimeHours} hrs extra
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                        {(!attendance || attendance.length === 0) && (
                                            <p className="text-muted-foreground text-center py-8">No hay registros de asistencia recientes.</p>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Tab: Incidences */}
                        <TabsContent value="incidences" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Historial de Permisos</CardTitle>
                                    <CardDescription>Vacaciones, permisos e incapacidades</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {incidences?.map((inc) => {
                                            // Can cancel if: HR permission + Approved + Not fully past (endDate >= today)
                                            const canCancel = hasHRPermissions &&
                                                inc.status === 'approved' &&
                                                inc.endDate >= today;
                                            const isCancelling = cancellingIncidenceId === inc.id;

                                            return (
                                                <div key={inc.id} className="flex items-start justify-between p-4 border rounded-lg">
                                                    <div className="flex gap-4">
                                                        <div className={`p-2 rounded-full h-fit 
                                ${inc.type === 'vacation' ? 'bg-blue-100 text-blue-600' :
                                                                inc.type === 'sick_leave' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}
                                                        >
                                                            <FileText className="h-4 w-4" />
                                                        </div>
                                                        <div>
                                                            <h4 className="font-medium capitalize">{inc.type?.replace('_', ' ') || 'Tipo Desconocido'}</h4>
                                                            <p className="text-sm text-muted-foreground">
                                                                Del {format(new Date(inc.startDate), 'P', { locale: es })} al {format(new Date(inc.endDate), 'P', { locale: es })}
                                                            </p>
                                                            {inc.notes && (
                                                                <p className="text-sm text-muted-foreground mt-2 bg-muted p-2 rounded">
                                                                    "{inc.notes}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <Badge variant={
                                                            inc.status === 'approved' ? 'default' :
                                                                inc.status === 'rejected' ? 'destructive' :
                                                                    inc.status === 'cancelled' ? 'secondary' : 'secondary'
                                                        }>
                                                            {inc.status === 'approved' ? 'Aprobada' :
                                                                inc.status === 'rejected' ? 'Rechazada' :
                                                                    inc.status === 'cancelled' ? 'Cancelada' : 'Pendiente'}
                                                        </Badge>
                                                        <span className="text-sm font-medium">{inc.totalDays} día(s)</span>
                                                        {canCancel && (
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 text-xs"
                                                                disabled={isCancelling}
                                                                onClick={() => handleCancelIncidence(inc.id)}
                                                            >
                                                                {isCancelling ? (
                                                                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                                                ) : (
                                                                    <XCircle className="h-3 w-3 mr-1" />
                                                                )}
                                                                Cancelar
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        {(!incidences || incidences.length === 0) && (
                                            <div className="text-center py-12">
                                                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                                <p className="text-muted-foreground">No hay permisos registrados.</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </main>
            </div>

            {/* ================================================================
                Dialog: Dar de Baja
            ================================================================ */}
            <Dialog open={isBajaDialogOpen} onOpenChange={setIsBajaDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <UserX className="h-5 w-5" />
                            Dar de Baja a Empleado
                        </DialogTitle>
                        <DialogDescription>
                            Esta acción marcará a <strong>{employee.fullName}</strong> como inactivo y registrará su fecha de baja en el sistema.
                            El empleado aparecerá con código <strong>BJ</strong> en el cierre de nómina del período correspondiente.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="space-y-2">
                            <Label htmlFor="termination-date">Fecha de Baja</Label>
                            <Input
                                id="termination-date"
                                type="date"
                                value={terminationDate}
                                onChange={(e) => setTerminationDate(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                            />
                            <p className="text-xs text-muted-foreground">
                                Esta fecha determina en qué período de nómina aparecerá el código BJ.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            onClick={() => setIsBajaDialogOpen(false)}
                            disabled={isDeactivating}
                        >
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeactivate}
                            disabled={isDeactivating || !terminationDate}
                        >
                            {isDeactivating ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Procesando...
                                </>
                            ) : (
                                <>
                                    <UserX className="mr-2 h-4 w-4" />
                                    Confirmar Baja
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </SiteLayout>
    );
}
