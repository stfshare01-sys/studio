"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useUser, useFirestore } from "@/firebase";
import type { AppModule, ModulePermission, PermissionLevel } from "@/lib/types";
import {
  getUserPermissions,
  hasPermission as checkPermission,
  getPermissionLevel,
  SYSTEM_ROLES,
  isSystemRole,
} from "@/firebase/role-actions";

export type UsePermissionsReturn = {
  permissions: ModulePermission[];
  isLoading: boolean;
  hasPermission: (module: AppModule, level?: 'read' | 'write') => boolean;
  getLevel: (module: AppModule) => PermissionLevel;
  canRead: (module: AppModule) => boolean;
  canWrite: (module: AppModule) => boolean;
  isHidden: (module: AppModule) => boolean;
  isAdmin: boolean;
};

/**
 * Hook to get and check user permissions
 */
export function usePermissions(): UsePermissionsReturn {
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();
  const [permissions, setPermissions] = useState<ModulePermission[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Check if user is Admin (special case - full access)
  const isAdmin = useMemo(() => {
    return user?.role === 'Admin';
  }, [user?.role]);

  // Load permissions when user changes
  useEffect(() => {
    async function loadPermissions() {
      if (isUserLoading) return;

      if (!user || !firestore) {
        setPermissions([]);
        setIsLoading(false);
        return;
      }

      try {
        const userRole = user.role || 'Member';
        // For system roles, use cached permissions
        if (isSystemRole(userRole)) {
          setPermissions(SYSTEM_ROLES[userRole]);
        } else {
          // For custom roles, fetch from Firestore
          const userPermissions = await getUserPermissions(
            firestore,
            userRole,
            user.customRoleId || undefined
          );
          setPermissions(userPermissions);
        }
      } catch (error) {
        console.error('Error loading permissions:', error);
        // Default to Member permissions on error
        setPermissions(SYSTEM_ROLES.Member);
      } finally {
        setIsLoading(false);
      }
    }

    loadPermissions();
  }, [user, firestore, isUserLoading]);

  // Check if user has permission for a module at a specific level
  const hasPermission = useCallback(
    (module: AppModule, level: 'read' | 'write' = 'read'): boolean => {
      // Admin always has full access
      if (isAdmin) return true;
      return checkPermission(permissions, module, level);
    },
    [permissions, isAdmin]
  );

  // Get permission level for a module
  const getLevel = useCallback(
    (module: AppModule): PermissionLevel => {
      // Admin always has write access
      if (isAdmin) return 'write';
      return getPermissionLevel(permissions, module);
    },
    [permissions, isAdmin]
  );

  // Convenience methods
  const canRead = useCallback(
    (module: AppModule): boolean => hasPermission(module, 'read'),
    [hasPermission]
  );

  const canWrite = useCallback(
    (module: AppModule): boolean => hasPermission(module, 'write'),
    [hasPermission]
  );

  const isHidden = useCallback(
    (module: AppModule): boolean => {
      if (isAdmin) return false;
      return getPermissionLevel(permissions, module) === 'hidden';
    },
    [permissions, isAdmin]
  );

  return {
    permissions,
    isLoading: isLoading || isUserLoading,
    hasPermission,
    getLevel,
    canRead,
    canWrite,
    isHidden,
    isAdmin,
  };
}

/**
 * Hook to check a single permission (lightweight alternative)
 */
export function useModulePermission(module: AppModule): {
  level: PermissionLevel;
  canRead: boolean;
  canWrite: boolean;
  isHidden: boolean;
  isLoading: boolean;
} {
  const { getLevel, canRead, canWrite, isHidden, isLoading } = usePermissions();

  return {
    level: getLevel(module),
    canRead: canRead(module),
    canWrite: canWrite(module),
    isHidden: isHidden(module),
    isLoading,
  };
}
