"use client";

import { useMemo } from "react";
import SiteLayout from "@/components/site-layout";
import { useFirebase, useMemoFirebase } from "@/firebase/provider";
import { useCollection } from "@/firebase/firestore/use-collection";
import { collection, query, where, orderBy } from "firebase/firestore";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import {
  Users,
  Timer,
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import type { Employee, Incidence } from "@/types/hcm.types";

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
              className={`text-xs flex items-center gap-1 ${trend === "up"
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

export default function CommandCenterPage() {
  const { firestore, isUserLoading } = useFirebase();
  const today = new Date();

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

  // Calculate metrics
  const metrics = useMemo(() => {
    const totalEmployees = employees?.length || 0;
    const totalPendingIncidences = pendingIncidences?.length || 0;

    return {
      totalEmployees,
      totalPendingIncidences,
    };
  }, [employees, pendingIncidences]);

  const isLoading = isLoadingEmployees || isLoadingIncidences;

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
              <RefreshCw className="mr-1 h-3 w-3" />
              {format(today, "HH:mm", { locale: es })}
            </Badge>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-6 p-4 sm:p-6">
          {/* KPI Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            <KpiCard
              title="Empleados Activos"
              value={metrics.totalEmployees}
              icon={Users}
              subtitle="total en plantilla"
              isLoading={isLoading}
            />
            <KpiCard
              title="Permisos Pendientes"
              value={metrics.totalPendingIncidences}
              icon={Timer}
              subtitle="esperando aprobación"
              variant={metrics.totalPendingIncidences > 5 ? "warning" : "default"}
              isLoading={isLoading}
            />
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
