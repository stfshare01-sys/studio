import { User, UserRole } from "@/types/auth.types";
import type { FieldValue, Timestamp } from 'firebase/firestore';

/**
 * Tipo de campo de auditoría compatible con Firestore.
 * - string: fechas legacy o campos de negocio (YYYY-MM-DD)
 * - FieldValue: serverTimestamp() en escrituras
 * - Timestamp: valor leído de Firestore en cliente
 */
export type FirestoreTimestamp = string | FieldValue | Timestamp;


export type ExtendedUserRole = UserRole | 'HRManager' | 'Manager';
export type EmploymentType = 'full_time' | 'part_time' | 'contractor' | 'intern';
export type ShiftType = 'diurnal' | 'nocturnal' | 'mixed';
export type IncidenceType = 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'marriage' | 'adoption' | 'unpaid_leave' | 'civic_duty' | 'half_day_family' | 'unjustified_absence' | 'abandono_empleo' | 'home_office';
export type IncidenceStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unjustified' | 'made_up';
export type OnboardingPhase = 'day_0' | 'day_30' | 'day_60' | 'day_90' | 'completed';
export type EmployeeShiftAssignment = {
      shiftId: string;
      startDate: string; // ISO Date YYYY-MM-DD
      endDate?: string;  // ISO Date YYYY-MM-DD
    };
/**
 * Expediente Digital del Empleado
 * Extiende el tipo User existente con datos laborales según LFT
 */
export type Employee = User & {
      // Datos fiscales y legales (LFT compliance)
      rfc_curp?: string;           // RFC con homoclave (legacy, mantener por retrocompatibilidad)
      rfc?: string;                // RFC con homoclave (13 caracteres)
      curp?: string;               // CURP (18 caracteres)
      nss?: string;                // Número de Seguridad Social (IMSS)
      userId?: string;             // Authenticated User UID (optional, for linking to Auth)
      employeeId?: string;         // Numerical ID for attendance (ZKTeco etc)

      // Datos laborales
      employmentType: EmploymentType;
      shiftType: ShiftType;
      hireDate: string;            // Fecha de ingreso (ISO 8601)
      terminationDate?: string;    // Fecha de baja (si aplica)
      costCenter?: string;         // Centro de costos contable
      positionTitle: string;       // Puesto / cargo
      scheduledStart?: string;     // Hora de entrada programada (e.g. "09:00")
      scheduledEnd?: string;       // Hora de salida programada (e.g. "18:00")

      // Datos financieros (sensibles)
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

      // Información jerárquica
      directManagerId?: string;    // ID del jefe directo
      secondLevelManagerId?: string; // ID del jefe de segundo nivel
      positionId?: string;         // ID del puesto asociado
      locationId?: string;         // ID de la ubicación física
      customShiftId?: string;      // ID del turno personalizado (si aplica)
      customRestDays?: number[];   // Días de descanso específicos, ej: [0, 6] para Dom y Sab
      homeOfficeDays?: number[];   // Días fijos de home office en la semana (0=Dom, 1=Lun...)
      /**
       * Modalidad de trabajo del empleado.
       * - 'office'  → usa checador físico, no usa widget de auto-marcaje
       * - 'remote'  → 100% desde casa, widget activo todos los días
       * - 'field'   → vendedor/campo sin checador, widget activo todos los días
       * - 'hybrid'  → oficina + días HO configurados (comportamiento actual)
       */
      workMode?: 'office' | 'remote' | 'field' | 'hybrid';
      shiftAssignments?: EmployeeShiftAssignment[]; // Historial de turnos asignados
      /** @deprecated Use customShiftId instead */
      shiftId?: string;            // Legacy: ID del turno (usado en seed data)

      // Configuración de compensación
      allowTimeForTime?: boolean;  // Permite tiempo por tiempo (solo RH puede modificar)
      
      // Control de vacaciones
      currentVacationBalanceId?: string;

      // Último retardo y contador
      lastTardinessDate?: string;
      tardinessCountCurrent?: number;  // Contador actual de retardos

      // Baja (adicionales a terminationDate)
      terminationReason?: string;
      showInPrenomina?: boolean;       // Si mostrar en pre-nómina (false si baja completa)
    };
/**
 * Objetivo SMART para Onboarding
 */
export type OnboardingObjective = {
      id: string;
      phase: OnboardingPhase;
      description: string;
      isCompleted: boolean;
      completedAt?: FirestoreTimestamp;
      notes?: string;
    };
/**
 * Registro de Compensación
 * Contiene información salarial y factores de integración según LFT
 */
export type Compensation = {
      id: string;
      employeeId: string;

      // Salario base
      salaryDaily: number;          // Salario diario base
      salaryMonthly?: number;       // Salario mensual (calculado)

      // Salario Diario Integrado (SDI) - Calculado por sistema de nómina externo
      sdiBase?: number;              // SDI calculado (opcional, se calcula en nómina)
      sdiFactor?: number;            // Factor de integración (opcional, se calcula en nómina)

      // Prestaciones LFT
      vacationDays: number;         // Días de vacaciones según antigüedad (Art. 76 LFT)
      vacationPremium: number;      // Prima vacacional (25% mínimo según Art. 80 LFT)
      aguinaldoDays: number;        // Días de aguinaldo (15 mínimo según Art. 87 LFT)

      // Prestaciones superiores a la ley
      savingsFundPercentage?: number;  // Fondo de ahorro (%)
      foodVouchersDaily?: number;      // Vales de despensa diarios

      // Vigencia
      effectiveDate: string;        // Fecha de vigencia
      endDate?: string;             // Fecha fin (si hay cambio de tabulador)

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
      createdById: string;
    };
