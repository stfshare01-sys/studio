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
} from "firebase/firestore";
import type { Role, ModulePermission, AppModule, PermissionLevel, SystemRole } from "@/lib/types";

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
    { module: 'hcm_settlements', level: 'write' },
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
    { module: 'hcm_settlements', level: 'hidden' },
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
    { module: 'hcm_settlements', level: 'hidden' },
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
    { module: 'hcm_settlements', level: 'write' },
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
    { module: 'hcm_settlements', level: 'hidden' },
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
  hcm_incidences: { name: 'Incidencias', description: 'Permisos, vacaciones y ausencias', category: 'hcm' },
  hcm_prenomina: { name: 'Pre-nómina', description: 'Consolidación de nómina', category: 'hcm' },
  hcm_calendar: { name: 'Calendario', description: 'Calendario de incidencias del equipo', category: 'hcm' },
  hcm_org_chart: { name: 'Organigrama', description: 'Estructura organizacional', category: 'hcm' },
  hcm_talent_grid: { name: 'Talent Grid', description: 'Matriz 9-box de talento', category: 'hcm' },
  hcm_team_management: { name: 'Gestión de Equipo', description: 'Administrar retardos, horas extras y turnos de subordinados', category: 'hcm' },
  hcm_admin_shifts: { name: 'Turnos', description: 'Configurar tipos de turnos', category: 'hcm' },
  hcm_admin_positions: { name: 'Posiciones', description: 'Catálogo de posiciones', category: 'hcm' },
  hcm_admin_locations: { name: 'Ubicaciones', description: 'Catálogo de ubicaciones', category: 'hcm' },
  hcm_admin_departments: { name: 'Departamentos', description: 'Catálogo de departamentos', category: 'hcm' },
  hcm_settlements: { name: 'Liquidaciones', description: 'Cálculos de finiquito y liquidación', category: 'hcm' },
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
};

// Check if a role is a system role
export function isSystemRole(role: string): role is SystemRole {
  return ['Admin', 'Member', 'Designer', 'HRManager', 'Manager'].includes(role);
}

// -------------------------------------------------------------------------
// Role CRUD Operations
// -------------------------------------------------------------------------

/**
 * Get all roles (system + custom)
 */
export async function getAllRoles(firestore: Firestore): Promise<Role[]> {
  // First, create Role objects for system roles
  const systemRoles: Role[] = Object.entries(SYSTEM_ROLES).map(([name, permissions]) => ({
    id: name.toLowerCase(),
    name,
    description: getSystemRoleDescription(name as SystemRole),
    isSystemRole: true,
    permissions,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));

  // Then, fetch custom roles from Firestore
  const rolesRef = collection(firestore, 'roles');
  const snapshot = await getDocs(rolesRef);
  const customRoles = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data(),
  })) as Role[];

  return [...systemRoles, ...customRoles];
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
    return {
      id: systemRoleName.toLowerCase(),
      name: systemRoleName,
      description: getSystemRoleDescription(systemRoleName),
      isSystemRole: true,
      permissions: SYSTEM_ROLES[systemRoleName],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
    createdById: string;
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

  await setDoc(roleRef, {
    name: data.name,
    description: data.description || '',
    isSystemRole: false,
    permissions: data.permissions,
    createdAt: now,
    updatedAt: now,
    createdById: data.createdById,
  });

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
  }>,
  isAdminUser: boolean = false
): Promise<void> {
  // Check if it's a system role
  const isSystem = isSystemRole(roleId) || isSystemRole(roleId.charAt(0).toUpperCase() + roleId.slice(1));

  // Only admins can edit system roles
  if (isSystem && !isAdminUser) {
    throw new Error('No se pueden modificar los roles del sistema. Se requieren permisos de administrador.');
  }

  // For system roles, we need to update them in Firestore (create if not exists)
  if (isSystem) {
    const systemRoleName = roleId.charAt(0).toUpperCase() + roleId.slice(1);
    const roleRef = doc(firestore, 'roles', roleId);
    const snapshot = await getDoc(roleRef);

    if (!snapshot.exists()) {
      // Create the system role document with updated data
      await setDoc(roleRef, {
        name: systemRoleName,
        description: getSystemRoleDescription(systemRoleName as SystemRole),
        isSystemRole: true,
        permissions: data.permissions || SYSTEM_ROLES[systemRoleName as SystemRole],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } else {
      await updateDoc(roleRef, {
        ...data,
        updatedAt: new Date().toISOString(),
      });
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

  await updateDoc(roleRef, {
    ...data,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Delete a custom role
 */
export async function deleteRole(firestore: Firestore, roleId: string): Promise<void> {
  // Prevent deleting system roles
  if (isSystemRole(roleId) || isSystemRole(roleId.charAt(0).toUpperCase() + roleId.slice(1))) {
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
 */
export async function getUserPermissions(
  firestore: Firestore,
  userRole: string,
  customRoleId?: string
): Promise<ModulePermission[]> {
  // Check if it's a system role
  if (isSystemRole(userRole)) {
    return SYSTEM_ROLES[userRole];
  }

  // If there's a custom role ID, fetch it
  if (customRoleId) {
    const role = await getRoleById(firestore, customRoleId);
    if (role) {
      return role.permissions;
    }
  }

  // Default to Member permissions if role not found
  return SYSTEM_ROLES.Member;
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
    Manager: 'Supervisión de equipo y aprobación de incidencias',
  };
  return descriptions[role];
}
