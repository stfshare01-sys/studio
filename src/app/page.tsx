
'use client';

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, where, limit } from "firebase/firestore";
import type { Request as RequestType, Task, User, Incidence } from '@/lib/types';
import { INCIDENCE_RULES } from '@/lib/hcm-validation';
import { FilePlus, Hourglass, CheckCircle, Timer } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { TaskCard, EnrichedTask } from "@/components/tasks/task-card";
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
    // This query MUST wait for user loading AND authentication to finish
    if (isUserLoading || !firestore || !user) return null;
    return query(collection(firestore, 'tasks'), limit(1000));
  }, [firestore, isUserLoading, user]);

  const { data: myRequests, isLoading: isLoadingMyRequests } = useCollection<RequestType>(myRequestsQuery);

  const myIncidencesQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !user?.uid) return null;
    return query(collection(firestore, 'incidences'), where('employeeId', '==', user.uid));
  }, [firestore, user?.uid, isUserLoading]);

  const { data: myIncidences, isLoading: isLoadingMyIncidences } = useCollection<Incidence>(myIncidencesQuery);

  const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);
  const { data: allTasks, isLoading: isLoadingAllTasks } = useCollection<Task>(allTasksQuery);

  const combinedRequests = React.useMemo(() => {
    const list: any[] = [];
    if (myRequests) {
      list.push(...myRequests);
    }
    if (myIncidences) {
      myIncidences.forEach(inc => {
        const rule = INCIDENCE_RULES[inc.type];
        const titleName = rule?.name || inc.type;
        list.push({
          id: inc.id,
          title: `${titleName} (${inc.startDate} al ${inc.endDate})`,
          status: inc.status === 'approved' ? 'Completed' : inc.status === 'rejected' ? 'Rejected' : 'In Progress',
          submittedBy: user?.uid || '',
          createdAt: inc.createdAt || new Date().toISOString(),
          updatedAt: inc.updatedAt || new Date().toISOString(),
          isHcmIncidence: true,
          incidenceType: inc.type,
          // fallback fields 
          templateId: 'hcm', formValues: {}, currentStepId: 'hcm'
        });
      });
    }
    list.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    return list;
  }, [myRequests, myIncidences, user]);


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
              isLoading={isLoadingMyRequests || isLoadingMyIncidences}

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
              isLoading={isLoadingMyRequests || isLoadingMyIncidences}

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
              {!isLoadingTasks && tasks && tasks.length > 0 && (
                <div className="space-y-2">
                  {tasks.slice(0, 5).map((task) => (
                    <TaskCard key={task.id} task={task as EnrichedTask} variant="compact" />
                  ))}
                  <div className="pt-2 text-center">
                    <Button variant="link" asChild className="text-muted-foreground">
                      <Link href="/tasks">Ver todas las tareas</Link>
                    </Button>
                  </div>
                </div>
              )}
              {!isLoadingTasks && !tasks?.length && (
                <EmptyState
                  variant="inbox"
                  title="Bandeja de entrada vacía"
                  description="No tienes ninguna tarea asignada en este momento."
                  compact
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mis Solicitudes</CardTitle>
              <CardDescription>Rastree el estado de todas las solicitudes que ha enviado.</CardDescription>
            </CardHeader>
            <CardContent>
              {(isLoadingMyRequests || isLoadingMyIncidences) && <DataTableSkeleton />}
              {!(isLoadingMyRequests || isLoadingMyIncidences) && combinedRequests.length > 0 && <RequestsTable requests={combinedRequests} />}
              {!(isLoadingMyRequests || isLoadingMyIncidences) && combinedRequests.length === 0 && (
                <EmptyState
                  variant="documents"
                  title="No tiene solicitudes"
                  description="Cree una nueva solicitud para empezar."
                  actionLabel="Nueva Solicitud"
                  onAction={() => window.location.href = '/requests/new'}
                />
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </SiteLayout>
  );
}
