
"use client";

import SiteLayout from "@/components/site-layout";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, collectionGroup, limit, orderBy } from "firebase/firestore";
import type { Request as RequestType, Task, User } from '@/lib/types';
import React, { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { addDays, format, isValid } from 'date-fns';
import { es } from 'date-fns/locale';
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import RequestVolumeChart from "@/components/reports/request-volume-chart";
import { UserPerformanceTable } from "@/components/reports/user-performance-table";
import { BottleneckChart } from "@/components/dashboard/bottleneck-chart";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Download, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { parseFirebaseDate } from "@/lib/utils";

const MAX_RECORDS = 1000; // Limit queries to prevent performance issues

function ReportsSkeleton() {
    return (
        <div className="space-y-8">
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/2" />
                    <Skeleton className="h-4 w-3/4" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[350px] w-full" />
                </CardContent>
            </Card>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-1/3" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                        <Skeleton className="h-12 w-full" />
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function AccessDenied() {
    return (
        <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
            <div className="flex flex-col items-center gap-2 text-center">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h3 className="text-2xl font-bold tracking-tight">Acceso Denegado</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    No tienes permisos para ver esta página. Los informes de rendimiento solo están disponibles para los administradores.
                </p>
            </div>
        </div>
    )
}

function ReportsView() {
    const { toast } = useToast();
    const { user, isUserLoading } = useUser();
    const { isAdmin } = usePermissions();
    const firestore = useFirestore();

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: addDays(new Date(), -29),
        to: new Date(),
    });

    // Optimized queries with limits to prevent loading too much data
    const requestsQuery = useMemoFirebase(() => {
        if (isUserLoading || !firestore || !isAdmin) return null;
        return query(
            collectionGroup(firestore, 'requests'),
            orderBy('createdAt', 'desc'),
            limit(MAX_RECORDS)
        );
    }, [firestore, isAdmin, isUserLoading]);

    const tasksQuery = useMemoFirebase(() => {
        if (isUserLoading || !firestore || !isAdmin) return null;
        return query(
            collection(firestore, 'tasks'),
            orderBy('createdAt', 'desc'),
            limit(MAX_RECORDS)
        );
    }, [firestore, isAdmin, isUserLoading]);

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const { data: requests, isLoading: isLoadingRequests } = useCollection<RequestType>(requestsQuery);
    const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);
    const { data: users, isLoading: isLoadingUsers } = useCollection<User>(usersQuery);

    const isLoading = isLoadingRequests || isLoadingTasks || isLoadingUsers;

    const filteredData = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
            return { requests: [], tasks: [] };
        }
        const from = new Date(dateRange.from).getTime();
        const to = new Date(dateRange.to).getTime();

        const filteredRequests = requests?.filter(r => {
            const createdAt = parseFirebaseDate(r.createdAt).getTime();
            return createdAt >= from && createdAt <= to;
        }) ?? [];

        const filteredTasks = tasks?.filter(t => {
            const createdAt = parseFirebaseDate(t.createdAt).getTime();
            return createdAt >= from && createdAt <= to;
        }) ?? [];

        return { requests: filteredRequests, tasks: filteredTasks };
    }, [requests, tasks, dateRange]);

    // Export functions
    const exportRequestsToCSV = () => {
        if (!filteredData.requests.length) {
            toast({
                variant: "destructive",
                title: "Sin datos",
                description: "No hay solicitudes para exportar en el rango seleccionado.",
            });
            return;
        }

        const headers = ['ID', 'Título', 'Estado', 'Creado', 'Actualizado', 'Enviado por'];
        const rows = filteredData.requests.map(r => [
            r.id,
            `"${r.title.replace(/"/g, '""')}"`,
            r.status,
            format(parseFirebaseDate(r.createdAt), 'yyyy-MM-dd HH:mm', { locale: es }),
            format(parseFirebaseDate(r.updatedAt), 'yyyy-MM-dd HH:mm', { locale: es }),
            r.submittedBy
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csvContent, `solicitudes_${format(new Date(), 'yyyy-MM-dd')}.csv`);

        toast({
            title: "Exportación completada",
            description: `Se exportaron ${filteredData.requests.length} solicitudes.`,
        });
    };

    const exportTasksToCSV = () => {
        if (!filteredData.tasks.length) {
            toast({
                variant: "destructive",
                title: "Sin datos",
                description: "No hay tareas para exportar en el rango seleccionado.",
            });
            return;
        }

        const headers = ['ID', 'Nombre', 'Estado', 'Solicitud', 'Asignado a', 'Creado'];
        const rows = filteredData.tasks.map(t => [
            t.id,
            `"${t.name.replace(/"/g, '""')}"`,
            t.status,
            `"${t.requestTitle.replace(/"/g, '""')}"`,
            t.assigneeId || 'Sin asignar',
            format(parseFirebaseDate(t.createdAt), 'yyyy-MM-dd HH:mm', { locale: es })
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csvContent, `tareas_${format(new Date(), 'yyyy-MM-dd')}.csv`);

        toast({
            title: "Exportación completada",
            description: `Se exportaron ${filteredData.tasks.length} tareas.`,
        });
    };

    const exportUserPerformanceToCSV = () => {
        if (!users?.length) {
            toast({
                variant: "destructive",
                title: "Sin datos",
                description: "No hay datos de usuarios para exportar.",
            });
            return;
        }

        const headers = ['Usuario', 'Email', 'Departamento', 'Tareas Completadas', 'Tareas Pendientes', 'Total Tareas'];
        const rows = users.map(u => {
            const userTasks = filteredData.tasks.filter(t => t.assigneeId === u.id);
            const completed = userTasks.filter(t => t.status === 'Completed').length;
            const pending = userTasks.filter(t => t.status !== 'Completed').length;
            return [
                `"${u.fullName.replace(/"/g, '""')}"`,
                u.email,
                `"${u.department.replace(/"/g, '""')}"`,
                completed,
                pending,
                userTasks.length
            ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        downloadCSV(csvContent, `rendimiento_usuarios_${format(new Date(), 'yyyy-MM-dd')}.csv`);

        toast({
            title: "Exportación completada",
            description: `Se exportaron datos de ${users.length} usuarios.`,
        });
    };

    const downloadCSV = (content: string, filename: string) => {
        const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        URL.revokeObjectURL(link.href);
    };

    // Calculate summary stats
    const stats = useMemo(() => {
        const completedRequests = filteredData.requests.filter(r => r.status === 'Completed').length;
        const completedTasks = filteredData.tasks.filter(t => t.status === 'Completed').length;
        const avgTasksPerRequest = filteredData.requests.length > 0
            ? (filteredData.tasks.length / filteredData.requests.length).toFixed(1)
            : '0';

        return {
            totalRequests: filteredData.requests.length,
            completedRequests,
            totalTasks: filteredData.tasks.length,
            completedTasks,
            avgTasksPerRequest,
            completionRate: filteredData.requests.length > 0
                ? ((completedRequests / filteredData.requests.length) * 100).toFixed(1)
                : '0'
        };
    }, [filteredData]);

    if (isLoading) {
        return <ReportsSkeleton />;
    }

    return (
        <div className="flex flex-1 flex-col gap-8">
            <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Informes de Rendimiento</h1>
                    <p className="text-muted-foreground">Analice las tendencias históricas del rendimiento de los procesos.</p>
                </div>
                {isAdmin && (
                    <div className="flex flex-col sm:flex-row gap-2">
                        <DateRangePicker dateRange={dateRange} onDateChange={setDateRange} />
                    </div>
                )}
            </header>
            <main className="flex flex-1 flex-col gap-8">
                {/* Summary Stats */}
                <div className="grid gap-4 md:grid-cols-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Solicitudes</CardDescription>
                            <CardTitle className="text-3xl">{stats.totalRequests}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                {stats.completedRequests} completadas ({stats.completionRate}%)
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Total Tareas</CardDescription>
                            <CardTitle className="text-3xl">{stats.totalTasks}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                {stats.completedTasks} completadas
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Promedio Tareas/Solicitud</CardDescription>
                            <CardTitle className="text-3xl">{stats.avgTasksPerRequest}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                tareas por solicitud
                            </p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Usuarios Activos</CardDescription>
                            <CardTitle className="text-3xl">{users?.length ?? 0}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-xs text-muted-foreground">
                                en el sistema
                            </p>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Volumen de Solicitudes</CardTitle>
                            <CardDescription>Número de solicitudes creadas y completadas a lo largo del tiempo.</CardDescription>
                        </div>
                        <Button variant="outline" size="sm" onClick={exportRequestsToCSV}>
                            <Download className="mr-2 h-4 w-4" />
                            Exportar CSV
                        </Button>
                    </CardHeader>
                    <CardContent>
                        <RequestVolumeChart requests={filteredData.requests} dateRange={dateRange} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Rendimiento por Usuario</CardTitle>
                            <CardDescription>Métricas de finalización de tareas para cada usuario.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" size="sm" onClick={exportTasksToCSV}>
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                Tareas CSV
                            </Button>
                            <Button variant="outline" size="sm" onClick={exportUserPerformanceToCSV}>
                                <Download className="mr-2 h-4 w-4" />
                                Rendimiento CSV
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <UserPerformanceTable users={users ?? []} tasks={filteredData.tasks} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Análisis de Cuellos de Botella</CardTitle>
                        <CardDescription>Tiempo promedio de finalización por tipo de tarea para identificar retrasos críticos.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <BottleneckChart tasks={filteredData.tasks} isLoading={isLoadingTasks} />
                    </CardContent>
                </Card>

                {(requests?.length === MAX_RECORDS || tasks?.length === MAX_RECORDS) && (
                    <p className="text-sm text-muted-foreground text-center">
                        ⚠️ Se muestran los últimos {MAX_RECORDS} registros. Use el filtro de fechas para ver datos específicos.
                    </p>
                )}
            </main>
        </div>
    );
}

export default function ReportsPage() {
    const { user, isUserLoading: isAuthLoading } = useUser();
    const isAdmin = user?.role === 'Admin';

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col p-4 pt-6 sm:p-6">
                {isAuthLoading ? (
                    <ReportsSkeleton />
                ) : isAdmin ? (
                    <ReportsView />
                ) : (
                    <AccessDenied />
                )}
            </div>
        </SiteLayout>
    );
}