/**
 * Registro de Asistencia
 * Importado de sistema externo (biométrico, reloj checador, etc.)
 */
export type AttendanceRecord = {
      id: string;
      employeeId: string;
      employeeName?: string;        // Denormalized for display (optional for legacy data)

      // Fecha y hora
      date: string;                 // YYYY-MM-DD
      checkIn?: string;             // HH:mm:ss (hora de entrada)
      checkOut?: string;            // HH:mm:ss (hora de salida)

      // Check-in/out detallado
      checkInLocation?: {
        latitude: number;
        longitude: number;
      };
      checkOutLocation?: {
        latitude: number;
        longitude: number;
      };
      locationId?: string; // Ubicacion asignada o donde hizo check-in

      // Cálculos automáticos
      hoursWorked: number;          // Total horas trabajadas
      regularHours: number;         // Horas dentro de jornada normal
      overtimeHours: number;        // Horas extra totales
      rawOvertimeHours?: number;    // Overtime sin descuento de retardo (para recálculo al justificar)
      overtimeType?: 'double' | 'triple' | null; // Tipo según "Ley de los 9s"
      scheduledStart?: string;      // HH:mm — hora programada de entrada
      scheduledEnd?: string;        // HH:mm — hora programada de salida

      // Estado y validación
      isValid: boolean;             // Validación de jornada según turno
      validationNotes?: string | null;     // Notas de validación (ej: "Excede jornada diurna")

      // Días de descanso / festivos
      isRestDay?: boolean;
      isRestDayWorked?: boolean;

      // Incidencia relacionada (si aplica)
      linkedIncidenceId?: string;   // Si hay permiso/incapacidad que justifica

      // Holiday Flags
      isHoliday?: boolean;          // Si true, este día es festivo oficial (DFT si hay checada)
      isCompanyBenefitDay?: boolean; // Si true, es día de beneficio empresa
      holidayName?: string;         // Nombre del día festivo (ej. "Día de la Independencia")

      // Integrity Flags
      isVoid?: boolean;             // Si true, este día NO cuenta como trabajado (ej. convertido a falta)
      voidReason?: string;          // Razón de la anulación (ej. "Salida anticipada injustificada")

      // Lote de importación
      importBatchId: string;        // ID del lote de importación

      // Origen del marcaje — diferencia biométrico de auto-reporte
      source?: 'biometric' | 'self_reported' | 'manual'; // Fuente del registro de asistencia

      // Home Office Flags
      isHomeOffice?: boolean;       // Si true, este día fue trabajado en Home Office (día configurado)
      isUnscheduledHO?: boolean;    // Si true, el empleado registró HO en un día no configurado como tal

      // Geolocalización del marcaje (solo para source: 'self_reported')
      location?: {
        lat: number;          // Latitud en grados decimales
        lng: number;          // Longitud en grados decimales
        accuracy: number;     // Radio de precisión en metros
        capturedAt: string;   // ISO timestamp del momento de captura GPS
      };


      // Auditoría
      createdAt: FirestoreTimestamp;

      // Seguimiento de deuda (Bolsa de Horas)
      hoursAppliedToDebt?: number; // Horas aplicadas para pagar deuda
      payableOvertimeHours?: number; // Horas extras pagables (después de deducir deuda)
    };
/**
 * Incidencias y Permisos
 * Gestiona ausencias, vacaciones, incapacidades según LFT
 */
