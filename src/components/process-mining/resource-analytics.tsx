
"use client";

import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import type { User } from '@/types/auth.types';
import { analyzeResources, ResourceMetrics } from '@/lib/process-mining';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import type { Task } from "@/types/workflow.types";

interface ResourceAnalyticsProps {
  tasks: Task[];
  users: User[];
}

function getWorkloadColor(score: number): string {
  if (score >= 80) return 'bg-red-500';
  if (score >= 60) return 'bg-yellow-500';
  return 'bg-green-500';
}

function getEfficiencyIcon(efficiency: number) {
  if (efficiency > 60) return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (efficiency < 40) return <TrendingDown className="h-4 w-4 text-red-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

export function ResourceAnalytics({ tasks, users }: ResourceAnalyticsProps) {
  const resourceMetrics = useMemo(() => {
    return analyzeResources(tasks, users);
  }, [tasks, users]);

  const chartData = useMemo(() => {
    return resourceMetrics.slice(0, 8).map(m => ({
      name: m.userName.split(' ')[0], // First name only
      tasksCompleted: m.tasksCompleted,
      avgTime: m.avgCompletionTime,
      efficiency: m.efficiency,
    }));
  }, [resourceMetrics]);

  const radarData = useMemo(() => {
    if (resourceMetrics.length === 0) return [];

    // Get top performer for comparison
    const topPerformer = resourceMetrics[0];

    return [
      { metric: 'Tareas', value: 100, fullMark: 100 },
      { metric: 'Eficiencia', value: topPerformer?.efficiency || 0, fullMark: 100 },
      { metric: 'Disponibilidad', value: 100 - (topPerformer?.workloadScore || 0), fullMark: 100 },
      { metric: 'Velocidad', value: Math.min(100, 100 - (topPerformer?.avgCompletionTime / 24) * 100), fullMark: 100 },
    ];
  }, [resourceMetrics]);

  if (resourceMetrics.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <Users className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <h3 className="text-lg font-semibold">Sin Datos de Recursos</h3>
          <p className="text-sm text-muted-foreground">
            No hay suficientes tareas asignadas para analizar recursos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Productivity Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Productividad por Usuario</CardTitle>
          <CardDescription>Tareas completadas y tiempo promedio</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  formatter={(value: number, name: string) => {
                    if (name === 'tasksCompleted') return [value, 'Tareas completadas'];
                    return [value, name];
                  }}
                />
                <Bar dataKey="tasksCompleted" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.efficiency > 50 ? 'hsl(var(--chart-1))' : 'hsl(var(--chart-3))'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Resource Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {resourceMetrics.slice(0, 6).map((resource, index) => {
          const user = users.find(u => u.id === resource.userId);
          return (
            <Card key={resource.userId} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={user?.avatarUrl} alt={resource.userName} />
                    <AvatarFallback>
                      {resource.userName.split(' ').map(n => n[0]).join('').slice(0, 2)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h4 className="font-medium truncate">{resource.userName}</h4>
                      {index === 0 && (
                        <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
                          Top
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                      <span>{resource.tasksCompleted} tareas</span>
                      <span>•</span>
                      <span>{resource.avgCompletionTime}h promedio</span>
                    </div>

                    {/* Metrics */}
                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Carga de trabajo</span>
                        <span>{resource.workloadScore}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", getWorkloadColor(resource.workloadScore))}
                          style={{ width: `${resource.workloadScore}%` }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Eficiencia</span>
                        <div className="flex items-center gap-1">
                          {getEfficiencyIcon(resource.efficiency)}
                          <span>{resource.efficiency}%</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Task Distribution */}
      {resourceMetrics.length > 0 && Object.keys(resourceMetrics[0].tasksByType).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Distribución de Tareas por Tipo</CardTitle>
            <CardDescription>Top performer: {resourceMetrics[0].userName}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(resourceMetrics[0].tasksByType)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 5)
                .map(([taskType, count]) => {
                  const totalTasks = resourceMetrics[0].tasksCompleted;
                  const percentage = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
                  return (
                    <div key={taskType} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="truncate">{taskType}</span>
                        <span className="text-muted-foreground">{count} ({Math.round(percentage)}%)</span>
                      </div>
                      <Progress value={percentage} className="h-1.5" />
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
