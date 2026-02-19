import { AppModule, ModulePermission, SystemRole } from "./types";

export interface SystemLevelRule {
    requiredPermissions: { module: AppModule; level: 'read' | 'write' }[];
    description: string;
    rank: number;
}

export const SYSTEM_LEVEL_CONFIG: Record<SystemRole, SystemLevelRule> = {
    Admin: {
        requiredPermissions: [
            { module: 'admin_users', level: 'write' },
            { module: 'admin_roles', level: 'write' },
            // Admin implies access to sensitive logs if we had a specific permission for it, 
            // but fundamentally it's about managing the system itself.
        ],
        description: 'Acceso total de administración del sistema',
        rank: 4
    },
    HRManager: {
        requiredPermissions: [
            { module: 'hcm_employees', level: 'write' },
            { module: 'hcm_prenomina', level: 'write' }
        ],
        description: 'Gestión completa de RRHH y Nómina',
        rank: 3
    },
    Designer: {
        // Designer is a specific technical role, often equivalent to Manager in terms of "trust" but specific scope.
        // For security rules, it might fall under 'Manager' or have its own if hardcoded rules exist.
        // However, typically Designers need to edit templates.
        requiredPermissions: [
            { module: 'templates', level: 'write' }
        ],
        description: 'Diseño de procesos y plantillas',
        rank: 2
    },
    Manager: {
        requiredPermissions: [
            { module: 'hcm_team_management', level: 'write' },
            { module: 'requests', level: 'write' } // Approvals often come with write access to requests
        ],
        description: 'Gestión operativa y de equipos',
        rank: 2
    },
    Member: {
        requiredPermissions: [],
        description: 'Usuario estándar',
        rank: 1
    }
};

/**
 * Calculates the implied System Role based on a list of permissions.
 * It checks from highest rank (Admin) to lowest.
 */
export function calculateSystemLevel(permissions: ModulePermission[]): SystemRole {
    // Check Admin
    if (hasAnyTopLevelPermission(permissions, SYSTEM_LEVEL_CONFIG.Admin.requiredPermissions)) {
        return 'Admin';
    }

    // Check HR
    if (hasAnyTopLevelPermission(permissions, SYSTEM_LEVEL_CONFIG.HRManager.requiredPermissions)) {
        return 'HRManager';
    }

    // Check Designer
    if (hasAnyTopLevelPermission(permissions, SYSTEM_LEVEL_CONFIG.Designer.requiredPermissions)) {
        return 'Designer';
    }

    // Check Manager
    if (hasAnyTopLevelPermission(permissions, SYSTEM_LEVEL_CONFIG.Manager.requiredPermissions)) {
        return 'Manager';
    }

    // Default
    return 'Member';
}

function hasAnyTopLevelPermission(
    userPermissions: ModulePermission[],
    required: { module: AppModule; level: 'read' | 'write' }[]
): boolean {
    return required.some(req => {
        const found = userPermissions.find(p => p.module === req.module);
        if (!found || found.level === 'hidden') return false;

        // If requirement is 'read', 'read' or 'write' is fine.
        // If requirement is 'write', only 'write' is fine.
        if (req.level === 'read') return true;
        return found.level === 'write';
    });
}
