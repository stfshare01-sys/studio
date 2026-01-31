import { IncidenceType, IncidenceStatus } from './hcm';

// =========================================================================
// OPERATIONAL HCM TYPES - Incidences, Attendance (No Money)
// =========================================================================

// -------------------------------------------------------------------------
// Justification Types
// -------------------------------------------------------------------------

/**
 * Estado de justificación para incidencias (retardos/salidas)
 */
export type IncidenceJustificationStatus =
    | 'pending'           // Pendiente de revisión
    | 'justified'         // Justificado por el jefe
    | 'unjustified'       // Marcado como injustificado
    | 'compensated'       // Repuesto (enviado a bolsa de horas)
    | 'auto_justified';   // Auto-justificado por solicitud previa aprobada

/**
 * Tipos de justificación preconfigurados
 */
export type JustificationType =
    | 'medical_appointment'       // Cita médica
    | 'family_emergency'          // Emergencia familiar
    | 'traffic_incident'          // Incidente de tráfico
    | 'public_transport_delay'    // Retraso transporte público
    | 'weather_conditions'        // Condiciones climáticas
    | 'official_business'         // Asuntos oficiales
    | 'manager_authorization'     // Autorización del jefe
    | 'other';                    // Otros (requiere comentario)

/**
 * Labels para tipos de justificación (uso en UI)
 */
export const JUSTIFICATION_TYPE_LABELS: Record<JustificationType, string> = {
    medical_appointment: 'Cita médica',
    family_emergency: 'Emergencia familiar',
    traffic_incident: 'Incidente de tráfico',
    public_transport_delay: 'Retraso en transporte público',
    weather_conditions: 'Condiciones climáticas',
    official_business: 'Asuntos oficiales',
    manager_authorization: 'Autorización del jefe',
    other: 'Otros',
};

export type AttendanceRecord = {
    id: string;
    employeeId: string;
    date: string;                 // YYYY-MM-DD
    checkIn?: string;             // HH:mm:ss
    checkOut?: string;            // HH:mm:ss
    hoursWorked: number;          // Total horas trabajadas
    regularHours: number;         // Horas dentro de jornada normal
    overtimeHours: number;        // Horas extra totales
    overtimeType?: 'double' | 'triple';
    isValid: boolean;
    validationNotes?: string;
    linkedIncidenceId?: string;
    importBatchId: string;
    createdAt: string;
};

export type Incidence = {
    id: string;
    employeeId: string;
    employeeName?: string;
    type: IncidenceType;
    startDate: string;
    endDate: string;
    totalDays: number;
    status: IncidenceStatus;
    isPaid: boolean;              // Con o sin goce de sueldo (Concepto de tiempo, no dinero aquí)
    imssReference?: string;
    imssPercentage?: number;
    requestId?: string;
    approvedById?: string;
    approvedByName?: string;
    approvedAt?: string;
    rejectionReason?: string;
    notes?: string;
    attachmentUrls?: string[];
    createdAt: string;
    updatedAt: string;
};

// =========================================================================
// VACATION CONTROL
// =========================================================================

export type VacationMovement = {
    id: string;
    date: string;
    type: 'taken' | 'scheduled' | 'cancelled' | 'reset' | 'adjustment';
    days: number;                   // Días (positivo o negativo)
    description: string;
    incidenceId?: string;
    approvedById?: string;
};

export type VacationBalance = {
    id: string;
    employeeId: string;
    periodStart: string;
    periodEnd: string;
    daysEntitled: number;
    yearsOfService: number;
    daysTaken: number;
    daysScheduled: number;
    daysAvailable: number;
    vacationPremiumPaid: boolean;
    vacationPremiumDate?: string;
    movements: VacationMovement[];
    lastUpdated: string;
    createdAt: string;
};

// =========================================================================
// TIME BANK & TARDINESS
// =========================================================================

export type TimeBankMovement = {
    id: string;
    type: 'earn' | 'use' | 'expire' | 'adjustment';
    hours: number;
    date: string;
    description: string;
    approvedById?: string;
};

export type TimeBank = {
    id: string;
    employeeId: string;
    hoursEarned: number;
    hoursUsed: number;
    hoursBalance: number;
    hoursExpired: number;
    expirationMonths?: number;
    lastUpdated: string;
    movements: TimeBankMovement[];
};

