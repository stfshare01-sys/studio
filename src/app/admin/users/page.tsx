
"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { User } from "@/lib/types";
import { Skeleton } from "@/components/ui/skeleton";
import { UsersTable } from "@/components/admin/users-table";
import { PlusCircle, ShieldAlert } from "lucide-react";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { doc, getFirestore } from "firebase/firestore";
import { useToast } from "@/hooks/use-toast";
import { CreateUserDialog } from "@/components/admin/create-user-dialog";
import { useState } from "react";
import { useUser } from "@/firebase";
import { usePermissions } from "@/hooks/use-permissions";

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

function AssignAdminButton() {
  const { user } = useUser();
  const firestore = getFirestore();
  const { toast } = useToast();

  const handleAssignAdmin = () => {
    if (!firestore || !user) return;
    const userRef = doc(firestore, 'users', user.uid);
    updateDocumentNonBlocking(userRef, { role: 'Admin' });
    toast({
      title: "¡Rol de Administrador Asignado!",
      description: "Has sido asignado como el primer administrador. La página se actualizará.",
    });
    // The data will refetch automatically due to the change, showing the table.
  }

  return (
    <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
      <div className="flex flex-col items-center gap-2 text-center">
        <ShieldAlert className="h-12 w-12 text-destructive" />
        <h3 className="text-2xl font-bold tracking-tight">Acceso Denegado</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          No tienes permisos para ver esta página. Sin embargo, parece que no hay administradores en el sistema.
          Puedes asignarte a ti mismo como el primer administrador.
        </p>
        <Button className="mt-4" onClick={handleAssignAdmin}>
          Convertirme en Administrador
        </Button>
      </div>
    </div>
  )
}

function AdminView() {
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);
  return (
    <>
      <UsersTable />
      <CreateUserDialog isOpen={isCreateUserOpen} onOpenChange={setIsCreateUserOpen} />
    </>
  );
}

export default function UsersPage() {
  const { user: currentUser, isUserLoading } = useUser();
  const { isAdmin: hasAdminRole } = usePermissions();
  const [isCreateUserOpen, setIsCreateUserOpen] = useState(false);

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight">Gestión de Usuarios</h1>
          {hasAdminRole && (
            <Button onClick={() => setIsCreateUserOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Añadir Usuario
            </Button>
          )}
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
              {isUserLoading && <UsersTableSkeleton />}
              {!isUserLoading && hasAdminRole && <AdminView />}
              {!isUserLoading && !hasAdminRole && <AssignAdminButton />}
            </CardContent>
          </Card>
        </main>
      </div>
      <CreateUserDialog isOpen={isCreateUserOpen} onOpenChange={setIsCreateUserOpen} />
    </SiteLayout>
  );
}
