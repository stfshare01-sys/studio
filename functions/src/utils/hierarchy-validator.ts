/**
 * Hierarchy Validator - Validación de Autorización Jerárquica
 *
 * Este módulo implementa la validación de cadena de mando para:
 * - Aprobación de incidencias
 * - Aprobación de horas extras
 * - Justificación de retardos
 * - Justificación de salidas tempranas
 * - Justificación de marcajes faltantes
 *
 * REGLAS DE AUTORIZACIÓN:
 * 1. HR/Admin pueden aprobar a CUALQUIER empleado
 * 2. Un jefe solo puede aprobar a sus subordinados (directos o indirectos)
 * 3. La cadena jerárquica es ILIMITADA hacia arriba
 * 4. El jefe debe tener el permiso específico en su puesto (canApprove*)
 */

import * as admin from 'firebase-admin';

const db = admin.firestore();

// Tipos de aprobación
export type ApprovalType =
    | 'incidence'
    | 'overtime'
    | 'tardiness'
    | 'early_departure'
    | 'missing_punch';

// Resultado de validación
export type HierarchyValidationResult = {
    canApprove: boolean;
    reason?: string;
    approverLevel?: number;  // Nivel en la cadena (1 = jefe directo, 2 = jefe del jefe, etc.)
    approvalMethod?: 'direct_manager' | 'chain_manager' | 'hr_admin';
};

// Tipos de datos
interface EmployeeData {
    id: string;
    managerId?: string;
    directManagerId?: string;
    positionId?: string;
    role?: string;
}

interface PositionData {
    id: string;
    canApproveOvertime?: boolean;
    canApproveIncidences?: boolean;
    canApproveTardiness?: boolean;
    canApproveEarlyDepartures?: boolean;
    canApproveMissingPunches?: boolean;
}

// Roles con permisos globales de aprobación
const HR_ADMIN_ROLES = ['Admin', 'HRManager'];

/**
 * Obtiene la cadena de managers de un empleado hacia arriba
 * @param employeeId - ID del empleado
 * @param maxDepth - Máxima profundidad de búsqueda (default: 10)
 * @returns Array de IDs de managers ordenados por cercanía (jefe directo primero)
 */
export async function getManagerChain(
    employeeId: string,
    maxDepth: number = 10
): Promise<string[]> {
    const chain: string[] = [];
    let currentId = employeeId;
    let depth = 0;

    while (depth < maxDepth) {
        const employeeSnap = await db.collection('employees').doc(currentId).get();
        if (!employeeSnap.exists) break;

        const employeeData = employeeSnap.data() as EmployeeData;

        // Buscar el manager (usar directManagerId o managerId)
        const managerId = employeeData.directManagerId || employeeData.managerId;

        if (!managerId || managerId === currentId) {
            // No hay más managers o referencia circular
            break;
        }

        chain.push(managerId);
        currentId = managerId;
        depth++;
    }

    return chain;
}

/**
 * Obtiene los permisos de aprobación de un puesto
 * @param positionId - ID del puesto
 * @returns Objeto con permisos de aprobación
 */
async function getPositionApprovalPermissions(
    positionId: string | undefined
): Promise<PositionData | null> {
    if (!positionId) return null;

    const positionSnap = await db.collection('positions').doc(positionId).get();
    if (!positionSnap.exists) return null;

    return { id: positionId, ...positionSnap.data() } as PositionData;
}

/**
 * Verifica si un usuario tiene rol HR/Admin
 * @param userId - ID del usuario
 * @returns true si tiene rol HR/Admin
 */
async function isHROrAdmin(userId: string): Promise<boolean> {
    const userSnap = await db.collection('users').doc(userId).get();
    if (!userSnap.exists) return false;

    const userData = userSnap.data();
    return HR_ADMIN_ROLES.includes(userData?.role || '');
}

/**
 * Mapea tipo de aprobación a campo de permiso en Position
 */
function getPermissionField(approvalType: ApprovalType): keyof PositionData {
    const permissionMap: Record<ApprovalType, keyof PositionData> = {
        incidence: 'canApproveIncidences',
        overtime: 'canApproveOvertime',
        tardiness: 'canApproveTardiness',
        early_departure: 'canApproveEarlyDepartures',
        missing_punch: 'canApproveMissingPunches',
    };
    return permissionMap[approvalType];
}

/**
 * Valida si un usuario puede aprobar una solicitud para un empleado específico
 *
 * ORDEN DE VALIDACIÓN:
 * 1. Si el aprobador es HR/Admin → SIEMPRE puede aprobar
 * 2. Obtener cadena de managers del empleado
 * 3. Verificar si el aprobador está en la cadena
 * 4. Verificar si su puesto tiene el permiso específico
 *
 * @param approverId - ID del usuario que intenta aprobar
 * @param employeeId - ID del empleado cuya solicitud se quiere aprobar
 * @param approvalType - Tipo de aprobación requerida
 * @returns Resultado de validación con explicación
 *
 * @example
 * const result = await canApproveForEmployee('manager123', 'employee456', 'overtime');
 * if (result.canApprove) {
 *   // Proceder con la aprobación
 * } else {
 *   throw new Error(result.reason);
 * }
 */
