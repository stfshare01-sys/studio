import type { User, Template, Request } from './types';
import { PlaceHolderImages } from './placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const users: User[] = [
  { id: 'user-1', name: 'Ava Johnson', avatarUrl: findImage('user-1'), email: 'ava.johnson@example.com', skills: ['React', 'Node.js', 'Financial Analysis'], currentWorkload: 3 },
  { id: 'user-2', name: 'Liam Smith', avatarUrl: findImage('user-2'), email: 'liam.smith@example.com', skills: ['Python', 'Data Science', 'Project Management'], currentWorkload: 2 },
  { id: 'user-3', name: 'Noah Brown', avatarUrl: findImage('user-3'), email: 'noah.brown@example.com', skills: ['Java', 'Spring Boot', 'System Architecture'], currentWorkload: 5 },
  { id: 'user-4', name: 'Olivia Davis', avatarUrl: findImage('user-4'), email: 'olivia.davis@example.com', skills: ['Go', 'Kubernetes', 'DevOps'], currentWorkload: 1 },
  { id: 'user-5', name: 'Emma Wilson', avatarUrl: findImage('user-5'), email: 'emma.wilson@example.com', skills: ['Human Resources', 'Recruiting', 'Employee Relations'], currentWorkload: 4 },
];

export const templates: Template[] = [
  {
    id: 'template-1',
    name: 'Employee Leave Request',
    description: 'A standard form for employees to request time off.',
    fields: [
      { id: 'field-1', label: 'Start Date', type: 'date' },
      { id: 'field-2', label: 'End Date', type: 'date' },
      { id: 'field-3', label: 'Reason for Leave', type: 'textarea' },
    ],
    steps: [
      { id: 'step-1', name: 'Manager Approval' },
      { id: 'step-2', name: 'HR Confirmation' },
      { id: 'step-3', name: 'Payroll Update' },
    ],
  },
  {
    id: 'template-2',
    name: 'Purchase Order',
    description: 'Submit a request to purchase goods or services.',
    fields: [
      { id: 'field-4', label: 'Item Description', type: 'text' },
      { id: 'field-5', label: 'Quantity', type: 'text' },
      { id: 'field-6', label: 'Estimated Cost', type: 'text' },
      { id: 'field-7', label: 'Justification', type: 'textarea' },
    ],
    steps: [
      { id: 'step-4', name: 'Department Head Approval' },
      { id: 'step-5', name: 'Finance Review' },
      { id: 'step-6', name: 'Procurement' },
    ],
  },
  {
    id: 'template-3',
    name: 'IT Support Ticket',
    description: 'Report an IT issue and track its resolution.',
    fields: [
      { id: 'field-8', label: 'Issue Category', type: 'text' },
      { id: 'field-9', label: 'Urgency', type: 'text' },
      { id: 'field-10', label: 'Detailed Description', type: 'textarea' },
    ],
    steps: [
      { id: 'step-7', name: 'Triage' },
      { id: 'step-8', name: 'Assign to Technician' },
      { id: 'step-9', name: 'Resolution' },
      { id: 'step-10', name: 'User Confirmation' },
    ],
  },
];

export const requests: Request[] = [
  {
    id: 'req-001',
    title: 'Vacation Request - Q3',
    templateId: 'template-1',
    status: 'In Progress',
    createdAt: '2024-07-15T09:00:00Z',
    updatedAt: '2024-07-16T11:30:00Z',
    submittedBy: users[0],
    steps: [
      { id: 's1-1', name: 'Manager Approval', status: 'Completed', assignee: users[1], completedAt: '2024-07-16T11:30:00Z' },
      { id: 's1-2', name: 'HR Confirmation', status: 'Active', assignee: users[4], completedAt: null },
      { id: 's1-3', name: 'Payroll Update', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Start Date': '2024-08-01',
      'End Date': '2024-08-10',
      'Reason for Leave': 'Family vacation to the Grand Canyon.',
    },
    documents: [{ name: 'Travel-Itinerary.pdf', url: '#' }],
  },
  {
    id: 'req-002',
    title: 'New Laptops for Design Team',
    templateId: 'template-2',
    status: 'In Progress',
    createdAt: '2024-07-18T14:20:00Z',
    updatedAt: '2024-07-18T14:20:00Z',
    submittedBy: users[3],
    steps: [
      { id: 's2-1', name: 'Department Head Approval', status: 'Active', assignee: users[1], completedAt: null },
      { id: 's2-2', name: 'Finance Review', status: 'Pending', assignee: null, completedAt: null },
      { id: 's2-3', name: 'Procurement', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Item Description': '16-inch MacBook Pro M3',
      'Quantity': '5',
      'Estimated Cost': '$12,500',
      'Justification': 'Upgrade for design team to handle larger project files and faster rendering.',
    },
    documents: [],
  },
  {
    id: 'req-003',
    title: 'Email Server Down',
    templateId: 'template-3',
    status: 'Completed',
    createdAt: '2024-07-10T08:15:00Z',
    updatedAt: '2024-07-10T15:00:00Z',
    submittedBy: users[2],
    steps: [
      { id: 's3-1', name: 'Triage', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:30:00Z' },
      { id: 's3-2', name: 'Assign to Technician', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:35:00Z' },
      { id: 's3-3', name: 'Resolution', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T14:45:00Z' },
      { id: 's3-4', name: 'User Confirmation', status: 'Completed', assignee: users[2], completedAt: '2024-07-10T15:00:00Z' },
    ],
    formData: {
      'Issue Category': 'Email',
      'Urgency': 'High',
      'Detailed Description': 'No one in the company can send or receive emails. This is a critical outage.',
    },
    documents: [{ name: 'error_screenshot.png', url: '#' }],
  },
  {
    id: 'req-004',
    title: 'Purchase of AI API credits',
    templateId: 'template-2',
    status: 'In Progress',
    createdAt: '2024-07-20T10:00:00Z',
    updatedAt: '2024-07-20T10:00:00Z',
    submittedBy: users[1],
    steps: [
      { id: 's4-1', name: 'Department Head Approval', status: 'Completed', assignee: users[3], completedAt: '2024-07-21T09:00:00Z' },
      { id: 's4-2', name: 'Finance Review', status: 'Active', assignee: null, completedAt: null },
      { id: 's4-3', name: 'Procurement', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Item Description': 'Genkit API credits',
      'Quantity': '1',
      'Estimated Cost': '$5000',
      'Justification': 'Credits needed for developing the new intelligent task assignment feature.',
    },
    documents: [],
  },
];
