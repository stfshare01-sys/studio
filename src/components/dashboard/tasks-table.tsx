

"use client";

import { useState, useMemo, useEffect } from "react";
import type { Task, User } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Search, ArrowUpDown, ChevronDown, AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { TableSkeleton } from "../ui/table-skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase";
import { collection } from "firebase/firestore";
import { handleTaskEscalation } from "@/lib/workflow-engine";

const PAGE_SIZE = 10;

type SortField = "name" | "createdAt" | "status";
type SortOrder = "asc" | "desc";

interface TasksTableProps {
  tasks: Task[];
  isLoading?: boolean;
}

export function TasksTable({ tasks, isLoading = false }: TasksTableProps) {
  const firestore = useFirestore();
  const { user: currentUser } = useUser();
  
  const usersQuery = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'users');
  }, [firestore]);
  const { data: allUsers } = useCollection<User>(usersQuery);

  useEffect(() => {
    if (tasks && firestore && currentUser && allUsers) {
      const now = new Date();
      tasks.forEach(task => {
        if (task.status === 'Active' && task.slaExpiresAt && isPast(new Date(task.slaExpiresAt)) && !task.isEscalated) {
          console.log(`Task ${task.id} is overdue. Initiating escalation check.`);
          handleTaskEscalation({ firestore, task, currentUser, allUsers });
        }
      });
    }
  }, [tasks, firestore, currentUser, allUsers]);

  if (isLoading) {
    return <TableSkeleton columns={4} rows={5} />;
  }

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("createdAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);

  const filteredAndSortedTasks = useMemo(() => {
    let result = [...tasks];
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(t =>
        t.name.toLowerCase().includes(term) ||
        t.requestTitle.toLowerCase().includes(term)
      );
    }
    if (statusFilter !== "all") {
      result = result.filter(t => t.status === statusFilter);
    }
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") comparison = a.name.localeCompare(b.name);
      else if (sortField === "createdAt") comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      else if (sortField === "status") comparison = a.status.localeCompare(b.status);
      return sortOrder === "asc" ? comparison : -comparison;
    });
    return result;
  }, [tasks, searchTerm, statusFilter, sortField, sortOrder]);

  const paginatedTasks = useMemo(() => {
    return filteredAndSortedTasks.slice(0, displayCount);
  }, [filteredAndSortedTasks, displayCount]);

  const hasMore = displayCount < filteredAndSortedTasks.length;

  const loadMore = () => setDisplayCount(prev => prev + PAGE_SIZE);
  const handleSearchChange = (value: string) => { setSearchTerm(value); setDisplayCount(PAGE_SIZE); };
  const handleStatusFilterChange = (value: string) => { setStatusFilter(value); setDisplayCount(PAGE_SIZE); };
  const toggleSort = (field: SortField) => {
    setSortField(field);
    setSortOrder(sortOrder === "asc" ? "desc" : "asc");
  };
  const getStatusLabel = (status: string) => ({ Active: 'Activa', Pending: 'Pendiente', Completed: 'Completada' }[status] || status);
  const getStatusVariant = (status: string) => ({ Active: 'default', Pending: 'secondary', Completed: 'outline' }[status] || 'secondary');

  return (
    <TooltipProvider>
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar tareas..." value={searchTerm} onChange={(e) => handleSearchChange(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
            <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar por estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="Active">Activa</SelectItem>
              <SelectItem value="Pending">Pendiente</SelectItem>
              <SelectItem value="Completed">Completada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {filteredAndSortedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
            <p className="text-muted-foreground">No se encontraron tareas</p>
            {(searchTerm || statusFilter !== "all") && (
              <Button variant="link" onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}>Limpiar filtros</Button>
            )}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead><Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort("name")}>Tarea<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead className="hidden sm:table-cell">Solicitud Relacionada</TableHead>
                  <TableHead className="hidden md:table-cell"><Button variant="ghost" size="sm" className="-ml-3 h-8" onClick={() => toggleSort("status")}>Estado<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                  <TableHead className="hidden text-right sm:table-cell"><Button variant="ghost" size="sm" className="-mr-3 h-8" onClick={() => toggleSort("createdAt")}>Creado<ArrowUpDown className="ml-2 h-4 w-4" /></Button></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedTasks.map((task) => {
                  const isOverdue = task.slaExpiresAt && isPast(new Date(task.slaExpiresAt)) && task.status === 'Active';
                  return (
                    <TableRow key={task.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {isOverdue && <Tooltip><TooltipTrigger><AlertTriangle className="h-4 w-4 text-destructive" /></TooltipTrigger><TooltipContent><p>Esta tarea ha excedido su SLA.</p></TooltipContent></Tooltip>}
                          <Link href={`/requests/${task.requestId}`} className="font-medium text-primary hover:underline">{task.name}</Link>
                        </div>
                        <div className="text-sm text-muted-foreground md:hidden mt-1">{task.requestTitle}</div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{task.requestTitle}</TableCell>
                      <TableCell className="hidden md:table-cell"><Badge variant={getStatusVariant(task.status) as "default" | "secondary" | "destructive" | "outline"}>{getStatusLabel(task.status)}</Badge></TableCell>
                      <TableCell className="hidden text-right text-muted-foreground sm:table-cell">{formatDistanceToNow(new Date(task.createdAt), { addSuffix: true, locale: es })}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {hasMore && <div className="flex justify-center"><Button variant="outline" onClick={loadMore} className="gap-2">Cargar más</Button></div>}
        <p className="text-sm text-muted-foreground">Mostrando {paginatedTasks.length} de {filteredAndSortedTasks.length} tareas</p>
      </div>
    </TooltipProvider>
  );
}
