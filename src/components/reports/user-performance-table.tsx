
"use client";

import React, { useMemo } from "react";
import type { User, Task } from "@/lib/types";
import { differenceInHours } from 'date-fns';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";

interface UserPerformanceTableProps {
  users: User[];
  tasks: Task[];
}

interface PerformanceData {
  user: User;
  tasksCompleted: number;
  avgCompletionTimeHours: number | null;
}

export function UserPerformanceTable({ users, tasks }: UserPerformanceTableProps) {
  const performanceData: PerformanceData[] = useMemo(() => {
    return users.map(user => {
      const completedTasks = tasks.filter(
        task => task.assigneeId === user.id && task.status === 'Completed' && task.completedAt
      );

      if (completedTasks.length === 0) {
        return {
          user,
          tasksCompleted: 0,
          avgCompletionTimeHours: null,
        };
      }

      const totalDuration = completedTasks.reduce((acc, task) => {
        return acc + differenceInHours(new Date(task.completedAt!), new Date(task.createdAt));
      }, 0);
      
      const avgDuration = totalDuration / completedTasks.length;

      return {
        user,
        tasksCompleted: completedTasks.length,
        avgCompletionTimeHours: parseFloat(avgDuration.toFixed(1)),
      };
    }).sort((a, b) => b.tasksCompleted - a.tasksCompleted);
  }, [users, tasks]);

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Usuario</TableHead>
            <TableHead className="text-center">Tareas Completadas</TableHead>
            <TableHead className="text-right">Tiempo Promedio de Finalización (Horas)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {performanceData.map(({ user, tasksCompleted, avgCompletionTimeHours }) => (
            <TableRow key={user.id}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                    <AvatarFallback>{user.fullName?.charAt(0) || user.email.charAt(0)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-medium">{user.fullName}</div>
                    <div className="text-sm text-muted-foreground">{user.email}</div>
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-center font-medium">{tasksCompleted}</TableCell>
              <TableCell className="text-right font-medium">
                {avgCompletionTimeHours !== null ? `${avgCompletionTimeHours}h` : 'N/A'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
