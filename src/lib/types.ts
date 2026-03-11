



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
  | 'hcm_sla_processing';    // Procesar prenómina

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
};

// Represents a step within a template, before it becomes a live task
export type WorkflowStepType = 'task' | 'gateway-exclusive' | 'gateway-parallel' | 'gateway-inclusive' | 'gateway-parallel-join' | 'gateway-inclusive-join' | 'timer';

export type EscalationPolicy = {
  action: 'NOTIFY' | 'REASSIGN';
  targetRole?: string; // For REASSIGN action
  notify: ('assignee' | 'manager' | 'submitter')[];
};

// -------------------------------------------------------------------------
// Field State Override Types (for dynamic states per task)
// -------------------------------------------------------------------------

export type FieldStateOverride = {
  fieldId: string;
  readOnly?: boolean;
  required?: boolean;
  visible?: boolean;
  defaultValue?: any;
};

// -------------------------------------------------------------------------
// Timer Configuration Types
// -------------------------------------------------------------------------

export type TimerType = 'duration' | 'date';

export type TimerConfig = {
  type: TimerType;
  durationHours?: number;       // For duration type: wait X hours
  durationDays?: number;        // For duration type: wait X days
  targetDate?: string;          // For date type: wait until specific date
  targetDateFieldId?: string;   // For date type: get date from form field
};

// -------------------------------------------------------------------------
// Assignee Source Types (for assignment by field)
// -------------------------------------------------------------------------

export type AssigneeSourceType = 'role' | 'field' | 'user' | 'submitter';

export type AssigneeSource = {
  type: AssigneeSourceType;
  role?: string;              // For role-based assignment
  fieldId?: string;           // For field-based assignment (email field)
  userId?: string;            // For direct user assignment
};

// -------------------------------------------------------------------------
// Lookup Field Configuration
// -------------------------------------------------------------------------

export type LookupMapping = {
  sourceField: string;        // Field in source data
  targetFieldId: string;      // Field in form to populate
};

export type LookupConfig = {
  sourceType: 'master-list' | 'collection';
  masterListId?: string;
  collectionPath?: string;
  lookupKeyField: string;     // Field in source to match against
  mappings: LookupMapping[];  // Which fields to populate
};

// -------------------------------------------------------------------------
// Default Value Rules (conditional defaults)
// -------------------------------------------------------------------------

export type DefaultValueRuleCondition = {
  fieldId: string;
  operator: RuleOperator;
  value: any;
};

export type DefaultValueRule = {
  id: string;
  targetFieldId: string;
  value: any;                 // Value to set (can be static or expression like "@fieldId")
  conditions?: DefaultValueRuleCondition[];
  logic?: VisibilityLogicalOperator;
  triggerOnChange?: string[]; // Field IDs that trigger re-evaluation
};

// -------------------------------------------------------------------------
// Field Layout Configuration (grid layout)
// -------------------------------------------------------------------------

export type FieldLayoutConfig = {
  fieldId: string;
  row: number;                // Row index (0-based)
  column: number;             // Column position (1-5)
  colspan?: number;           // Number of columns to span (1-5, default 5 = full width)
};

// -------------------------------------------------------------------------
// Public Form / External Participants
// -------------------------------------------------------------------------

export type PublicFormToken = {
  id: string;
  templateId: string;
  requestId?: string;         // If linked to existing request
  stepId?: string;            // Specific step for external participation
  createdAt: string;
  expiresAt: string;
  createdBy: string;          // User who created the link
  email?: string;             // Optional: restrict to specific email
  maxUses?: number;           // Optional: limit number of submissions
  usedCount: number;
  isActive: boolean;
};

export type WorkflowStepDefinition = {
  id: string;
  name: string;
  type: WorkflowStepType;
  assigneeRole?: string; // e.g., 'Finance Approver', 'IT Support' (legacy)
  // For exclusive gateways, defines possible outcomes
  outcomes?: string[];
  slaHours?: number; // Service Level Agreement in hours
  escalationPolicy?: EscalationPolicy;

  // NEW: Advanced assignee configuration
  assigneeSource?: AssigneeSource;

  // NEW: Field state overrides for this specific task
  fieldOverrides?: FieldStateOverride[];

  // NEW: Timer configuration (for timer steps)
  timerConfig?: TimerConfig;

  // NEW: Allow external participants without authentication
  allowExternalParticipants?: boolean;
  externalParticipantEmail?: string;  // Specific email for external participant

  // NEW: For inclusive gateway - which conditions must be true
  inclusiveConditions?: {
    targetStepId: string;
    condition: RuleCondition;
  }[];

  // NEW: Gateway routing configuration
  routes?: GatewayRoute[];
};

// Gateway route configuration
export type GatewayRoute = {
  id: string;
  targetStepId: string;
  condition?: {
    sourceType: 'form' | 'outcome';
    fieldId: string;
    operator: RuleOperator;
    value: string | number;
  };
  isDefault?: boolean;
};

export type TaskStatus = 'Completed' | 'Pending' | 'Active';

// Represents a live, actionable task assigned to a user, based on a WorkflowStepDefinition
export type Task = {
  id: string; // Unique ID for the task document itself
  requestTitle: string; // Denormalized from parent request
  requestId: string; // ID of the parent request
  requestOwnerId: string; // ID of the user who submitted the request
  stepId: string; // ID from the original WorkflowStepDefinition in the template
  name: string; // Name of the step/task
  /** @deprecated use name instead, but kept for compatibility with older code */
  title?: string;
  description?: string;
  type?: string;
  priority?: 'low' | 'medium' | 'high';
  module?: string;
  link?: string;
  metadata?: any;
  status: TaskStatus;
  assigneeId: string | null;
  completedAt: string | null;
  createdAt: string; // Timestamp when the task was created
  activatedAt?: string; // Timestamp when the task became active
  slaExpiresAt?: string; // Timestamp when the SLA for this task expires
  isEscalated?: boolean; // Flag to prevent multiple escalations
};

export type Document = {
  id: string;
  requestId: string;
  filename: string;
  contentType: string;
  size: number;
  uploadDate: string;
  url: string;
  storagePath: string; // Path in Firebase Storage
};

export type RequestPriority = 'Baja' | 'Media' | 'Alta';

export type Request = {
  id: string;
  title: string;
  templateId: string;
  status: 'In Progress' | 'Completed' | 'Rejected';
  priority: RequestPriority;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null; // Added for cycle time calculation
  submittedBy: string; // User ID
  // Steps are now mainly for historical/display purposes within the request context
  steps: {
    id: string; // Matches stepId from template
    name: string;
    status: TaskStatus;
    assigneeId: string | null;
    completedAt: string | null;
    taskId: string | null; // Reference to the document in the /tasks collection
    outcome?: string | null; // The result of a decision task
  }[];
  formData: Record<string, any>;
  documents: Document[];
  template?: Template; // Denormalized template data
};

