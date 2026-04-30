
"use client";

import SiteLayout from "@/components/site-layout";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, collectionGroup, limit, orderBy } from "firebase/firestore";
import type { User } from '@/types/auth.types';
import React, { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { addDays, startOfDay, isValid, subDays } from 'date-fns';
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldAlert, Activity, GitBranch, Shield, TrendingUp, Users2, AlertTriangle } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ProcessVariantsChart,
  ConformancePanel,
  SPCChart,
  ResourceAnalytics,
  BottleneckAnalysisComponent,
  ProcessHealthScore,
} from '@/components/process-mining';
import { usePermissions } from "@/hooks/use-permissions";
import type { Request as RequestType, Task, Template } from "@/types/workflow.types";

const MAX_RECORDS = 1000;

function ProcessMiningSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-[280px]" />
        <Skeleton className="h-[280px] md:col-span-2" />
      </div>
      <Skeleton className="h-[400px]" />
    </div>
  );
}

function AccessDenied() {
  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h3 className="text-2xl font-bold tracking-tight">Acceso Denegado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          No tienes permisos para ver esta página. La minería de procesos solo está disponible para los administradores.
        </p>
      </div>
    </div>
  );
}

export default function ProcessMiningPage() {
  const { user, isUserLoading: isAuthLoading } = useUser();
  const { isAdmin } = usePermissions();

  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: addDays(new Date(), -29),
    to: new Date(),
  });

  const firestore = useFirestore();

  // Queries
  const requestsQuery = useMemoFirebase(() => {
    if (isAuthLoading || !firestore || !isAdmin) return null;
    return query(
      collectionGroup(firestore, 'requests'),
      orderBy('createdAt', 'desc'),
      limit(MAX_RECORDS)
    );
  }, [firestore, isAdmin, isAuthLoading]);

  const tasksQuery = useMemoFirebase(() => {
    if (isAuthLoading || !firestore || !isAdmin) return null;
    return query(
      collection(firestore, 'tasks'),
      orderBy('createdAt', 'desc'),
      limit(MAX_RECORDS)
    );
  }, [firestore, isAdmin, isAuthLoading]);

  const templatesQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'request_templates');
  }, [firestore]);

  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore]);

  const { data: requests, isLoading: isLoadingRequests } = useCollection<RequestType>(requestsQuery);
  const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);
  const { data: templates, isLoading: isLoadingTemplates } = useCollection<Template>(templatesQuery);
  const { data: users, isLoading: isLoadingUsers } = useCollection<User>(usersQuery);

  const isLoading = isLoadingRequests || isLoadingTasks || isLoadingTemplates || isLoadingUsers;

  // Filter data by date range
  const filteredData = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to || !isValid(dateRange.from) || !isValid(dateRange.to)) {
      return { requests: [], tasks: [], previousRequests: [], previousTasks: [] };
    }
    const from = startOfDay(dateRange.from).getTime();
    const to = startOfDay(addDays(dateRange.to, 1)).getTime();

    // Calculate previous period for trend comparison
    const periodLength = Math.ceil((to - from) / (1000 * 60 * 60 * 24));
    const prevFrom = subDays(dateRange.from, periodLength).getTime();
    const prevTo = from;

    const filteredRequests = requests?.filter(r => {
      const createdAt = new Date(r.createdAt).getTime();
      return createdAt >= from && createdAt < to;
    }) ?? [];

    const filteredTasks = tasks?.filter(t => {
      const createdAt = new Date(t.createdAt).getTime();
      return createdAt >= from && createdAt < to;
    }) ?? [];

    const previousRequests = requests?.filter(r => {
      const createdAt = new Date(r.createdAt).getTime();
      return createdAt >= prevFrom && createdAt < prevTo;
    }) ?? [];

    const previousTasks = tasks?.filter(t => {
      const createdAt = new Date(t.createdAt).getTime();
      return createdAt >= prevFrom && createdAt < prevTo;
    }) ?? [];

    return { requests: filteredRequests, tasks: filteredTasks, previousRequests, previousTasks };
  }, [requests, tasks, dateRange]);

  // Summary stats
  const stats = useMemo(() => {
    const completedRequests = filteredData.requests.filter(r => r.status === 'Completed');
    const uniqueVariants = new Set(
      filteredData.requests.map(r =>
        r.steps
          .filter(s => s.status === 'Completed')
          .map(s => s.name)
          .join('→')
      )
    ).size;

    return {
      totalRequests: filteredData.requests.length,
      completedRequests: completedRequests.length,
      uniqueVariants,
      totalTasks: filteredData.tasks.length,
    };
  }, [filteredData]);

  if (isAuthLoading) {
    return (
      <SiteLayout>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-6 sm:p-6">
          <ProcessMiningSkeleton />
        </div>
      </SiteLayout>
    );
  }

  if (!isAdmin) {
    return (
      <SiteLayout>
        <div className="flex flex-1 flex-col gap-6 p-4 pt-6 sm:p-6">
          <AccessDenied />
        </div>
      </SiteLayout>
    )
  }

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Minería de Procesos
            </h1>
            <p className="text-muted-foreground">
              Análisis avanzado de variantes, conformidad y rendimiento de procesos.
            </p>
          </div>
          {isAdmin && (
            <DateRangePicker dateRange={dateRange} onDateChange={setDateRange} />
          )}
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 pt-0 sm:p-6 sm:pt-0">
          <>
            {isLoading ? (
              <ProcessMiningSkeleton />
            ) : (
              <>
                {/* Summary Stats */}
                <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Solicitudes Analizadas</CardDescription>
                      <CardTitle className="text-3xl">{stats.totalRequests}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {stats.completedRequests} completadas
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Variantes Detectadas</CardDescription>
                      <CardTitle className="text-3xl">{stats.uniqueVariants}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        rutas de proceso únicas
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Tareas Procesadas</CardDescription>
                      <CardTitle className="text-3xl">{stats.totalTasks}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        en el período seleccionado
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2">
                      <CardDescription>Plantillas Activas</CardDescription>
                      <CardTitle className="text-3xl">{templates?.length ?? 0}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        modelos de proceso
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Main Content with Tabs */}
                <Tabs defaultValue="overview" className="space-y-4">
                  <TabsList className="grid w-full grid-cols-2 md:grid-cols-5">
                    <TabsTrigger value="overview" className="flex items-center gap-1">
                      <Activity className="h-4 w-4" />
                      <span className="hidden sm:inline">Resumen</span>
                    </TabsTrigger>
                    <TabsTrigger value="variants" className="flex items-center gap-1">
                      <GitBranch className="h-4 w-4" />
                      <span className="hidden sm:inline">Variantes</span>
                    </TabsTrigger>
                    <TabsTrigger value="conformance" className="flex items-center gap-1">
                      <Shield className="h-4 w-4" />
                      <span className="hidden sm:inline">Conformidad</span>
                    </TabsTrigger>
                    <TabsTrigger value="spc" className="flex items-center gap-1">
                      <TrendingUp className="h-4 w-4" />
                      <span className="hidden sm:inline">Control SPC</span>
                    </TabsTrigger>
                    <TabsTrigger value="resources" className="flex items-center gap-1">
                      <Users2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Recursos</span>
                    </TabsTrigger>
                  </TabsList>

                  {/* Overview Tab */}
                  <TabsContent value="overview" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-3">
                      <ProcessHealthScore
                        requests={filteredData.requests}
                        tasks={filteredData.tasks}
                        templates={templates ?? []}
                      />
                      <Card className="md:col-span-2">
                        <CardHeader>
                          <CardTitle className="text-lg flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Análisis de Cuellos de Botella
                          </CardTitle>
                          <CardDescription>
                            Identificación de pasos que ralentizan el proceso
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <BottleneckAnalysisComponent
                            tasks={filteredData.tasks}
                            previousPeriodTasks={filteredData.previousTasks}
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Variants Tab */}
                  <TabsContent value="variants">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <GitBranch className="h-5 w-5" />
                          Análisis de Variantes del Proceso
                        </CardTitle>
                        <CardDescription>
                          Diferentes caminos que las solicitudes toman a través del flujo de trabajo.
                          Las variantes muestran cómo los procesos reales difieren del modelo ideal.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ProcessVariantsChart requests={filteredData.requests} maxVariants={8} />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* Conformance Tab */}
                  <TabsContent value="conformance">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Shield className="h-5 w-5" />
                          Verificación de Conformidad
                        </CardTitle>
                        <CardDescription>
                          Análisis de qué tan bien las ejecuciones reales se ajustan a los modelos de proceso definidos.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ConformancePanel
                          requests={filteredData.requests}
                          templates={templates ?? []}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  {/* SPC Tab */}
                  <TabsContent value="spc" className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Control del Tiempo de Ciclo
                          </CardTitle>
                          <CardDescription>
                            Monitoreo estadístico de la duración de los procesos
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <SPCChart
                            requests={filteredData.requests}
                            metric="cycle_time"
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base flex items-center gap-2">
                            <TrendingUp className="h-5 w-5" />
                            Control de Complejidad
                          </CardTitle>
                          <CardDescription>
                            Monitoreo del número de pasos por solicitud
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <SPCChart
                            requests={filteredData.requests}
                            metric="steps_count"
                          />
                        </CardContent>
                      </Card>
                    </div>
                  </TabsContent>

                  {/* Resources Tab */}
                  <TabsContent value="resources">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users2 className="h-5 w-5" />
                          Análisis de Recursos
                        </CardTitle>
                        <CardDescription>
                          Productividad, carga de trabajo y eficiencia del equipo.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ResourceAnalytics
                          tasks={filteredData.tasks}
                          users={users ?? []}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>

                {/* Data limit warning */}
                {(requests?.length === MAX_RECORDS || tasks?.length === MAX_RECORDS) && (
                  <p className="text-sm text-muted-foreground text-center">
                    ⚠️ Se muestran los últimos {MAX_RECORDS} registros. Use el filtro de fechas para ver datos específicos.
                  </p>
                )}
              </>
            )}
          </>
        </main>
      </div>
    </SiteLayout>
  );
}
