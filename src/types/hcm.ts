import { User, UserRole } from './core';

// =========================================================================
// HCM MODULE TYPES - Sistema de Gestión de Capital Humano
// =========================================================================

// Extend UserRole to include HRManager
export type ExtendedUserRole = UserRole | 'HRManager' | 'Manager';

export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type ShiftType = 'diurnal' | 'nocturnal' | 'mixed';
export type IncidenceType = 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'unjustified_absence';
export type IncidenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type OnboardingPhase = 'day_0' | 'day_30' | 'day_60' | 'day_90' | 'completed';

/**
 * Objetivo SMART para Onboarding
 */
export type OnboardingObjective = {
    id: string;
    phase: OnboardingPhase;
    description: string;
    isCompleted: boolean;
    completedAt?: string;
    notes?: string;
};

/**
 * Expediente Digital del Empleado
 * Extiende el tipo User existente con datos laborales según LFT
 */
export type Employee = User & {
    // Datos fiscales y legales (LFT compliance)
    rfc_curp?: string;           // RFC con homoclave + CURP
    nss?: string;                // Número de Seguridad Social (IMSS)

    // Datos laborales
    employmentType: EmploymentType;
    shiftType: ShiftType;
    hireDate: string;            // Fecha de ingreso (ISO 8601)
    terminationDate?: string;    // Fecha de baja (si aplica)
    costCenter?: string;         // Centro de costos contable
    positionTitle: string;       // Puesto / cargo

    // Datos financieros (sensibles) - DEPRECATED for calculations, kept for record if needed?
    // Removing clabe as part of Purge if strictly monetary? Kept for payroll export (layout) purposes.
    clabe?: string;              // Cuenta bancaria CLABE 18 dígitos

    // Onboarding
    onboardingStatus?: OnboardingPhase;
    mentorId?: string;           // ID del mentor asignado
    onboardingObjectives?: OnboardingObjective[];

    // Evaluación 9-Box Grid
    performanceRating?: 1 | 2 | 3 | 4 | 5;
    potentialRating?: 1 | 2 | 3 | 4 | 5;
    lastEvaluationDate?: string;

    // Lista negra (offboarding)
    isBlacklisted?: boolean;
    blacklistReason?: string;
    blacklistDate?: string;
};

// =========================================================================
// UBICACIONES, PUESTOS Y TURNOS
// =========================================================================

export type LocationType = 'cedis' | 'tienda' | 'corporativo' | 'planta' | 'otro';

export type Location = {
    id: string;
    name: string;                   // Nombre de la ubicación
    code: string;                   // Código único (ej: "CEDIS-GDL", "T001")
    type: LocationType;             // Tipo de ubicación
    address?: string;               // Dirección
    city?: string;                  // Ciudad
    state?: string;                 // Estado

    // Configuración de nómina
    overtimeResetDay: 'sunday' | 'saturday' | 'custom'; // Día de reinicio de horas extras
    customOvertimeResetDay?: number;  // 0-6 si es custom

    // Calendario específico
    holidayCalendarId?: string;     // Calendario de días festivos específico
    companyBenefitDays?: string[];  // Días de beneficio empresa (ej: "12-24", "12-31")

    // Configuración de asistencia
    toleranceMinutes: number;       // Tolerancia de entrada en minutos (default: 10)
    useVirtualCheckIn?: boolean;    // Usar check-in virtual (Home Office)

    // Estado
    isActive: boolean;

    // Auditoría
    createdAt: string;
    updatedAt: string;
    createdById: string;
};

export type Position = {
    id: string;
    name: string;                   // Nombre del puesto
    code: string;                   // Código único
    department: string;             // Departamento
    level: number;                  // Nivel jerárquico (1 = director, 2 = gerente, etc.)

    // Configuración salarial - REMOVED salaryMin/Max as per Purge?
    // Keeping as reference data is usually fine, but strictly "Operation No Payroll" might imply hiding this.
    // I will keep them as 'reference' only, or remove if strict.
    // User said "Elimina funciones... cálculos monetarios". Reference numbers in position are borderline.
    // I will leave them commented out to be safe/clean.
    // salaryMin?: number;
    // salaryMax?: number;

    // Permisos especiales
    canApproveOvertime?: boolean;   // Puede aprobar horas extras
    canApproveIncidences?: boolean; // Puede aprobar incidencias

    // Estado
    isActive: boolean;

    // Auditoría
    createdAt: string;
    updatedAt: string;
};

export type CustomShift = {
    id: string;
    name: string;                   // Nombre del turno (ej: "Turno Matutino")
    code: string;                   // Código (ej: "TM-01")
    type: ShiftType;                // Tipo base (diurnal, nocturnal, mixed)

    // Horarios
    startTime: string;              // Hora de entrada (HH:mm)
    endTime: string;                // Hora de salida (HH:mm)
    breakStartTime?: string;        // Inicio de descanso
    breakEndTime?: string;          // Fin de descanso
    breakMinutes: number;           // Minutos de descanso (si no hay horario específico)

    // Días de la semana laborables (0=Dom, 1=Lun, ..., 6=Sab)
    workDays: number[];             // ej: [1, 2, 3, 4, 5] para Lun-Vie

    // Días de descanso
    restDays: number[];             // ej: [0, 6] para Dom y Sab

    // Horas calculadas
    dailyHours: number;             // Horas diarias normales
    weeklyHours: number;            // Horas semanales normales

    // Ubicación (opcional, si es turno específico de ubicación)
    locationId?: string;

    // Estado
    isActive: boolean;

    // Auditoría
    createdAt: string;
    updatedAt: string;
};

/**
 * Empleado con campos extendidos para el nuevo sistema
 */
export type ExtendedEmployee = Employee & {
    // Ubicación y puesto
    locationId?: string;            // ID de la ubicación
    positionId?: string;            // ID del puesto

    // Turno personalizado
    customShiftId?: string;         // ID del turno personalizado

    // Días de descanso específicos (override del turno)
    customRestDays?: number[];      // ej: [0, 6] para Dom y Sab

    // Jefe directo
    directManagerId?: string;       // ID del jefe directo
    secondLevelManagerId?: string;  // ID del jefe de segundo nivel

    // Control de vacaciones
    currentVacationBalanceId?: string;

    // Último retardo y contador
    lastTardinessDate?: string;
    tardinessCountCurrent: number;  // Contador actual de retardos

    // Fecha de baja (para pre-nómina)
    terminationDate?: string;
    terminationReason?: string;
    showInPrenomina: boolean;       // Si mostrar en pre-nómina (false si baja completa)
};

export type OfficialHoliday = {
    date: string;                 // YYYY-MM-DD
    name: string;                 // Nombre del día festivo
    isObligatory: boolean;        // Descanso obligatorio según Art. 74 LFT
    premiumRequired: boolean;     // Requiere pago de prima (200%)
};

export type HolidayCalendar = {
    id: string;
    year: number;
    holidays: OfficialHoliday[];
    createdAt: string;
    updatedAt: string;
};
