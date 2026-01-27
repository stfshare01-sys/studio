"use client";

import { useState, useEffect } from "react";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useUser, useFirestore } from "@/firebase";
import {
  PlusCircle,
  Shield,
  ShieldAlert,
  Edit,
  Trash2,
  Eye,
  EyeOff,
  Pencil,
  Users,
  Lock,
} from "lucide-react";
import type { Role, AppModule, ModulePermission, PermissionLevel } from "@/lib/types";
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
  MODULE_INFO,
  isSystemRole,
} from "@/firebase/role-actions";

// Permission level badge colors
const PERMISSION_COLORS: Record<PermissionLevel, string> = {
  write: "bg-green-500/10 text-green-600 border-green-500/20",
  read: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  hidden: "bg-gray-500/10 text-gray-500 border-gray-500/20",
};

const PERMISSION_LABELS: Record<PermissionLevel, string> = {
  write: "Escritura",
  read: "Lectura",
  hidden: "Oculto",
};

const PERMISSION_ICONS: Record<PermissionLevel, React.ReactNode> = {
  write: <Pencil className="h-3 w-3" />,
  read: <Eye className="h-3 w-3" />,
  hidden: <EyeOff className="h-3 w-3" />,
};

// Get all modules grouped by category
const MODULES_BY_CATEGORY = {
  general: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "general")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
  admin: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "admin")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
  hcm: Object.entries(MODULE_INFO)
    .filter(([_, info]) => info.category === "hcm")
    .map(([id, info]) => ({ id: id as AppModule, ...info })),
};

function RolesTableSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function PermissionSelector({
  module,
  level,
  onChange,
  disabled,
}: {
  module: { id: AppModule; name: string; description: string };
  level: PermissionLevel;
  onChange: (level: PermissionLevel) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex-1">
        <p className="font-medium text-sm">{module.name}</p>
        <p className="text-xs text-muted-foreground">{module.description}</p>
      </div>
      <Select value={level} onValueChange={(v) => onChange(v as PermissionLevel)} disabled={disabled}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="write">
            <div className="flex items-center gap-2">
              <Pencil className="h-3 w-3 text-green-600" />
              Escritura
            </div>
          </SelectItem>
          <SelectItem value="read">
            <div className="flex items-center gap-2">
              <Eye className="h-3 w-3 text-blue-600" />
              Lectura
            </div>
          </SelectItem>
          <SelectItem value="hidden">
            <div className="flex items-center gap-2">
              <EyeOff className="h-3 w-3 text-gray-500" />
              Oculto
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

type RoleDialogProps = {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role | null;
  onSave: (data: { name: string; description: string; permissions: ModulePermission[] }) => Promise<void>;
  isSaving: boolean;
};

function RoleDialog({ isOpen, onOpenChange, role, onSave, isSaving }: RoleDialogProps) {
  const [name, setName] = useState(role?.name || "");
  const [description, setDescription] = useState(role?.description || "");
  const [permissions, setPermissions] = useState<Record<AppModule, PermissionLevel>>(() => {
    const initial: Record<string, PermissionLevel> = {};
    Object.keys(MODULE_INFO).forEach((moduleId) => {
      const existing = role?.permissions.find((p) => p.module === moduleId);
      initial[moduleId] = existing?.level || "hidden";
    });
    return initial as Record<AppModule, PermissionLevel>;
  });

  // Reset form when role changes
  useEffect(() => {
    setName(role?.name || "");
    setDescription(role?.description || "");
    const initial: Record<string, PermissionLevel> = {};
    Object.keys(MODULE_INFO).forEach((moduleId) => {
      const existing = role?.permissions.find((p) => p.module === moduleId);
      initial[moduleId] = existing?.level || "hidden";
    });
    setPermissions(initial as Record<AppModule, PermissionLevel>);
  }, [role]);

  const handlePermissionChange = (moduleId: AppModule, level: PermissionLevel) => {
    setPermissions((prev) => ({ ...prev, [moduleId]: level }));
  };

  const handleSave = async () => {
    const permissionsList: ModulePermission[] = Object.entries(permissions).map(
      ([module, level]) => ({ module: module as AppModule, level })
    );
    await onSave({ name, description, permissions: permissionsList });
  };

  const isEditing = !!role;
  const isSystemRoleEdit = role?.isSystemRole || false;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Editar Rol" : "Crear Nuevo Rol"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? isSystemRoleEdit
                ? "Los roles del sistema no pueden ser modificados."
                : "Modifica los permisos de este rol personalizado."
              : "Define un nuevo rol con permisos específicos para cada módulo."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre del Rol</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Supervisor de Ventas"
                disabled={isSystemRoleEdit}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe las responsabilidades de este rol..."
                disabled={isSystemRoleEdit}
              />
            </div>
          </div>

          {/* Permissions */}
          <div className="space-y-4">
            <Label>Permisos por Módulo</Label>
            <Tabs defaultValue="general">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="admin">Administración</TabsTrigger>
                <TabsTrigger value="hcm">HCM</TabsTrigger>
              </TabsList>

              <TabsContent value="general" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.general.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={isSystemRoleEdit}
                  />
                ))}
              </TabsContent>

              <TabsContent value="admin" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.admin.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={isSystemRoleEdit}
                  />
                ))}
              </TabsContent>

              <TabsContent value="hcm" className="mt-4 border rounded-lg p-4">
                {MODULES_BY_CATEGORY.hcm.map((module) => (
                  <PermissionSelector
                    key={module.id}
                    module={module}
                    level={permissions[module.id]}
                    onChange={(level) => handlePermissionChange(module.id, level)}
                    disabled={isSystemRoleEdit}
                  />
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {!isSystemRoleEdit && (
            <Button onClick={handleSave} disabled={!name.trim() || isSaving}>
              {isSaving ? "Guardando..." : isEditing ? "Guardar Cambios" : "Crear Rol"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RolesPage() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();

  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  const hasAdminRole = user?.role === "Admin";

  // Load roles
  useEffect(() => {
    async function loadRoles() {
      if (!firestore) return;
      try {
        const allRoles = await getAllRoles(firestore);
        setRoles(allRoles);
      } catch (error) {
        console.error("Error loading roles:", error);
        toast({
          title: "Error",
          description: "No se pudieron cargar los roles",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    }

    if (!isUserLoading && firestore) {
      loadRoles();
    }
  }, [firestore, isUserLoading, toast]);

  const handleCreateRole = () => {
    setSelectedRole(null);
    setIsDialogOpen(true);
  };

  const handleEditRole = (role: Role) => {
    setSelectedRole(role);
    setIsDialogOpen(true);
  };

  const handleSaveRole = async (data: {
    name: string;
    description: string;
    permissions: ModulePermission[];
  }) => {
    if (!firestore || !user) return;

    setIsSaving(true);
    try {
      if (selectedRole) {
        // Update existing role
        await updateRole(firestore, selectedRole.id, data);
        toast({
          title: "Rol actualizado",
          description: `El rol "${data.name}" ha sido actualizado.`,
        });
      } else {
        // Create new role
        await createRole(firestore, {
          ...data,
          createdById: user.uid,
        });
        toast({
          title: "Rol creado",
          description: `El rol "${data.name}" ha sido creado.`,
        });
      }

      // Reload roles
      const allRoles = await getAllRoles(firestore);
      setRoles(allRoles);
      setIsDialogOpen(false);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo guardar el rol",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRole = async () => {
    if (!firestore || !deleteRoleId) return;

    try {
      await deleteRole(firestore, deleteRoleId);
      toast({
        title: "Rol eliminado",
        description: "El rol ha sido eliminado correctamente.",
      });
      // Reload roles
      const allRoles = await getAllRoles(firestore);
      setRoles(allRoles);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar el rol",
        variant: "destructive",
      });
    } finally {
      setDeleteRoleId(null);
    }
  };

  // Count permissions by level for display
  const countPermissions = (permissions: ModulePermission[]) => {
    const counts = { write: 0, read: 0, hidden: 0 };
    permissions.forEach((p) => counts[p.level]++);
    return counts;
  };

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
              {isLoading ? (
                <RolesTableSkeleton />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rol</TableHead>
                      <TableHead>Descripción</TableHead>
                      <TableHead>Permisos</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((role) => {
                      const counts = countPermissions(role.permissions);
                      return (
                        <TableRow key={role.id}>
                          <TableCell className="font-medium">
                            <div className="flex items-center gap-2">
                              {role.isSystemRole ? (
                                <Lock className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <Users className="h-4 w-4 text-muted-foreground" />
                              )}
                              {role.name}
                            </div>
                          </TableCell>
                          <TableCell className="text-muted-foreground max-w-xs truncate">
                            {role.description}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {counts.write > 0 && (
                                <Badge variant="outline" className={PERMISSION_COLORS.write}>
                                  {PERMISSION_ICONS.write}
                                  <span className="ml-1">{counts.write}</span>
                                </Badge>
                              )}
                              {counts.read > 0 && (
                                <Badge variant="outline" className={PERMISSION_COLORS.read}>
                                  {PERMISSION_ICONS.read}
                                  <span className="ml-1">{counts.read}</span>
                                </Badge>
                              )}
                              {counts.hidden > 0 && (
                                <Badge variant="outline" className={PERMISSION_COLORS.hidden}>
                                  {PERMISSION_ICONS.hidden}
                                  <span className="ml-1">{counts.hidden}</span>
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={role.isSystemRole ? "secondary" : "outline"}>
                              {role.isSystemRole ? "Sistema" : "Personalizado"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditRole(role)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              {!role.isSystemRole && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => setDeleteRoleId(role.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
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
