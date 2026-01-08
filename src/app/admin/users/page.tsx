
"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { collection, query } from "firebase/firestore";
import type { User } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/components/admin/users-table";
import { PlusCircle } from "lucide-react";

function UsersTableSkeleton() {
  return (
    <div className="rounded-md border">
      <div className="p-4">
          <div className="space-y-3">
              <Skeleton className="h-5 w-2/5" />
              <Skeleton className="h-4 w-4/5" />
          </div>
      </div>
      <div className="p-4">
          <Skeleton className="h-10 w-full" />
      </div>
      <div className="p-4">
          <div className="space-y-4">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
          </div>
      </div>
    </div>
  );
}

export default function UsersPage() {
    const firestore = useFirestore();

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'users'));
    }, [firestore]);

    const { data: users, isLoading } = useCollection<User>(usersQuery);

  return (
    <SiteLayout>
        <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1>
            {/* Future "Add User" button can go here */}
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Todos los Usuarios</CardTitle>
              <CardDescription>
                Ver, editar y gestionar todos los usuarios del sistema.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading && <UsersTableSkeleton />}
              {!isLoading && users && <UsersTable users={users} />}
              {!isLoading && !users?.length && (
                 <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">No se encontraron usuarios</h3>
                        <p className="text-sm text-muted-foreground">No hay usuarios registrados en el sistema.</p>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
        </div>
    </SiteLayout>
  );
}
