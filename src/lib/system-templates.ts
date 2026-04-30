
import { Template } from "@/types/workflow.types";

export const SYSTEM_TEMPLATES: Template[] = [
    {
        id: 'tpl-solicitud-permisos',
        name: 'Solicitud de Permisos',
        description: 'Solicitud unificada para Vacaciones, Incapacidades, Permisos Personales, etc.',
        fields: [], // Los campos son manejados dinámicamente por NewIncidenceForm
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 48, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-2', name: 'Validación RH', type: 'task', assigneeRole: 'HRManager', slaHours: 24 },
        ],
        rules: [],
        status: 'published', // Ensure it appears as published
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }
];
