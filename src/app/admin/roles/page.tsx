"use client";

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldAlert, PlusCircle } from "lucide-react";
import { useRolesManagement } from "./hooks/use-roles-management";
import { RolesTable } from "./components/roles-table";
import { RoleDialog } from "./components/role-dialog";
import { PERMISSION_COLORS, PERMISSION_ICONS } from "./utils/role-constants";

export default function RolesPage() {
  const {
    roles,
    isLoading,
    isUserLoading,
    hasAdminRole,
    isDialogOpen,
    setIsDialogOpen,
    selectedRole,
    isSaving,
    deleteRoleId,
    setDeleteRoleId,
    handleCreateRole,
    handleEditRole,
    handleSaveRole,
    handleDeleteRole,
  } = useRolesManagement();

  if (!isUserLoading && !hasAdminRole) {
    return (
      <SiteLayout>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-2 text-center p-8">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <h3 className="text-2xl font-bold tracking-tight">Acceso Denegado</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              No tienes permisos para acceder a la gestión de roles.
            </p>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Gestión de Roles</h1>
            <p className="text-muted-foreground">
              Crea y administra roles con permisos personalizados
            </p>
          </div>
          {hasAdminRole && (
            <Button onClick={handleCreateRole}>
              <PlusCircle className="mr-2 h-4 w-4" />
              Crear Rol
            </Button>
          )}
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Roles del Sistema
              </CardTitle>
              <CardDescription>
                Los roles del sistema vienen preconfigurados y no pueden ser eliminados.
                Los roles personalizados pueden ser creados y modificados libremente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RolesTable
                roles={roles}
                isLoading={isLoading}
                onEditRole={handleEditRole}
                onDeleteRole={setDeleteRoleId}
              />
            </CardContent>
          </Card>

          {/* Permission Legend */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Leyenda de Permisos</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={PERMISSION_COLORS.write}>
                    {PERMISSION_ICONS.write}
                    <span className="ml-1">Escritura</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Puede ver y modificar
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={PERMISSION_COLORS.read}>
                    {PERMISSION_ICONS.read}
                    <span className="ml-1">Lectura</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Solo puede ver
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={PERMISSION_COLORS.hidden}>
                    {PERMISSION_ICONS.hidden}
                    <span className="ml-1">Oculto</span>
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    No tiene acceso
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      {/* Create/Edit Dialog */}
      <RoleDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        role={selectedRole}
        onSave={handleSaveRole}
        isSaving={isSaving}
        isAdmin={hasAdminRole}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRoleId} onOpenChange={() => setDeleteRoleId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. El rol será eliminado permanentemente.
              Asegúrate de que ningún usuario tenga este rol asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteRole}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SiteLayout>
  );
}
