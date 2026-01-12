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
  Legend,
} from 'recharts';
import type { Task } from '@/lib/types';
import { analyzeBottlenecks, BottleneckAnalysis as BottleneckData } from '@/lib/process-mining';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Minus, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottleneckAnalysisProps {
  tasks: Task[];
  previousPeriodTasks?: Task[];
}

function getTrendIcon(trend: BottleneckData['trend']) {
  switch (trend) {
    case 'improving':
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    case 'worsening':
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    default:
      return <Minus className="h-4 w-4 text-muted-foreground" />;
  }
}

function getTrendLabel(trend: BottleneckData['trend']) {
  switch (trend) {
    case 'improving':
      return 'Mejorando';
    case 'worsening':
      return 'Empeorando';
    default:
      return 'Estable';
  }
}

function getBottleneckSeverity(score: number): 'critical' | 'warning' | 'normal' {
  if (score >= 80) return 'critical';
  if (score >= 50) return 'warning';
  return 'normal';
}

export function BottleneckAnalysisComponent({ tasks, previousPeriodTasks }: BottleneckAnalysisProps) {
  const bottlenecks = useMemo(() => {
    return analyzeBottlenecks(tasks, previousPeriodTasks);
  }, [tasks, previousPeriodTasks]);

  const chartData = useMemo(() => {
    return bottlenecks.slice(0, 8).map(b => ({
      name: b.stepName.length > 15 ? b.stepName.slice(0, 15) + '...' : b.stepName,
      fullName: b.stepName,
      avgDuration: b.avgDuration,
      medianDuration: b.medianDuration,
      bottleneckScore: b.bottleneckScore,
    }));
  }, [bottlenecks]);

  if (bottlenecks.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-2" />
          <h3 className="text-lg font-semibold">Sin Datos</h3>
          <p className="text-sm text-muted-foreground">
            No hay suficientes tareas completadas para analizar cuellos de botella.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Duración Promedio vs Mediana</CardTitle>
          <CardDescription>
            Una gran diferencia indica alta variabilidad en el proceso
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `${value}h`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--background))',
                    borderColor: 'hsl(var(--border))',
                    borderRadius: 'var(--radius)',
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                  labelFormatter={(label, payload) => payload[0]?.payload?.fullName || label}
                  formatter={(value: number, name: string) => [
                    `${value}h`,
                    name === 'avgDuration' ? 'Promedio' : 'Mediana'
                  ]}
                />
                <Legend
                  wrapperStyle={{ fontSize: '0.75rem' }}
                  formatter={(value) => value === 'avgDuration' ? 'Promedio' : 'Mediana'}
                />
                <Bar dataKey="avgDuration" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="medianDuration" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Bottleneck Details */}
      <div className="space-y-3">
        {bottlenecks.slice(0, 5).map((bottleneck, index) => {
          const severity = getBottleneckSeverity(bottleneck.bottleneckScore);
          return (
            <Card
              key={bottleneck.stepName}
              className={cn(
                "overflow-hidden",
                severity === 'critical' && "border-red-500/50",
                severity === 'warning' && "border-yellow-500/50"
              )}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {severity === 'critical' && (
                        <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                      )}
                      <h4 className="font-medium truncate">{bottleneck.stepName}</h4>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                      <span>{bottleneck.frequency} ocurrencias</span>
                      <span>σ = {bottleneck.stdDeviation}h</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {getTrendIcon(bottleneck.trend)}
                    <Badge
                      variant={
                        bottleneck.trend === 'improving'
                          ? 'secondary'
                          : bottleneck.trend === 'worsening'
                          ? 'destructive'
                          : 'outline'
                      }
                      className="text-xs"
                    >
                      {getTrendLabel(bottleneck.trend)}
                    </Badge>
                  </div>
                </div>

                {/* Bottleneck Score */}
                <div className="mt-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">Índice de cuello de botella</span>
                    <span className={cn(
                      severity === 'critical' && "text-red-500",
                      severity === 'warning' && "text-yellow-600"
                    )}>
                      {bottleneck.bottleneckScore}%
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        severity === 'critical' && "bg-red-500",
                        severity === 'warning' && "bg-yellow-500",
                        severity === 'normal' && "bg-green-500"
                      )}
                      style={{ width: `${bottleneck.bottleneckScore}%` }}
                    />
                  </div>
                </div>

                {/* Duration Comparison */}
                <div className="flex gap-4 mt-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Promedio: </span>
                    <span className="font-medium">{bottleneck.avgDuration}h</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mediana: </span>
                    <span className="font-medium">{bottleneck.medianDuration}h</span>
                  </div>
                  {bottleneck.previousAvgDuration && (
                    <div>
                      <span className="text-muted-foreground">Anterior: </span>
                      <span className="font-medium">{bottleneck.previousAvgDuration}h</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
