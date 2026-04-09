import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  Firestore,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import type { Role, ModulePermission, AppModule, PermissionLevel, SystemRole } from "@/lib/types";
import { calculateSystemLevel } from "@/lib/permissions-config";

// -------------------------------------------------------------------------
// System Roles Configuration
// -------------------------------------------------------------------------

// Default permissions for system roles
export const SYSTEM_ROLES: Record<SystemRole, ModulePermission[]> = {
  Admin: [
    // Admin has write access to everything
    { module: 'dashboard', level: 'write' },
    { module: 'requests', level: 'write' },
    { module: 'templates', level: 'write' },
    { module: 'master_lists', level: 'write' },
    { module: 'reports', level: 'write' },
    { module: 'process_mining', level: 'write' },
    { module: 'integrations', level: 'write' },
    { module: 'admin_users', level: 'write' },
    { module: 'admin_roles', level: 'write' },
    { module: 'hcm_employees', level: 'write' },
    { module: 'hcm_attendance', level: 'write' },
    { module: 'hcm_incidences', level: 'write' },
    { module: 'hcm_prenomina', level: 'write' },
    { module: 'hcm_calendar', level: 'write' },
    { module: 'hcm_org_chart', level: 'write' },
    { module: 'hcm_talent_grid', level: 'write' },
    { module: 'hcm_team_management', level: 'write' },
    { module: 'hcm_admin_shifts', level: 'write' },
    { module: 'hcm_admin_positions', level: 'write' },
    { module: 'hcm_admin_locations', level: 'write' },
    { module: 'hcm_admin_departments', level: 'write' },
    // Granular team management
    { module: 'hcm_team_tardiness', level: 'write' },
    { module: 'hcm_team_departures', level: 'write' },
    { module: 'hcm_team_overtime', level: 'write' },
    { module: 'hcm_team_shifts', level: 'write' },
    { module: 'hcm_team_hour_bank', level: 'write' },
    { module: 'hcm_team_management_global', level: 'write' },
    // Granular prenomina
    { module: 'hcm_prenomina_process', level: 'write' },
    { module: 'hcm_prenomina_close', level: 'write' },
    { module: 'hcm_prenomina_export', level: 'write' },
    { module: 'hcm_sla_processing', level: 'write' },
  ],
  Designer: [
    { module: 'dashboard', level: 'read' },
    { module: 'requests', level: 'write' },
    { module: 'templates', level: 'write' },
    { module: 'master_lists', level: 'write' },
    { module: 'reports', level: 'read' },
    { module: 'process_mining', level: 'read' },
    { module: 'integrations', level: 'hidden' },
    { module: 'admin_users', level: 'hidden' },
    { module: 'admin_roles', level: 'hidden' },
    { module: 'hcm_employees', level: 'hidden' },
    { module: 'hcm_attendance', level: 'hidden' },
    { module: 'hcm_incidences', level: 'hidden' },
    { module: 'hcm_prenomina', level: 'hidden' },
    { module: 'hcm_calendar', level: 'hidden' },
    { module: 'hcm_org_chart', level: 'hidden' },
    { module: 'hcm_talent_grid', level: 'hidden' },
    { module: 'hcm_team_management', level: 'hidden' },
    { module: 'hcm_admin_shifts', level: 'hidden' },
    { module: 'hcm_admin_positions', level: 'hidden' },
    { module: 'hcm_admin_locations', level: 'hidden' },
    { module: 'hcm_admin_departments', level: 'hidden' },

    { module: 'hcm_team_tardiness', level: 'hidden' },
    { module: 'hcm_team_departures', level: 'hidden' },
    { module: 'hcm_team_overtime', level: 'hidden' },
    { module: 'hcm_team_shifts', level: 'hidden' },
    { module: 'hcm_team_hour_bank', level: 'hidden' },
    { module: 'hcm_prenomina_process', level: 'hidden' },
    { module: 'hcm_prenomina_close', level: 'hidden' },
    { module: 'hcm_prenomina_export', level: 'hidden' },
  ],
  Member: [
    { module: 'dashboard', level: 'read' },
    { module: 'requests', level: 'write' },
    { module: 'templates', level: 'read' },
    { module: 'master_lists', level: 'read' },
    { module: 'reports', level: 'hidden' },
    { module: 'process_mining', level: 'hidden' },
    { module: 'integrations', level: 'hidden' },
    { module: 'admin_users', level: 'hidden' },
    { module: 'admin_roles', level: 'hidden' },
    { module: 'hcm_employees', level: 'hidden' },
    { module: 'hcm_attendance', level: 'hidden' },
    { module: 'hcm_incidences', level: 'hidden' },
    { module: 'hcm_prenomina', level: 'hidden' },
    { module: 'hcm_calendar', level: 'hidden' },
    { module: 'hcm_org_chart', level: 'hidden' },
    { module: 'hcm_talent_grid', level: 'hidden' },
    { module: 'hcm_team_management', level: 'hidden' },
    { module: 'hcm_admin_shifts', level: 'hidden' },
    { module: 'hcm_admin_positions', level: 'hidden' },
    { module: 'hcm_admin_locations', level: 'hidden' },
    { module: 'hcm_admin_departments', level: 'hidden' },

    { module: 'hcm_team_tardiness', level: 'hidden' },
    { module: 'hcm_team_departures', level: 'hidden' },
    { module: 'hcm_team_overtime', level: 'hidden' },
    { module: 'hcm_team_shifts', level: 'hidden' },
    { module: 'hcm_team_hour_bank', level: 'hidden' },
    { module: 'hcm_prenomina_process', level: 'hidden' },
    { module: 'hcm_prenomina_close', level: 'hidden' },
    { module: 'hcm_prenomina_export', level: 'hidden' },
  ],
  HRManager: [
    { module: 'dashboard', level: 'read' },
    { module: 'requests', level: 'write' },
    { module: 'templates', level: 'read' },
    { module: 'master_lists', level: 'read' },
    { module: 'reports', level: 'read' },
    { module: 'process_mining', level: 'hidden' },
    { module: 'integrations', level: 'hidden' },
    { module: 'admin_users', level: 'hidden' },
    { module: 'admin_roles', level: 'hidden' },
    { module: 'hcm_employees', level: 'write' },
    { module: 'hcm_attendance', level: 'write' },
    { module: 'hcm_incidences', level: 'write' },
    { module: 'hcm_prenomina', level: 'write' },
    { module: 'hcm_calendar', level: 'write' },
    { module: 'hcm_org_chart', level: 'read' },
    { module: 'hcm_talent_grid', level: 'write' },
    { module: 'hcm_team_management', level: 'write' },
    { module: 'hcm_admin_shifts', level: 'write' },
    { module: 'hcm_admin_positions', level: 'write' },
    { module: 'hcm_admin_locations', level: 'write' },
    { module: 'hcm_admin_departments', level: 'write' },
    // Full team management for HR
    { module: 'hcm_team_tardiness', level: 'write' },
    { module: 'hcm_team_departures', level: 'write' },
    { module: 'hcm_team_overtime', level: 'write' },
    { module: 'hcm_team_shifts', level: 'write' },
    { module: 'hcm_team_hour_bank', level: 'write' },
    { module: 'hcm_team_management_global', level: 'write' },
    // Full prenomina for HR
    { module: 'hcm_prenomina_process', level: 'write' },
    { module: 'hcm_prenomina_close', level: 'write' },
    { module: 'hcm_prenomina_export', level: 'write' },
    { module: 'hcm_sla_processing', level: 'write' },
    // Vacation & Holiday management for HR
    { module: 'hcm_admin_vacation', level: 'write' },
    { module: 'hcm_admin_holidays', level: 'write' },
  ],
  Manager: [
    { module: 'dashboard', level: 'read' },
    { module: 'requests', level: 'write' },
    { module: 'templates', level: 'read' },
    { module: 'master_lists', level: 'read' },
    { module: 'reports', level: 'read' },
    { module: 'process_mining', level: 'hidden' },
    { module: 'integrations', level: 'hidden' },
    { module: 'admin_users', level: 'hidden' },
    { module: 'admin_roles', level: 'hidden' },
    { module: 'hcm_employees', level: 'read' },
    { module: 'hcm_attendance', level: 'read' },
    { module: 'hcm_incidences', level: 'write' },
    { module: 'hcm_prenomina', level: 'read' },
    { module: 'hcm_calendar', level: 'read' },
    { module: 'hcm_org_chart', level: 'read' },
    { module: 'hcm_talent_grid', level: 'read' },
    { module: 'hcm_team_management', level: 'write' },
    { module: 'hcm_admin_shifts', level: 'hidden' },
    { module: 'hcm_admin_positions', level: 'hidden' },
    { module: 'hcm_admin_locations', level: 'hidden' },
    { module: 'hcm_admin_departments', level: 'hidden' },

    // Managers can manage their team
    { module: 'hcm_team_tardiness', level: 'write' },
    { module: 'hcm_team_departures', level: 'write' },
    { module: 'hcm_team_overtime', level: 'write' },
    { module: 'hcm_team_shifts', level: 'write' },
    { module: 'hcm_team_hour_bank', level: 'read' },
    // Managers can process but not close/export
    { module: 'hcm_prenomina_process', level: 'write' },
    { module: 'hcm_prenomina_close', level: 'hidden' },
    { module: 'hcm_prenomina_export', level: 'hidden' },
  ],
};

