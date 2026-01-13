
"use client";

import { useMemo } from 'react';
import type { Request, Template } from '@/lib/types';
import { analyzeConformance, ConformanceDeviation } from '@/lib/process-mining';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, CheckCircle2, XCircle, ArrowRight, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ConformancePanelProps {
  requests: Request[];
  templates: Template[];
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-green-600 dark:text-green-400';
  if (score >= 70) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getScoreBg(score: number): string {
  if (score >= 90) return 'bg-green-100 dark:bg-green-900/30';
  if (score >= 70) return 'bg-yellow-100 dark:bg-yellow-900/30';
  return 'bg-red-100 dark:bg-red-900/30';
}

function DeviationIcon({ type }: { type: ConformanceDeviation['deviationType'] }) {
  switch (type) {
    case 'skipped_step':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'extra_step':
      return <AlertCircle className="h-4 w-4 text-yellow-500" />;
    case 'out_of_order':
      return <ArrowRight className="h-4 w-4 text-orange-500" />;
    case 'timeout':
      return <AlertTriangle className="h-4 w-4 text-red-500" />;
    default:
      return <AlertTriangle className="h-4 w-4 text-muted-foreground" />;
  }
}

function DeviationLabel({ type }: { type: ConformanceDeviation['deviationType'] }) {
  switch (type) {
    case 'skipped_step':
      return 'Paso omitido';
    case 'extra_step':
      return 'Paso adicional';
    case 'out_of_order':
      return 'Fuera de orden';
    case 'timeout':
      return 'Timeout';
    default:
      return type;
  }
}

export function ConformancePanel({ requests, templates }: ConformancePanelProps) {
  const metrics = useMemo(() => {
    return analyzeConformance(requests, templates);
  }, [requests, templates]);

  const deviationsByType = useMemo(() => {
    const grouped: Record<string, ConformanceDeviation[]> = {};
    metrics.deviations.forEach(d => {
      if (!grouped[d.deviationType]) {
        grouped[d.deviationType] = [];
      }
      grouped[d.deviationType].push(d);
    });
    return grouped;
  }, [metrics.deviations]);

  return (
    <div className="space-y-4">
      {/* Score Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cumplimiento General</CardDescription>
            <CardTitle className={cn("text-3xl", getScoreColor(metrics.overallCompliance))}>
              {metrics.overallCompliance}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={metrics.overallCompliance}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Porcentaje de pasos completados según el modelo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Fitness (Ajuste)</CardDescription>
            <CardTitle className={cn("text-3xl", getScoreColor(metrics.fitnesScore))}>
              {metrics.fitnesScore}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={metrics.fitnesScore}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Qué tan bien las trazas se ajustan al modelo
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Precisión</CardDescription>
            <CardTitle className={cn("text-3xl", getScoreColor(metrics.precisionScore))}>
              {metrics.precisionScore}%
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress
              value={metrics.precisionScore}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground mt-2">
              Qué tan preciso es el modelo (menos pasos extra = mejor)
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Deviations Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Resumen de Desviaciones</CardTitle>
          <CardDescription>
            Se encontraron {metrics.deviations.length} desviaciones del modelo esperado
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.deviations.length === 0 ? (
            <div className="flex items-center justify-center py-8 text-center">
              <div>
                <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-2" />
                <p className="font-medium">Sin desviaciones detectadas</p>
                <p className="text-sm text-muted-foreground">
                  Todas las solicitudes siguen el modelo de proceso definido
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Deviation Type Summary */}
              <div className="flex flex-wrap gap-2">
                {Object.entries(deviationsByType).map(([type, deviations]) => (
                  <Badge
                    key={type}
                    variant="outline"
                    className="flex items-center gap-1"
                  >
                    <DeviationIcon type={type as ConformanceDeviation['deviationType']} />
                    <DeviationLabel type={type as ConformanceDeviation['deviationType']} />
                    <span className="ml-1 font-bold">{deviations.length}</span>
                  </Badge>
                ))}
              </div>

              {/* Deviation List */}
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {metrics.deviations.slice(0, 20).map((deviation, index) => (
                    <div
                      key={`${deviation.requestId}-${index}`}
                      className="flex items-start gap-3 p-2 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                    >
                      <DeviationIcon type={deviation.deviationType} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {deviation.requestTitle}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {deviation.description}
                        </p>
                      </div>
                      <Badge
                        variant={
                          deviation.severity === 'high'
                            ? 'destructive'
                            : deviation.severity === 'medium'
                            ? 'default'
                            : 'secondary'
                        }
                        className="text-xs"
                      >
                        {deviation.severity === 'high'
                          ? 'Alta'
                          : deviation.severity === 'medium'
                          ? 'Media'
                          : 'Baja'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {metrics.deviations.length > 20 && (
                <p className="text-xs text-center text-muted-foreground">
                  Mostrando 20 de {metrics.deviations.length} desviaciones
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
