
"use client";

import { useMemo } from 'react';
import {
  analyzeConformance,
  analyzeBottlenecks,
  calculateSPCData,
  calculateProcessHealthScore,
} from '@/lib/process-mining';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { Activity, CheckCircle2, AlertTriangle, TrendingUp, Target, Shield } from 'lucide-react';
import type { Request, Task, Template } from "@/types/workflow.types";

interface ProcessHealthScoreProps {
  requests: Request[];
  tasks: Task[];
  templates: Template[];
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600 dark:text-green-400';
  if (score >= 60) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreGradient(score: number): string {
  if (score >= 80) return 'from-green-500 to-green-600';
  if (score >= 60) return 'from-yellow-500 to-yellow-600';
  return 'from-red-500 to-red-600';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Excelente';
  if (score >= 80) return 'Muy Bueno';
  if (score >= 70) return 'Bueno';
  if (score >= 60) return 'Aceptable';
  if (score >= 50) return 'Regular';
  return 'Necesita Mejoras';
}

export function ProcessHealthScore({ requests, tasks, templates }: ProcessHealthScoreProps) {
  const metrics = useMemo(() => {
    const conformance = analyzeConformance(requests, templates);
    const bottlenecks = analyzeBottlenecks(tasks);
    const spcData = calculateSPCData(requests);
    const healthScore = calculateProcessHealthScore(conformance, bottlenecks, spcData);

    // Calculate individual component scores for display
    const avgBottleneckScore = bottlenecks.length > 0
      ? bottlenecks.reduce((sum, b) => sum + b.bottleneckScore, 0) / bottlenecks.length
      : 0;
    const bottleneckHealth = Math.round(100 - avgBottleneckScore);

    const anomalyRate = spcData.length > 0
      ? spcData.filter(d => d.isAnomaly).length / spcData.length
      : 0;
    const stabilityScore = Math.round((1 - anomalyRate) * 100);

    return {
      healthScore,
      conformanceScore: Math.round(conformance.overallCompliance),
      bottleneckHealth,
      stabilityScore,
      deviationCount: conformance.deviations.length,
      criticalBottlenecks: bottlenecks.filter(b => b.bottleneckScore >= 80).length,
      anomalyCount: spcData.filter(d => d.isAnomaly).length,
    };
  }, [requests, tasks, templates]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5" />
          Salud del Proceso
        </CardTitle>
        <CardDescription>
          Puntuación general basada en cumplimiento, eficiencia y estabilidad
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Score */}
        <div className="flex items-center justify-center">
          <div className="relative w-40 h-40">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90">
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke="hsl(var(--muted))"
                strokeWidth="12"
                fill="none"
              />
              <circle
                cx="80"
                cy="80"
                r="70"
                stroke={`url(#scoreGradient)`}
                strokeWidth="12"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${(metrics.healthScore / 100) * 440} 440`}
                className="transition-all duration-1000"
              />
              <defs>
                <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor={metrics.healthScore >= 60 ? 'hsl(142.1 76.2% 36.3%)' : 'hsl(0 84.2% 60.2%)'} />
                  <stop offset="100%" stopColor={metrics.healthScore >= 80 ? 'hsl(142.1 70.6% 45.3%)' : metrics.healthScore >= 60 ? 'hsl(47.9 95.8% 53.1%)' : 'hsl(0 72.2% 50.6%)'} />
                </linearGradient>
              </defs>
            </svg>
            {/* Score text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={cn("text-4xl font-bold", getScoreColor(metrics.healthScore))}>
                {metrics.healthScore}
              </span>
              <span className="text-sm text-muted-foreground">
                {getScoreLabel(metrics.healthScore)}
              </span>
            </div>
          </div>
        </div>

        {/* Component Scores */}
        <div className="space-y-4">
          {/* Conformance */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Cumplimiento</span>
              </div>
              <span className={cn("text-sm font-medium", getScoreColor(metrics.conformanceScore))}>
                {metrics.conformanceScore}%
              </span>
            </div>
            <Progress value={metrics.conformanceScore} className="h-2" />
            {metrics.deviationCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {metrics.deviationCount} desviaciones detectadas
              </p>
            )}
          </div>

          {/* Bottleneck Health */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Eficiencia</span>
              </div>
              <span className={cn("text-sm font-medium", getScoreColor(metrics.bottleneckHealth))}>
                {metrics.bottleneckHealth}%
              </span>
            </div>
            <Progress value={metrics.bottleneckHealth} className="h-2" />
            {metrics.criticalBottlenecks > 0 && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-red-500" />
                {metrics.criticalBottlenecks} cuello{metrics.criticalBottlenecks > 1 ? 's' : ''} de botella crítico{metrics.criticalBottlenecks > 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Stability */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Estabilidad</span>
              </div>
              <span className={cn("text-sm font-medium", getScoreColor(metrics.stabilityScore))}>
                {metrics.stabilityScore}%
              </span>
            </div>
            <Progress value={metrics.stabilityScore} className="h-2" />
            {metrics.anomalyCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {metrics.anomalyCount} anomalía{metrics.anomalyCount > 1 ? 's' : ''} en el período
              </p>
            )}
          </div>
        </div>

        {/* Summary */}
        <div className={cn(
          "rounded-lg p-3 text-sm",
          metrics.healthScore >= 80 && "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400",
          metrics.healthScore >= 60 && metrics.healthScore < 80 && "bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400",
          metrics.healthScore < 60 && "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400"
        )}>
          {metrics.healthScore >= 80 ? (
            <div className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
              <span>El proceso está funcionando de manera óptima. Continúe monitoreando para mantener la excelencia operativa.</span>
            </div>
          ) : metrics.healthScore >= 60 ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Hay oportunidades de mejora. Revise los cuellos de botella y las desviaciones del proceso.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Se requiere atención inmediata. Múltiples áreas del proceso necesitan optimización.</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
