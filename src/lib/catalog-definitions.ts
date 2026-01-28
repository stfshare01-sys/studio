import { LucideIcon, FileText, Calendar, DollarSign, Briefcase, UserPlus, AlertCircle } from 'lucide-react';

/**
 * Service Catalog - Definitions for "Ventanilla Única"
 * 
 * This file defines the registry of all available services/procedures in the FlowMaster system.
 * It maps UI representation to underlying Business Processes (BPMN Templates).
 */

export type ServiceCategory = 'HR' | 'Finance' | 'IT' | 'Operations' | 'Legal';

export type ServiceSideEffect =
    | 'update_vacation_balance'
    | 'create_employee_record'
    | 'register_attendance_correction'
    | 'trigger_payroll_incident'
    | 'none';

export interface ServiceItem {
    id: string;                  // Unique identifier (slug)
    title: string;               // Display title
    description: string;         // Short description for the card
    category: ServiceCategory;   // Grouping
    iconName: string;            // Icon to display

    // Process Link
    templateId: string;          // ID of the BPMN template to launch

    // Visibility Rules
    requiredRole?: string[];     // Roles that can see this service
    hidden?: boolean;            // Temporarily hide

    // Metadata for Routing & Execution
    moduleTag: string;           // e.g., 'HCM', 'FIN' - used for routing logic
    sideEffects: ServiceSideEffect[]; // What happens when approved?
}

export const SERVICE_CATALOG: ServiceItem[] = [
    // =================================================================
    // HUMAN RESOURCES (HCM)
    // =================================================================
    {
        id: 'vacation-request',
        title: 'Solicitud de Vacaciones',
        description: 'Gestiona tus días de descanso con aprobación automática de saldo.',
        category: 'HR',
        iconName: 'Calendar',
        templateId: 'tpl_vacation_v1', // Maps to a Template in Firestore
        moduleTag: 'HCM',
        sideEffects: ['update_vacation_balance', 'trigger_payroll_incident']
    },
    {
        id: 'sick-leave',
        title: 'Incapacidad / Permiso Médico',
        description: 'Reporte de ausencias por enfermedad o justificante médico.',
        category: 'HR',
        iconName: 'AlertCircle',
        templateId: 'tpl_sick_leave_v1',
        moduleTag: 'HCM',
        sideEffects: ['trigger_payroll_incident']
    },
    {
        id: 'overtime-authorization',
        title: 'Autorización de Horas Extra',
        description: 'Solicita aprobación previa para laborar fuera de horario.',
        category: 'HR',
        iconName: 'Clock',
        templateId: 'tpl_overtime_v1',
        moduleTag: 'HCM',
        sideEffects: ['trigger_payroll_incident'] // Will be processed in Prenomina
    },
    {
        id: 'details-update',
        title: 'Actualización de Datos Personales',
        description: 'Notifica cambios de domicilio, estado civil o contacto.',
        category: 'HR',
        iconName: 'User',
        templateId: 'tpl_data_update_v1',
        moduleTag: 'HCM',
        sideEffects: ['none'] // Just updates the record via standard flow
    },

    // =================================================================
    // IT & ACCESS
    // =================================================================
    {
        id: 'access-request',
        title: 'Solicitud de Accesos',
        description: 'Pide acceso a sistemas, VPN o carpetas compartidas.',
        category: 'IT',
        iconName: 'Key',
        templateId: 'tpl_it_access_v1',
        moduleTag: 'IT',
        sideEffects: ['none']
    },
    {
        id: 'hardware-request',
        title: 'Solicitud de Equipo',
        description: 'Laptop, monitor o periféricos para tu puesto.',
        category: 'IT',
        iconName: 'Laptop',
        templateId: 'tpl_hardware_v1',
        moduleTag: 'IT',
        sideEffects: ['none']
    }
];

/**
 * Helper to get catalog by category
 */
export function getServicesByCategory(category: ServiceCategory): ServiceItem[] {
    return SERVICE_CATALOG.filter(item => item.category === category && !item.hidden);
}

/**
 * Helper to get available services for a user role
 */
export function getAvailableServices(userRoles: string[]): ServiceItem[] {
    return SERVICE_CATALOG.filter(item => {
        if (item.hidden) return false;
        if (!item.requiredRole) return true;
        return item.requiredRole.some(role => userRoles.includes(role));
    });
}
