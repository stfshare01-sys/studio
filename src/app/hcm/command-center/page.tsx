"use client";

import { useState, useMemo } from "react";
import SiteLayout from "@/components/site-layout";
import { useFirebase, useMemoFirebase } from "@/firebase/provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import Link from "next/link";
import { format, subDays, differenceInDays, addMonths, startOfMonth, endOfMonth } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

import {
  Users,
  DollarSign,
  Clock,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Calendar,
  UserPlus,
  UserMinus,
  FileCheck,
  ArrowRight,
  Building2,
  CheckCircle2,
  XCircle,
  Timer,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";

import type { Employee, Incidence, PrenominaRecord, AttendanceRecord } from "@/lib/types";
import { formatCurrency } from "@/lib/hcm-utils";

// KPI Card Component
function KpiCard({
  title,
  value,
  subtitle,
  icon: Icon,
  trend,
  trendValue,
  variant = "default",
  isLoading,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  variant?: "default" | "success" | "warning" | "danger";
  isLoading?: boolean;
}) {
  const variantStyles = {
    default: "bg-card",
    success: "bg-green-500/5 border-green-500/20",
    warning: "bg-amber-500/5 border-amber-500/20",
    danger: "bg-red-500/5 border-red-500/20",
  };

  const iconStyles = {
    default: "text-primary",
    success: "text-green-600",
    warning: "text-amber-600",
    danger: "text-red-600",
  };

  if (isLoading) {
    return (
      <Card className={variantStyles[variant]}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-8 rounded-full" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-32 mb-1" />
          <Skeleton className="h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={variantStyles[variant]}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <div className={`p-2 rounded-full bg-muted ${iconStyles[variant]}`}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 mt-1">
          {trend && trendValue && (
            <span
              className={`text-xs flex items-center gap-1 ${
                trend === "up"
                  ? "text-green-600"
                  : trend === "down"
                  ? "text-red-600"
                  : "text-muted-foreground"
              }`}
            >
              {trend === "up" ? (
                <TrendingUp className="h-3 w-3" />
              ) : trend === "down" ? (
                <TrendingDown className="h-3 w-3" />
              ) : null}
              {trendValue}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// Alert Item Component
function AlertItem({
  type,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  type: "warning" | "danger" | "info";
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  const styles = {
    warning: "border-l-amber-500 bg-amber-500/5",
    danger: "border-l-red-500 bg-red-500/5",
    info: "border-l-blue-500 bg-blue-500/5",
  };

  const iconStyles = {
    warning: "text-amber-600",
    danger: "text-red-600",
    info: "text-blue-600",
  };

  return (
    <div className={`border-l-4 p-4 rounded-r-lg ${styles[type]}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className={`h-5 w-5 mt-0.5 ${iconStyles[type]}`} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {actionLabel && actionHref && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={actionHref}>
              {actionLabel}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

// Activity Timeline Item
function ActivityItem({
  icon: Icon,
  iconBg,
  title,
  subtitle,
  timestamp,
}: {
  icon: React.ElementType;
  iconBg: string;
  title: string;
  subtitle: string;
  timestamp: string;
}) {
  return (
    <div className="flex gap-3">
      <div className={`p-2 rounded-full h-fit ${iconBg}`}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
        <p className="text-xs text-muted-foreground mt-1">{timestamp}</p>
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  const { firestore, user, isUserLoading } = useFirebase();
  const today = new Date();
  const thirtyDaysAgo = subDays(today, 30);

  // Fetch employees
  const employeesQuery = useMemoFirebase(() => {
    if (!firestore || isUserLoading) return null;
    return query(collection(firestore, "employees"), where("status", "==", "active"));
  }, [firestore, isUserLoading]);

  const { data: employees, isLoading: isLoadingEmployees } = useCollection<Employee>(employeesQuery);

  // Fetch pending incidences
  const pendingIncidencesQuery = useMemoFirebase(() => {
    if (!firestore || isUserLoading) return null;
    return query(
      collection(firestore, "incidences"),
      where("status", "==", "pending"),
      orderBy("createdAt", "desc")
    );
  }, [firestore, isUserLoading]);

  const { data: pendingIncidences, isLoading: isLoadingIncidences } =
    useCollection<Incidence>(pendingIncidencesQuery);

  // Fetch recent incidences for timeline
  const recentIncidencesQuery = useMemoFirebase(() => {
    if (!firestore || isUserLoading) return null;
    return query(
      collection(firestore, "incidences"),
      orderBy("createdAt", "desc"),
      limit(10)
    );
  }, [firestore, isUserLoading]);

  const { data: recentIncidences } = useCollection<Incidence>(recentIncidencesQuery);

  // Fetch today's attendance
  const todayStr = format(today, "yyyy-MM-dd");
  const attendanceQuery = useMemoFirebase(() => {
    if (!firestore || isUserLoading) return null;
    return query(
      collection(firestore, "attendance"),
      where("date", "==", todayStr)
    );
  }, [firestore, isUserLoading, todayStr]);

  const { data: todayAttendance, isLoading: isLoadingAttendance } =
    useCollection<AttendanceRecord>(attendanceQuery);

  // Fetch prenomina for current period
  const prenominaQuery = useMemoFirebase(() => {
    if (!firestore || isUserLoading) return null;
    return query(
      collection(firestore, "prenomina"),
      where("status", "in", ["draft", "pending_approval"]),
      orderBy("createdAt", "desc"),
      limit(50)
    );
  }, [firestore, isUserLoading]);

  const { data: prenominaRecords, isLoading: isLoadingPrenomina } =
    useCollection<PrenominaRecord>(prenominaQuery);

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalEmployees = employees?.length || 0;
    const presentToday = todayAttendance?.length || 0;
    const attendanceRate = totalEmployees > 0 ? (presentToday / totalEmployees) * 100 : 0;

    const totalPendingIncidences = pendingIncidences?.length || 0;
    const oldPendingIncidences =
      pendingIncidences?.filter((inc) => {
        const created = inc.createdAt instanceof Timestamp
          ? inc.createdAt.toDate()
          : new Date(inc.createdAt);
        return differenceInDays(today, created) > 2;
      }).length || 0;

    const totalPrenomina =
      prenominaRecords?.reduce((sum, record) => sum + (record.netPay || 0), 0) || 0;

    // Employees with contracts expiring in 30 days (mock - would need contract end date)
    const contractsExpiring = 0; // Would calculate from employee contracts

    // Overtime hours this period
    const totalOvertimeHours =
      todayAttendance?.reduce((sum, record) => sum + (record.overtimeHours || 0), 0) || 0;

    return {
      totalEmployees,
      presentToday,
      attendanceRate,
      totalPendingIncidences,
      oldPendingIncidences,
      totalPrenomina,
      contractsExpiring,
      totalOvertimeHours,
    };
  }, [employees, todayAttendance, pendingIncidences, prenominaRecords]);

  // Generate alerts
  const alerts = useMemo(() => {
    const alertList: {
      type: "warning" | "danger" | "info";
      title: string;
      description: string;
      actionLabel?: string;
      actionHref?: string;
    }[] = [];

    if (metrics.oldPendingIncidences > 0) {
      alertList.push({
        type: "danger",
        title: `${metrics.oldPendingIncidences} incidencias sin aprobar > 48 horas`,
        description:
          "Hay solicitudes de incidencia que requieren atención urgente.",
        actionLabel: "Ver incidencias",
        actionHref: "/hcm/incidences",
      });
    }

    if (metrics.attendanceRate < 85 && metrics.totalEmployees > 0) {
      alertList.push({
        type: "warning",
        title: "Asistencia por debajo del 85%",
        description: `Solo ${metrics.presentToday} de ${metrics.totalEmployees} empleados han registrado asistencia hoy.`,
        actionLabel: "Ver asistencia",
        actionHref: "/hcm/attendance",
      });
    }

    if (metrics.totalPendingIncidences > 10) {
      alertList.push({
        type: "warning",
        title: `${metrics.totalPendingIncidences} incidencias pendientes`,
        description:
          "Hay un alto número de solicitudes esperando aprobación.",
        actionLabel: "Revisar",
        actionHref: "/hcm/incidences",
      });
    }

    if (alertList.length === 0) {
      alertList.push({
        type: "info",
        title: "Todo en orden",
        description:
          "No hay alertas críticas en este momento. Los indicadores están dentro de los parámetros normales.",
      });
    }

    return alertList;
  }, [metrics]);

  // Departments breakdown
  const departmentBreakdown = useMemo(() => {
    if (!employees) return [];

    const deptCounts = employees.reduce((acc, emp) => {
      const dept = emp.department || "Sin departamento";
      acc[dept] = (acc[dept] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(deptCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [employees]);

  const isLoading = isLoadingEmployees || isLoadingIncidences || isLoadingAttendance;

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        {/* Header */}
        <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between border-b">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="icon"
              className="border-blue-500 text-blue-600 hover:bg-blue-50"
              asChild
            >
              <Link href="/hcm">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">
                Centro de Comando HCM
              </h1>
              <p className="text-muted-foreground">
                Dashboard ejecutivo en tiempo real
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-muted-foreground">
              <Clock className="mr-1 h-3 w-3" />
              Actualizado: {format(today, "HH:mm", { locale: es })}
            </Badge>
            <Button variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Actualizar
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <KpiCard
              title="Empleados Activos"
              value={metrics.totalEmployees}
              icon={Users}
              subtitle="total en plantilla"
              isLoading={isLoading}
            />
            <KpiCard
              title="Nómina del Período"
              value={formatCurrency(metrics.totalPrenomina)}
              icon={DollarSign}
              subtitle="pendiente de procesar"
              variant={metrics.totalPrenomina > 0 ? "warning" : "default"}
              isLoading={isLoading}
            />
            <KpiCard
              title="Incidencias Pendientes"
              value={metrics.totalPendingIncidences}
              icon={Timer}
              subtitle="esperando aprobación"
              variant={metrics.totalPendingIncidences > 5 ? "warning" : "default"}
              isLoading={isLoading}
            />
            <KpiCard
              title="Asistencia Hoy"
              value={`${Math.round(metrics.attendanceRate)}%`}
              icon={CheckCircle2}
              subtitle={`${metrics.presentToday} de ${metrics.totalEmployees}`}
              variant={
                metrics.attendanceRate >= 90
                  ? "success"
                  : metrics.attendanceRate >= 80
                  ? "warning"
                  : "danger"
              }
              isLoading={isLoading}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Alerts Panel */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Alertas y Notificaciones
                </CardTitle>
                <CardDescription>
                  Situaciones que requieren tu atención
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {alerts.map((alert, index) => (
                    <AlertItem key={index} {...alert} />
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Departments Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-muted-foreground" />
                  Por Departamento
                </CardTitle>
                <CardDescription>
                  Distribución de empleados
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-6 w-full" />
                    </>
                  ) : departmentBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No hay datos de departamentos
                    </p>
                  ) : (
                    departmentBreakdown.map((dept) => (
                      <div key={dept.name} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>{dept.name}</span>
                          <span className="text-muted-foreground">
                            {dept.count}
                          </span>
                        </div>
                        <Progress
                          value={(dept.count / metrics.totalEmployees) * 100}
                          className="h-2"
                        />
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                Actividad Reciente
              </CardTitle>
              <CardDescription>
                Últimas acciones en el sistema
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-6">
                  {isLoading ? (
                    <>
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </>
                  ) : recentIncidences && recentIncidences.length > 0 ? (
                    recentIncidences.map((inc) => {
                      const createdAt = inc.createdAt instanceof Timestamp
                        ? inc.createdAt.toDate()
                        : new Date(inc.createdAt);

                      const iconConfig = {
                        pending: { icon: Clock, bg: "bg-amber-500" },
                        approved: { icon: CheckCircle2, bg: "bg-green-500" },
                        rejected: { icon: XCircle, bg: "bg-red-500" },
                        cancelled: { icon: XCircle, bg: "bg-gray-500" },
                      };

                      const config = iconConfig[inc.status] || iconConfig.pending;

                      return (
                        <ActivityItem
                          key={inc.id}
                          icon={config.icon}
                          iconBg={config.bg}
                          title={`${inc.employeeName} - ${inc.type}`}
                          subtitle={
                            inc.status === "pending"
                              ? "Solicitud pendiente de aprobación"
                              : inc.status === "approved"
                              ? "Incidencia aprobada"
                              : inc.status === "rejected"
                              ? "Incidencia rechazada"
                              : "Incidencia cancelada"
                          }
                          timestamp={format(createdAt, "dd MMM yyyy, HH:mm", {
                            locale: es,
                          })}
                        />
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Calendar className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No hay actividad reciente</p>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <div className="grid gap-4 md:grid-cols-4">
            <Button variant="outline" className="h-auto py-4" asChild>
              <Link href="/hcm/employees/new" className="flex flex-col items-center gap-2">
                <UserPlus className="h-6 w-6" />
                <span>Nuevo Empleado</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4" asChild>
              <Link href="/hcm/incidences" className="flex flex-col items-center gap-2">
                <FileCheck className="h-6 w-6" />
                <span>Revisar Incidencias</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4" asChild>
              <Link href="/hcm/prenomina" className="flex flex-col items-center gap-2">
                <DollarSign className="h-6 w-6" />
                <span>Consolidar Nómina</span>
              </Link>
            </Button>
            <Button variant="outline" className="h-auto py-4" asChild>
              <Link href="/hcm/calendar" className="flex flex-col items-center gap-2">
                <Calendar className="h-6 w-6" />
                <span>Ver Calendario</span>
              </Link>
            </Button>
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