export type FormFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'radio'
  | 'file'
  // Advanced field types
  | 'table'           // Interactive sub-table with multiple rows
  | 'dynamic-select'  // Dropdown connected to Firestore collections/master lists
  | 'user-identity'   // Auto-filled with logged-in user info (read-only)
  | 'email'           // Email with format validation
  | 'html';           // Custom HTML/script content for advanced layouts

// -------------------------------------------------------------------------
// Typography Configuration
// -------------------------------------------------------------------------

export type TypographyConfig = {
  fontFamily?: 'default' | 'serif' | 'mono' | 'custom';
  customFont?: string;           // Custom font name if fontFamily is 'custom'
  fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
  fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
  textColor?: string;            // Hex color or Tailwind class
  textAlign?: 'left' | 'center' | 'right';
  labelHidden?: boolean;         // Hide the field label
};

// -------------------------------------------------------------------------
// Table Field Types
// -------------------------------------------------------------------------

export type TableColumnType = 'text' | 'number' | 'date' | 'select' | 'formula';

export type TableColumnFormula = {
  type: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'CUSTOM';
  targetColumn?: string;      // Column ID for aggregation functions
  expression?: string;        // Custom formula expression like "colA * colB"
  referenceField?: string;    // Main form field reference using @fieldId syntax
};

export type TableColumnDefinition = {
  id: string;
  name: string;
  type: TableColumnType;
  options?: string[];           // For select columns
  formula?: TableColumnFormula; // For formula columns
  width?: number;               // Column width in pixels
  required?: boolean;
};

export type TableRowData = {
  _rowId: string;               // Internal row identifier
  [columnId: string]: any;
};

// -------------------------------------------------------------------------
// Dynamic Select Types
// -------------------------------------------------------------------------

export type DynamicSelectSourceType = 'master-list' | 'collection' | 'static';

export type CascadeFilter = {
  dependsOn: string;           // Field ID this dropdown depends on
  filterField: string;         // Field in source data to filter by
  operator: '==' | 'contains' | 'in';
};

export type DynamicSelectSource = {
  type: DynamicSelectSourceType;
  masterListId?: string;       // Reference to master_lists/{id}
  collectionPath?: string;     // Direct Firestore collection path
  labelField: string;          // Field to display as label
  valueField: string;          // Field to use as value
  filterConfig?: CascadeFilter;
};

// -------------------------------------------------------------------------
// User Identity Field Types
// -------------------------------------------------------------------------

export type UserIdentityDisplayField = 'email' | 'fullName' | 'both';

export type UserIdentityConfig = {
  displayField: UserIdentityDisplayField;
  includeTimestamp?: boolean;
};

export type UserIdentityValue = {
  userId: string;
  email: string;
  fullName: string;
  timestamp?: string;
};

// -------------------------------------------------------------------------
// Visibility Rules Types
// -------------------------------------------------------------------------

export type VisibilityLogicalOperator = 'AND' | 'OR';

export type VisibilityCondition = {
  fieldId: string;
  operator: RuleOperator;
  value: any;
};

export type VisibilityRule = {
  id: string;
  targetFieldId: string;
  logic: VisibilityLogicalOperator;
  conditions: VisibilityCondition[];
  action: 'show' | 'hide';     // What happens when condition is met
};

// -------------------------------------------------------------------------
// Validation Rules Types
// -------------------------------------------------------------------------

export type ValidationType =
  | 'required'
  | 'min'
  | 'max'
  | 'minLength'
  | 'maxLength'
  | 'pattern'
  | 'email'
  | 'fileSize'
  | 'fileType';

export type ValidationRule = {
  type: ValidationType;
  value?: any;                  // The validation parameter (e.g., min value, pattern)
  message?: string;             // Custom error message
};

// -------------------------------------------------------------------------
// Legacy TableColumn (for master lists)
// -------------------------------------------------------------------------

export type TableColumn = {
  id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'select';
  options?: string[]; // For select type columns
};

// -------------------------------------------------------------------------
// Extended FormField Type
// -------------------------------------------------------------------------

export type FormField = {
  id: string;
  label: string;
  type: FormFieldType;
  options?: string[];

  // Table configuration
  tableColumns?: TableColumnDefinition[];
  minRows?: number;
  maxRows?: number;
  showSummaryRow?: boolean;    // Show auto-calculated summary row

  // Dynamic select configuration
  dynamicSource?: DynamicSelectSource;

  // User identity configuration
  userIdentityConfig?: UserIdentityConfig;

  // Validation rules
  validations?: ValidationRule[];

  // General properties
  placeholder?: string;
  helpText?: string;
  defaultValue?: any;
  readOnly?: boolean;
  required?: boolean;

  // NEW: Lookup configuration - auto-populate other fields based on selection
  lookupConfig?: LookupConfig;

  // NEW: Typography configuration for field styling
  typography?: TypographyConfig;

  // NEW: HTML content for 'html' field type
  htmlContent?: string;          // Raw HTML/script content to render
};

export type RuleOperator =
  | '==' | '!=' // Generic equality
  | '>' | '<' | '>=' | '<=' // For numbers
  | 'contains' | 'not_contains' // For text
  | 'is' | 'is_not'; // For selects/radios

export type RuleCondition = {
  fieldId: string; // Can be a form field ID or a step ID for outcome-based rules
  operator: RuleOperator;
  value: any;
  type: 'form' | 'outcome'; // Distinguish between form data rules and workflow outcome rules
};

export type RuleAction =
  | { type: 'REQUIRE_ADDITIONAL_STEP'; stepId: string; }
  | { type: 'ROUTE_TO_STEP'; stepId: string; }
  | { type: 'ASSIGN_USER'; stepId: string; userId: string; }
  | { type: 'SEND_NOTIFICATION'; target: 'submitter' | UserRole; message: string; }
  | { type: 'CHANGE_REQUEST_PRIORITY'; priority: RequestPriority; };

export type Rule = {
  id: string;
  condition: RuleCondition;
  action: RuleAction;
};

export type MasterListField = {
  id: string;
  label: string;
  type: 'text' | 'number' | 'boolean' | 'date';
}

export type MasterList = {
  id: string;
  name: string;
  description: string;
  primaryKey: string;
  fields: MasterListField[];
}

// Configuration for who can initiate a request from a template
export type InitiatorPermission = {
  type: 'all' | 'user' | 'role' | 'position' | 'department' | 'area';
  // For specific selections, store the IDs
  userIds?: string[];
  roleIds?: string[];
  positionIds?: string[];
  departmentIds?: string[];
  areaIds?: string[];
};

