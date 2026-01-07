
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
import { useDoc, useFirestore, useMemoFirebase } from "@/firebase";
import { doc } from "firebase/firestore";
import type { User } from "@/lib/types";
import { Skeleton } from "../ui/skeleton";

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
