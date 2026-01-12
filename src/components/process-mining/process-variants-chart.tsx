"use client";

import { useMemo } from 'react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { Request } from '@/lib/types';
import { analyzeProcessVariants, ProcessVariant } from '@/lib/process-mining';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ProcessVariantsChartProps {
  requests: Request[];
  maxVariants?: number;
}

const VARIANT_COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

export function ProcessVariantsChart({ requests, maxVariants = 5 }: ProcessVariantsChartProps) {
  const variants = useMemo(() => {
    return analyzeProcessVariants(requests).slice(0, maxVariants);
  }, [requests, maxVariants]);

  const chartData = useMemo(() => {
    return variants.map((v, index) => ({
      name: `Variante ${index + 1}`,
      frequency: v.frequency,
      percentage: Math.round(v.percentage * 10) / 10,
      avgCycleTime: Math.round(v.avgCycleTime * 10) / 10,
      path: v.path,
    }));
  }, [variants]);

  if (chartData.length === 0) {
    return (
      <div className="flex h-[300px] w-full items-center justify-center rounded-lg border border-dashed">
        <div className="text-center">
          <h3 className="text-lg font-semibold">Sin Variantes</h3>
          <p className="text-sm text-muted-foreground">No hay suficientes datos para analizar variantes del proceso.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical" margin={{ top: 5, right: 30, left: 80, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={true} vertical={false} />
            <XAxis
              type="number"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <YAxis
              type="category"
              dataKey="name"
              stroke="hsl(var(--muted-foreground))"
              fontSize={12}
              tickLine={false}
              axisLine={false}
              width={70}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
              }}
              labelStyle={{ color: 'hsl(var(--foreground))' }}
              formatter={(value: number, name: string) => {
                if (name === 'percentage') return [`${value}%`, 'Frecuencia'];
                return [value, name];
              }}
            />
            <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
              {chartData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={VARIANT_COLORS[index % VARIANT_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Variant Details */}
      <div className="space-y-3">
        {variants.map((variant, index) => (
          <div
            key={variant.id}
            className="rounded-lg border p-3 bg-card"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: VARIANT_COLORS[index % VARIANT_COLORS.length] }}
                />
                <span className="font-medium">Variante {index + 1}</span>
                <Badge variant="secondary">{variant.frequency} solicitudes</Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                ~{variant.avgCycleTime.toFixed(1)}h ciclo promedio
              </span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {variant.path.length > 0 ? (
                variant.path.map((step, i) => (
                  <span key={i} className="flex items-center">
                    <Badge variant="outline" className="font-normal">
                      {step}
                    </Badge>
                    {i < variant.path.length - 1 && (
                      <span className="mx-1 text-muted-foreground">→</span>
                    )}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground italic">Sin pasos completados</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
