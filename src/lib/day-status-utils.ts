import type { IncidenceType } from "@/types/hcm.types";

// =========================================================================
// DETERMINACIÓN DE ESTADO DEL DÍA — REGLA DE ORO DE NÓMINA
// =========================================================================

/**
 * Estado de un marcaje (entrada o salida)
 */
export type PunchStatus = 'on_time' | 'late' | 'early' | 'justified' | 'missing';

/**
 * Estado final del día para nómina
 */
export type FinalDayStatus =
    | 'worked_complete'          // Día trabajado completo (ASI)
    | 'worked_with_tardiness'    // Día trabajado con retardo (ASI + RET)
    | 'absence_unjustified'      // Falta injustificada (FINJ)
    | 'absence_justified'        // Permiso/Incidencia aprobada
    | 'pending_justification';   // Pendiente de justificar

/**
 * Datos de entrada y salida del día
 */
export type DayPunchData = {
    entryStatus: PunchStatus;
    entryIsJustified: boolean;
    exitStatus: PunchStatus;
    exitIsJustified: boolean;
    hasApprovedIncidence: boolean;
    incidenceType?: IncidenceType;
};

/**
 * Resultado de la evaluación del día
 */
export type DayStatusResult = {
    status: FinalDayStatus;
    primaryNomipaqCode: string;
    additionalCodes: string[];
    hasTardiness: boolean;
    hasEarlyDeparture: boolean;
    isFault: boolean;               // Si el día cuenta como falta
    requiresAction: boolean;        // Si requiere acción del jefe
    explanation: string;
};

/**
 * Determina el estado final de un día para efectos de nómina.
 *
 * REGLA DE ORO — Día Trabajado Completo SOLO si:
 * - Entrada OK + Salida OK
 * - Entrada OK + Salida Justificada
 * - Retardo Justificado + Salida OK
 * - Retardo Justificado + Salida Justificada
 *
 * ESCENARIOS DE CONFLICTO:
 * - Retardo Justificado + Salida Injustificada = FALTA
 * - Entrada OK + Salida Injustificada = FALTA
 * - Retardo Injustificado + Salida OK/Justificada = RETARDO (no falta)
 * - Retardo Injustificado + Salida Injustificada = FALTA
 *
 * PRIORIDAD: La FALTA siempre domina sobre el día trabajado.
 *
 * @param dayData - Datos de marcajes del día
 * @returns Estado calculado con código NomiPAQ
 *
 * @example
 * // Entrada tarde justificada + Salida temprano injustificada = FALTA
 * determineDayStatus({
 *   entryStatus: 'late', entryIsJustified: true,
 *   exitStatus: 'early', exitIsJustified: false,
 *   hasApprovedIncidence: false
 * })
 * // → { status: 'absence_unjustified', primaryNomipaqCode: '1FINJ', isFault: true }
 */
