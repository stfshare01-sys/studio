import type { User, Template, Request } from './types';
import { PlaceHolderImages } from './placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const users: User[] = [
  { id: 'user-1', name: 'Ava Johnson', avatarUrl: findImage('user-1'), email: 'ava.johnson@example.com', skills: ['React', 'Node.js', 'Análisis Financiero'], currentWorkload: 3 },
  { id: 'user-2', name: 'Liam Smith', avatarUrl: findImage('user-2'), email: 'liam.smith@example.com', skills: ['Python', 'Ciencia de Datos', 'Gestión de Proyectos'], currentWorkload: 2 },
  { id: 'user-3', name: 'Noah Brown', avatarUrl: findImage('user-3'), email: 'noah.brown@example.com', skills: ['Java', 'Spring Boot', 'Arquitectura de Sistemas'], currentWorkload: 5 },
  { id: 'user-4', name: 'Olivia Davis', avatarUrl: findImage('user-4'), email: 'olivia.davis@example.com', skills: ['Go', 'Kubernetes', 'DevOps'], currentWorkload: 1 },
  { id: 'user-5', name: 'Emma Wilson', avatarUrl: findImage('user-5'), email: 'emma.wilson@example.com', skills: ['Recursos Humanos', 'Reclutamiento', 'Relaciones con Empleados'], currentWorkload: 4 },
];

export const templates: Template[] = [
  {
    id: 'template-1',
    name: 'Solicitud de Permiso para Empleados',
    description: 'Un formulario estándar para que los empleados soliciten tiempo libre.',
    fields: [
      { id: 'field-1', label: 'Fecha de Inicio', type: 'date' },
      { id: 'field-2', label: 'Fecha de Fin', type: 'date' },
      { id: 'field-3', label: 'Motivo del Permiso', type: 'textarea' },
    ],
    steps: [
      { id: 'step-1', name: 'Aprobación del Gerente' },
      { id: 'step-2', name: 'Confirmación de RRHH' },
      { id: 'step-3', name: 'Actualización de Nómina' },
    ],
  },
  {
    id: 'template-2',
    name: 'Orden de Compra',
    description: 'Enviar una solicitud para comprar bienes o servicios.',
    fields: [
      { id: 'field-4', label: 'Descripción del Artículo', type: 'text' },
      { id: 'field-5', label: 'Cantidad', type: 'text' },
      { id: 'field-6', label: 'Costo Estimado', type: 'text' },
      { id: 'field-7', label: 'Justificación', type: 'textarea' },
    ],
    steps: [
      { id: 'step-4', name: 'Aprobación del Jefe de Departamento' },
      { id: 'step-5', name: 'Revisión Financiera' },
      { id: 'step-6', name: 'Adquisición' },
    ],
  },
  {
    id: 'template-3',
    name: 'Ticket de Soporte de TI',
    description: 'Reportar un problema de TI y seguir su resolución.',
    fields: [
      { id: 'field-8', label: 'Categoría del Problema', type: 'text' },
      { id: 'field-9', label: 'Urgencia', type: 'text' },
      { id: 'field-10', label: 'Descripción Detallada', type: 'textarea' },
    ],
    steps: [
      { id: 'step-7', name: 'Clasificación' },
      { id: 'step-8', name: 'Asignar a Técnico' },
      { id: 'step-9', name: 'Resolución' },
      { id: 'step-10', name: 'Confirmación del Usuario' },
    ],
  },
];

export const requests: Request[] = [
  {
    id: 'req-001',
    title: 'Solicitud de Vacaciones - T3',
    templateId: 'template-1',
    status: 'In Progress',
    createdAt: '2024-07-15T09:00:00Z',
    updatedAt: '2024-07-16T11:30:00Z',
    submittedBy: users[0],
    steps: [
      { id: 's1-1', name: 'Aprobación del Gerente', status: 'Completed', assignee: users[1], completedAt: '2024-07-16T11:30:00Z' },
      { id: 's1-2', name: 'Confirmación de RRHH', status: 'Active', assignee: users[4], completedAt: null },
      { id: 's1-3', name: 'Actualización de Nómina', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Fecha de Inicio': '2024-08-01',
      'Fecha de Fin': '2024-08-10',
      'Motivo del Permiso': 'Vacaciones familiares al Gran Cañón.',
    },
    documents: [{ name: 'Itinerario-Viaje.pdf', url: '#' }],
  },
  {
    id: 'req-002',
    title: 'Nuevos Portátiles para el Equipo de Diseño',
    templateId: 'template-2',
    status: 'In Progress',
    createdAt: '2024-07-18T14:20:00Z',
    updatedAt: '2024-07-18T14:20:00Z',
    submittedBy: users[3],
    steps: [
      { id: 's2-1', name: 'Aprobación del Jefe de Departamento', status: 'Active', assignee: users[1], completedAt: null },
      { id: 's2-2', name: 'Revisión Financiera', status: 'Pending', assignee: null, completedAt: null },
      { id: 's2-3', name: 'Adquisición', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Descripción del Artículo': 'MacBook Pro de 16 pulgadas M3',
      'Cantidad': '5',
      'Costo Estimado': '$12,500',
      'Justificación': 'Actualización para el equipo de diseño para manejar archivos de proyectos más grandes y renderizado más rápido.',
    },
    documents: [],
  },
  {
    id: 'req-003',
    title: 'Servidor de Correo Caído',
    templateId: 'template-3',
    status: 'Completed',
    createdAt: '2024-07-10T08:15:00Z',
    updatedAt: '2024-07-10T15:00:00Z',
    submittedBy: users[2],
    steps: [
      { id: 's3-1', name: 'Clasificación', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:30:00Z' },
      { id: 's3-2', name: 'Asignar a Técnico', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:35:00Z' },
      { id: 's3-3', name: 'Resolución', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T14:45:00Z' },
      { id: 's3-4', name: 'Confirmación del Usuario', status: 'Completed', assignee: users[2], completedAt: '2024-07-10T15:00:00Z' },
    ],
    formData: {
      'Categoría del Problema': 'Correo Electrónico',
      'Urgencia': 'Alta',
      'Descripción Detallada': 'Nadie en la empresa puede enviar o recibir correos electrónicos. Esta es una interrupción crítica.',
    },
    documents: [{ name: 'captura_de_pantalla_error.png', url: '#' }],
  },
  {
    id: 'req-004',
    title: 'Compra de créditos de API de IA',
    templateId: 'template-2',
    status: 'In Progress',
    createdAt: '2024-07-20T10:00:00Z',
    updatedAt: '2024-07-20T10:00:00Z',
    submittedBy: users[1],
    steps: [
      { id: 's4-1', name: 'Aprobación del Jefe de Departamento', status: 'Completed', assignee: users[3], completedAt: '2024-07-21T09:00:00Z' },
      { id: 's4-2', name: 'Revisión Financiera', status: 'Active', assignee: null, completedAt: null },
      { id: 's4-3', name: 'Adquisición', status: 'Pending', assignee: null, completedAt: null },
    ],
    formData: {
      'Descripción del Artículo': 'Créditos de API de Genkit',
      'Cantidad': '1',
      'Costo Estimado': '$5000',
      'Justificación': 'Créditos necesarios para desarrollar la nueva función de asignación inteligente de tareas.',
    },
    documents: [],
  },
];
