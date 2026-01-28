import { User, UserRole } from './core';

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

// -------------------------------------------------------------------------
// Form Field & Template Types
// -------------------------------------------------------------------------

export type FormFieldType =
    | 'text' | 'textarea' | 'number' | 'date' | 'select' | 'checkbox' | 'radio' | 'file'
    | 'table' | 'dynamic-select' | 'user-identity' | 'email' | 'html';

export type TypographyConfig = {
    fontFamily?: 'default' | 'serif' | 'mono' | 'custom';
    customFont?: string;
    fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
    fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
    textColor?: string;
    textAlign?: 'left' | 'center' | 'right';
    labelHidden?: boolean;
};

export type TableColumnType = 'text' | 'number' | 'date' | 'select' | 'formula';

export type TableColumnFormula = {
    type: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'CUSTOM';
    targetColumn?: string;
    expression?: string;
    referenceField?: string;
};

export type TableColumnDefinition = {
    id: string;
    name: string;
    type: TableColumnType;
    options?: string[];
    formula?: TableColumnFormula;
    width?: number;
    required?: boolean;
};

export type TableRowData = {
    _rowId: string;
    [columnId: string]: any;
};

export type DynamicSelectSourceType = 'master-list' | 'collection' | 'static';

export type CascadeFilter = {
    dependsOn: string;
    filterField: string;
    operator: '==' | 'contains' | 'in';
};

export type DynamicSelectSource = {
    type: DynamicSelectSourceType;
    masterListId?: string;
    collectionPath?: string;
    labelField: string;
    valueField: string;
    filterConfig?: CascadeFilter;
};

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
    action: 'show' | 'hide';
};

export type ValidationType = 'required' | 'min' | 'max' | 'minLength' | 'maxLength' | 'pattern' | 'email' | 'fileSize' | 'fileType';

export type ValidationRule = {
    type: ValidationType;
    value?: any;
    message?: string;
};

export type TableColumn = {
    id: string;
    name: string;
    type: 'text' | 'number' | 'date' | 'select';
    options?: string[];
};

export type FormField = {
    id: string;
    label: string;
    type: FormFieldType;
    options?: string[];
    tableColumns?: TableColumnDefinition[];
    minRows?: number;
    maxRows?: number;
    showSummaryRow?: boolean;
    dynamicSource?: DynamicSelectSource;
    userIdentityConfig?: UserIdentityConfig;
    validations?: ValidationRule[];
    placeholder?: string;
    helpText?: string;
    defaultValue?: any;
    readOnly?: boolean;
    required?: boolean;
    lookupConfig?: LookupConfig;
    typography?: TypographyConfig;
    htmlContent?: string;
};

export type RuleOperator =
    | '==' | '!=' | '>' | '<' | '>=' | '<=' | 'contains' | 'not_contains' | 'is' | 'is_not';

export type RuleCondition = {
    fieldId: string;
    operator: RuleOperator;
    value: any;
    type: 'form' | 'outcome';
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
    visibilityRules?: VisibilityRule[];
    fieldLayout?: FieldLayoutConfig[];
    defaultValueRules?: DefaultValueRule[];
    allowPublicSubmission?: boolean;
};

export type Comment = {
    id: string;
    requestId: string;
    authorId: string;
    text: string;
    createdAt: string;
};

// Enriched types for UI
export type EnrichedWorkflowStep = Omit<Request['steps'][0], 'assigneeId'> & {
    assignee: User | null;
};

export type EnrichedRequest = Omit<Request, 'submittedBy' | 'steps'> & {
    submittedBy: User;
    steps: EnrichedWorkflowStep[];
    template: Template;
};

export type EnrichedComment = Omit<Comment, 'authorId'> & {
    author?: User;
};

export type TaskDuration = {
    name: string;
    duration: number;
};
