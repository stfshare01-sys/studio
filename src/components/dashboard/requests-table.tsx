"use client";

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
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { User } from "@/lib/types";

function SubmittedBy({ userId }: { userId: string }) {
    const firestore = useFirestore();
    
    // Although we fetch only one user, useCollection is simpler for a single-doc query
    const userQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'), where('id', '==', userId));
    }, [firestore, userId]);

    const { data: users, isLoading } = useCollection<User>(userQuery);
    
    if (isLoading || !users || users.length === 0) {
        return (
            <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8 animate-pulse bg-muted"></Avatar>
                <span className="animate-pulse bg-muted rounded-md h-5 w-24"></span>
            </div>
        );
    }
    
    const user = users[0];

    return (
        <div className="flex items-center gap-2">
            <Avatar className="h-8 w-8">
                <AvatarImage src={user.avatarUrl} alt={user.name} />
                <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>{user.name}</span>
        </div>
    );
}

export function RequestsTable({ requests }: { requests: Request[] }) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Solicitud</TableHead>
            <TableHead className="hidden sm:table-cell">Enviado por</TableHead>
            <TableHead className="hidden md:table-cell">Estado</TableHead>
            <TableHead className="text-right">Última Actualización</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow key={request.id}>
              <TableCell>
                <Link
                  href={`/requests/${request.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {request.title}
                </Link>
                <div className="text-sm text-muted-foreground md:hidden">
                   {request.status === 'In Progress' ? 'En Progreso' : request.status === 'Completed' ? 'Completado' : 'Rechazado'}
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
                  {request.status === 'In Progress' ? 'En Progreso' : request.status === 'Completed' ? 'Completado' : 'Rechazado'}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
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
  );
}
