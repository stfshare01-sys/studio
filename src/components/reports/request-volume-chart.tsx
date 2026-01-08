
"use client";

import { useMemo } from 'react';
import { Line, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { Request as RequestType } from '@/lib/types';
import { eachDayOfInterval, format, startOfDay } from 'date-fns';
import { DateRange } from 'react-day-picker';

interface RequestVolumeChartProps {
  requests: RequestType[];
  dateRange: DateRange | undefined;
}

interface ChartData {
  date: string;
  Creadas: number;
  Completadas: number;
}

export default function RequestVolumeChart({ requests, dateRange }: RequestVolumeChartProps) {
  const chartData: ChartData[] = useMemo(() => {
    if (!dateRange?.from || !dateRange?.to) return [];

    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    
    const dataByDate = days.reduce((acc, day) => {
        const formattedDate = format(day, 'dd/MM');
        acc[formattedDate] = { date: formattedDate, Creadas: 0, Completadas: 0 };
        return acc;
    }, {} as Record<string, ChartData>);

    requests.forEach(req => {
        const createdDate = format(startOfDay(new Date(req.createdAt)), 'dd/MM');
        if(dataByDate[createdDate]) {
            dataByDate[createdDate].Creadas++;
        }
        
        if (req.status === 'Completed' && req.completedAt) {
            const completedDate = format(startOfDay(new Date(req.completedAt)), 'dd/MM');
            if (dataByDate[completedDate]) {
                dataByDate[completedDate].Completadas++;
            }
        }
    });

    return Object.values(dataByDate);
  }, [requests, dateRange]);

  if (chartData.length === 0) {
    return (
        <div className="flex h-[350px] w-full items-center justify-center rounded-lg border border-dashed shadow-sm">
            <div className="text-center">
                <h3 className="text-xl font-bold tracking-tight">Sin Datos</h3>
                <p className="text-sm text-muted-foreground">No hay solicitudes en el rango de fechas seleccionado.</p>
            </div>
        </div>
    );
  }

  return (
    <div className="h-[350px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis 
            dataKey="date" 
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
            allowDecimals={false}
          />
          <Tooltip 
             contentStyle={{
                backgroundColor: 'hsl(var(--background))',
                borderColor: 'hsl(var(--border))',
                borderRadius: 'var(--radius)',
             }}
             labelStyle={{ color: 'hsl(var(--foreground))' }}
          />
          <Legend wrapperStyle={{fontSize: "0.8rem"}} />
          <Line type="monotone" dataKey="Creadas" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="Completadas" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
