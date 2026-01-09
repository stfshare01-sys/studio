
"use client";

import { useState, useMemo } from "react";
import type { Request } from "@/lib/types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import type { User } from "@/lib/types";
import { Skeleton } from "../ui/skeleton";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Search, ArrowUpDown } from "lucide-react";
import { Button } from "../ui/button";

function SubmittedBy({ userId }: { userId: string }) {
    const firestore = useFirestore();

    const userRef = useMemoFirebase(() => {
        if (!firestore || !userId) return null;
        return doc(firestore, 'users', userId);
    }, [firestore, userId]);

    const { data: user, isLoading } = useDoc<User>(userRef);

    if (isLoading || !user) {
        return (
            <div className="flex items-center gap-2">
                <Skeleton className="h-8 w-8 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-md" />
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback>{user.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>{user.fullName}</span>
        </div>
    );
}

type SortField = "title" | "updatedAt" | "status";
type SortOrder = "asc" | "desc";

export function RequestsTable({ requests }: { requests: Request[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SortField>("updatedAt");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const filteredAndSortedRequests = useMemo(() => {
    let result = [...requests];

    // Filtrar por búsqueda
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(r =>
        r.title.toLowerCase().includes(term)
      );
    }

    // Filtrar por estado
    if (statusFilter !== "all") {
      result = result.filter(r => r.status === statusFilter);
    }

    // Ordenar
    result.sort((a, b) => {
      let comparison = 0;

      if (sortField === "title") {
        comparison = a.title.localeCompare(b.title);
      } else if (sortField === "updatedAt") {
        comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
      } else if (sortField === "status") {
        comparison = a.status.localeCompare(b.status);
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [requests, searchTerm, statusFilter, sortField, sortOrder]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'In Progress': return 'En Progreso';
      case 'Completed': return 'Completado';
      case 'Rejected': return 'Rechazado';
      default: return status;
    }
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar solicitudes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filtrar por estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="In Progress">En Progreso</SelectItem>
            <SelectItem value="Completed">Completado</SelectItem>
            <SelectItem value="Rejected">Rechazado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Resultados */}
      {filteredAndSortedRequests.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-8">
          <p className="text-muted-foreground">No se encontraron solicitudes</p>
          {(searchTerm || statusFilter !== "all") && (
            <Button
              variant="link"
              onClick={() => { setSearchTerm(""); setStatusFilter("all"); }}
            >
              Limpiar filtros
            </Button>
          )}
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => toggleSort("title")}
                  >
                    Solicitud
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden sm:table-cell">Enviado por</TableHead>
                <TableHead className="hidden md:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-ml-3 h-8"
                    onClick={() => toggleSort("status")}
                  >
                    Estado
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="-mr-3 h-8"
                    onClick={() => toggleSort("updatedAt")}
                  >
                    Última Actualización
                    <ArrowUpDown className="ml-2 h-4 w-4" />
                  </Button>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <Link
                      href={`/requests/${request.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {request.title}
                    </Link>
                    <div className="text-sm text-muted-foreground md:hidden mt-1">
                       <Badge
                        variant={
                            request.status === "Completed"
                            ? "default"
                            : request.status === "Rejected"
                            ? "destructive"
                            : "secondary"
                        }
                        className={request.status === 'Completed' ? 'bg-green-600 text-white' : ''}
                        >
                        {getStatusLabel(request.status)}
                        </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <SubmittedBy userId={request.submittedBy} />
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge
                      variant={
                        request.status === "Completed"
                          ? "default"
                          : request.status === "Rejected"
                          ? "destructive"
                          : "secondary"
                      }
                      className={request.status === 'Completed' ? 'bg-green-600 text-white' : ''}
                    >
                      {getStatusLabel(request.status)}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground sm:table-cell">
                    {formatDistanceToNow(new Date(request.updatedAt), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Contador de resultados */}
      <p className="text-sm text-muted-foreground">
        Mostrando {filteredAndSortedRequests.length} de {requests.length} solicitudes
      </p>
    </div>
  );
}