export type Template = {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  steps: WorkflowStepDefinition[];
  rules: Rule[];
  pools?: {
    id: string;
    name: string;
    lanes: {
      id: string;
      name: string;
      steps: WorkflowStepDefinition[];
    }[];
  }[];
  // Global visibility rules for conditional field display
  visibilityRules?: VisibilityRule[];

  // NEW: Field layout configuration for grid display
  fieldLayout?: FieldLayoutConfig[];

  // NEW: Default value rules with conditional logic
  defaultValueRules?: DefaultValueRule[];

  // NEW: Allow public form submissions (no authentication)
  allowPublicSubmission?: boolean;

  // Publication status: draft templates are not visible in "Nueva Solicitud"
  status?: 'draft' | 'published' | 'archived';

  // Who can initiate requests from this template
  initiatorPermissions?: InitiatorPermission;

  // Metadata
  createdAt?: string;
  createdBy?: string;
  updatedAt?: string;
  publishedAt?: string;
  publishedBy?: string;
  version?: number;
};

export type Comment = {
  id: string;
  requestId: string;
  authorId: string;
  text: string;
  createdAt: string;
};

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



// Enriched types for UI
export type EnrichedWorkflowStep = Omit<Request['steps'][0], 'assigneeId'> & {
  assignee: User | null;
};

export type EnrichedRequest = Omit<Request, 'submittedBy' | 'steps'> & {
  submittedBy: User;
  steps: EnrichedWorkflowStep[];
  template: Template; // Enriched requests must have the template
};

export type EnrichedComment = Omit<Comment, 'authorId'> & {
  author?: User;
};

// Analytics types
export type TaskDuration = {
  name: string;
  duration: number;
};

// =========================================================================
// HCM MODULE TYPES - Sistema de Gestión de Capital Humano
// =========================================================================

// Extend UserRole to include HRManager
export type ExtendedUserRole = UserRole | 'HRManager' | 'Manager';

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type ShiftType = 'diurnal' | 'nocturnal' | 'mixed';
export type IncidenceType = 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'marriage' | 'adoption' | 'unpaid_leave' | 'civic_duty' | 'half_day_family' | 'unjustified_absence' | 'abandono_empleo';
export type IncidenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unjustified' | 'made_up';
export type OnboardingPhase = 'day_0' | 'day_30' | 'day_60' | 'day_90' | 'completed';

export type EmployeeShiftAssignment = {
  shiftId: string;
  startDate: string; // ISO Date YYYY-MM-DD
  endDate?: string;  // ISO Date YYYY-MM-DD
};

/**
 * Expediente Digital del Empleado
 * Extiende el tipo User existente con datos laborales según LFT
 */
export type Employee = User & {
  // Datos fiscales y legales (LFT compliance)
  rfc_curp?: string;           // RFC con homoclave + CURP
  nss?: string;                // Número de Seguridad Social (IMSS)
  userId?: string;             // Authenticated User UID (optional, for linking to Auth)
  employeeId?: string;         // Numerical ID for attendance (ZKTeco etc)

  // Datos laborales
  employmentType: EmploymentType;
  shiftType: ShiftType;
  hireDate: string;            // Fecha de ingreso (ISO 8601)
  terminationDate?: string;    // Fecha de baja (si aplica)
  costCenter?: string;         // Centro de costos contable
  positionTitle: string;       // Puesto / cargo

  // Datos financieros (sensibles)
  clabe?: string;              // Cuenta bancaria CLABE 18 dígitos

  // Onboarding
  onboardingStatus?: OnboardingPhase;
  mentorId?: string;           // ID del mentor asignado
  onboardingObjectives?: OnboardingObjective[];

  // Evaluación 9-Box Grid
  performanceRating?: 1 | 2 | 3 | 4 | 5;
  potentialRating?: 1 | 2 | 3 | 4 | 5;
  lastEvaluationDate?: string;

  // Lista negra (offboarding)
  isBlacklisted?: boolean;
  blacklistReason?: string;
  blacklistDate?: string;

  // Información jerárquica
  directManagerId?: string;    // ID del jefe directo
  positionId?: string;         // ID del puesto asociado
  locationId?: string;         // ID de la ubicación física
  customShiftId?: string;      // ID del turno personalizado (si aplica)
  shiftAssignments?: EmployeeShiftAssignment[]; // Historial de turnos asignados
  /** @deprecated Use customShiftId instead */
  shiftId?: string;            // Legacy: ID del turno (usado en seed data)

  // Configuración de compensación
  allowTimeForTime?: boolean;  // Permite tiempo por tiempo (solo RH puede modificar)
};

/**
 * Objetivo SMART para Onboarding
 */
export type OnboardingObjective = {
  id: string;
  phase: OnboardingPhase;
  description: string;
  isCompleted: boolean;
  completedAt?: string;
  notes?: string;
};

/**
 * Registro de Compensación
 * Contiene información salarial y factores de integración según LFT
 */
export type Compensation = {
  id: string;
  employeeId: string;

  // Salario base
  salaryDaily: number;          // Salario diario base
  salaryMonthly?: number;       // Salario mensual (calculado)

  // Salario Diario Integrado (SDI) - Calculado por sistema de nómina externo
  sdiBase?: number;              // SDI calculado (opcional, se calcula en nómina)
  sdiFactor?: number;            // Factor de integración (opcional, se calcula en nómina)

  // Prestaciones LFT
  vacationDays: number;         // Días de vacaciones según antigüedad (Art. 76 LFT)
  vacationPremium: number;      // Prima vacacional (25% mínimo según Art. 80 LFT)
  aguinaldoDays: number;        // Días de aguinaldo (15 mínimo según Art. 87 LFT)

  // Prestaciones superiores a la ley
  savingsFundPercentage?: number;  // Fondo de ahorro (%)
  foodVouchersDaily?: number;      // Vales de despensa diarios

  // Vigencia
  effectiveDate: string;        // Fecha de vigencia
  endDate?: string;             // Fecha fin (si hay cambio de tabulador)

  // Auditoría
  createdAt: string;
  updatedAt: string;
  createdById: string;
};

/**
 * Registro de Asistencia
 * Importado de sistema externo (biométrico, reloj checador, etc.)
 */
