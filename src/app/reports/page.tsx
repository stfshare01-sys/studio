
"use client";

import SiteLayout from "@/components/site-layout";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, collectionGroup } from "firebase/firestore";
import type { Request as RequestType, Task, User } from '@/lib/types';
import React, { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { addDays, format, startOfDay, isValid } from 'date-fns';
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import RequestVolumeChart from "@/components/reports/request-volume-chart";
import { UserPerformanceTable } from "@/components/reports/user-performance-table";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert } from "lucide-react";

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

function AdminReportsView({ dateRange }: { dateRange: DateRange | undefined }) {
    const firestore = useFirestore();

    const requestsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collectionGroup(firestore, 'requests'));
    }, [firestore]);

    const tasksQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'tasks'));
    }, [firestore]);

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const { data: requests, isLoading: isLoadingRequests } = useCollection<RequestType>(requestsQuery);
    const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);
    const { data: users, isLoading: isLoadingUsers } = useCollection<User>(usersQuery);

    const filteredData = useMemo(() => {
        if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
            return { requests: [], tasks: [] };
        }
        const from = startOfDay(dateRange.from).getTime();
        const to = startOfDay(addDays(dateRange.to, 1)).getTime();

        const filteredRequests = requests?.filter(r => {
            const createdAt = new Date(r.createdAt).getTime();
            return createdAt >= from && createdAt < to;
        }) ?? [];

        const filteredTasks = tasks?.filter(t => {
            const createdAt = new Date(t.createdAt).getTime();
            return createdAt >= from && createdAt < to;
        }) ?? [];

        return { requests: filteredRequests, tasks: filteredTasks };
    }, [requests, tasks, dateRange]);

    const isLoadingData = isLoadingRequests || isLoadingTasks || isLoadingUsers;

    if (isLoadingData) {
        return <ReportsSkeleton />;
    }

    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle>Volumen de Solicitudes</CardTitle>
                    <CardDescription>Número de solicitudes creadas y completadas a lo largo del tiempo.</CardDescription>
                </CardHeader>
                <CardContent>
                    <RequestVolumeChart requests={filteredData.requests} dateRange={dateRange} />
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Rendimiento por Usuario</CardTitle>
                    <CardDescription>Métricas de finalización de tareas para cada usuario.</CardDescription>
                </CardHeader>
                <CardContent>
                    <UserPerformanceTable users={users ?? []} tasks={filteredData.tasks} />
                </CardContent>
            </Card>
        </>
    );
}


export default function ReportsPage() {
    const { user, isUserLoading: isAuthLoading } = useUser();
    const isAdmin = user?.role === 'Admin';

    const [dateRange, setDateRange] = useState<DateRange | undefined>({
        from: addDays(new Date(), -29),
        to: new Date(),
    });
    
    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Informes de Rendimiento</h1>
                        <p className="text-muted-foreground">Analice las tendencias históricas del rendimiento de los procesos.</p>
                    </div>
                    {isAdmin && <DateRangePicker dateRange={dateRange} onDateChange={setDateRange} />}
                </header>
                <main className="flex flex-1 flex-col gap-8 p-4 pt-0 sm:p-6 sm:pt-0">
                    {isAuthLoading && <ReportsSkeleton />}
                    {!isAuthLoading && !isAdmin && <AccessDenied />}
                    {!isAuthLoading && isAdmin && <AdminReportsView dateRange={dateRange} />}
                </main>
            </div>
        </SiteLayout>
    );
}
