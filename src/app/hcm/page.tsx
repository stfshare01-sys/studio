
'use client';

import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    Users,
    Clock,
    Calendar,
    FileSpreadsheet,
    TrendingUp,
    AlertTriangle,
    CheckCircle2,
    XCircle,
    Timer,
    UserPlus,
    Upload,
    Calculator,
    MapPin,
    Settings,
    Briefcase,
    LayoutDashboard,
} from 'lucide-react';
import Link from 'next/link';
import type { Employee, Incidence, AttendanceImportBatch } from '@/lib/types';

/**
 * HCM Dashboard - Main page for Human Capital Management module
 */
import { usePermissions } from '@/hooks/use-permissions';

/**
 * HCM Dashboard - Main page for Human Capital Management module
 */
export default function HCMPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { canRead, canWrite, isAdmin } = usePermissions();

    // Check if user has HR/Admin permissions (Write access to employees implies HR management)
    const hasHRPermissions = isAdmin || canWrite('hcm_employees');

    // Fetch active employees count - only if user is loaded and has HR permissions
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user || !hasHRPermissions) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active'),
            limit(100)
        );
    }, [firestore, isUserLoading, user, hasHRPermissions]);

    const { data: employees, isLoading: employeesLoading } = useCollection<Employee>(employeesQuery);

    // Fetch pending incidences - only if user is loaded and has HR permissions
    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user) return null;

        const baseQuery = collection(firestore, 'incidences');

        // Admins/HR can see all pending incidences
        if (hasHRPermissions) {
            return query(
                baseQuery,
                where('status', '==', 'pending'),
                orderBy('createdAt', 'desc'),
                limit(10)
            );
        }

        // Regular users only see their own
        return query(
            baseQuery,
            where('employeeId', '==', user.uid),
            where('status', '==', 'pending'),
            orderBy('createdAt', 'desc'),
            limit(10)
        );
    }, [firestore, isUserLoading, user, hasHRPermissions]);


    const { data: pendingIncidences, isLoading: incidencesLoading } = useCollection<Incidence>(incidencesQuery);

    // Fetch recent imports - only if user is loaded and has HR permissions
    const importsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user || !hasHRPermissions) return null;
        return query(
            collection(firestore, 'attendance_imports'),
            orderBy('uploadedAt', 'desc'),
            limit(5)
        );
    }, [firestore, isUserLoading, user, hasHRPermissions]);

    const { data: recentImports, isLoading: importsLoading } = useCollection<AttendanceImportBatch>(importsQuery);

    const isLoading = isUserLoading || employeesLoading || incidencesLoading || importsLoading;

    // Stats calculations
    const totalEmployees = employees?.length ?? 0;
    const pendingCount = pendingIncidences?.length ?? 0;
    const onboardingEmployees = employees?.filter(e => e.onboardingStatus && e.onboardingStatus !== 'completed').length ?? 0;

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Capital Humano
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Gestión de personal, incidencias y pre-nómina
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <Button asChild variant="default" className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
                            <Link href="/hcm/command-center">
                                <LayoutDashboard className="mr-2 h-4 w-4" />
                                Centro de Comando
                            </Link>
                        </Button>
                        {canWrite('hcm_attendance') && (
                            <Button asChild variant="outline">
                                <Link href="/hcm/attendance">
                                    <Upload className="mr-2 h-4 w-4" />
                                    Importar Asistencia
                                </Link>
                            </Button>
                        )}
                        {canWrite('hcm_employees') && (
                            <Button asChild variant="outline">
                                <Link href="/hcm/employees/new">
                                    <UserPlus className="mr-2 h-4 w-4" />
                                    Nuevo Empleado
                                </Link>
                            </Button>
                        )}
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    {/* Stats Cards */}
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        {hasHRPermissions && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {isLoading ? '...' : totalEmployees}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {onboardingEmployees > 0 && `${onboardingEmployees} en onboarding`}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Incidencias Pendientes</CardTitle>
                                <Timer className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {isLoading ? '...' : pendingCount}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Requieren aprobación
                                </p>
                            </CardContent>
                        </Card>

                        {hasHRPermissions && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Última Importación</CardTitle>
                                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {isLoading ? '...' : recentImports?.[0]?.recordCount ?? 0}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        {recentImports?.[0]?.status === 'completed' ? 'Completada' :
                                            recentImports?.[0]?.status === 'processing' ? 'Procesando...' :
                                                recentImports?.[0]?.status ?? 'Sin importaciones'}
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {canRead('hcm_prenomina') && (
                            <Card>
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Pre-Nómina</CardTitle>
                                    <Calculator className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        -
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        <Link href="/prenomina" className="text-primary hover:underline">
                                            Ir a consolidación →
                                        </Link>
                                    </p>
                                </CardContent>
                            </Card>
                        )}
                    </div>

                    {/* Main Content Tabs */}
                    <Tabs defaultValue="overview" className="space-y-4">
                        <TabsList>
                            <TabsTrigger value="overview">Resumen</TabsTrigger>
                            <TabsTrigger value="incidences">Incidencias Pendientes</TabsTrigger>
                            <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
                        </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                {/* Quick Actions */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Acciones Rápidas</CardTitle>
                                        <CardDescription>Operaciones frecuentes del módulo HCM</CardDescription>
                                    </CardHeader>
                                    <CardContent className="grid gap-2">
                                        {canRead('hcm_employees') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/employees">
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Ver Directorio de Empleados
                                                </Link>
                                            </Button>
                                        )}
                                        {canWrite('hcm_employees') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/employees/import">
                                                    <Upload className="mr-2 h-4 w-4" />
                                                    Importar Empleados
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_incidences') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/incidences">
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    Gestionar Incidencias
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_attendance') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/attendance">
                                                    <Clock className="mr-2 h-4 w-4" />
                                                    Revisar Asistencia
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_org_chart') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/org-chart">
                                                    <TrendingUp className="mr-2 h-4 w-4" />
                                                    Ver Organigrama
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_talent_grid') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/talent-grid">
                                                    <Users className="mr-2 h-4 w-4" />
                                                    Matriz 9-Box
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_calendar') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/calendar">
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    Calendario del Equipo
                                                </Link>
                                            </Button>
                                        )}
                                        {canRead('hcm_prenomina') && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/prenomina">
                                                    <Calculator className="mr-2 h-4 w-4" />
                                                    Pre-Nomina
                                                </Link>
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Admin Section */}
                                {hasHRPermissions && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle className="flex items-center gap-2">
                                                <Settings className="h-5 w-5" />
                                                Administracion
                                            </CardTitle>
                                            <CardDescription>Configuracion del sistema HCM</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-2">
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/locations">
                                                    <MapPin className="mr-2 h-4 w-4" />
                                                    Ubicaciones
                                                </Link>
                                            </Button>
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/shifts">
                                                    <Clock className="mr-2 h-4 w-4" />
                                                    Turnos
                                                </Link>
                                            </Button>
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/positions">
                                                    <Briefcase className="mr-2 h-4 w-4" />
                                                    Puestos
                                                </Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Recent Imports */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Importaciones Recientes</CardTitle>
                                        <CardDescription>Últimos archivos de asistencia cargados</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {importsLoading ? (
                                            <p className="text-sm text-muted-foreground">Cargando...</p>
                                        ) : recentImports && recentImports.length > 0 ? (
                                            <div className="space-y-3">
                                                {recentImports.slice(0, 3).map((importBatch) => (
                                                    <div key={importBatch.id} className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            {importBatch.status === 'completed' ? (
                                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                                            ) : importBatch.status === 'failed' ? (
                                                                <XCircle className="h-4 w-4 text-red-500" />
                                                            ) : (
                                                                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                                            )}
                                                            <span className="text-sm truncate max-w-[150px]">{importBatch.filename}</span>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">
                                                            {importBatch.recordCount} registros
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No hay importaciones recientes
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Alerts */}
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Alertas</CardTitle>
                                        <CardDescription>Notificaciones importantes</CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        {pendingCount > 0 ? (
                                            <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                                                <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                                                <div>
                                                    <p className="text-sm font-medium">Incidencias pendientes</p>
                                                    <p className="text-xs text-muted-foreground">
                                                        Hay {pendingCount} solicitudes esperando aprobación
                                                    </p>
                                                </div>
                                            </div>
                                        ) : (
                                            <p className="text-sm text-muted-foreground">
                                                No hay alertas activas
                                            </p>
                                        )}
                                    </CardContent>
                                </Card>
                            </div>
                        </TabsContent>

                        <TabsContent value="incidences" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Incidencias Pendientes de Aprobación</CardTitle>
                                    <CardDescription>
                                        Solicitudes de permisos, vacaciones e incapacidades
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {incidencesLoading ? (
                                        <p className="text-sm text-muted-foreground">Cargando incidencias...</p>
                                    ) : pendingIncidences && pendingIncidences.length > 0 ? (
                                        <div className="space-y-3">
                                            {pendingIncidences.map((incidence) => (
                                                <div
                                                    key={incidence.id}
                                                    className="flex items-center justify-between p-3 border rounded-lg"
                                                >
                                                    <div>
                                                        <p className="font-medium">{incidence.employeeName}</p>
                                                        <p className="text-sm text-muted-foreground">
                                                            {incidence.type === 'vacation' ? 'Vacaciones' :
                                                                incidence.type === 'sick_leave' ? 'Incapacidad' :
                                                                    incidence.type === 'personal_leave' ? 'Permiso Personal' :
                                                                        incidence.type}
                                                            {' • '}
                                                            {incidence.startDate} - {incidence.endDate}
                                                            {' • '}
                                                            {incidence.totalDays} días
                                                        </p>
                                                    </div>
                                                    <Button asChild size="sm">
                                                        <Link href={`/hcm/incidences`}>
                                                            Revisar
                                                        </Link>
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            No hay incidencias pendientes de aprobación
                                        </p>
                                    )}
                                    <div className="mt-4">
                                        <Button asChild variant="outline">
                                            <Link href="/hcm/incidences">
                                                Ver todas las incidencias
                                            </Link>
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="onboarding" className="space-y-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Empleados en Onboarding</CardTitle>
                                    <CardDescription>
                                        Seguimiento del proceso de integración
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {employeesLoading ? (
                                        <p className="text-sm text-muted-foreground">Cargando...</p>
                                    ) : employees?.filter(e => e.onboardingStatus && e.onboardingStatus !== 'completed').length ? (
                                        <div className="space-y-3">
                                            {employees
                                                .filter(e => e.onboardingStatus && e.onboardingStatus !== 'completed')
                                                .map((employee) => (
                                                    <div
                                                        key={employee.id}
                                                        className="flex items-center justify-between p-3 border rounded-lg"
                                                    >
                                                        <div>
                                                            <p className="font-medium">{employee.fullName}</p>
                                                            <p className="text-sm text-muted-foreground">
                                                                {employee.positionTitle} • {employee.department}
                                                            </p>
                                                        </div>
                                                        <div className="text-right">
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${employee.onboardingStatus === 'day_0' ? 'bg-blue-100 text-blue-800' :
                                                                employee.onboardingStatus === 'day_30' ? 'bg-yellow-100 text-yellow-800' :
                                                                    employee.onboardingStatus === 'day_60' ? 'bg-orange-100 text-orange-800' :
                                                                        'bg-green-100 text-green-800'
                                                                }`}>
                                                                {employee.onboardingStatus === 'day_0' ? 'Día 0' :
                                                                    employee.onboardingStatus === 'day_30' ? 'Día 30' :
                                                                        employee.onboardingStatus === 'day_60' ? 'Día 60' :
                                                                            employee.onboardingStatus === 'day_90' ? 'Día 90' :
                                                                                employee.onboardingStatus}
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm text-muted-foreground">
                                            No hay empleados en proceso de onboarding
                                        </p>
                                    )}
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </Tabs>
                </main>
            </div>
        </SiteLayout>
    );
}
