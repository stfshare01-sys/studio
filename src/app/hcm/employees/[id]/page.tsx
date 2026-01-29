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
    AlertCircle
} from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

import { KardexTimeline, EmployeeMovement } from '@/components/hcm/kardex-timeline';

import type { Employee, AttendanceRecord, Incidence } from '@/lib/types';

export default function EmployeeDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { id: employeeId } = use(params);
    // 0. Auth state
    const { firestore, user, isUserLoading } = useFirebase();

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

    // 5. Fetch Kardex Movements
    const movementsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(
            collection(firestore, 'employees', employeeId, 'movements'),
            orderBy('date', 'desc')
        );
    }, [firestore, isUserLoading, employeeId]);

    const { data: movements, isLoading: isLoadingMovements } = useCollection<EmployeeMovement>(movementsQuery);

    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

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
                        <Button variant="destructive">Dar de Baja</Button>
                    </div>
                </header>
                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Tabs defaultValue="general" className="w-full">
                        <TabsList className="grid w-full grid-cols-4 lg:w-[800px]">
                            <TabsTrigger value="general">General</TabsTrigger>
                            <TabsTrigger value="attendance">Asistencia</TabsTrigger>
                            <TabsTrigger value="incidences">Incidencias</TabsTrigger>
                            <TabsTrigger value="kardex">Kardex</TabsTrigger>
                        </TabsList>

                        {/* Tab: General Information */}
                        <TabsContent value="general" className="space-y-6 mt-6">
                            <div className="grid gap-6 md:grid-cols-2">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Información de Contacto</CardTitle>
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
                                                    <span>{format(new Date(employee.hireDate), 'PPP', { locale: es })}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Tipo de Contrato</p>
                                                <div className="flex items-center gap-2">
                                                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                                                    <span className="capitalize">{employee.employmentType.replace('_', ' ')}</span>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground mb-1">Turno</p>
                                                <div className="flex items-center gap-2">
                                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                                    <span className="capitalize">{employee.shiftType === 'diurnal' ? 'Diurno' : employee.shiftType === 'nocturnal' ? 'Nocturno' : 'Mixto'}</span>
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

                                <Card className="md:col-span-2">
                                    <CardHeader>
                                        <CardTitle>Información Fiscal (SAT / IMSS)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">RFC con Homoclave</p>
                                                <p className="text-lg font-mono mt-1">{employee.rfc_curp?.split(' ')[0] || 'No registrado'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">CURP</p>
                                                <p className="text-lg font-mono mt-1">{employee.rfc_curp?.split(' ')[1] || 'No registrado'}</p>
                                            </div>
                                            <div>
                                                <p className="text-sm font-medium text-muted-foreground">NSS (IMSS)</p>
                                                <p className="text-lg font-mono mt-1">{employee.nss || 'No registrado'}</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
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
                                                            {format(new Date(record.date), 'EEEE, d MMMM', { locale: es })}
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
                                    <CardTitle>Historial de Incidencias</CardTitle>
                                    <CardDescription>Vacaciones, permisos e incapacidades</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-4">
                                        {incidences?.map((inc) => (
                                            <div key={inc.id} className="flex items-start justify-between p-4 border rounded-lg">
                                                <div className="flex gap-4">
                                                    <div className={`p-2 rounded-full h-fit 
                                ${inc.type === 'vacation' ? 'bg-blue-100 text-blue-600' :
                                                            inc.type === 'sick_leave' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}
                                                    >
                                                        <FileText className="h-4 w-4" />
                                                    </div>
                                                    <div>
                                                        <h4 className="font-medium capitalize">{inc.type.replace('_', ' ')}</h4>
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
                                                            inc.status === 'rejected' ? 'destructive' : 'secondary'
                                                    }>
                                                        {inc.status === 'approved' ? 'Aprobada' :
                                                            inc.status === 'rejected' ? 'Rechazada' : 'Pendiente'}
                                                    </Badge>
                                                    <span className="text-sm font-medium">{inc.totalDays} día(s)</span>
                                                </div>
                                            </div>
                                        ))}
                                        {(!incidences || incidences.length === 0) && (
                                            <div className="text-center py-12">
                                                <AlertCircle className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                                                <p className="text-muted-foreground">No hay incidencias registradas.</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        {/* Tab: Kardex */}
                        <TabsContent value="kardex" className="mt-6">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Kardex del Empleado</CardTitle>
                                    <CardDescription>Historial cronológico de movimientos y cambios laborales.</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <KardexTimeline movements={movements || []} isLoading={isLoadingMovements} />
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </main>
            </div>
        </SiteLayout>
    );
}