export async function canApproveForEmployee(
    approverId: string,
    employeeId: string,
    approvalType: ApprovalType,
    overrides?: { role?: string }
): Promise<HierarchyValidationResult> {
    // Caso especial: no puedes aprobarte a ti mismo
    if (approverId === employeeId) {
        return {
            canApprove: false,
            reason: 'No puedes aprobar tus propias solicitudes.',
        };
    }

    // 1. Verificar si es HR/Admin (checking overrides first)
    if (overrides?.role && HR_ADMIN_ROLES.includes(overrides.role)) {
        return {
            canApprove: true,
            approvalMethod: 'hr_admin',
            reason: 'Aprobado como HR/Admin (Token Claims).',
        };
    }

    const hrAdmin = await isHROrAdmin(approverId);
    if (hrAdmin) {
        return {
            canApprove: true,
            approvalMethod: 'hr_admin',
            reason: 'Aprobado como HR/Admin con permisos globales.',
        };
    }

    // 2. Obtener cadena de managers del empleado
    const managerChain = await getManagerChain(employeeId);

    if (managerChain.length === 0) {
        return {
            canApprove: false,
            reason: 'El empleado no tiene jefe asignado en el sistema.',
        };
    }

    // 3. Verificar si el aprobador está en la cadena
    const approverIndex = managerChain.indexOf(approverId);

    if (approverIndex === -1) {
        return {
            canApprove: false,
            reason: 'No eres jefe directo ni indirecto de este empleado.',
        };
    }

    // 4. Obtener datos del aprobador para verificar permisos del puesto
    const approverSnap = await db.collection('employees').doc(approverId).get();
    if (!approverSnap.exists) {
        return {
            canApprove: false,
            reason: 'No se encontró tu registro de empleado.',
        };
    }

    const approverData = approverSnap.data() as EmployeeData;
    const positionPermissions = await getPositionApprovalPermissions(approverData.positionId);

    // 5. Verificar permiso específico en el puesto
    if (positionPermissions) {
        const permissionField = getPermissionField(approvalType);
        const hasPermission = positionPermissions[permissionField];

        if (!hasPermission) {
            // El jefe está en la cadena pero su puesto no tiene el permiso
            const approvalTypeNames: Record<ApprovalType, string> = {
                incidence: 'incidencias',
                overtime: 'horas extras',
                tardiness: 'retardos',
                early_departure: 'salidas tempranas',
                missing_punch: 'marcajes faltantes',
            };
            return {
                canApprove: false,
                reason: `Tu puesto no tiene permiso para aprobar ${approvalTypeNames[approvalType]}.`,
            };
        }
    }
    // Si no tiene puesto asignado, se permite si está en la cadena (comportamiento legacy)

    // 6. Determinar el método de aprobación
    const approverLevel = approverIndex + 1; // 1-indexed
    const approvalMethod = approverLevel === 1 ? 'direct_manager' : 'chain_manager';

    return {
        canApprove: true,
        approverLevel,
        approvalMethod,
        reason: approverLevel === 1
            ? 'Aprobado como jefe directo.'
            : `Aprobado como jefe de nivel ${approverLevel} en la cadena jerárquica.`,
    };
}

/**
 * Obtiene todos los subordinados de un manager (directos e indirectos)
 * Útil para filtrar listas de solicitudes pendientes
 *
 * @param managerId - ID del manager
 * @param maxDepth - Máxima profundidad de búsqueda (default: 5)
 * @returns Array de IDs de empleados subordinados
 */
export async function getSubordinates(
    managerId: string,
    maxDepth: number = 5
): Promise<string[]> {
    const subordinates: string[] = [];
    const toProcess: string[] = [managerId];
    const processed = new Set<string>();
    let depth = 0;

    while (toProcess.length > 0 && depth < maxDepth) {
        const currentBatch = [...toProcess];
        toProcess.length = 0;

        for (const currentManagerId of currentBatch) {
            if (processed.has(currentManagerId)) continue;
            processed.add(currentManagerId);

            // Buscar empleados que tienen este manager como jefe
            const directReportsQuery = await db.collection('employees')
                .where('managerId', '==', currentManagerId)
                .get();

            const directReportsQuery2 = await db.collection('employees')
                .where('directManagerId', '==', currentManagerId)
                .get();

            // Combinar resultados únicos
            const directReportIds = new Set<string>();
            directReportsQuery.docs.forEach(doc => directReportIds.add(doc.id));
            directReportsQuery2.docs.forEach(doc => directReportIds.add(doc.id));

            for (const reportId of directReportIds) {
                if (!subordinates.includes(reportId) && reportId !== managerId) {
                    subordinates.push(reportId);
                    toProcess.push(reportId); // Para buscar sus subordinados
                }
            }
        }

        depth++;
    }

    return subordinates;
}