export type AttendanceRecord = {
  id: string;
  employeeId: string;
  employeeName?: string;        // Denormalized for display (optional for legacy data)

  // Fecha y hora
  date: string;                 // YYYY-MM-DD
  checkIn?: string;             // HH:mm:ss (hora de entrada)
  checkOut?: string;            // HH:mm:ss (hora de salida)

  // Check-in/out detallado
  checkInLocation?: {
    latitude: number;
    longitude: number;
  };
  checkOutLocation?: {
    latitude: number;
    longitude: number;
  };
  locationId?: string; // Ubicacion asignada o donde hizo check-in

  // Cálculos automáticos
  hoursWorked: number;          // Total horas trabajadas
  regularHours: number;         // Horas dentro de jornada normal
  overtimeHours: number;        // Horas extra totales
  rawOvertimeHours?: number;    // Overtime sin descuento de retardo (para recálculo al justificar)
  overtimeType?: 'double' | 'triple' | null; // Tipo según "Ley de los 9s"
  scheduledStart?: string;      // HH:mm — hora programada de entrada
  scheduledEnd?: string;        // HH:mm — hora programada de salida

  // Estado y validación
  isValid: boolean;             // Validación de jornada según turno
  validationNotes?: string | null;     // Notas de validación (ej: "Excede jornada diurna")


  // Incidencia relacionada (si aplica)
  linkedIncidenceId?: string;   // Si hay permiso/incapacidad que justifica

  // Holiday Flags
  isHoliday?: boolean;          // Si true, este día es festivo oficial (DFT si hay checada)
  isCompanyBenefitDay?: boolean; // Si true, es día de beneficio empresa
  holidayName?: string;         // Nombre del día festivo (ej. "Día de la Independencia")

  // Integrity Flags
  isVoid?: boolean;             // Si true, este día NO cuenta como trabajado (ej. convertido a falta)
  voidReason?: string;          // Razón de la anulación (ej. "Salida anticipada injustificada")

  // Lote de importación
  importBatchId: string;        // ID del lote de importación

  // Auditoría
  createdAt: string;

  // Seguimiento de deuda (Bolsa de Horas)
  hoursAppliedToDebt?: number; // Horas aplicadas para pagar deuda
  payableOvertimeHours?: number; // Horas extras pagables (después de deducir deuda)
};

/**
 * Incidencias y Permisos
 * Gestiona ausencias, vacaciones, incapacidades según LFT
 */