/**
 * Bolsa de Horas del Empleado (para compensación de retardos)
 */
export type HourBank = {
    id: string;
    employeeId: string;
    employeeName?: string;

    // Saldo actual (en minutos)
    // Positivo = empleado debe tiempo a la empresa
    // Negativo = empresa debe tiempo al empleado (crédito)
    balanceMinutes: number;

    // Estadísticas
    totalDebtAccumulated: number;   // Total acumulado de deuda
    totalCompensated: number;       // Total compensado con HE
    lastMovementDate?: string;      // Última actualización

    // Auditoría
    createdAt: string;
    updatedAt: string;
};

/**
 * Movimiento en la Bolsa de Horas
 */
export type HourBankMovement = {
    id: string;
    hourBankId: string;
    employeeId: string;
    date: string;

    type:
    | 'tardiness'
    | 'early_departure'
    | 'overtime_compensation'
    | 'manual_adjustment';

    minutes: number; // Positivo = agrega deuda, Negativo = reduce deuda
    reason: string;
    sourceRecordId?: string;
    sourceRecordType?: 'tardiness' | 'early_departure' | 'overtime';

    createdById: string;
    createdByName?: string;
    createdAt: string;
};

/**
 * Resultado del cálculo de horas extras según LFT
 */
export type OvertimeCalculation = {
    rawOvertimeMinutes: number;
    hourBankDebt: number;
    minutesCompensated: number;
    remainingDebt: number;
    netOvertimeMinutes: number;
    doubleHoursMinutes: number;
    tripleHoursMinutes: number;
    doubleHoursAmount?: number;
    tripleHoursAmount?: number;
    totalAmount?: number;
    weeklyOvertimeAccumulated: number;
};

export type TardinessType = 'entry' | 'exit' | 'break';

export type TardinessRecord = {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    attendanceRecordId: string;
    type: TardinessType;
    scheduledTime: string;
    actualTime: string;
    minutesLate: number;

    // Estado de justificación
    isJustified: boolean;           // Legacy, usar justificationStatus
    justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
    justificationType?: JustificationType; // Tipo de justificación seleccionado
    justificationReason?: string;   // Razón de justificación o comentario
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    linkedIncidenceId?: string;     // Si fue auto-justificado por una incidencia previa
    compensatedToHourBank?: boolean; // Si se envió a bolsa de horas

    // Acumulación
    periodStartDate: string;
    tardinessCountInPeriod: number;
    tardinessCountInWeek: number;

    // Sanciones
    sanctionApplied: boolean;
    sanctionType?: 'suspension_1day' | 'warning';
    sanctionDate?: string;
    sanctionResetById?: string;

    // Auditoría
    createdAt: string;
    updatedAt: string;
};

/**
 * Salida Temprana
 */
export type EarlyDeparture = {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    shiftId?: string;

    // Horarios
    scheduledTime: string;            // Hora programada de salida
    actualTime: string;               // Hora real de salida
    minutesEarly: number;             // Minutos antes de lo programado

    // Estado de justificación
    isJustified: boolean;             // Legacy, usar justificationStatus
    justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
    justificationType?: JustificationType; // Tipo de justificación seleccionado
    justificationReason?: string;
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    linkedIncidenceId?: string;       // Si fue auto-justificado
    compensatedToHourBank?: boolean;  // Si se envió a bolsa de horas

    // Regla de 6 horas
    hoursWorked?: number;             // Horas trabajadas antes de la salida
    isAbsence?: boolean;              // True si trabajó < 6 horas (se considera falta)

    // Referencias
    attendanceRecordId?: string;      // Referencia al registro de asistencia
    requestId?: string;               // Si fue solicitado previamente

    // Auditoría
    createdAt: string;
    updatedAt: string;
};