export type Incidence = {
      id: string;
      employeeId: string;
      employeeName?: string;        // Denormalizado para consultas rápidas

      // Tipo y fechas
      type: IncidenceType;
      startDate: string;            // Fecha inicio
      endDate: string;              // Fecha fin
      totalDays: number;            // Días totales

      // Estado del flujo
      status: IncidenceStatus;
      isPaid: boolean;              // Con o sin goce de sueldo

      // Datos específicos según tipo
      imssReference?: string;       // Folio IMSS para incapacidades
      imssPercentage?: number;      // % que cubre IMSS (40% o 60%)

      // Flujo de aprobación
      requestId?: string;           // Referencia al Request del workflow
      approvedById?: string;
      approvedByName?: string;      // Denormalizado
      approvedAt?: FirestoreTimestamp;
      rejectionReason?: string;

      // Información adicional
      notes?: string;
      reason?: string;
      attachmentUrls?: string[];    // Documentos adjuntos (constancias médicas, etc.)

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Registro de Pre-Nómina Consolidada
 * Resumen por empleado por período de pago
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

      sundayPremiumDays: number;
      holidayDays: number;               // Días festivos trabajados
      companyBenefitDaysTaken?: number;   // Días de beneficio empresa tomados (pagados)

      // Deducciones (Días/Horas, no $)
      absenceDays: number;

      vacationDaysTaken: number;
      sickLeaveDays: number;
      paidLeaveDays: number;
      unpaidLeaveDays: number;

      // Estado y exportación
      status: 'draft' | 'reviewed' | 'exported' | 'locked';
      reviewedById?: string;
      reviewedAt?: string;
      exportedAt?: string;
      exportedById?: string;
      exportFormat?: 'nomipaq' | 'excel' | 'json';

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Bolsa de Horas Compensatorias
 * "Tiempo por tiempo" según mutuo acuerdo
 */
export type TimeBank = {
      id: string;
      employeeId: string;

      // Saldos
      hoursEarned: number;          // Horas acumuladas por trabajo extra
      hoursUsed: number;            // Horas compensadas/usadas
      hoursBalance: number;         // Saldo disponible (earned - used)
      hoursExpired: number;         // Horas expiradas (si aplica política)

      // Política
      expirationMonths?: number;    // Meses para expiración (null = no expira)

      // Auditoría
      lastUpdated: FirestoreTimestamp;
      movements: TimeBankMovement[];
    };
/**
 * Movimiento en Bolsa de Horas
 */
export type TimeBankMovement = {
      id: string;
      type: 'earn' | 'use' | 'expire' | 'adjustment';
      hours: number;
      date: string;
      description: string;
      approvedById?: string;
    };
/**
 * Lote de Importación de Asistencia
 */
export type AttendanceImportBatch = {
      id: string;
      filename: string;
      fileSize: number;
      mimeType: string;

      // Procesamiento
      uploadedById: string;
      uploadedByName?: string;
      uploadedAt: FirestoreTimestamp;

      // Resultados
      recordCount: number;          // Total registros procesados
      successCount: number;         // Registros exitosos
      skippedCount: number;         // Registros omitidos (duplicados)
      errorCount: number;           // Registros con error

      // Modo de cálculo de horas extra
      overtimeMode?: 'daily_limit' | 'weekly_only';

      // Estado
      status: 'uploading' | 'processing' | 'completed' | 'failed' | 'partial';
      errors?: ImportError[];

      // Período cubierto
      dateRangeStart?: string;
      dateRangeEnd?: string;
    };
export type EmployeeImportBatch = {
      id: string;
      filename: string;
      fileSize: number;
      mimeType: string;
      uploadedById: string;
      uploadedByName?: string;
      uploadedAt: FirestoreTimestamp;
      recordCount: number;
      successCount: number;
      errorCount: number;
      status: 'uploading' | 'processing' | 'completed' | 'failed' | 'partial';
      errors?: ImportError[];
    };
/**
 * Error de Importación
 */
export type ImportError = {
      row: number;
      column?: string;
      employeeId?: string;
      message: string;
      severity: 'warning' | 'error';
    };
/**
 * Póliza Contable de Nómina
 */
export type AccountingPolicy = {
      id: string;
      prenominalPeriodStart: string;
      prenominalPeriodEnd: string;

      // Cuentas contables
      entries: AccountingEntry[];

      // Totales
      totalDebit: number;
      totalCredit: number;
      isBalanced: boolean;

      // Estado
      status: 'draft' | 'posted' | 'cancelled';
      postedAt?: string;
      postedById?: string;

      // Auditoría
      createdAt: FirestoreTimestamp;
      createdById: string;
    };
/**
 * Entrada de Póliza Contable
 */
export type AccountingEntry = {
      accountCode: string;          // Código de cuenta contable
      accountName: string;          // Nombre de cuenta
      costCenter?: string;          // Centro de costos
      debit: number;                // Cargo
      credit: number;               // Abono
      concept: string;              // Concepto
    };
/**
 * Configuración de Calendario Laboral
 * Días festivos oficiales según LFT
 */
export type HolidayCalendar = {
      id: string;
      name: string;                 // Nombre del calendario (e.g. "México 2026 Oficial")
      year: number;
      countryCode?: string;         // Código ISO del país (e.g. "mx")
      isDefault?: boolean;          // Si es el calendario por defecto
      holidays: OfficialHoliday[];
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Día Festivo Oficial
 */
export type OfficialHoliday = {
      date: string;                 // YYYY-MM-DD
      name: string;                 // Nombre del día festivo
      mandatory?: boolean;          // Si es obligatorio según LFT
      isObligatory?: boolean;       // Alias legacy — Descanso obligatorio según Art. 74 LFT
      premiumRequired?: boolean;    // Requiere pago de prima (200%)
    };
/**
 * Departamento Organizacional
 * Entidad completa con jefe, presupuesto y jerarquía
 */
export type Department = {
      id: string;
      name: string;                   // Nombre del departamento
      code: string;                   // Código único (ej: "RH", "OPS", "FIN")
      description?: string;           // Descripción del departamento

      // Jerarquía organizacional
      managerPositionId?: string;     // ID del puesto responsable/jefe del departamento
      parentDepartmentId?: string;    // Departamento padre (para jerarquías)

      // Contabilidad
      costCenter?: string;            // Centro de costos contable
      budget?: number;                // Presupuesto asignado
      budgetPeriod?: 'monthly' | 'quarterly' | 'annual';

      // Ubicación física principal
      locationId?: string;            // Ubicación física principal del departamento

      // Estado
      isActive: boolean;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
      createdById?: string;
    };
/**
 * Tipo de ubicación
 */
export type LocationType = 'cedis' | 'tienda' | 'corporativo' | 'planta' | 'otro';
/**
 * Ubicación / Sucursal
 * Representa una ubicación física de la empresa
 */
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
      isOfficeLocation?: boolean;     // Es ubicación de oficina central (ignora marcajes en días de descanso)

      // Estado
      isActive: boolean;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
      createdById: string;
    };
/**
 * Límites de Aprobación por Puesto
 * Define los montos máximos que un puesto puede aprobar sin escalamiento
 */
export type ApprovalLimits = {
      // Límites monetarios (MXN)
      expenses?: number;              // Reembolsos de gastos
      purchases?: number;             // Requisiciones de compra
      travel?: number;                // Viáticos y viajes
      contracts?: number;             // Contratos de servicios

      // Límites de tiempo (días)
      vacationDays?: number;          // Días de vacaciones que puede aprobar sin escalar
      overtimeHours?: number;         // Horas extra semanales que puede aprobar

      // Límites de personal
      headcount?: number;             // Número de posiciones que puede aprobar contratar
    };
/**
 * Puesto / Cargo
 * Catálogo de puestos de la empresa
 */
export type Position = {
      id: string;
      name: string;                   // Nombre del puesto
      code: string;                   // Código único
      department: string;             // Legacy: nombre del departamento (string)
      departmentId?: string;          // NEW: referencia a departments/{id}
      level: number;                  // Nivel jerárquico (1 = director, 2 = gerente, etc.)

      // Configuración salarial
      salaryMin?: number;             // Salario mínimo del tabulador
      salaryMax?: number;             // Salario máximo del tabulador

      // Permisos especiales
      canApproveOvertime?: boolean;   // Puede aprobar horas extras
      canApproveIncidences?: boolean; // Puede aprobar incidencias

      // Configuración de horas extras
      generatesOvertime?: boolean;    // Si el puesto puede generar horas extras pagadas
      overtimePreApprovalRequired?: boolean; // Si requiere pre-autorización para HE
      allowTimeBank?: boolean;        // Permitir uso de bolsa de horas

      // Control de asistencia
      isExemptFromAttendance?: boolean; // Exento de usar reloj checador (Directivos)

      // Límites de aprobación
      approvalLimits?: ApprovalLimits; // Límites máximos que puede aprobar sin escalar

      // Estado
      isActive: boolean;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Turno personalizado
 * Permite configurar turnos específicos por empleado/ubicación
 */
export type CustomShift = {
      id: string;
      name: string;                   // Nombre del turno (ej: "Turno Matutino")
      code: string;                   // Código (ej: "TM-01")
      type: ShiftType;                // Tipo base (diurnal, nocturnal, mixed)

      // Configuración de horario
      startTime: string; // HH:mm
      endTime: string;   // HH:mm
      breakMinutes: number; // Tiempo de descanso

      // NEW: Horarios específicos por día (opcional)
      // Si existe una entrada para el día actual, sobreescribe el horario global
      daySchedules?: {
        [day: number]: { // 0=Domingo, 1=Lunes...
          startTime: string;
          endTime: string;
          breakMinutes: number;
        }
      };

      // Días laborales y de descanso
      workDays: number[]; // 0=Sunday, 1=Monday, etc.
      restDays: number[];             // ej: [0, 6] para Dom y Sab

      // Horas calculadas
      dailyHours: number;             // Horas diarias normales
      weeklyHours: number;            // Horas semanales normales

      // Ubicación (opcional, si es turno específico de ubicación)
      locationId?: string;

      // Estado
      isActive: boolean;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Saldo de Vacaciones del Empleado
 * Control del saldo de vacaciones disponible
 */
export type VacationBalance = {
      id: string;
      employeeId: string;

      // Período actual (año de aniversario)
      periodStart: string;            // Fecha de inicio del período (aniversario)
      periodEnd: string;              // Fecha de fin del período

      // Días según antigüedad (Reforma 2023)
      daysEntitled: number;           // Días que le corresponden según antigüedad
      yearsOfService: number;         // Años de antigüedad al inicio del período

      // Control de saldo
      daysTaken: number;              // Días ya tomados
      daysScheduled: number;          // Días programados (aprobados pero no tomados)
      daysAvailable: number;          // Días disponibles (entitled - taken - scheduled)
      daysCarriedOver: number;        // Días arrastrados del período anterior
      daysPending: number;            // Días en solicitudes pendientes de aprobación
      maxCarryOverDays?: number;      // Días máximos a arrastrar (snapshot)

      // Prima vacacional
      vacationPremiumPaid: boolean;   // Si ya se pagó la prima vacacional
      vacationPremiumDate?: string;   // Fecha de pago de prima

      // Historial de movimientos
      movements: VacationMovement[];

      // Auditoría
      lastUpdated: FirestoreTimestamp;
      createdAt: FirestoreTimestamp;
    };
/**
 * Movimiento de Vacaciones
 */
export type VacationMovement = {
      id: string;
      date: string;
      type: 'taken' | 'scheduled' | 'cancelled' | 'reset' | 'adjustment';
      days: number;                   // Días (positivo o negativo)
      description: string;
      incidenceId?: string;           // Referencia a la incidencia
      approvedById?: string;
    };
/**
 * Tipo de retardo
 */
export type TardinessType = 'entry' | 'exit' | 'break';
/**
 * Registro de Retardo
 */
export type TardinessRecord = {
      id: string;
      employeeId: string;
      date: string;
      attendanceRecordId: string;     // Referencia al registro de asistencia

      // Detalle del retardo
      type: TardinessType;
      scheduledTime: string;          // Hora programada (HH:mm)
      actualTime: string;             // Hora real (HH:mm)
      minutesLate: number;            // Minutos de retardo

      // Estado de justificación
      isJustified: boolean;           // Si fue justificado (legacy, usar justificationStatus)
      justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
      justificationType?: JustificationType; // Tipo de justificación seleccionado
      justificationReason?: string;   // Razón de justificación o comentario
      justifiedById?: string;         // Quién justificó
      justifiedAt?: FirestoreTimestamp;           // Cuándo se justificó
      linkedIncidenceId?: string;     // Si fue auto-justificado por una incidencia previa
      compensatedToHourBank?: boolean; // Si se envió a bolsa de horas
      importBatchId?: string;         // Link al batch de importación que creó este registro

      // Acumulación
      periodStartDate: string;        // Inicio del período de 30 días
      tardinessCountInPeriod: number; // Contador de retardos en el período
      tardinessCountInWeek: number;   // Contador de retardos en la semana

      // Sanción aplicada
      sanctionApplied: boolean;
      sanctionType?: 'suspension_1day' | 'warning';
      sanctionDate?: string;
      sanctionResetById?: string;     // Si se hizo reset de sanción

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Configuración de Retardos por Ubicación
 */
export type TardinessPolicy = {
      id: string;
      locationId?: string;            // null = política global

      // Tolerancia
      toleranceMinutes: number;       // Minutos de tolerancia (default: 10)

      // Reglas de acumulación
      maxTardinessPerMonth: number;   // Máximo retardos en 30 días antes de sanción (default: 3)
      maxTardinessPerWeek: number;    // Máximo retardos en 1 semana antes de sanción (default: 2)

      // Sanciones
      sanctionType: 'suspension_1day' | 'warning' | 'deduction';
      autoApplySanction: boolean;     // Aplicar sanción automáticamente

      // Período de acumulación
      accumulationPeriodDays: number; // Días del período de acumulación (default: 30)

      // Estado
      isActive: boolean;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Solicitud de Horas Extra
 */
export type OvertimeRequest = {
      id: string;
      employeeId: string;
      employeeName?: string;

      // Detalles de la solicitud
      date: string;                   // Fecha de las horas extras
      hoursRequested: number;         // Horas solicitadas
      reason: string;                 // Razón de las horas extras

      // Flujo de aprobación
      status: 'pending' | 'approved' | 'rejected' | 'partial';
      hoursApproved?: number;         // Horas aprobadas (puede ser menor a solicitadas)
      doubleHours?: number;           // Horas dobles calculadas
      tripleHours?: number;           // Horas triples calculadas

      // Aprobador
      approverLevel: 1 | 2;           // Nivel 1 = jefe directo, Nivel 2 = siguiente nivel
      requestedToId: string;          // A quién se solicitó aprobación
      requestedToName?: string;
      approvedById?: string;
      approvedByName?: string;
      approvedAt?: FirestoreTimestamp;
      rejectionReason?: string;

      // Vinculación con asistencia
      attendanceRecordId?: string;    // Referencia al registro de asistencia

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Bloqueo de Período de Nómina
 * Una vez descargada la pre-nómina, se bloquea el período
 */
export type PayrollPeriodLock = {
      id: string;

      // Período bloqueado
      periodStart: string;
      periodEnd: string;
      periodType: 'weekly' | 'biweekly' | 'monthly';

      // Ubicación (opcional, puede ser global)
      locationId?: string;

      // Estado del bloqueo
      isLocked: boolean;
      lockedAt: FirestoreTimestamp;
      lockedById: string;
      lockedByName?: string;

      // Referencia a pre-nómina exportada
      prenominaExportId?: string;
      exportFormat?: 'nomipaq' | 'excel' | 'json';

      // Desbloqueo (solo Admin)
      unlockedAt?: FirestoreTimestamp;
      unlockedById?: string;
      unlockReason?: string;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Alerta de Duplicidad de Período
 */
export type PeriodDuplicateAlert = {
      periodStart: string;
      periodEnd: string;
      existingLockId: string;
      message: string;
    };
/**
 * Códigos de incidencias para la pre-nómina
 * Según el informe de requerimientos
 */
export type IncidenceCode = | 'FINJ'  // Falta Injustificada
      | 'ASI'   // Asistencia
      | 'INC'   // Incapacidad
      | 'PSS'   // Permiso Sin goce de Sueldo
      | 'PCS'   // Permiso Con goce de Sueldo
      | 'DFT'   // Día Festivo Trabajado
      | 'DD'    // Día de Descanso
      | 'DL'    // Descanso Laborado
      | 'HE2'   // Horas Extras Dobles
      | 'HE3'   // Horas Extras Triples
      | 'RET'   // Retardo
      | 'PD'    // Prima Dominical
      | 'VAC'   // Vacaciones
      | 'PV'    // Prima Vacacional
      | 'BJ'    // Baja
      | 'AE';
/**
 * Entrada diaria para la tabla de pre-nómina
 */
export type DailyPrenominaEntry = {
      date: string;                   // Fecha YYYY-MM-DD
      dayOfWeek: number;              // 0-6
      dayName: string;                // LUN, MAR, etc.

      // Código principal del día
      primaryCode: IncidenceCode;

      // Códigos adicionales (ej: DL, PD para domingo trabajado)
      additionalCodes?: IncidenceCode[];

      // Horas extras del día
      overtimeDoubleHours?: number;
      overtimeTripleHours?: number;

      // Indicadores
      isHoliday: boolean;
      isRestDay: boolean;
      isSunday: boolean;
      hasTardiness: boolean;

      // Texto para celda (ej: "3HE2, 0.5HE3" o "DL, PD")
      cellDisplay: string;
    };
/**
 * Registro detallado de Pre-Nómina con desglose diario
 * Extiende PrenominaRecord con información adicional
 */
export type DetailedPrenominaRecord = PrenominaRecord & {
      // Identificación completa
      locationName?: string;
      locationCode?: string;
      departmentName?: string;
      positionName?: string;

      // Desglose diario
      dailyEntries: DailyPrenominaEntry[];

      // Acumulados numéricos (columnas finales)
      totalDaysWorked: number;
      totalRestDaysWorked: number;    // Días de descanso laborados (DL)
      totalSundayPremiumDays: number; // Días con prima dominical (PD)
      totalHolidaysWorked: number;    // Días festivos trabajados (DFT)
      totalTardiness: number;         // Total de retardos (RET)
      totalAbsences: number;          // Total de faltas (FINJ)
      totalVacationDays: number;      // Total vacaciones (VAC)
      totalSickLeaveDays: number;     // Total incapacidades (INC)

      // Horas extras acumuladas
      totalOvertimeDoubleHours: number;
      totalOvertimeTripleHours: number;

      // Prima vacacional (si es aniversario en el período)
      vacationPremiumAnniversary: boolean;
      vacationPremiumDays?: number;

      // Semáforo de bono
      bonusEligible: boolean;         // Verde = elegible, Rojo = no elegible
      bonusIneligibleReason?: string; // Razón de no elegibilidad
    };
/**
 * Empleado con campos extendidos para el nuevo sistema
 */
/**
 * Salida Temprana
 * Registro de salida anticipada del empleado
 */
export type EarlyDeparture = {
      id: string;
      employeeId: string;
      employeeName?: string;
      date: string;                     // YYYY-MM-DD
      scheduledEndTime?: string;         // Hora programada de salida (HH:mm)
      actualEndTime?: string;            // Hora real de salida (HH:mm)
      scheduledTime?: string;
      actualTime?: string;
      minutesEarly: number;             // Minutos antes de lo programado

      // Estado de justificación
      isJustified: boolean;             // Legacy, usar justificationStatus
      justificationStatus: IncidenceJustificationStatus; // Nuevo estado detallado
      justificationType?: JustificationType; // Tipo de justificación seleccionado
      justificationReason?: string;
      justifiedById?: string;
      justifiedByName?: string;
      importBatchId?: string; // Link to the import batch that created this record
      linkedIncidenceId?: string;       // Si fue auto-justificado
      compensatedToHourBank?: boolean;  // Si se envió a bolsa de horas

      // Regla de 6 horas
      checkOut: string;             // ISO Date
      hoursWorked: number;            // Horas trabajadas (HH.dd)
      notes?: string;

      // Regla de 6 horas
      isAbsence?: boolean;              // True si trabajó < 6 horas (se considera falta)
      severity?: 'minor' | 'major' | 'critical';  // Severidad de la salida temprana

      // Referencias
      attendanceRecordId?: string;      // Referencia al registro de asistencia

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Asignación de Turno (temporal o permanente)
 * Permite al jefe asignar un turno diferente a un empleado
 */
export type ShiftAssignment = {
      id: string;
      employeeId: string;
      employeeName?: string;

      // Turnos
      originalShiftId?: string;         // Turno original (para restaurar)
      originalShiftName?: string;
      newShiftId: string;               // Nuevo turno asignado
      newShiftName?: string;

      // Tipo de asignación
      assignmentType: 'temporary' | 'permanent';
      startDate: string;                // Fecha de inicio
      endDate?: string;                 // Fecha fin (solo si es temporal)
      reason: string;                   // Razón del cambio

      // Estado
      status: 'active' | 'completed' | 'cancelled';

      // Aprobación
      assignedById: string;
      assignedByName?: string;
      assignedAt: FirestoreTimestamp;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Cambio de Horario (temporal o permanente)
 * Permite al jefe modificar las horas de entrada/salida de un empleado
 */
export type ScheduleChange = {
      id: string;
      employeeId: string;
      employeeName?: string;

      // Horario original
      originalStartTime: string;        // HH:mm
      originalEndTime: string;          // HH:mm

      // Nuevo horario
      newStartTime: string;             // HH:mm
      newEndTime: string;               // HH:mm

      // Tipo de cambio
      changeType: 'temporary' | 'permanent';
      effectiveDate: string;            // Fecha de inicio del cambio
      endDate?: string;                 // Fecha fin (solo si es temporal)
      reason: string;                   // Razón del cambio

      // Estado
      status: 'active' | 'completed' | 'cancelled';

      // Aprobación
      assignedById: string;
      assignedByName?: string;
      assignedAt: FirestoreTimestamp;

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Estadísticas de equipo por día
 * Para la vista diaria del panel del jefe
 */
export type TeamDailyStats = {
      date: string;                     // YYYY-MM-DD
      employeeId: string;
      employeeName: string;

      // Marcajes del día (del registro de asistencia)
      checkIn?: string;                 // HH:mm
      checkOut?: string;                // HH:mm
      isRestDay?: boolean;

      // Eventos del día
      tardinessMinutes?: number;        // Minutos de retardo
      tardinessJustified?: boolean;
      earlyDepartureMinutes?: number;   // Minutos de salida temprana
      earlyDepartureJustified?: boolean;
      overtimeHoursRequested?: number;  // HE solicitadas
      overtimeHoursApproved?: number;   // HE aprobadas
      overtimeStatus?: 'pending' | 'approved' | 'rejected' | 'partial';

      // Incidencias
      hasIncidence: boolean;
      incidenceType?: IncidenceType;
      incidenceStatus?: IncidenceStatus;

      // Marcajes faltantes
      hasMissingPunch?: boolean;
      missingPunchType?: 'entry' | 'exit' | 'both';
      missingPunchJustified?: boolean;
    };
/**
 * Resumen mensual de empleado
 * Para la vista de estadísticas del equipo
 */
export type EmployeeMonthlyStats = {
      employeeId: string;
      employeeName: string;
      positionTitle?: string;
      avatarUrl?: string;

      // Período
      month?: number;                    // 1-12
      year?: number;

      // Contadores
      totalTardiness: number;           // Total retardos del mes
      justifiedTardiness: number;       // Retardos justificados
      unjustifiedTardiness: number;     // Retardos sin justificar
      totalEarlyDepartures: number;     // Total salidas tempranas
      justifiedEarlyDepartures: number; // Salidas tempranas justificadas

      // Horas extras
      overtimeHoursRequested: number;   // HE solicitadas
      overtimeHoursApproved: number;    // HE aprobadas
      overtimeHoursRejected: number;    // HE rechazadas
      overtimeRequestsPending: number;  // Solicitudes pendientes

      // Incidencias
      pendingIncidences: number;        // Incidencias pendientes de aprobación
      approvedIncidences: number;       // Incidencias aprobadas
    };
export type NotificationType = | 'overtime_approved'
      | 'overtime_rejected'
      | 'overtime_partial'
      | 'tardiness_justified'
      | 'early_departure_justified'
      | 'shift_assigned'
      | 'schedule_changed'
      | 'incidence_approved'
      | 'incidence_rejected'
      | 'general';
export type Notification = {
      id: string;
      userId: string;                   // Usuario que recibe la notificación
      type: NotificationType;
      title: string;
      message: string;
      read: boolean;
      createdAt: FirestoreTimestamp;

      // Metadatos opcionales para navegación
      relatedId?: string;               // ID del registro relacionado (incidencia, OT, etc.)
      relatedType?: 'incidence' | 'overtime' | 'tardiness' | 'early_departure' | 'shift' | 'schedule';
      actionUrl?: string;               // URL para navegar al hacer click
      link?: string;                    // Alias for actionUrl or direct link

      // Quién generó la notificación
      createdById?: string;
      createdByName?: string;
    };
/**
 * Estado de justificación para incidencias (retardos/salidas)
 */
export type IncidenceJustificationStatus = | 'pending'           // Pendiente de revisión
      | 'justified'         // Justificado por el jefe
      | 'unjustified'       // Marcado como injustificado
      | 'compensated'       // Repuesto (enviado a bolsa de horas)
      | 'auto_justified';
/**
 * Tipos de justificación preconfigurados
 */
export type JustificationType = | 'medical_appointment'       // Cita médica
      | 'family_emergency'          // Emergencia familiar
      | 'traffic_incident'          // Incidente de tráfico
      | 'public_transport_delay'    // Retraso transporte público
      | 'weather_conditions'        // Condiciones climáticas
      | 'official_business'         // Asuntos oficiales
      | 'manager_authorization'     // Autorización del jefe
      | 'unjustified'               // Injustificado (marcado explícitamente)
      | 'other';
/**
 * Bolsa de Horas del Empleado
 * Registra la deuda/crédito de tiempo del empleado
 */
export type HourBank = {
      id: string;
      employeeId: string;
      employeeName?: string;

      // Saldo actual (en minutos)
      // Positivo = empleado debe tiempo a la empresa
      // Negativo = empresa debe tiempo al empleado (crédito)
      balanceMinutes: number;

      // Bolsa oculta: horas trabajadas de más (solo para empleados sin HE)
      // Este valor NUNCA se muestra en la UI. Se usa internamente para compensar deuda.
      // Se resetea a 0 al cerrar/consolidar el periodo.
      hiddenPositiveMinutes: number;

      // Estadísticas
      totalDebtAccumulated: number;   // Total acumulado de deuda
      totalCompensated: number;       // Total compensado con HE
      lastMovementDate?: FirestoreTimestamp;      // Última actualización

      // Auditoría
      createdAt: FirestoreTimestamp;
      updatedAt: FirestoreTimestamp;
    };
/**
 * Movimiento en la Bolsa de Horas
 */
export type HourBankMovement = {
      id: string;
      hourBankId: string;
      employeeId: string;
      date: string;                   // Fecha del movimiento

      // Tipo de movimiento
      type:
      | 'tardiness'                 // Retardo agregado
      | 'early_departure'           // Salida temprana agregada
      | 'overtime_compensation'     // Compensado con horas extras
      | 'manual_adjustment'         // Ajuste manual
      | 'hidden_positive_accumulation'   // Acumulación de horas ocultas (extra no pagada)
      | 'hidden_positive_compensation';  // Compensación automática de deuda con horas ocultas

      // Cantidad (en minutos)
      // Positivo = agrega deuda
      // Negativo = reduce deuda (compensación)
      minutes: number;

      // Referencias
      reason: string;
      sourceRecordId?: string;        // ID del retardo/salida/OT origen
      sourceRecordType?: 'tardiness' | 'early_departure' | 'overtime';

      // Auditoría
      createdById: string;
      createdByName?: string;
      createdAt: FirestoreTimestamp;
    };
/**
 * Resultado del cálculo de horas extras según LFT
 */
export type OvertimeCalculation = {
      // Entrada
      rawOvertimeMinutes: number;     // Minutos extras trabajados (antes de compensación)
      hourBankDebt: number;           // Deuda en bolsa de horas

      // Compensación
      minutesCompensated: number;     // Minutos usados para compensar deuda
      remainingDebt: number;          // Deuda restante después de compensar

      // Horas extras netas
      netOvertimeMinutes: number;     // Minutos extras después de compensar

      // Desglose LFT
      doubleHoursMinutes: number;     // Minutos a pagar dobles (primeras 9 HE semanales)
      tripleHoursMinutes: number;     // Minutos a pagar triples (a partir de hora 10)

      // Valores monetarios (si se proporciona tarifa)
      doubleHoursAmount?: number;
      tripleHoursAmount?: number;
      totalAmount?: number;

      // Acumulado semanal (para saber cuántas HE lleva en la semana)
      weeklyOvertimeAccumulated: number;
    };

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
      unjustified: 'Injustificado',
      other: 'Otros',
    };

export function formatOvertimeForNomipaq(
    hours: number,
    type: 'double' | 'triple'
): string {
    const code = type === 'double' ? NOMIPAQ_CODES.HORAS_EXTRAS_DOBLES : NOMIPAQ_CODES.HORAS_EXTRAS_TRIPLES;
    return `${hours}${code}`;
}

export const INCIDENCE_CODE_MAP: Record<IncidenceType | 'attendance' | 'rest_day' | 'worked_rest_day' | 'holiday_worked' | 'tardiness' | 'termination', IncidenceCode> = {
    vacation: 'VAC',
    sick_leave: 'INC',
    personal_leave: 'PCS',
    maternity: 'INC',
    paternity: 'PCS',
    bereavement: 'PCS',
    marriage: 'PCS',
    adoption: 'PCS',
    unpaid_leave: 'PSS',
    civic_duty: 'PCS',
    half_day_family: 'PCS',
    home_office: 'ASI',
    unjustified_absence: 'FINJ',
    abandono_empleo: 'AE',
    attendance: 'ASI',
    rest_day: 'DD',
    worked_rest_day: 'DL',
    holiday_worked: 'DFT',
    tardiness: 'RET',
    termination: 'BJ'
};

export type EarlyDepartureRecord = {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;                     // YYYY-MM-DD
    attendanceRecordId: string;       // Referencia al registro de asistencia
    scheduledTime: string;            // Hora programada de salida (HH:mm)
    actualTime: string;               // Hora real de salida (HH:mm)
    minutesEarly: number;             // Minutos de salida anticipada
    isJustified: boolean;             // Si fue justificada
    justificationReason?: string;     // Motivo de justificación
    justifiedById?: string;           // ID de quien justificó
    justifiedByName?: string;         // Nombre de quien justificó
    justifiedAt?: FirestoreTimestamp;             // Fecha/hora de justificación
    resultedInAbsence: boolean;       // Si causó FALTA (injustificada)
    linkedAbsenceId?: string;         // ID de la falta generada (si aplica)
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
};

export type MissingPunchType = 'entry' | 'exit' | 'both';

export type MissingPunchRecord = {
    id: string;
    employeeId: string;
    employeeName?: string;
    date: string;                     // YYYY-MM-DD
    attendanceRecordId?: string;      // Puede no existir si faltan ambos
    missingType: MissingPunchType;    // Qué marcaje falta
    isJustified: boolean;             // Si fue justificado
    justificationReason?: string;     // Motivo de justificación
    providedEntryTime?: string;       // Hora de entrada proporcionada al justificar
    providedExitTime?: string;        // Hora de salida proporcionada al justificar
    generatedTardinessId?: string;    // Si se generó un retardo al justificar
    generatedEarlyDepartureId?: string; // Si se generó salida temprana al justificar
    justifiedById?: string;           // ID de quien justificó
    justifiedByName?: string;         // Nombre de quien justificó
    justifiedAt?: FirestoreTimestamp;             // Fecha/hora de justificación
    resultedInAbsence: boolean;       // Si quedó como FALTA
    linkedAbsenceId?: string;         // ID de la falta (si aplica)
    // Home Office Flags
    isHomeOffice?: boolean;           // Si true, la falta corresponde a un día de Home Office configurado
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
};

export type DayWorkStatus =
    | 'complete'              // Día trabajado completo (ASI)
    | 'absence_unjustified'   // Falta injustificada (FINJ)
    | 'absence_justified'     // Falta justificada (con permiso)
    | 'tardiness_only'        // Solo retardo, día trabajado (RET + ASI)
    | 'vacation'              // Vacaciones (VAC)
    | 'sick_leave'            // Incapacidad (INC)
    | 'paid_leave'            // Permiso con goce (PCS)
    | 'unpaid_leave'          // Permiso sin goce (PSS)
    | 'rest_day'              // Día de descanso (DD)
    | 'rest_day_worked'       // Día de descanso laborado (DL)
    | 'holiday'               // Día festivo (DFT si trabajado)
    | 'pending_justification';

export type DayStatusEvaluation = {
    status: DayWorkStatus;
    primaryCode: IncidenceCode;
    additionalCodes: IncidenceCode[];
    hasTardiness: boolean;
    hasEarlyDeparture: boolean;
    hasMissingPunch: boolean;
    isTardinessJustified: boolean;
    isEarlyDepartureJustified: boolean;
    isMissingPunchJustified: boolean;
    requiresAction: boolean;          // Si requiere acción del jefe
    actionType?: 'justify_tardiness' | 'justify_early_departure' | 'justify_missing_punch';
    notes?: string;
};

export const NOMIPAQ_CODES = {
    // Faltas y asistencia
    FALTA_INJUSTIFICADA: '1FINJ',
    RETARDO: '1RET',
    DIA_TRABAJADO: 'ASI',

    // Horas extras (formato: cantidad + código)
    HORAS_EXTRAS_DOBLES: 'HE2',      // Ej: "1HE2", "0.5HE2"
    HORAS_EXTRAS_TRIPLES: 'HE3',     // Ej: "1HE3", "0.5HE3"

    // Permisos
    PERMISO_SIN_SUELDO: '1PSS',
    PERMISO_CON_SUELDO: '1PCS',

    // Vacaciones e incapacidades
    VACACIONES: 'VAC',
    INCAPACIDAD: 'INC',

    // Días especiales
    DIA_DESCANSO: 'DD',
    DIA_DESCANSO_LABORADO: 'DDL',
    DIA_FESTIVO_TRABAJADO: 'DDDL',
    PRIMA_DOMINICAL: 'PD',

    // Otros
    PRIMA_VACACIONAL: 'PV',
    BAJA: 'BJ',
    ABANDONO_EMPLEO: 'AE',
} as const;
