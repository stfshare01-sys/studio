



export type UserRole = 'Admin' | 'Member' | 'Designer';
export type UserStatus = 'active' | 'disabled';

export type User = {
  id: string;
  fullName: string;
  avatarUrl?: string;
  email: string;
  department: string;
  skills?: string[];
  currentWorkload?: number;
  role: UserRole;
  status: UserStatus;
  managerId?: string; // ID of the user's manager
};

// Represents a step within a template, before it becomes a live task
export type WorkflowStepType = 'task' | 'gateway-exclusive' | 'gateway-parallel' | 'gateway-inclusive' | 'timer';

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
export type IncidenceType = 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'unjustified_absence';
export type IncidenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type OnboardingPhase = 'day_0' | 'day_30' | 'day_60' | 'day_90' | 'completed';

/**
 * Expediente Digital del Empleado
 * Extiende el tipo User existente con datos laborales según LFT
 */
export type Employee = User & {
  // Datos fiscales y legales (LFT compliance)
  rfc_curp?: string;           // RFC con homoclave + CURP
  nss?: string;                // Número de Seguridad Social (IMSS)

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

  // Salario Diario Integrado (SDI)
  sdiBase: number;              // SDI calculado
  sdiFactor: number;            // Factor de integración (típicamente 1.0452 - 1.0493)

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

  // Fecha y hora
  date: string;                 // YYYY-MM-DD
  checkIn?: string;             // HH:mm:ss (hora de entrada)
  checkOut?: string;            // HH:mm:ss (hora de salida)

  // Cálculos automáticos
  hoursWorked: number;          // Total horas trabajadas
  regularHours: number;         // Horas dentro de jornada normal
  overtimeHours: number;        // Horas extra totales
  overtimeType?: 'double' | 'triple'; // Tipo según "Ley de los 9s"

  // Estado y validación
  isValid: boolean;             // Validación de jornada según turno
  validationNotes?: string;     // Notas de validación (ej: "Excede jornada diurna")

  // Incidencia relacionada (si aplica)
  linkedIncidenceId?: string;   // Si hay permiso/incapacidad que justifica

  // Lote de importación
  importBatchId: string;        // ID del lote de importación

  // Auditoría
  createdAt: string;
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
  employeeName?: string;        // Denormalizado
  employeeRfc?: string;         // Denormalizado para exportación

  // Período
  periodStart: string;          // Inicio del período (YYYY-MM-DD)
  periodEnd: string;            // Fin del período (YYYY-MM-DD)
  periodType: 'weekly' | 'biweekly' | 'monthly';

  // Percepciones
  salaryBase: number;           // Salario base del período
  daysWorked: number;           // Días trabajados

  // Horas extra (según "Ley de los 9s")
  overtimeDoubleHours: number;  // Horas dobles (primeras 9 semanales)
  overtimeDoubleAmount: number; // Monto horas dobles
  overtimeTripleHours: number;  // Horas triples (excedente de 9)
  overtimeTripleAmount: number; // Monto horas triples

  // Prima dominical (si aplica)
  sundayPremiumDays: number;
  sundayPremiumAmount: number;  // 25% adicional según Art. 71 LFT

  // Deducciones
  absenceDays: number;          // Días de falta
  absenceDeductions: number;    // Deducciones por faltas no justificadas

  // Incidencias del período
  vacationDaysTaken: number;
  sickLeaveDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;

  // Totales
  grossPay: number;             // Total percepciones
  totalDeductions: number;      // Total deducciones (sin ISR, solo prenómina)
  netPay: number;               // Neto a pagar

  // Salario bajo demanda (Liquidity)
  earnedWage: number;           // Salario neto generado disponible para retiro

  // Estado y exportación
  status: 'draft' | 'reviewed' | 'exported' | 'locked';
  reviewedById?: string;
  reviewedAt?: string;
  exportedAt?: string;
  exportedById?: string;
  exportFormat?: 'nomipaq' | 'excel' | 'json';

  // Contabilidad
  costCenter?: string;          // Centro de costos
  accountingPolicyId?: string;  // ID de póliza contable generada

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
  errorCount: number;           // Registros con error

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
  year: number;
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
  isObligatory: boolean;        // Descanso obligatorio según Art. 74 LFT
  premiumRequired: boolean;     // Requiere pago de prima (200%)
};

/**
 * Datos de Liquidación/Finiquito
 */
export type SettlementCalculation = {
  id: string;
  employeeId: string;
  employeeName?: string;

  // Tipo
  type: 'resignation' | 'dismissal_justified' | 'dismissal_unjustified' | 'mutual_agreement';
  terminationDate: string;

  // Cálculos
  proportionalVacation: number;
  proportionalVacationPremium: number;
  proportionalAguinaldo: number;
  salaryPending: number;

  // Indemnizaciones (según tipo)
  severancePay?: number;        // 3 meses de salario (Art. 48 LFT)
  seniorityPremium?: number;    // Prima de antigüedad (12 días/año, Art. 162 LFT)
  twentyDaysPerYear?: number;   // 20 días por año (despido injustificado)

  // Totales
  totalPerceptions: number;
  totalDeductions: number;
  netSettlement: number;

  // Estado
  status: 'preliminary' | 'final' | 'paid';
  paidAt?: string;

  // Auditoría
  calculatedAt: string;
  calculatedById: string;
};