export type TardinessPolicy = {
    id: string;
    locationId?: string;
    toleranceMinutes: number;
    maxTardinessPerMonth: number;
    maxTardinessPerWeek: number;
    sanctionType: 'suspension_1day' | 'warning' | 'deduction';
    autoApplySanction: boolean;
    accumulationPeriodDays: number;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type OvertimeRequest = {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;
    hoursRequested: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected' | 'partial';
    hoursApproved?: number;
    doubleHours?: number; // Desglose estricto LFT
    tripleHours?: number; // Desglose estricto LFT
    approverLevel: 1 | 2;
    requestedToId: string;
    requestedToName?: string;
    approvedById?: string;
    approvedByName?: string;
    approvedAt?: string;
    rejectionReason?: string;
    attendanceRecordId?: string;
    createdAt: string;
    updatedAt: string;
};

// =========================================================================
// EXPORT TYPES (PRENOMINA - Time & Incidences Only)
// =========================================================================

export type IncidenceCode =
    | 'FINJ' | 'ASI' | 'INC' | 'PSS' | 'PCS' | 'DFT' | 'DD' | 'DL'
    | 'HE2' | 'HE3' | 'RET' | 'PD' | 'VAC' | 'PV' | 'BJ';

export const INCIDENCE_CODE_MAP: Record<IncidenceType | 'attendance' | 'rest_day' | 'worked_rest_day' | 'holiday_worked' | 'tardiness' | 'termination', IncidenceCode> = {
    vacation: 'VAC',
    sick_leave: 'INC',
    personal_leave: 'PCS',
    maternity: 'INC',
    paternity: 'PCS',
    bereavement: 'PCS',
    unjustified_absence: 'FINJ',
    attendance: 'ASI',
    rest_day: 'DD',
    worked_rest_day: 'DL',
    holiday_worked: 'DFT',
    tardiness: 'RET',
    termination: 'BJ'
};

/**
 * Registro de Pre-Nómina CONSOLIDADO (Operativo)
 * Sin montos monetarios (grossPay, netPay eliminados).
 */
export type PrenominaRecord = {
    id: string;
    employeeId: string;
    employeeName?: string;
    employeeRfc?: string;
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';

    // Percepciones de TIEMPO
    daysWorked: number;

    // Horas extra (tiempos)
    overtimeDoubleHours: number;
    overtimeTripleHours: number;
    // overtimeDoubleAmount REMOVED
    // overtimeTripleAmount REMOVED

    sundayPremiumDays: number;
    // sundayPremiumAmount REMOVED

    // Deducciones (Días/Horas, no $)
    absenceDays: number;
    // absenceDeductions REMOVED

    vacationDaysTaken: number;
    sickLeaveDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;

    // Totales Monetarios REMOVED
    // grossPay, totalDeductions, netPay, earnedWage REMOVED

    status: 'draft' | 'reviewed' | 'exported' | 'locked';
    reviewedById?: string;
    reviewedAt?: string;
    exportedAt?: string;
    exportedById?: string;
    exportFormat?: 'nomipaq' | 'excel' | 'json';

    createdAt: string;
    updatedAt: string;
};

export type PayrollPeriodLock = {
    id: string;
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    locationId?: string;
    isLocked: boolean;
    lockedAt: string;
    lockedById: string;
    lockedByName?: string;
    prenominaExportId?: string;
    exportFormat?: 'nomipaq' | 'excel' | 'json';
    unlockedAt?: string;
    unlockedById?: string;
    unlockReason?: string;
    createdAt: string;
    updatedAt: string;
};

export type DailyPrenominaEntry = {
    date: string;
    dayOfWeek: number;
    dayName: string;
    primaryCode: IncidenceCode;
    additionalCodes?: IncidenceCode[];
    overtimeDoubleHours?: number;
    overtimeTripleHours?: number;
    isHoliday: boolean;
    isRestDay: boolean;
    isSunday: boolean;
    hasTardiness: boolean;
    cellDisplay: string;
};

export type DetailedPrenominaRecord = PrenominaRecord & {
    locationName?: string;
    locationCode?: string;
    departmentName?: string;
    positionName?: string;
    dailyEntries: DailyPrenominaEntry[];
    totalDaysWorked: number;
    totalRestDaysWorked: number;
    totalSundayPremiumDays: number;
    totalHolidaysWorked: number;
    totalTardiness: number;
    totalAbsences: number;
    totalVacationDays: number;
    totalSickLeaveDays: number;
    totalOvertimeDoubleHours: number;
    totalOvertimeTripleHours: number;
    vacationPremiumAnniversary: boolean;
    vacationPremiumDays?: number;
    bonusEligible: boolean;
    bonusIneligibleReason?: string;
};

export type PeriodDuplicateAlert = {
    periodStart: string;
    periodEnd: string;
    existingLockId: string;
    message: string;
};