export function determineDayStatus(dayData: DayPunchData): DayStatusResult {
    // Caso 1: Hay incidencia aprobada que cubre el día
    if (dayData.hasApprovedIncidence && dayData.incidenceType) {
        const incidenceCodeMap: Record<IncidenceType, { code: string; name: string }> = {
            vacation: { code: 'VAC', name: 'Vacaciones' },
            sick_leave: { code: 'INC', name: 'Incapacidad' },
            personal_leave: { code: '1PCS', name: 'Permiso con sueldo' },
            maternity: { code: 'INC', name: 'Maternidad' },
            paternity: { code: '1PCS', name: 'Paternidad' },
            bereavement: { code: '1PCS', name: 'Duelo' },
            unjustified_absence: { code: '1FINJ', name: 'Falta injustificada' },
            abandono_empleo: { code: 'AE', name: 'Abandono de empleo' },
            marriage: { code: '1PCS', name: 'Matrimonio' },
            adoption: { code: '1PCS', name: 'Adopción' },
            unpaid_leave: { code: 'PSGS', name: 'Permiso sin goce' },
            civic_duty: { code: '1PCS', name: 'Deber Cívico' },
            half_day_family: { code: '1PCS', name: 'Medio día' },
            home_office: { code: 'ASI', name: 'Home Office' }
        };

        const incidenceInfo = incidenceCodeMap[dayData.incidenceType];
        return {
            status: 'absence_justified',
            primaryNomipaqCode: incidenceInfo.code,
            additionalCodes: [],
            hasTardiness: false,
            hasEarlyDeparture: false,
            isFault: dayData.incidenceType === 'unjustified_absence',
            requiresAction: false,
            explanation: `Día cubierto por ${incidenceInfo.name}`,
        };
    }

    // Caso 2: Falta algún marcaje (entrada o salida)
    if (dayData.entryStatus === 'missing' || dayData.exitStatus === 'missing') {
        const missingEntry = dayData.entryStatus === 'missing';
        const missingExit = dayData.exitStatus === 'missing';
        const bothMissing = missingEntry && missingExit;

        if (bothMissing) {
            if (dayData.entryIsJustified && dayData.exitIsJustified) {
                return {
                    status: 'worked_complete',
                    primaryNomipaqCode: 'ASI',
                    additionalCodes: [],
                    hasTardiness: false,
                    hasEarlyDeparture: false,
                    isFault: false,
                    requiresAction: false,
                    explanation: 'Ambos marcajes faltantes justificados',
                };
            }
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Faltan ambos marcajes - pendiente de justificar',
            };
        }

        if (missingEntry && !dayData.entryIsJustified) {
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Falta marcaje de entrada - pendiente de justificar',
            };
        }

        if (missingExit && !dayData.exitIsJustified) {
            return {
                status: 'pending_justification',
                primaryNomipaqCode: '1FINJ',
                additionalCodes: [],
                hasTardiness: false,
                hasEarlyDeparture: false,
                isFault: true,
                requiresAction: true,
                explanation: 'Falta marcaje de salida - pendiente de justificar',
            };
        }
    }

    // Caso 3: Evaluar combinación de entrada y salida
    const entryOK = dayData.entryStatus === 'on_time' ||
        (dayData.entryStatus === 'late' && dayData.entryIsJustified);

    const exitOK = dayData.exitStatus === 'on_time' ||
        (dayData.exitStatus === 'early' && dayData.exitIsJustified);

    const hasUnjustifiedTardiness = dayData.entryStatus === 'late' && !dayData.entryIsJustified;
    const hasUnjustifiedEarlyDeparture = dayData.exitStatus === 'early' && !dayData.exitIsJustified;

    // REGLA: Salida temprano injustificada = FALTA (siempre)
    if (hasUnjustifiedEarlyDeparture) {
        return {
            status: 'absence_unjustified',
            primaryNomipaqCode: '1FINJ',
            additionalCodes: hasUnjustifiedTardiness ? ['1RET'] : [],
            hasTardiness: hasUnjustifiedTardiness,
            hasEarlyDeparture: true,
            isFault: true,
            requiresAction: false,
            explanation: 'Salida temprano injustificada - día se marca como FALTA',
        };
    }

    // REGLA: Retardo injustificado + Salida OK/Justificada = Solo retardo (no falta)
    if (hasUnjustifiedTardiness && exitOK) {
        return {
            status: 'worked_with_tardiness',
            primaryNomipaqCode: 'ASI',
            additionalCodes: ['1RET'],
            hasTardiness: true,
            hasEarlyDeparture: false,
            isFault: false,
            requiresAction: false,
            explanation: 'Día trabajado con retardo injustificado',
        };
    }

    // REGLA: Entrada OK + Salida OK = Día completo
    if (entryOK && exitOK) {
        return {
            status: 'worked_complete',
            primaryNomipaqCode: 'ASI',
            additionalCodes: [],
            hasTardiness: false,
            hasEarlyDeparture: false,
            isFault: false,
            requiresAction: false,
            explanation: 'Día trabajado completo',
        };
    }

    // Caso por defecto: algo está pendiente
    return {
        status: 'pending_justification',
        primaryNomipaqCode: '1FINJ',
        additionalCodes: [],
        hasTardiness: hasUnjustifiedTardiness,
        hasEarlyDeparture: hasUnjustifiedEarlyDeparture,
        isFault: true,
        requiresAction: true,
        explanation: 'Estado del día pendiente de resolver',
    };
}
