
"use client";

import type { Task } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export function TasksTable({ tasks }: { tasks: Task[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tarea</TableHead>
            <TableHead className="hidden sm:table-cell">Solicitud Relacionada</TableHead>
            <TableHead className="hidden text-right sm:table-cell">Creado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {tasks.map((task) => (
            <TableRow key={task.id}>
              <TableCell>
                <Link
                  href={`/requests/${task.requestId}`}
                  className="font-medium text-primary hover:underline"
                >
                  {task.name}
                </Link>
                <div className="text-sm text-muted-foreground md:hidden mt-1">
                   {task.requestTitle}
                </div>
              </TableCell>
              <TableCell className="hidden sm:table-cell">
                {task.requestTitle}
              </TableCell>
              <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                {formatDistanceToNow(new Date(task.createdAt), {
                  addSuffix: true,
                  locale: es,
                })}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
