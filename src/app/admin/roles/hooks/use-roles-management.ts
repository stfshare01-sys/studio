import { useState, useEffect, useCallback } from "react";
import { useUser, useFirestore } from "@/firebase";
import { usePermissions } from "@/hooks/use-permissions";
import { useToast } from "@/hooks/use-toast";
import type { Role, ModulePermission, SystemRole } from '@/types/auth.types';
import {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole,
} from "@/firebase/role-actions";

export function useRolesManagement() {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const { toast } = useToast();
  const { isAdmin: hasAdminRole } = usePermissions();

  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteRoleId, setDeleteRoleId] = useState<string | null>(null);

  const loadRoles = useCallback(async () => {
    if (!firestore) return;
    try {
      setIsLoading(true);
      const allRoles = await getAllRoles(firestore);
      // Client-side deduplication to ensure unique keys
      const uniqueRolesMap = new Map();
      allRoles.forEach(role => {
        if (!uniqueRolesMap.has(role.id)) {
          uniqueRolesMap.set(role.id, role);
        }
      });
      setRoles(Array.from(uniqueRolesMap.values()));
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
  }, [firestore, toast]);

  useEffect(() => {
    if (!isUserLoading && firestore) {
      loadRoles();
    }
  }, [firestore, isUserLoading, loadRoles]);

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
    systemLevel?: SystemRole;
  }) => {
    if (!firestore || !user) return;

    setIsSaving(true);
    try {
      if (selectedRole) {
        // Update existing role
        await updateRole(firestore, selectedRole.id, data, hasAdminRole);
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

      await loadRoles();
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
      await loadRoles();
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

  return {
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
  };
}
