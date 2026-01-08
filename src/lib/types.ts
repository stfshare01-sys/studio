export type UserRole = 'Admin' | 'Member';

export type User = {
  id: string;
  fullName: string;
  avatarUrl?: string;
  email: string;
  department: string;
  skills?: string[];
  currentWorkload?: number;
  role: UserRole;
};

// Represents a step within a template, before it becomes a live task
export type WorkflowStepDefinition = {
  id: string;
  name: string;
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
};

export type Request = {
  id: string;
  title: string;
  templateId: string;
  status: 'In Progress' | 'Completed' | 'Rejected';
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
  }[];
  formData: Record<string, any>;
  documents: { name: string; url: string }[];
  template?: Template; // Denormalized template data
};

export type FormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number';
};

export type RuleCondition = {
  fieldId: string;
  operator: '>' | '<' | '==' | '!=' | '>=' | '<=';
  value: any;
};

export type RuleAction = {
  type: 'REQUIRE_ADDITIONAL_STEP';
  stepId: string;
};

export type Rule = {
  condition: RuleCondition;
  action: RuleAction;
};

export type Template = {
  id: string;
  name: string;
  description: string;
  fields: FormField[];
  steps: WorkflowStepDefinition[]; // Changed from WorkflowStep
  rules: Rule[];
};

export type Document = {
    id: string;
    requestId: string;
    filename: string;
    contentType: string;
    size: number;
    uploadDate: string;
    url: string;
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
};

export type EnrichedComment = Omit<Comment, 'authorId'> & {
    author?: User;
};

// Analytics types
export type TaskDuration = {
  name: string;
  duration: number;
};
