
"use client";

import { useMemo } from 'react';
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Scatter,
  ComposedChart,
  Area,
} from 'recharts';
import { calculateSPCData, SPCDataPoint } from '@/lib/process-mining';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { Request } from "@/types/workflow.types";

interface SPCChartProps {
  requests: Request[];
  metric?: 'cycle_time' | 'steps_count';
  title?: string;
}

export function SPCChart({
  requests,
  metric = 'cycle_time',
  title = 'Control Estadístico del Proceso',
}: SPCChartProps) {
  const spcData = useMemo(() => {
    return calculateSPCData(requests, metric);
  }, [requests, metric]);

  const anomalyCount = useMemo(() => {
    return spcData.filter(d => d.isAnomaly).length;
  }, [spcData]);

  const chartData = useMemo(() => {
    return spcData.map(d => ({
      ...d,
      dateLabel: format(parseISO(d.date), 'dd MMM', { locale: es }),
    }));
  }, [spcData]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <h3 className="text-lg font-semibold">Sin Datos</h3>
          <p className="text-sm text-muted-foreground">
            No hay suficientes datos completados para el análisis SPC.
          </p>
        </div>
      </div>
    );
  }

  const metricLabel = metric === 'cycle_time' ? 'Tiempo de Ciclo (horas)' : 'Número de Pasos';

  return (
    <div className="space-y-3">
      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{metricLabel}</span>
        {anomalyCount > 0 ? (
          <Badge variant="destructive" className="flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {anomalyCount} anomalía{anomalyCount > 1 ? 's' : ''} detectada{anomalyCount > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge variant="secondary" className="flex items-center gap-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-3 w-3" />
            Proceso estable
          </Badge>
        )}
      </div>

      {/* Chart */}
      <div className="h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={chartData} margin={{ top: 20, right: 20, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id="controlArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.1} />
                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="dateLabel"
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
              tickFormatter={(value) => metric === 'cycle_time' ? `${value}h` : value}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number, name: string) => {
                if (name === 'value') return [
                  metric === 'cycle_time' ? `${value}h` : value,
                  'Valor'
                ];
                if (name === 'ucl') return [
                  metric === 'cycle_time' ? `${value}h` : value,
                  'Límite Superior (UCL)'
                ];
                if (name === 'lcl') return [
                  metric === 'cycle_time' ? `${value}h` : value,
                  'Límite Inferior (LCL)'
                ];
                if (name === 'mean') return [
                  metric === 'cycle_time' ? `${value}h` : value,
                  'Media'
                ];
                return [value, name];
              }}
            />

            {/* Control Limits Area */}
            <Area
              type="monotone"
              dataKey="ucl"
              stroke="transparent"
              fill="url(#controlArea)"
              fillOpacity={1}
            />

            {/* Upper Control Limit */}
            <Line
              type="monotone"
              dataKey="ucl"
              stroke="hsl(var(--destructive))"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="ucl"
            />

            {/* Lower Control Limit */}
            <Line
              type="monotone"
              dataKey="lcl"
              stroke="hsl(var(--destructive))"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="lcl"
            />

            {/* Mean Line */}
            <Line
              type="monotone"
              dataKey="mean"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1}
              strokeDasharray="3 3"
              dot={false}
              name="mean"
            />

            {/* Actual Values */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={(props: any) => {
                const { cx, cy, payload } = props;
                if (payload.isAnomaly) {
                  return (
                    <circle
                      key={`dot-${props.index}`}
                      cx={cx}
                      cy={cy}
                      r={6}
                      fill="hsl(var(--destructive))"
                      stroke="hsl(var(--background))"
                      strokeWidth={2}
                    />
                  );
                }
                return (
                  <circle
                    key={`dot-${props.index}`}
                    cx={cx}
                    cy={cy}
                    r={3}
                    fill="hsl(var(--primary))"
                  />
                );
              }}
              name="value"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-primary" />
          <span>Valor actual</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-muted-foreground" style={{ borderStyle: 'dashed' }} />
          <span>Media</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-destructive" style={{ borderStyle: 'dashed' }} />
          <span>Límites de control (±3σ)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-destructive" />
          <span>Anomalía</span>
        </div>
      </div>
    </div>
  );
}
