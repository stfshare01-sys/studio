import { User, UserRole } from "@/types/auth.types";

export type WorkflowStepType = 'task' | 'gateway-exclusive' | 'gateway-parallel' | 'gateway-inclusive' | 'gateway-parallel-join' | 'gateway-inclusive-join' | 'timer';
export type EscalationPolicy = {
      action: 'NOTIFY' | 'REASSIGN';
      targetRole?: string; // For REASSIGN action
      notify: ('assignee' | 'manager' | 'submitter')[];
    };
export type FieldStateOverride = {
      fieldId: string;
      readOnly?: boolean;
      required?: boolean;
      visible?: boolean;
      defaultValue?: any;
    };
export type TimerType = 'duration' | 'date';
export type TimerConfig = {
      type: TimerType;
      durationHours?: number;       // For duration type: wait X hours
      durationDays?: number;        // For duration type: wait X days
      targetDate?: string;          // For date type: wait until specific date
      targetDateFieldId?: string;   // For date type: get date from form field
    };
export type AssigneeSourceType = 'role' | 'field' | 'user' | 'submitter';
export type AssigneeSource = {
      type: AssigneeSourceType;
      role?: string;              // For role-based assignment
      fieldId?: string;           // For field-based assignment (email field)
      userId?: string;            // For direct user assignment
    };
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
export type FieldLayoutConfig = {
      fieldId: string;
      row: number;                // Row index (0-based)
      column: number;             // Column position (1-5)
      colspan?: number;           // Number of columns to span (1-5, default 5 = full width)
    };
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
export type FormFieldType = | 'text'
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
      | 'html';
export type TypographyConfig = {
      fontFamily?: 'default' | 'serif' | 'mono' | 'custom';
      customFont?: string;           // Custom font name if fontFamily is 'custom'
      fontSize?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl';
      fontWeight?: 'normal' | 'medium' | 'semibold' | 'bold';
      textColor?: string;            // Hex color or Tailwind class
      textAlign?: 'left' | 'center' | 'right';
      labelHidden?: boolean;         // Hide the field label
    };
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
      action: 'show' | 'hide';     // What happens when condition is met
    };
export type ValidationType = | 'required'
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
export type TableColumn = {
      id: string;
      name: string;
      type: 'text' | 'number' | 'date' | 'select';
      options?: string[]; // For select type columns
    };
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
export type RuleOperator = | '==' | '!=' // Generic equality
      | '>' | '<' | '>=' | '<=' // For numbers
      | 'contains' | 'not_contains' // For text
      | 'is' | 'is_not';
export type RuleCondition = {
      fieldId: string; // Can be a form field ID or a step ID for outcome-based rules
      operator: RuleOperator;
      value: any;
      type: 'form' | 'outcome'; // Distinguish between form data rules and workflow outcome rules
    };
export type RuleAction = | { type: 'REQUIRE_ADDITIONAL_STEP'; stepId: string; }
      | { type: 'ROUTE_TO_STEP'; stepId: string; }
      | { type: 'ASSIGN_USER'; stepId: string; userId: string; }
      | { type: 'SEND_NOTIFICATION'; target: 'submitter' | UserRole; message: string; }
      | { type: 'CHANGE_REQUEST_PRIORITY'; priority: RequestPriority; };
export type Rule = {
      id: string;
      condition: RuleCondition;
      action: RuleAction;
    };
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
export type TaskDuration = {
      name: string;
      duration: number;
    };
