
'use client';

import { useState, useEffect } from 'react';

import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
    Users,
    Users2,
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
    Building2,
} from 'lucide-react';
import Link from 'next/link';
import type { Employee, Incidence, AttendanceImportBatch } from '@/lib/types';
import { getDirectReports } from '@/firebase/actions/team-actions';

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
    // Check if Manager-only (not HR, not Admin)
    const isManagerOnly = user?.role === 'Manager' && !hasHRPermissions;
    const [teamIds, setTeamIds] = useState<string[]>([]);

    // Load team IDs for Manager
    useEffect(() => {
        if (isManagerOnly && user?.uid) {
            getDirectReports(user.uid).then(res => {
                if (res.success && res.employees) {
                    setTeamIds(res.employees.map(e => e.id));
                }
            });
        }
    }, [isManagerOnly, user?.uid]);

    // Fetch active employees count - for HR/Admin see all, for Manager see team
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user) return null;

        if (hasHRPermissions) {
            return query(
                collection(firestore, 'employees'),
                where('status', '==', 'active'),
                limit(100)
            );
        }

        if (isManagerOnly) {
            return query(
                collection(firestore, 'employees'),
                where('directManagerId', '==', user.uid),
                where('status', '==', 'active'),
                limit(100)
            );
        }

        return null; // Regular employees don't see employee list
    }, [firestore, isUserLoading, user, hasHRPermissions, isManagerOnly]);

    const { data: employees, isLoading: employeesLoading } = useCollection<Employee>(employeesQuery);

    // Fetch pending incidences - HR sees all, Manager sees team, Employee sees own
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

        // Managers see their team's pending incidences + their own
        if (isManagerOnly && teamIds.length > 0) {
            const allowedIds = [user.uid, ...teamIds].slice(0, 30);
            return query(
                baseQuery,
                where('employeeId', 'in', allowedIds),
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
    }, [firestore, isUserLoading, user, hasHRPermissions, isManagerOnly, teamIds]);


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

    // Check if current user has direct reports (for team management access)
    // Only query for roles that have permission to list employees
    const directReportsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user?.id) return null;
        // Only Manager/HR/Admin can list employees — Members would get permission denied
        if (!hasHRPermissions && !isManagerOnly) return null;
        return query(
            collection(firestore, 'employees'),
            where('directManagerId', '==', user.id),
            where('status', '==', 'active'),
            limit(1)
        );
    }, [firestore, isUserLoading, user?.id, hasHRPermissions, isManagerOnly]);

    const { data: directReports, isLoading: directReportsLoading } = useCollection<Employee>(directReportsQuery);
    const hasDirectReports = (directReports && directReports.length > 0) || isAdmin;

    const isLoading = isUserLoading || employeesLoading || incidencesLoading || importsLoading || directReportsLoading;

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
                            Gestión de personal, permisos y pre-nómina
                        </p>
                    </div>
                    <div className="header-action-bar">
                        {hasHRPermissions && (
                            <Button asChild variant="default" className="button-aura px-6">
                                <Link href="/hcm/command-center">
                                    <LayoutDashboard className="mr-2 h-4 w-4" />
                                    Centro de Comando
                                </Link>
                            </Button>
                        )}
                        {canWrite('hcm_attendance') && (
                            <Button asChild variant="outline" className="rounded-full border-primary/20 hover:bg-primary/10">
                                <Link href="/hcm/attendance">
                                    <Upload className="mr-2 h-4 w-4" />
                                    Importar Asistencia
                                </Link>
                            </Button>
                        )}
                        {canWrite('hcm_employees') && (
                            <Button asChild variant="outline" className="rounded-full border-primary/20 hover:bg-primary/10">
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
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 bento-grid">
                        {hasHRPermissions && (
                            <Card className="bento-item">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Empleados Activos</CardTitle>
                                    <Users className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        {isLoading ? '...' : totalEmployees}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Personal en nómina
                                    </p>
                                </CardContent>
                            </Card>
                        )}

                        {hasHRPermissions && (
                            <Card className="bento-item">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Permisos Pendientes</CardTitle>
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
                        )}

                        {hasHRPermissions && (
                            <Card className="bento-item">
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
                            <Card className="bento-item">
                                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                    <CardTitle className="text-sm font-medium">Pre-Nómina</CardTitle>
                                    <Calculator className="h-4 w-4 text-muted-foreground" />
                                </CardHeader>
                                <CardContent>
                                    <div className="text-2xl font-bold">
                                        -
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        <Link href="/hcm/prenomina" className="text-primary hover:underline">
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
                            </TabsList>

                        <TabsContent value="overview" className="space-y-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 bento-grid">
                                {/* Quick Actions */}
                                <Card className="bento-item">
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
                                                    Gestionar Permisos
                                                </Link>
                                            </Button>
                                        )}
                                        {hasDirectReports && (
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/team-management">
                                                    <Users2 className="mr-2 h-4 w-4" />
                                                    Gestión de Equipo
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
                                                    Consolidación de Asistencia
                                                </Link>
                                            </Button>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Admin Section */}
                                {hasHRPermissions && (
                                    <Card className="bento-item">
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
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/departments">
                                                    <Building2 className="mr-2 h-4 w-4" />
                                                    Departamentos
                                                </Link>
                                            </Button>
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/vacation-management">
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    Gestión de Vacaciones
                                                </Link>
                                            </Button>
                                            <Button asChild variant="outline" className="justify-start">
                                                <Link href="/hcm/admin/holidays">
                                                    <Calendar className="mr-2 h-4 w-4" />
                                                    Calendarios de Días Festivos
                                                </Link>
                                            </Button>
                                        </CardContent>
                                    </Card>
                                )}

                                {/* Recent Imports */}
                                {hasHRPermissions && (
                                    <Card className="bento-item">
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
                                )}

                                {/* Alerts */}
                                {hasHRPermissions && (
                                    <Card className="bento-item">
                                        <CardHeader>
                                            <CardTitle>Alertas</CardTitle>
                                            <CardDescription>Notificaciones importantes</CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {pendingCount > 0 ? (
                                                <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg">
                                                    <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5" />
                                                    <div>
                                                        <p className="text-sm font-medium">Permisos pendientes</p>
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
                                )}
                            </div>
                        </TabsContent>


                    </Tabs>
                </main>
            </div >
        </SiteLayout >
    );
}
