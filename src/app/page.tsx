
'use client';

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { Request as RequestType, Task, User } from '@/lib/types';
import { FilePlus, Hourglass, CheckCircle, Timer } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TasksTable } from "@/components/dashboard/tasks-table";
import React from "react";
import { differenceInHours } from 'date-fns';
import { BottleneckChart } from "@/components/dashboard/bottleneck-chart";
import { StatCard } from "@/components/dashboard/stat-card";


function DataTableSkeleton() {
    return (
      <div className="rounded-md border">
        <div className="p-4">
            <div className="space-y-3">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
            </div>
        </div>
        <div className="p-4">
            <Skeleton className="h-10 w-full" />
        </div>
        <div className="p-4">
            <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      </div>
    );
  }

export default function DashboardPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  // Query for the current user's requests
  const myRequestsQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !user?.uid) return null;
    return query(collection(firestore, 'users', user.uid, 'requests'));
  }, [firestore, user?.uid, isUserLoading]);

  // Query for tasks assigned TO the current user that are active
  const tasksQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !user) return null;
    return query(
        collection(firestore, 'tasks'),
        where('assigneeId', '==', user.uid),
        where('status', '==', 'Active')
    );
  }, [firestore, user, isUserLoading]);

  const allTasksQuery = useMemoFirebase(() => {
    // This query MUST wait for user loading to finish to ensure firestore is ready
    if (isUserLoading || !firestore) return null;
    return query(collection(firestore, 'tasks'));
  }, [firestore, isUserLoading]);

  // Query for users (for RequestsTable to avoid N+1)
  const usersQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore, isUserLoading]);

  const { data: myRequests, isLoading: isLoadingMyRequests } = useCollection<RequestType>(myRequestsQuery);
  const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);
  const { data: allTasks, isLoading: isLoadingAllTasks } = useCollection<Task>(allTasksQuery);
  const { data: users } = useCollection<User>(usersQuery);


  const stats = React.useMemo(() => {
    if (!myRequests) return { inProgress: 0, avgCycleTime: 0 };
    const completedRequests = myRequests.filter(r => r.status === 'Completed' && r.completedAt && r.createdAt);
    const totalCycleTime = completedRequests.reduce((acc, curr) => {
        const completedAt = curr.completedAt ? new Date(curr.completedAt) : null;
        const createdAt = new Date(curr.createdAt);
        if (completedAt) {
            return acc + differenceInHours(completedAt, createdAt);
        }
        return acc;
    }, 0);

    return {
        inProgress: myRequests.filter(r => r.status === 'In Progress').length,
        avgCycleTime: completedRequests.length > 0 ? (totalCycleTime / completedRequests.length).toFixed(1) : 0,
    }
  }, [myRequests]);

  const completedTasksCount = React.useMemo(() => {
    if (!allTasks) return 0;
    return allTasks.filter(t => t.status === 'Completed').length;
  }, [allTasks]);


  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
          <Button asChild>
            <Link href="/requests/new">
              <FilePlus className="mr-2 h-4 w-4" />
              Nueva Solicitud
            </Link>
          </Button>
        </header>
        <main className="flex flex-1 flex-col gap-8 p-4 pt-0 sm:p-6 sm:pt-0">
          
          {/* STATS CARDS */}
          <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Solicitudes en Progreso"
                value={stats.inProgress}
                icon={Hourglass}
                description="Procesos activos que requieren acción."
                isLoading={isLoadingMyRequests}
              />
              <StatCard
                title="Tareas Completadas"
                value={completedTasksCount}
                icon={CheckCircle}
                description="Total de tareas completadas en todos los flujos."
                isLoading={isLoadingAllTasks}
              />
              <StatCard
                title="Tiempo Promedio de Ciclo (Horas)"
                value={stats.avgCycleTime}
                icon={Timer}
                description="Tiempo medio para completar una solicitud."
                isLoading={isLoadingMyRequests}
              />
          </div>

          {/* BOTTLENECK CHART */}
          <Card>
              <CardHeader>
                  <CardTitle>Análisis de Cuellos de Botella</CardTitle>
                  <CardDescription>Tiempo promedio de finalización por tipo de tarea para identificar retrasos.</CardDescription>
              </CardHeader>
              <CardContent>
                  <BottleneckChart tasks={allTasks} isLoading={isLoadingAllTasks} />
              </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>Mis Tareas Pendientes</CardTitle>
              <CardDescription>Estas son las tareas activas que requieren tu atención.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingTasks && <DataTableSkeleton />}
                {!isLoadingTasks && tasks && <TasksTable tasks={tasks} />}
                {!isLoadingTasks && !tasks?.length && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                        <div className="text-center">
                            <h3 className="text-2xl font-bold tracking-tight">Bandeja de entrada vacía</h3>
                            <p className="text-sm text-muted-foreground">No tienes ninguna tarea asignada en este momento.</p>
                        </div>
                    </div>
                )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Mis Solicitudes</CardTitle>
              <CardDescription>Rastree el estado de todas las solicitudes que ha enviado.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingMyRequests && <DataTableSkeleton />}
              {!isLoadingMyRequests && myRequests && <RequestsTable requests={myRequests} users={users ?? []} />}
              {!isLoadingMyRequests && !myRequests?.length && (
                 <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">No tiene solicitudes</h3>
                        <p className="text-sm text-muted-foreground">Cree una nueva solicitud para empezar.</p>
                        <Button className="mt-4" asChild>
                            <Link href="/requests/new">
                                <FilePlus className="mr-2 h-4 w-4" />
                                Nueva Solicitud
                            </Link>
                        </Button>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </SiteLayout>
  );
}