/**
 * Verifica si un usuario puede ver solicitudes de un empleado
 * Más permisivo que canApproveForEmployee (solo verifica cadena, no permisos específicos)
 *
 * @param viewerId - ID del usuario que quiere ver
 * @param employeeId - ID del empleado
 * @returns true si puede ver las solicitudes
 */
export async function canViewEmployeeRequests(
    viewerId: string,
    employeeId: string
): Promise<boolean> {
    // HR/Admin pueden ver todo
    if (await isHROrAdmin(viewerId)) {
        return true;
    }

    // Verificar si está en la cadena de managers
    const managerChain = await getManagerChain(employeeId);
    return managerChain.includes(viewerId);
}

// =========================================================================
// ESCALAMIENTO DE NOTIFICACIONES — Detección de ausencia de jefe
// =========================================================================

/**
 * Verifica si un manager tiene una incidencia activa (aprobada) que cubra la fecha actual.
 * Se usa para determinar si la notificación debe escalarse al siguiente jefe en la cadena.
 *
 * @param managerId - ID del manager a verificar
 * @returns true si el manager tiene una incidencia activa hoy
 */
export async function isManagerAbsent(managerId: string): Promise<boolean> {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD (safe timezone)

    try {
        // Query: employeeId == managerId AND status == 'approved' AND startDate <= today
        // Uses existing composite index: (employeeId ASC, status ASC, startDate DESC)
        const incidencesSnap = await db.collection('incidences')
            .where('employeeId', '==', managerId)
            .where('status', '==', 'approved')
            .where('startDate', '<=', today)
            .orderBy('startDate', 'desc')
            .limit(10) // Small limit — only need active ones
            .get();

        // Filter in memory: endDate >= today (Firestore doesn't support range on two fields)
        const activeIncidences = incidencesSnap.docs.filter(doc => {
            const data = doc.data();
            return data.endDate >= today;
        });

        if (activeIncidences.length > 0) {
            const types = activeIncidences.map(d => d.data().type).join(', ');
            console.log(`[HCM Escalation] Manager ${managerId} is ABSENT (active: ${types})`);
        }

        return activeIncidences.length > 0;
    } catch (error) {
        console.error(`[HCM Escalation] Error checking manager absence for ${managerId}:`, error);
        // On error, assume manager is available (don't escalate unnecessarily)
        return false;
    }
}

/**
 * Resultado de búsqueda de aprobador disponible.
 */
export interface AvailableApproverResult {
    approverId: string;
    approverName: string;
    isEscalated: boolean;
    absentManagerNames: string[];
}

/**
 * Busca el primer manager disponible (no ausente) en la cadena jerárquica del empleado.
 * Si el jefe directo está ausente, sube por la cadena hasta encontrar uno disponible.
 * Si ninguno está disponible, retorna el último en la cadena (RH será notificado aparte).
 *
 * @param employeeId - ID del empleado que solicita el permiso
 * @returns Información del aprobador disponible y si hubo escalamiento
 */
export async function findAvailableApprover(
    employeeId: string
): Promise<AvailableApproverResult> {
    // Get the employee's manager chain (direct manager first)
    const managerChain = await getManagerChain(employeeId);

    if (managerChain.length === 0) {
        console.log(`[HCM Escalation] Employee ${employeeId} has no manager chain`);
        return {
            approverId: '',
            approverName: '',
            isEscalated: false,
            absentManagerNames: [],
        };
    }

    const absentManagerNames: string[] = [];

    for (const managerId of managerChain) {
        const absent = await isManagerAbsent(managerId);

        if (!absent) {
            // Found an available manager
            const managerSnap = await db.collection('employees').doc(managerId).get();
            const managerName = managerSnap.exists
                ? (managerSnap.data()?.fullName || 'Manager')
                : 'Manager';

            const isEscalated = absentManagerNames.length > 0;
            if (isEscalated) {
                console.log(`[HCM Escalation] Escalated to ${managerName} (${managerId}). Absent: [${absentManagerNames.join(', ')}]`);
            }

            return {
                approverId: managerId,
                approverName: managerName,
                isEscalated,
                absentManagerNames,
            };
        }

        // This manager is absent — record and continue up the chain
        const mSnap = await db.collection('employees').doc(managerId).get();
        const mName = mSnap.exists ? (mSnap.data()?.fullName || managerId) : managerId;
        absentManagerNames.push(mName);
    }

    // ALL managers in the chain are absent — use the last one in the chain
    // HR will also be notified since isEscalated = true
    const lastManagerId = managerChain[managerChain.length - 1];
    const lastSnap = await db.collection('employees').doc(lastManagerId).get();
    const lastName = lastSnap.exists ? (lastSnap.data()?.fullName || 'Manager') : 'Manager';

    console.warn(`[HCM Escalation] ALL managers absent for employee ${employeeId}. Using last in chain: ${lastName}`);

    return {
        approverId: lastManagerId,
        approverName: lastName,
        isEscalated: true,
        absentManagerNames,
    };
}
