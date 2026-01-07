export type User = {
  id: string;
  name: string;
  avatarUrl: string;
  email: string;
  skills: string[];
  currentWorkload: number;
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
};

export type Template = {
  id: string;
  name: string;
  description: string;
  fields: { id: string; label: string; type: 'text' | 'textarea' | 'date' }[];
  steps: { id: string; name: string }[];
};


// Enriched types for UI
export type EnrichedWorkflowStep = Omit<WorkflowStepData, 'assigneeId'> & {
  assignee: User | null;
};

export type EnrichedRequest = Omit<Request, 'submittedBy' | 'steps'> & {
  submittedBy: User;
  steps: EnrichedWorkflowStep[];
};
