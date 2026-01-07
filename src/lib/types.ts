export type User = {
  id: string;
  name: string;
  avatarUrl: string;
  email: string;
  skills: string[];
  currentWorkload: number;
};

export type WorkflowStep = {
  id: string;
  name: string;
  status: 'Completed' | 'Pending' | 'Active';
  assignee: User | null;
  completedAt: string | null;
};

export type Request = {
  id: string;
  title: string;
  templateId: string;
  status: 'In Progress' | 'Completed' | 'Rejected';
  createdAt: string;
  updatedAt: string;
  submittedBy: User;
  steps: WorkflowStep[];
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
