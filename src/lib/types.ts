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

export type WorkflowStepData = {
  id: string;
  name: string;
  status: 'Completed' | 'Pending' | 'Active';
  assigneeId: string | null;
  completedAt: string | null;
};

export type Request = {
  id: string;
  title: string;
  templateId: string;
  status: 'In Progress' | 'Completed' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  submittedBy: string; // User ID
  steps: WorkflowStepData[];
  formData: Record<string, any>;
  documents: { name: string; url: string }[];
  template?: Template; // Denormalized template data
};

export type FormField = {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'date' | 'number';
};

export type WorkflowStep = {
  id: string;
  name: string;
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
  steps: WorkflowStep[];
  rules: Rule[];
};


// Enriched types for UI
export type EnrichedWorkflowStep = Omit<WorkflowStepData, 'assigneeId'> & {
  assignee: User | null;
};

export type EnrichedRequest = Omit<Request, 'submittedBy' | 'steps'> & {
  submittedBy: User;
  steps: EnrichedWorkflowStep[];
};
