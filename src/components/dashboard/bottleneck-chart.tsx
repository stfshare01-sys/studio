
'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Task } from '@/lib/types';
import { useMemo } from 'react';
import { differenceInHours } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '../ui/skeleton';

interface BottleneckChartProps {
  tasks: Task[] | null;
  isLoading: boolean;
}

interface ChartData {
  name: string;
  'Tiempo promedio (horas)': number;
}

export function BottleneckChart({ tasks, isLoading }: BottleneckChartProps) {
  const chartData: ChartData[] = useMemo(() => {
    if (!tasks) return [];

    const completedTasks = tasks.filter(t => t.status === 'Completed' && t.completedAt);
    
    const tasksByName = completedTasks.reduce((acc, task) => {
      if (!acc[task.name]) {
        acc[task.name] = [];
      }
      acc[task.name].push(task);
      return acc;
    }, {} as Record<string, Task[]>);

    return Object.entries(tasksByName).map(([name, taskGroup]) => {
      const totalDuration = taskGroup.reduce((acc, task) => {
        return acc + differenceInHours(new Date(task.completedAt!), new Date(task.createdAt));
      }, 0);
      const avgDuration = totalDuration / taskGroup.length;
      return {
        name,
        'Tiempo promedio (horas)': parseFloat(avgDuration.toFixed(1)),
      };
    });
  }, [tasks]);

  if (isLoading) {
      return <Skeleton className="h-[350px] w-full" />
  }

  if (chartData.length === 0) {
    return (
        <div className="flex h-[350px] w-full items-center justify-center rounded-lg border border-dashed shadow-sm">
            <div className="text-center">
                <h3 className="text-xl font-bold tracking-tight">Datos Insuficientes</h3>
                <p className="text-sm text-muted-foreground">Complete algunas tareas para ver el análisis de cuellos de botella.</p>
            </div>
        </div>
    )
  }

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="name" 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            />
          <YAxis 
            stroke="hsl(var(--muted-foreground))"
            fontSize={12}
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
             labelStyle={{
                 color: 'hsl(var(--foreground))',
             }}
          />
          <Legend wrapperStyle={{fontSize: "0.8rem"}} />
          <Bar dataKey="Tiempo promedio (horas)" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
