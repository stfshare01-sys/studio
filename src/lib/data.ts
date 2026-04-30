import type { User } from '@/types/auth.types';
import { PlaceHolderImages } from './placeholder-images';

const findImage = (id: string) => PlaceHolderImages.find(img => img.id === id)?.imageUrl || '';

export const users: User[] = [
  { id: 'user-1', fullName: 'Ava Johnson', avatarUrl: findImage('user-1'), email: 'ava.johnson@example.com', skills: ['React', 'Node.js', 'Análisis Financiero'], currentWorkload: 3, role: 'Member', department: 'Tecnología', status: 'active' },
  { id: 'user-2', fullName: 'Liam Smith', avatarUrl: findImage('user-2'), email: 'liam.smith@example.com', skills: ['Python', 'Ciencia de Datos', 'Gestión de Proyectos'], currentWorkload: 2, role: 'Member', department: 'Datos', status: 'active' },
  { id: 'user-3', fullName: 'Noah Brown', avatarUrl: findImage('user-3'), email: 'noah.brown@example.com', skills: ['Java', 'Spring Boot', 'Arquitectura de Sistemas'], currentWorkload: 5, role: 'Admin', department: 'Tecnología', status: 'active' },
  { id: 'user-4', fullName: 'Olivia Davis', avatarUrl: findImage('user-4'), email: 'olivia.davis@example.com', skills: ['Go', 'Kubernetes', 'DevOps'], currentWorkload: 1, role: 'Member', department: 'Infraestructura', status: 'active' },
  { id: 'user-5', fullName: 'Emma Wilson', avatarUrl: findImage('user-5'), email: 'emma.wilson@example.com', skills: ['Recursos Humanos', 'Reclutamiento', 'Relaciones con Empleados'], currentWorkload: 4, role: 'Member', department: 'Recursos Humanos', status: 'active' },
];

export const requests = [
  {
    id: 'req-001',
    title: 'Solicitud de Vacaciones - T3',
    templateId: 'template-1',
    status: 'In Progress',
    createdAt: '2024-07-15T09:00:00Z',
    updatedAt: '2024-07-16T11:30:00Z',
    submittedBy: users[0],
    steps: [
      { id: 's1-1', name: 'Aprobación del Gerente', status: 'Completed', assignee: users[1], completedAt: '2024-07-16T11:30:00Z', taskId: 'task-1' },
      { id: 's1-2', name: 'Confirmación de RRHH', status: 'Active', assignee: users[4], completedAt: null, taskId: 'task-2' },
      { id: 's1-3', name: 'Actualización de Nómina', status: 'Pending', assignee: null, completedAt: null, taskId: 'task-3' },
    ],
    formData: {
      'Fecha de Inicio': '2024-08-01',
      'Fecha de Fin': '2024-08-10',
      'Motivo del Permiso': 'Vacaciones familiares al Gran Cañón.',
    },
    documents: [{ id: 'doc-1', requestId: 'req-001', filename: 'Itinerario-Viaje.pdf', contentType: 'application/pdf', size: 102400, uploadDate: '2024-07-15T09:00:00Z', url: '#', storagePath: 'documents/req-001/Itinerario-Viaje.pdf' }],
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
      { id: 's2-1', name: 'Aprobación del Jefe de Departamento', status: 'Active', assignee: users[1], completedAt: null, taskId: 'task-4' },
      { id: 's2-2', name: 'Revisión Financiera', status: 'Pending', assignee: null, completedAt: null, taskId: 'task-5' },
      { id: 's2-3', name: 'Adquisición', status: 'Pending', assignee: null, completedAt: null, taskId: 'task-6' },
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
    completedAt: '2024-07-10T15:00:00Z',
    submittedBy: users[2],
    steps: [
      { id: 's3-1', name: 'Clasificación', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:30:00Z', taskId: 'task-7' },
      { id: 's3-2', name: 'Asignar a Técnico', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T08:35:00Z', taskId: 'task-8' },
      { id: 's3-3', name: 'Resolución', status: 'Completed', assignee: users[3], completedAt: '2024-07-10T14:45:00Z', taskId: 'task-9' },
      { id: 's3-4', name: 'Confirmación del Usuario', status: 'Completed', assignee: users[2], completedAt: '2024-07-10T15:00:00Z', taskId: 'task-10' },
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
      { id: 's4-1', name: 'Aprobación del Jefe de Departamento', status: 'Completed', assignee: users[3], completedAt: '2024-07-21T09:00:00Z', taskId: 'task-11' },
      { id: 's4-2', name: 'Revisión Financiera', status: 'Active', assignee: null, completedAt: null, taskId: 'task-12' },
      { id: 's4-3', name: 'Adquisición', status: 'Pending', assignee: null, completedAt: null, taskId: 'task-13' },
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