// Module metadata for UI
export const MODULE_INFO: Record<AppModule, { name: string; description: string; category: 'general' | 'admin' | 'hcm' }> = {
  dashboard: { name: 'Dashboard', description: 'Panel principal con estadísticas y tareas', category: 'general' },
  requests: { name: 'Solicitudes', description: 'Crear y gestionar solicitudes de flujo de trabajo', category: 'general' },
  templates: { name: 'Plantillas', description: 'Diseñar y editar plantillas de flujos', category: 'general' },
  master_lists: { name: 'Listas Maestras', description: 'Gestionar datos de referencia', category: 'general' },
  reports: { name: 'Reportes', description: 'Ver reportes y análisis', category: 'general' },
  process_mining: { name: 'Process Mining', description: 'Análisis de procesos y cuellos de botella', category: 'general' },
  integrations: { name: 'Integraciones', description: 'Configurar integraciones externas', category: 'admin' },
  admin_users: { name: 'Gestión de Usuarios', description: 'Administrar usuarios del sistema', category: 'admin' },
  admin_roles: { name: 'Gestión de Roles', description: 'Crear y gestionar roles y permisos', category: 'admin' },
  hcm_employees: { name: 'Empleados', description: 'Gestionar perfiles de empleados', category: 'hcm' },
  hcm_attendance: { name: 'Asistencia', description: 'Registros de asistencia diaria', category: 'hcm' },
  hcm_incidences: { name: 'Permisos', description: 'Permisos, vacaciones y ausencias', category: 'hcm' },
  hcm_prenomina: { name: 'Pre-nómina', description: 'Consolidación de nómina', category: 'hcm' },
  hcm_calendar: { name: 'Calendario', description: 'Calendario de permisos del equipo', category: 'hcm' },
  hcm_org_chart: { name: 'Organigrama', description: 'Estructura organizacional', category: 'hcm' },
  hcm_talent_grid: { name: 'Talent Grid', description: 'Matriz 9-box de talento', category: 'hcm' },
  hcm_team_management: { name: 'Gestión de Equipo', description: 'Administrar retardos, horas extras y turnos de subordinados', category: 'hcm' },
  hcm_admin_shifts: { name: 'Turnos', description: 'Configurar tipos de turnos', category: 'hcm' },
  hcm_admin_positions: { name: 'Posiciones', description: 'Catálogo de posiciones', category: 'hcm' },
  hcm_admin_locations: { name: 'Ubicaciones', description: 'Catálogo de ubicaciones', category: 'hcm' },
  hcm_admin_departments: { name: 'Departamentos', description: 'Catálogo de departamentos', category: 'hcm' },
  // Granular team management
  hcm_team_tardiness: { name: 'Retardos del Equipo', description: 'Gestionar y justificar retardos', category: 'hcm' },
  hcm_team_departures: { name: 'Salidas Tempranas', description: 'Gestionar salidas anticipadas', category: 'hcm' },
  hcm_team_overtime: { name: 'Horas Extras del Equipo', description: 'Aprobar y gestionar horas extras', category: 'hcm' },
  hcm_team_shifts: { name: 'Asignación de Turnos', description: 'Asignar turnos a subordinados', category: 'hcm' },
  hcm_team_hour_bank: { name: 'Bolsa de Horas', description: 'Ver saldo de bolsa de horas del equipo', category: 'hcm' },
  hcm_team_management_global: { name: 'Gestión Global de Equipos', description: 'Ver y gestionar equipos de todos los gerentes', category: 'hcm' },
  // Granular prenomina
  hcm_prenomina_process: { name: 'Procesar Pre-nómina', description: 'Procesar datos para pre-nómina', category: 'hcm' },
  hcm_prenomina_close: { name: 'Cerrar Período', description: 'Cerrar y bloquear período de nómina', category: 'hcm' },
  hcm_prenomina_export: { name: 'Exportar Pre-nómina', description: 'Exportar datos a sistema de nómina', category: 'hcm' },
  hcm_sla_processing: { name: 'Procesamiento SLA', description: 'Ejecución manual de reglas de SLA', category: 'hcm' },
  hcm_admin_holidays: { name: 'Calendarios Festivos', description: 'Gestionar calendarios de días festivos oficiales', category: 'hcm' },
  hcm_admin_vacation: { name: 'Gestión de Vacaciones', description: 'Ajustar saldos de vacaciones individual y masivamente', category: 'hcm' },
};