export type Incidence = {
  id: string;
  employeeId: string;
  employeeName?: string;        // Denormalizado para consultas rápidas

  // Tipo y fechas
  type: IncidenceType;
  startDate: string;            // Fecha inicio
  endDate: string;              // Fecha fin
  totalDays: number;            // Días totales

  // Estado del flujo
  status: IncidenceStatus;
  isPaid: boolean;              // Con o sin goce de sueldo

  // Datos específicos según tipo
  imssReference?: string;       // Folio IMSS para incapacidades
  imssPercentage?: number;      // % que cubre IMSS (40% o 60%)

  // Flujo de aprobación
  requestId?: string;           // Referencia al Request del workflow
  approvedById?: string;
  approvedByName?: string;      // Denormalizado
  approvedAt?: string;
  rejectionReason?: string;

  // Información adicional
  notes?: string;
  attachmentUrls?: string[];    // Documentos adjuntos (constancias médicas, etc.)

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Registro de Pre-Nómina Consolidada
 * Resumen por empleado por período de pago
 */
export type PrenominaRecord = {
  id: string;
  employeeId: string;
  employeeName?: string;
  employeeRfc?: string;
  periodStart: string;
  periodEnd: string;
  periodType: 'weekly' | 'biweekly' | 'monthly';

  // Percepciones de TIEMPO
  daysWorked: number;

  // Horas extra (tiempos)
  overtimeDoubleHours: number;
  overtimeTripleHours: number;

  sundayPremiumDays: number;
  holidayDays: number;               // Días festivos trabajados
  companyBenefitDaysTaken?: number;   // Días de beneficio empresa tomados (pagados)

  // Deducciones (Días/Horas, no $)
  absenceDays: number;

  vacationDaysTaken: number;
  sickLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;

  // Estado y exportación
  status: 'draft' | 'reviewed' | 'exported' | 'locked';
  reviewedById?: string;
  reviewedAt?: string;
  exportedAt?: string;
  exportedById?: string;
  exportFormat?: 'nomipaq' | 'excel' | 'json';

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Bolsa de Horas Compensatorias
 * "Tiempo por tiempo" según mutuo acuerdo
 */
export type TimeBank = {
  id: string;
  employeeId: string;

  // Saldos
  hoursEarned: number;          // Horas acumuladas por trabajo extra
  hoursUsed: number;            // Horas compensadas/usadas
  hoursBalance: number;         // Saldo disponible (earned - used)
  hoursExpired: number;         // Horas expiradas (si aplica política)

  // Política
  expirationMonths?: number;    // Meses para expiración (null = no expira)

  // Auditoría
  lastUpdated: string;
  movements: TimeBankMovement[];
};

/**
 * Movimiento en Bolsa de Horas
 */
export type TimeBankMovement = {
  id: string;
  type: 'earn' | 'use' | 'expire' | 'adjustment';
  hours: number;
  date: string;
  description: string;
  approvedById?: string;
};

/**
 * Lote de Importación de Asistencia
 */
export type AttendanceImportBatch = {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;

  // Procesamiento
  uploadedById: string;
  uploadedByName?: string;
  uploadedAt: string;

  // Resultados
  recordCount: number;          // Total registros procesados
  successCount: number;         // Registros exitosos
  skippedCount: number;         // Registros omitidos (duplicados)
  errorCount: number;           // Registros con error

  // Modo de cálculo de horas extra
  overtimeMode?: 'daily_limit' | 'weekly_only';

  // Estado
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'partial';
  errors?: ImportError[];

  // Período cubierto
  dateRangeStart?: string;
  dateRangeEnd?: string;
};

export type EmployeeImportBatch = {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  uploadedById: string;
  uploadedByName?: string;
  uploadedAt: string;
  recordCount: number;
  successCount: number;
  errorCount: number;
  status: 'uploading' | 'processing' | 'completed' | 'failed' | 'partial';
  errors?: ImportError[];
};

/**
 * Error de Importación
 */
export type ImportError = {
  row: number;
  column?: string;
  employeeId?: string;
  message: string;
  severity: 'warning' | 'error';
};

/**
 * Póliza Contable de Nómina
 */
export type AccountingPolicy = {
  id: string;
  prenominalPeriodStart: string;
  prenominalPeriodEnd: string;

  // Cuentas contables
  entries: AccountingEntry[];

  // Totales
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;

  // Estado
  status: 'draft' | 'posted' | 'cancelled';
  postedAt?: string;
  postedById?: string;

  // Auditoría
  createdAt: string;
  createdById: string;
};

/**
 * Entrada de Póliza Contable
 */
export type AccountingEntry = {
  accountCode: string;          // Código de cuenta contable
  accountName: string;          // Nombre de cuenta
  costCenter?: string;          // Centro de costos
  debit: number;                // Cargo
  credit: number;               // Abono
  concept: string;              // Concepto
};

/**
 * Configuración de Calendario Laboral
 * Días festivos oficiales según LFT
 */
export type HolidayCalendar = {
  id: string;
  name: string;                 // Nombre del calendario (e.g. "México 2026 Oficial")
  year: number;
  countryCode?: string;         // Código ISO del país (e.g. "mx")
  isDefault?: boolean;          // Si es el calendario por defecto
  holidays: OfficialHoliday[];
  createdAt: string;
  updatedAt: string;
};

/**
 * Día Festivo Oficial
 */
export type OfficialHoliday = {
  date: string;                 // YYYY-MM-DD
  name: string;                 // Nombre del día festivo
  mandatory?: boolean;          // Si es obligatorio según LFT
  isObligatory?: boolean;       // Alias legacy — Descanso obligatorio según Art. 74 LFT
  premiumRequired?: boolean;    // Requiere pago de prima (200%)
};

// =========================================================================
// DEPARTAMENTOS
// =========================================================================

/**
 * Departamento Organizacional
 * Entidad completa con jefe, presupuesto y jerarquía
 */
export type Department = {
  id: string;
  name: string;                   // Nombre del departamento
  code: string;                   // Código único (ej: "RH", "OPS", "FIN")
  description?: string;           // Descripción del departamento

  // Jerarquía organizacional
  managerPositionId?: string;     // ID del puesto responsable/jefe del departamento
  parentDepartmentId?: string;    // Departamento padre (para jerarquías)

  // Contabilidad
  costCenter?: string;            // Centro de costos contable
  budget?: number;                // Presupuesto asignado
  budgetPeriod?: 'monthly' | 'quarterly' | 'annual';

  // Ubicación física principal
  locationId?: string;            // Ubicación física principal del departamento

  // Estado
  isActive: boolean;

  // Auditoría
  createdAt: string;
  updatedAt: string;
  createdById?: string;
};

// =========================================================================
// UBICACIONES, PUESTOS Y TURNOS
// =========================================================================

/**
 * Tipo de ubicación
 */
export type LocationType = 'cedis' | 'tienda' | 'corporativo' | 'planta' | 'otro';

/**
 * Ubicación / Sucursal
 * Representa una ubicación física de la empresa
 */
export type Location = {
  id: string;
  name: string;                   // Nombre de la ubicación
  code: string;                   // Código único (ej: "CEDIS-GDL", "T001")
  type: LocationType;             // Tipo de ubicación
  address?: string;               // Dirección
  city?: string;                  // Ciudad
  state?: string;                 // Estado

  // Configuración de nómina
  overtimeResetDay: 'sunday' | 'saturday' | 'custom'; // Día de reinicio de horas extras
  customOvertimeResetDay?: number;  // 0-6 si es custom

  // Calendario específico
  holidayCalendarId?: string;     // Calendario de días festivos específico
  companyBenefitDays?: string[];  // Días de beneficio empresa (ej: "12-24", "12-31")

  // Configuración de asistencia
  toleranceMinutes: number;       // Tolerancia de entrada en minutos (default: 10)
  useVirtualCheckIn?: boolean;    // Usar check-in virtual (Home Office)

  // Estado
  isActive: boolean;

  // Auditoría
  createdAt: string;
  updatedAt: string;
  createdById: string;
};

/**
 * Límites de Aprobación por Puesto
 * Define los montos máximos que un puesto puede aprobar sin escalamiento
 */
export type ApprovalLimits = {
  // Límites monetarios (MXN)
  expenses?: number;              // Reembolsos de gastos
  purchases?: number;             // Requisiciones de compra
  travel?: number;                // Viáticos y viajes
  contracts?: number;             // Contratos de servicios

  // Límites de tiempo (días)
  vacationDays?: number;          // Días de vacaciones que puede aprobar sin escalar
  overtimeHours?: number;         // Horas extra semanales que puede aprobar

  // Límites de personal
  headcount?: number;             // Número de posiciones que puede aprobar contratar
};

/**
 * Puesto / Cargo
 * Catálogo de puestos de la empresa
 */
export type Position = {
  id: string;
  name: string;                   // Nombre del puesto
  code: string;                   // Código único
  department: string;             // Legacy: nombre del departamento (string)
  departmentId?: string;          // NEW: referencia a departments/{id}
  level: number;                  // Nivel jerárquico (1 = director, 2 = gerente, etc.)

  // Configuración salarial
  salaryMin?: number;             // Salario mínimo del tabulador
  salaryMax?: number;             // Salario máximo del tabulador

  // Permisos especiales
  canApproveOvertime?: boolean;   // Puede aprobar horas extras
  canApproveIncidences?: boolean; // Puede aprobar incidencias

  // Configuración de horas extras
  generatesOvertime?: boolean;    // Si el puesto puede generar horas extras pagadas
  overtimePreApprovalRequired?: boolean; // Si requiere pre-autorización para HE
  allowTimeBank?: boolean;        // Permitir uso de bolsa de horas

  // Límites de aprobación
  approvalLimits?: ApprovalLimits; // Límites máximos que puede aprobar sin escalar

  // Estado
  isActive: boolean;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Turno personalizado
 * Permite configurar turnos específicos por empleado/ubicación
 */
export type CustomShift = {
  id: string;
  name: string;                   // Nombre del turno (ej: "Turno Matutino")
  code: string;                   // Código (ej: "TM-01")
  type: ShiftType;                // Tipo base (diurnal, nocturnal, mixed)

  // Configuración de horario
  startTime: string; // HH:mm
  endTime: string;   // HH:mm
  breakMinutes: number; // Tiempo de descanso

  // NEW: Horarios específicos por día (opcional)
  // Si existe una entrada para el día actual, sobreescribe el horario global
  daySchedules?: {
    [day: number]: { // 0=Domingo, 1=Lunes...
      startTime: string;
      endTime: string;
      breakMinutes: number;
    }
  };

  // Días laborales y de descanso
  workDays: number[]; // 0=Sunday, 1=Monday, etc.
  restDays: number[];             // ej: [0, 6] para Dom y Sab

  // Horas calculadas
  dailyHours: number;             // Horas diarias normales
  weeklyHours: number;            // Horas semanales normales

  // Ubicación (opcional, si es turno específico de ubicación)
  locationId?: string;

  // Estado
  isActive: boolean;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

// =========================================================================
// CONTROL DE VACACIONES
// =========================================================================

/**
 * Saldo de Vacaciones del Empleado
 * Control del saldo de vacaciones disponible
 */
export type VacationBalance = {
  id: string;
  employeeId: string;

  // Período actual (año de aniversario)
  periodStart: string;            // Fecha de inicio del período (aniversario)
  periodEnd: string;              // Fecha de fin del período

  // Días según antigüedad (Reforma 2023)
  daysEntitled: number;           // Días que le corresponden según antigüedad
  yearsOfService: number;         // Años de antigüedad al inicio del período

  // Control de saldo
  daysTaken: number;              // Días ya tomados
  daysScheduled: number;          // Días programados (aprobados pero no tomados)
  daysAvailable: number;          // Días disponibles (entitled - taken - scheduled)
  daysCarriedOver: number;        // Días arrastrados del período anterior
  daysPending: number;            // Días en solicitudes pendientes de aprobación
  maxCarryOverDays?: number;      // Días máximos a arrastrar (snapshot)

  // Prima vacacional
  vacationPremiumPaid: boolean;   // Si ya se pagó la prima vacacional
  vacationPremiumDate?: string;   // Fecha de pago de prima

  // Historial de movimientos
  movements: VacationMovement[];

  // Auditoría
  lastUpdated: string;
  createdAt: string;
};

/**
 * Movimiento de Vacaciones
 */
export type VacationMovement = {
  id: string;
  date: string;
  type: 'taken' | 'scheduled' | 'cancelled' | 'reset' | 'adjustment';
  days: number;                   // Días (positivo o negativo)
  description: string;
  incidenceId?: string;           // Referencia a la incidencia
  approvedById?: string;
};

// =========================================================================
// SISTEMA DE RETARDOS
// =========================================================================

/**
 * Tipo de retardo
 */
export type TardinessType = 'entry' | 'exit' | 'break';

/**
 * Registro de Retardo
 */
export type TardinessRecord = {
  id: string;
  employeeId: string;
  date: string;
  attendanceRecordId: string;     // Referencia al registro de asistencia

  // Detalle del retardo
  type: TardinessType;
  scheduledTime: string;          // Hora programada (HH:mm)
  actualTime: string;             // Hora real (HH:mm)
  minutesLate: number;            // Minutos de retardo

  // Estado de justificación
  isJustified: boolean;           // Si fue justificado (legacy, usar justificationStatus)
  justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
  justificationType?: JustificationType; // Tipo de justificación seleccionado
  justificationReason?: string;   // Razón de justificación o comentario
  justifiedById?: string;         // Quién justificó
  justifiedAt?: string;           // Cuándo se justificó
  linkedIncidenceId?: string;     // Si fue auto-justificado por una incidencia previa
  compensatedToHourBank?: boolean; // Si se envió a bolsa de horas
  importBatchId?: string;         // Link al batch de importación que creó este registro

  // Acumulación
  periodStartDate: string;        // Inicio del período de 30 días
  tardinessCountInPeriod: number; // Contador de retardos en el período
  tardinessCountInWeek: number;   // Contador de retardos en la semana

  // Sanción aplicada
  sanctionApplied: boolean;
  sanctionType?: 'suspension_1day' | 'warning';
  sanctionDate?: string;
  sanctionResetById?: string;     // Si se hizo reset de sanción

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Configuración de Retardos por Ubicación
 */
export type TardinessPolicy = {
  id: string;
  locationId?: string;            // null = política global

  // Tolerancia
  toleranceMinutes: number;       // Minutos de tolerancia (default: 10)

  // Reglas de acumulación
  maxTardinessPerMonth: number;   // Máximo retardos en 30 días antes de sanción (default: 3)
  maxTardinessPerWeek: number;    // Máximo retardos en 1 semana antes de sanción (default: 2)

  // Sanciones
  sanctionType: 'suspension_1day' | 'warning' | 'deduction';
  autoApplySanction: boolean;     // Aplicar sanción automáticamente

  // Período de acumulación
  accumulationPeriodDays: number; // Días del período de acumulación (default: 30)

  // Estado
  isActive: boolean;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

// =========================================================================
// APROBACIÓN DE HORAS EXTRAS
// =========================================================================

/**
 * Solicitud de Horas Extra
 */
export type OvertimeRequest = {
  id: string;
  employeeId: string;
  employeeName?: string;

  // Detalles de la solicitud
  date: string;                   // Fecha de las horas extras
  hoursRequested: number;         // Horas solicitadas
  reason: string;                 // Razón de las horas extras

  // Flujo de aprobación
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  hoursApproved?: number;         // Horas aprobadas (puede ser menor a solicitadas)
  doubleHours?: number;           // Horas dobles calculadas
  tripleHours?: number;           // Horas triples calculadas

  // Aprobador
  approverLevel: 1 | 2;           // Nivel 1 = jefe directo, Nivel 2 = siguiente nivel
  requestedToId: string;          // A quién se solicitó aprobación
  requestedToName?: string;
  approvedById?: string;
  approvedByName?: string;
  approvedAt?: string;
  rejectionReason?: string;

  // Vinculación con asistencia
  attendanceRecordId?: string;    // Referencia al registro de asistencia

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

// =========================================================================
// BLOQUEO DE PERÍODOS DE NÓMINA
// =========================================================================

/**
 * Bloqueo de Período de Nómina
 * Una vez descargada la pre-nómina, se bloquea el período
 */
export type PayrollPeriodLock = {
  id: string;

  // Período bloqueado
  periodStart: string;
  periodEnd: string;
  periodType: 'weekly' | 'biweekly' | 'monthly';

  // Ubicación (opcional, puede ser global)
  locationId?: string;

  // Estado del bloqueo
  isLocked: boolean;
  lockedAt: string;
  lockedById: string;
  lockedByName?: string;

  // Referencia a pre-nómina exportada
  prenominaExportId?: string;
  exportFormat?: 'nomipaq' | 'excel' | 'json';

  // Desbloqueo (solo Admin)
  unlockedAt?: string;
  unlockedById?: string;
  unlockReason?: string;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Alerta de Duplicidad de Período
 */
export type PeriodDuplicateAlert = {
  periodStart: string;
  periodEnd: string;
  existingLockId: string;
  message: string;
};

// =========================================================================
// NOMENCLATURA DE INCIDENCIAS PARA PRE-NÓMINA
// =========================================================================

/**
 * Códigos de incidencias para la pre-nómina
 * Según el informe de requerimientos
 */
export type IncidenceCode =
  | 'FINJ'  // Falta Injustificada
  | 'ASI'   // Asistencia
  | 'INC'   // Incapacidad
  | 'PSS'   // Permiso Sin goce de Sueldo
  | 'PCS'   // Permiso Con goce de Sueldo
  | 'DFT'   // Día Festivo Trabajado
  | 'DD'    // Día de Descanso
  | 'DL'    // Descanso Laborado
  | 'HE2'   // Horas Extras Dobles
  | 'HE3'   // Horas Extras Triples
  | 'RET'   // Retardo
  | 'PD'    // Prima Dominical
  | 'VAC'   // Vacaciones
  | 'PV'    // Prima Vacacional
  | 'BJ'    // Baja
  | 'AE';   // Abandono de Empleo

/**
 * Mapeo de tipos de incidencia a códigos
 */
export const INCIDENCE_CODE_MAP: Record<IncidenceType | 'attendance' | 'rest_day' | 'worked_rest_day' | 'holiday_worked' | 'tardiness' | 'termination', IncidenceCode> = {
  vacation: 'VAC',
  sick_leave: 'INC',
  personal_leave: 'PCS',
  maternity: 'INC',
  paternity: 'PCS',
  bereavement: 'PCS',
  marriage: 'PCS',
  adoption: 'PCS',
  civic_duty: 'PCS',
  half_day_family: 'PCS',
  unpaid_leave: 'PSS',
  unjustified_absence: 'FINJ',
  abandono_empleo: 'AE',
  attendance: 'ASI',
  rest_day: 'DD',
  worked_rest_day: 'DL',
  holiday_worked: 'DFT',
  tardiness: 'RET',
  termination: 'BJ'
};

// =========================================================================
// REGISTRO DIARIO DE PRE-NÓMINA (DESGLOSE)
// =========================================================================

/**
 * Entrada diaria para la tabla de pre-nómina
 */
export type DailyPrenominaEntry = {
  date: string;                   // Fecha YYYY-MM-DD
  dayOfWeek: number;              // 0-6
  dayName: string;                // LUN, MAR, etc.

  // Código principal del día
  primaryCode: IncidenceCode;

  // Códigos adicionales (ej: DL, PD para domingo trabajado)
  additionalCodes?: IncidenceCode[];

  // Horas extras del día
  overtimeDoubleHours?: number;
  overtimeTripleHours?: number;

  // Indicadores
  isHoliday: boolean;
  isRestDay: boolean;
  isSunday: boolean;
  hasTardiness: boolean;

  // Texto para celda (ej: "3HE2, 0.5HE3" o "DL, PD")
  cellDisplay: string;
};

/**
 * Registro detallado de Pre-Nómina con desglose diario
 * Extiende PrenominaRecord con información adicional
 */
export type DetailedPrenominaRecord = PrenominaRecord & {
  // Identificación completa
  locationName?: string;
  locationCode?: string;
  departmentName?: string;
  positionName?: string;

  // Desglose diario
  dailyEntries: DailyPrenominaEntry[];

  // Acumulados numéricos (columnas finales)
  totalDaysWorked: number;
  totalRestDaysWorked: number;    // Días de descanso laborados (DL)
  totalSundayPremiumDays: number; // Días con prima dominical (PD)
  totalHolidaysWorked: number;    // Días festivos trabajados (DFT)
  totalTardiness: number;         // Total de retardos (RET)
  totalAbsences: number;          // Total de faltas (FINJ)
  totalVacationDays: number;      // Total vacaciones (VAC)
  totalSickLeaveDays: number;     // Total incapacidades (INC)

  // Horas extras acumuladas
  totalOvertimeDoubleHours: number;
  totalOvertimeTripleHours: number;

  // Prima vacacional (si es aniversario en el período)
  vacationPremiumAnniversary: boolean;
  vacationPremiumDays?: number;

  // Semáforo de bono
  bonusEligible: boolean;         // Verde = elegible, Rojo = no elegible
  bonusIneligibleReason?: string; // Razón de no elegibilidad
};

// =========================================================================
// EXTENSIÓN DE EMPLOYEE CON NUEVOS CAMPOS
// =========================================================================

/**
 * Empleado con campos extendidos para el nuevo sistema
 */
export type ExtendedEmployee = Employee & {
  // Ubicación y puesto
  locationId?: string;            // ID de la ubicación
  positionId?: string;            // ID del puesto

  // Turno personalizado
  customShiftId?: string;         // ID del turno personalizado

  // Días de descanso específicos (override del turno)
  customRestDays?: number[];      // ej: [0, 6] para Dom y Sab

  // Jefe directo
  directManagerId?: string;       // ID del jefe directo
  secondLevelManagerId?: string;  // ID del jefe de segundo nivel

  // Control de vacaciones
  currentVacationBalanceId?: string;

  // Último retardo y contador
  lastTardinessDate?: string;
  tardinessCountCurrent: number;  // Contador actual de retardos

  // Fecha de baja (para pre-nómina)
  terminationDate?: string;
  terminationReason?: string;
  showInPrenomina: boolean;       // Si mostrar en pre-nómina (false si baja completa)
};

// =========================================================================
// GESTIÓN DE EQUIPO - TIPOS PARA JEFES
// =========================================================================

/**
 * Salida Temprana
 * Registro de salida anticipada del empleado
 */
export type EarlyDeparture = {
  id: string;
  employeeId: string;
  employeeName?: string;
  date: string;                     // YYYY-MM-DD
  scheduledEndTime?: string;         // Hora programada de salida (HH:mm)
  actualEndTime?: string;            // Hora real de salida (HH:mm)
  scheduledTime?: string;
  actualTime?: string;
  minutesEarly: number;             // Minutos antes de lo programado

  // Estado de justificación
  isJustified: boolean;             // Legacy, usar justificationStatus
  justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
  justificationType?: JustificationType; // Tipo de justificación seleccionado
  justificationReason?: string;
  justifiedById?: string;
  justifiedByName?: string;
  importBatchId?: string; // Link to the import batch that created this record
  linkedIncidenceId?: string;       // Si fue auto-justificado
  compensatedToHourBank?: boolean;  // Si se envió a bolsa de horas

  // Regla de 6 horas
  checkOut: string;             // ISO Date
  hoursWorked: number;            // Horas trabajadas (HH.dd)
  notes?: string;

  // Regla de 6 horas
  isAbsence?: boolean;              // True si trabajó < 6 horas (se considera falta)
  severity?: 'minor' | 'major' | 'critical';  // Severidad de la salida temprana

  // Referencias
  attendanceRecordId?: string;      // Referencia al registro de asistencia

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Asignación de Turno (temporal o permanente)
 * Permite al jefe asignar un turno diferente a un empleado
 */
export type ShiftAssignment = {
  id: string;
  employeeId: string;
  employeeName?: string;

  // Turnos
  originalShiftId?: string;         // Turno original (para restaurar)
  originalShiftName?: string;
  newShiftId: string;               // Nuevo turno asignado
  newShiftName?: string;

  // Tipo de asignación
  assignmentType: 'temporary' | 'permanent';
  startDate: string;                // Fecha de inicio
  endDate?: string;                 // Fecha fin (solo si es temporal)
  reason: string;                   // Razón del cambio

  // Estado
  status: 'active' | 'completed' | 'cancelled';

  // Aprobación
  assignedById: string;
  assignedByName?: string;
  assignedAt: string;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Cambio de Horario (temporal o permanente)
 * Permite al jefe modificar las horas de entrada/salida de un empleado
 */
export type ScheduleChange = {
  id: string;
  employeeId: string;
  employeeName?: string;

  // Horario original
  originalStartTime: string;        // HH:mm
  originalEndTime: string;          // HH:mm

  // Nuevo horario
  newStartTime: string;             // HH:mm
  newEndTime: string;               // HH:mm

  // Tipo de cambio
  changeType: 'temporary' | 'permanent';
  effectiveDate: string;            // Fecha de inicio del cambio
  endDate?: string;                 // Fecha fin (solo si es temporal)
  reason: string;                   // Razón del cambio

  // Estado
  status: 'active' | 'completed' | 'cancelled';

  // Aprobación
  assignedById: string;
  assignedByName?: string;
  assignedAt: string;

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Estadísticas de equipo por día
 * Para la vista diaria del panel del jefe
 */
export type TeamDailyStats = {
  date: string;                     // YYYY-MM-DD
  employeeId: string;
  employeeName: string;

  // Eventos del día
  tardinessMinutes?: number;        // Minutos de retardo
  tardinessJustified?: boolean;
  earlyDepartureMinutes?: number;   // Minutos de salida temprana
  earlyDepartureJustified?: boolean;
  overtimeHoursRequested?: number;  // HE solicitadas
  overtimeHoursApproved?: number;   // HE aprobadas
  overtimeStatus?: 'pending' | 'approved' | 'rejected' | 'partial';

  // Incidencias
  hasIncidence: boolean;
  incidenceType?: IncidenceType;
  incidenceStatus?: IncidenceStatus;

  // Marcajes faltantes
  hasMissingPunch?: boolean;
  missingPunchType?: 'entry' | 'exit' | 'both';
  missingPunchJustified?: boolean;
};

/**
 * Resumen mensual de empleado
 * Para la vista de estadísticas del equipo
 */
export type EmployeeMonthlyStats = {
  employeeId: string;
  employeeName: string;
  positionTitle?: string;
  avatarUrl?: string;

  // Período
  month?: number;                    // 1-12
  year?: number;

  // Contadores
  totalTardiness: number;           // Total retardos del mes
  justifiedTardiness: number;       // Retardos justificados
  unjustifiedTardiness: number;     // Retardos sin justificar
  totalEarlyDepartures: number;     // Total salidas tempranas
  justifiedEarlyDepartures: number; // Salidas tempranas justificadas

  // Horas extras
  overtimeHoursRequested: number;   // HE solicitadas
  overtimeHoursApproved: number;    // HE aprobadas
  overtimeHoursRejected: number;    // HE rechazadas
  overtimeRequestsPending: number;  // Solicitudes pendientes

  // Incidencias
  pendingIncidences: number;        // Incidencias pendientes de aprobación
  approvedIncidences: number;       // Incidencias aprobadas
};

// -------------------------------------------------------------------------
// Notification Types
// -------------------------------------------------------------------------

export type NotificationType =
  | 'overtime_approved'
  | 'overtime_rejected'
  | 'overtime_partial'
  | 'tardiness_justified'
  | 'early_departure_justified'
  | 'shift_assigned'
  | 'schedule_changed'
  | 'incidence_approved'
  | 'incidence_rejected'
  | 'general';

export type Notification = {
  id: string;
  userId: string;                   // Usuario que recibe la notificación
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: string;

  // Metadatos opcionales para navegación
  relatedId?: string;               // ID del registro relacionado (incidencia, OT, etc.)
  relatedType?: 'incidence' | 'overtime' | 'tardiness' | 'early_departure' | 'shift' | 'schedule';
  actionUrl?: string;               // URL para navegar al hacer click
  link?: string;                    // Alias for actionUrl or direct link

  // Quién generó la notificación
  createdById?: string;
  createdByName?: string;
};

// =========================================================================
// BOLSA DE HORAS Y TIPOS DE JUSTIFICACIÓN
// =========================================================================

/**
 * Estado de justificación para incidencias (retardos/salidas)
 */
export type IncidenceJustificationStatus =
  | 'pending'           // Pendiente de revisión
  | 'justified'         // Justificado por el jefe
  | 'unjustified'       // Marcado como injustificado
  | 'compensated'       // Repuesto (enviado a bolsa de horas)
  | 'auto_justified';   // Auto-justificado por solicitud previa aprobada

/**
 * Tipos de justificación preconfigurados
 */
export type JustificationType =
  | 'medical_appointment'       // Cita médica
  | 'family_emergency'          // Emergencia familiar
  | 'traffic_incident'          // Incidente de tráfico
  | 'public_transport_delay'    // Retraso transporte público
  | 'weather_conditions'        // Condiciones climáticas
  | 'official_business'         // Asuntos oficiales
  | 'manager_authorization'     // Autorización del jefe
  | 'unjustified'               // Injustificado (marcado explícitamente)
  | 'other';                    // Otros (requiere comentario)

/**
 * Labels para tipos de justificación (uso en UI)
 */
export const JUSTIFICATION_TYPE_LABELS: Record<JustificationType, string> = {
  medical_appointment: 'Cita médica',
  family_emergency: 'Emergencia familiar',
  traffic_incident: 'Incidente de tráfico',
  public_transport_delay: 'Retraso en transporte público',
  weather_conditions: 'Condiciones climáticas',
  official_business: 'Asuntos oficiales',
  manager_authorization: 'Autorización del jefe',
  unjustified: 'Injustificado',
  other: 'Otros',
};

/**
 * Bolsa de Horas del Empleado
 * Registra la deuda/crédito de tiempo del empleado
 */
export type HourBank = {
  id: string;
  employeeId: string;
  employeeName?: string;

  // Saldo actual (en minutos)
  // Positivo = empleado debe tiempo a la empresa
  // Negativo = empresa debe tiempo al empleado (crédito)
  balanceMinutes: number;

  // Estadísticas
  totalDebtAccumulated: number;   // Total acumulado de deuda
  totalCompensated: number;       // Total compensado con HE
  lastMovementDate?: string;      // Última actualización

  // Auditoría
  createdAt: string;
  updatedAt: string;
};

/**
 * Movimiento en la Bolsa de Horas
 */
export type HourBankMovement = {
  id: string;
  hourBankId: string;
  employeeId: string;
  date: string;                   // Fecha del movimiento

  // Tipo de movimiento
  type:
  | 'tardiness'                 // Retardo agregado
  | 'early_departure'           // Salida temprana agregada
  | 'overtime_compensation'     // Compensado con horas extras
  | 'manual_adjustment';        // Ajuste manual

  // Cantidad (en minutos)
  // Positivo = agrega deuda
  // Negativo = reduce deuda (compensación)
  minutes: number;

  // Referencias
  reason: string;
  sourceRecordId?: string;        // ID del retardo/salida/OT origen
  sourceRecordType?: 'tardiness' | 'early_departure' | 'overtime';

  // Auditoría
  createdById: string;
  createdByName?: string;
  createdAt: string;
};

/**
 * Resultado del cálculo de horas extras según LFT
 */
export type OvertimeCalculation = {
  // Entrada
  rawOvertimeMinutes: number;     // Minutos extras trabajados (antes de compensación)
  hourBankDebt: number;           // Deuda en bolsa de horas

  // Compensación
  minutesCompensated: number;     // Minutos usados para compensar deuda
  remainingDebt: number;          // Deuda restante después de compensar

  // Horas extras netas
  netOvertimeMinutes: number;     // Minutos extras después de compensar

  // Desglose LFT
  doubleHoursMinutes: number;     // Minutos a pagar dobles (primeras 9 HE semanales)
  tripleHoursMinutes: number;     // Minutos a pagar triples (a partir de hora 10)

  // Valores monetarios (si se proporciona tarifa)
  doubleHoursAmount?: number;
  tripleHoursAmount?: number;
  totalAmount?: number;

  // Acumulado semanal (para saber cuántas HE lleva en la semana)
  weeklyOvertimeAccumulated: number;
};


