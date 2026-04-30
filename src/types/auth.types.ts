// -------------------------------------------------------------------------
// System Roles - Built-in roles (cannot be deleted)
// -------------------------------------------------------------------------
export type SystemRole = 'Admin' | 'Member' | 'Designer' | 'HRManager' | 'Manager';

// UserRole can be a system role or a custom role ID
export type UserRole = SystemRole | string;
export type UserStatus = 'active' | 'disabled';

// -------------------------------------------------------------------------
// Permission System Types
// -------------------------------------------------------------------------

// Permission levels for modules and features
export type PermissionLevel = 'read' | 'write' | 'hidden';

// Application modules that can have permissions assigned
export type AppModule =
  | 'dashboard'
  | 'requests'
  | 'templates'
  | 'master_lists'
  | 'reports'
  | 'process_mining'
  | 'integrations'
  | 'admin_users'
  | 'admin_roles'
  | 'hcm_employees'
  | 'hcm_attendance'
  | 'hcm_incidences'
  | 'hcm_prenomina'
  | 'hcm_calendar'
  | 'hcm_org_chart'
  | 'hcm_talent_grid'
  | 'hcm_team_management'
  | 'hcm_admin_shifts'
  | 'hcm_admin_positions'
  | 'hcm_admin_locations'
  | 'hcm_admin_departments'
  | 'hcm_admin_holidays'
  | 'hcm_admin_vacation'
  // Granular team management permissions
  | 'hcm_team_tardiness'       // Gestionar retardos del equipo
  | 'hcm_team_departures'      // Gestionar salidas tempranas
  | 'hcm_team_overtime'        // Gestionar horas extras
  | 'hcm_team_shifts'          // Asignar turnos al equipo
  | 'hcm_team_hour_bank'       // Ver/gestionar bolsa de horas
  // Granular Team Global
  | 'hcm_team_management_global'
  // Granular prenomina permissions
  | 'hcm_prenomina_process'    // Procesar prenómina
  | 'hcm_prenomina_close'      // Cerrar período
  | 'hcm_prenomina_export'     // Exportar prenómina
  // SLAs
  | 'hcm_sla_processing'       // Procesar prenómina
  // Document Management
  | 'org_documents';

// Permission for a specific module
export type ModulePermission = {
  module: AppModule;
  level: PermissionLevel;
};

// Custom role definition stored in Firestore
export type Role = {
  id: string;
  name: string;
  description?: string;
  isSystemRole: boolean;       // true for Admin, Member, Designer, etc. (Pre-defined immutable roles)
  systemLevel: SystemRole;     // The underlying security level (Admin, HRManager, etc.) for rules.
  permissions: ModulePermission[];
  hierarchyDepth?: number;     // 1=directos, 2=gerencial, undefined=infinito
  createdAt: string;
  updatedAt: string;
  createdById?: string;
};

// Module metadata for UI display
export type ModuleInfo = {
  id: AppModule;
  name: string;
  description: string;
  category: 'general' | 'admin' | 'hcm';
  icon?: string;
};

export type User = {
  id: string;
  fullName: string;
  avatarUrl?: string;
  email: string;
  department: string;           // Legacy: nombre del departamento (string)
  departmentId?: string;        // NEW: referencia a departments/{id}
  skills?: string[];
  currentWorkload?: number;
  role: UserRole;
  customRoleId?: string;       // If role is custom, stores the role document ID
  status: UserStatus;
  managerId?: string; // ID of the user's manager
  legalEntity?: string; // Razón Social (STFLatin America, Stuffactory, Derechos de Autor)
};

// -------------------------------------------------------------------------
// Audit Log Types
// -------------------------------------------------------------------------

export type AuditLogAction = 'REQUEST_SUBMITTED' | 'STEP_ASSIGNEE_CHANGED' | 'COMMENT_ADDED' | 'STEP_COMPLETED' | 'DOCUMENT_DELETED';

export type AuditLog = {
  id: string;
  requestId: string;
  userId: string;
  userFullName: string; // Denormalized for display
  userAvatarUrl?: string; // Denormalized for display
  timestamp: string;
  action: AuditLogAction;
  details: Record<string, any>;
};