// System role names (canonical PascalCase)
const SYSTEM_ROLE_NAMES: SystemRole[] = ['Admin', 'Member', 'Designer', 'HRManager', 'Manager'];

// Check if a role is a system role (case-insensitive)
export function isSystemRole(role: string): role is SystemRole {
  return SYSTEM_ROLE_NAMES.some(r => r.toLowerCase() === role.toLowerCase());
}

// Normalize a role ID (possibly lowercase) to its canonical PascalCase system role name
function normalizeSystemRoleName(roleId: string): SystemRole {
  return SYSTEM_ROLE_NAMES.find(r => r.toLowerCase() === roleId.toLowerCase()) || roleId as SystemRole;
}

// -------------------------------------------------------------------------
// Role CRUD Operations
// -------------------------------------------------------------------------

/**
 * Get all roles (system + custom), deduplicated
 * Bug 5 fix: Merges system roles with their Firestore overrides to avoid duplicate keys
 */
export async function getAllRoles(firestore: Firestore): Promise<Role[]> {
  // First, create Role objects for system roles
  const systemRoles: Role[] = Object.entries(SYSTEM_ROLES).map(([name, permissions]) => ({
    id: name.toLowerCase(),
    name,
    description: getSystemRoleDescription(name as SystemRole),
    isSystemRole: true,
    systemLevel: name as SystemRole,
    permissions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  // Then, fetch custom roles from Firestore
  const rolesRef = collection(firestore, 'roles');
  const snapshot = await getDocs(rolesRef);

  // Build a map of Firestore roles by ID
  const firestoreRolesMap = new Map<string, Role>();
  snapshot.docs.forEach(d => {
    firestoreRolesMap.set(d.id, { id: d.id, ...d.data() } as Role);
  });

  // Merge: for system roles, prefer Firestore permissions if customized by admin
  const systemRoleIds = new Set(systemRoles.map(r => r.id));
  const mergedRoles: Role[] = systemRoles.map(sr => {
    const fsVersion = firestoreRolesMap.get(sr.id);
    if (fsVersion) {
      // Use Firestore permissions but keep system role metadata
      return { 
        ...sr, 
        permissions: fsVersion.permissions,
        hierarchyDepth: fsVersion.hierarchyDepth
      };
    }
    return sr;
  });

  // Add truly custom (non-system) roles from Firestore
  firestoreRolesMap.forEach((role, id) => {
    if (!systemRoleIds.has(id)) {
      mergedRoles.push(role);
    }
  });

  return mergedRoles;
}

/**
 * Get a single role by ID
 */
export async function getRoleById(firestore: Firestore, roleId: string): Promise<Role | null> {
  // Check if it's a system role
  const systemRoleName = Object.keys(SYSTEM_ROLES).find(
    name => name.toLowerCase() === roleId.toLowerCase()
  ) as SystemRole | undefined;

  if (systemRoleName) {
    const roleRef = doc(firestore, 'roles', systemRoleName.toLowerCase());
    const snapshot = await getDoc(roleRef);
    let overrides: Partial<Role> = {};

    if (snapshot.exists()) {
      overrides = snapshot.data() as Partial<Role>;
    }

    return {
      id: systemRoleName.toLowerCase(),
      name: systemRoleName,
      description: getSystemRoleDescription(systemRoleName),
      isSystemRole: true,
      systemLevel: systemRoleName, // System level for system role is itself
      permissions: overrides.permissions || SYSTEM_ROLES[systemRoleName],
      hierarchyDepth: overrides.hierarchyDepth,
      createdAt: overrides.createdAt || new Date().toISOString(),
      updatedAt: overrides.updatedAt || new Date().toISOString(),
    };
  }

  // Fetch custom role from Firestore
  const roleRef = doc(firestore, 'roles', roleId);
  const snapshot = await getDoc(roleRef);

  if (!snapshot.exists()) return null;

  return {
    id: snapshot.id,
    ...snapshot.data(),
  } as Role;
}

/**
 * Create a new custom role
 */
export async function createRole(
  firestore: Firestore,
  data: {
    name: string;
    description?: string;
    permissions: ModulePermission[];
    hierarchyDepth?: number;
    createdById: string;
    systemLevel?: SystemRole; // Optional override, otherwise calculated
  }
): Promise<string> {
  // Generate a slug-like ID from the name
  const id = data.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  // Check if role name already exists
  const existingRole = await getRoleById(firestore, id);
  if (existingRole) {
    throw new Error(`Ya existe un rol con el nombre "${data.name}"`);
  }

  const roleRef = doc(firestore, 'roles', id);
  const now = new Date().toISOString();

  // Calculate system level automatically if not provided
  const systemLevel = data.systemLevel || calculateSystemLevel(data.permissions);

  const rolePayload: any = {
    name: data.name,
    description: data.description || '',
    isSystemRole: false,
    systemLevel,
    permissions: data.permissions,
    createdAt: now,
    updatedAt: now,
    createdById: data.createdById,
  };

  if (data.hierarchyDepth !== undefined) {
    rolePayload.hierarchyDepth = data.hierarchyDepth;
  }

  await setDoc(roleRef, rolePayload);

  return id;
}

/**
 * Update a custom role
 * @param isAdminUser - If true, allows editing system roles (for admin users only)
 */
export async function updateRole(
  firestore: Firestore,
  roleId: string,
  data: Partial<{
    name: string;
    description: string;
    permissions: ModulePermission[];
    hierarchyDepth?: number;
    systemLevel: SystemRole;
  }>,
  isAdminUser: boolean = false
): Promise<void> {
  // Check if it's a system role (case-insensitive)
  const isSystem = isSystemRole(roleId);

  // Only admins can edit system roles
  if (isSystem && !isAdminUser) {
    throw new Error('No se pueden modificar los roles del sistema. Se requieren permisos de administrador.');
  }

  // For system roles, we need to update them in Firestore (create if not exists)
  if (isSystem) {
    const systemRoleName = normalizeSystemRoleName(roleId);
    const roleRef = doc(firestore, 'roles', roleId);
    const snapshot = await getDoc(roleRef);

    if (!snapshot.exists()) {
      // Create the system role document with updated data
      const payload: any = {
        name: systemRoleName,
        description: getSystemRoleDescription(systemRoleName as SystemRole),
        isSystemRole: true,
        // System roles always have their own level
        systemLevel: systemRoleName as SystemRole,
        permissions: data.permissions || SYSTEM_ROLES[systemRoleName as SystemRole],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      if (data.hierarchyDepth !== undefined) {
        payload.hierarchyDepth = data.hierarchyDepth;
      }
      await setDoc(roleRef, payload);
    } else {
      const updatePayload: any = {
        ...data,
        updatedAt: new Date().toISOString(),
      };
      if (data.hierarchyDepth === undefined && 'hierarchyDepth' in data) {
        updatePayload.hierarchyDepth = deleteField();
      }
      await updateDoc(roleRef, updatePayload);
    }
    return;
  }

  const roleRef = doc(firestore, 'roles', roleId);
  const snapshot = await getDoc(roleRef);

  if (!snapshot.exists()) {
    throw new Error('Rol no encontrado');
  }

  const existingData = snapshot.data();
  if (existingData.isSystemRole && !isAdminUser) {
    throw new Error('No se pueden modificar los roles del sistema');
  }

  // If permissions change, recalculate system level if not explicitly provided
  let systemLevel = data.systemLevel;
  if (!systemLevel && data.permissions) {
    systemLevel = calculateSystemLevel(data.permissions);
  }

  const updatePayload: any = {
    ...data,
    updatedAt: new Date().toISOString(),
  };

  if (systemLevel) {
    updatePayload.systemLevel = systemLevel;
  }

  if (data.hierarchyDepth === undefined && 'hierarchyDepth' in data) {
    updatePayload.hierarchyDepth = deleteField();
  } else if (data.hierarchyDepth !== undefined) {
    updatePayload.hierarchyDepth = data.hierarchyDepth;
  }

  await updateDoc(roleRef, updatePayload);
}

/**
 * Delete a custom role
 */
export async function deleteRole(firestore: Firestore, roleId: string): Promise<void> {
  // Prevent deleting system roles
  if (isSystemRole(roleId)) {
    throw new Error('No se pueden eliminar los roles del sistema');
  }

  const roleRef = doc(firestore, 'roles', roleId);
  const snapshot = await getDoc(roleRef);

  if (!snapshot.exists()) {
    throw new Error('Rol no encontrado');
  }

  const existingData = snapshot.data();
  if (existingData.isSystemRole) {
    throw new Error('No se pueden eliminar los roles del sistema');
  }

  // Check if any users have this role
  const usersRef = collection(firestore, 'users');
  const usersWithRole = await getDocs(query(usersRef, where('customRoleId', '==', roleId)));

  if (!usersWithRole.empty) {
    throw new Error(
      `No se puede eliminar este rol porque ${usersWithRole.size} usuario(s) lo tienen asignado`
    );
  }

  await deleteDoc(roleRef);
}

// -------------------------------------------------------------------------
// Permission Helpers
// -------------------------------------------------------------------------

/**
 * Get permissions for a user based on their role
 * Checks Firestore for admin-customized system roles before falling back to defaults
 */
export async function getUserPermissions(
  firestore: Firestore,
  userRole: string,
  customRoleId?: string
): Promise<{ permissions: ModulePermission[], hierarchyDepth?: number }> {
  // If there's a custom role ID, fetch it first
  if (customRoleId) {
    const role = await getRoleById(firestore, customRoleId);
    if (role) {
      return { permissions: role.permissions, hierarchyDepth: role.hierarchyDepth };
    }
  }

  // For system roles, check if admin has customized permissions in Firestore
  if (isSystemRole(userRole)) {
    try {
      const roleDocId = userRole.toLowerCase();
      const roleDoc = await getDoc(doc(firestore, 'roles', roleDocId));
      if (roleDoc.exists()) {
        const data = roleDoc.data() as Role;
        if (data.permissions?.length > 0) {
          return { permissions: data.permissions, hierarchyDepth: data.hierarchyDepth };
        }
      }
    } catch {
      // Fallback to hardcoded defaults if Firestore read fails
    }
    return { permissions: SYSTEM_ROLES[userRole] };
  }

  // Default to Member permissions if role not found
  return { permissions: SYSTEM_ROLES.Member };
}

/**
 * Check if user has permission for a specific module
 */
export function hasPermission(
  permissions: ModulePermission[],
  module: AppModule,
  requiredLevel: 'read' | 'write'
): boolean {
  const modulePermission = permissions.find(p => p.module === module);

  if (!modulePermission || modulePermission.level === 'hidden') {
    return false;
  }

  if (requiredLevel === 'read') {
    return modulePermission.level === 'read' || modulePermission.level === 'write';
  }

  return modulePermission.level === 'write';
}

/**
 * Get permission level for a module
 */
export function getPermissionLevel(
  permissions: ModulePermission[],
  module: AppModule
): PermissionLevel {
  const modulePermission = permissions.find(p => p.module === module);
  return modulePermission?.level || 'hidden';
}

// -------------------------------------------------------------------------
// Utility Functions
// -------------------------------------------------------------------------

function getSystemRoleDescription(role: SystemRole): string {
  const descriptions: Record<SystemRole, string> = {
    Admin: 'Acceso completo a todas las funciones del sistema',
    Designer: 'Diseño de flujos de trabajo y plantillas',
    Member: 'Usuario estándar con acceso básico',
    HRManager: 'Gestión completa de recursos humanos',
    Manager: 'Supervisión de equipo y aprobación de permisos',
  };
  return descriptions[role];
}
