/**
 * Firestore Types for Cloud Functions
 * 
 * These types mirror the client-side types for Firestore documents.
 */

export interface Employee {
    id: string;
    email: string;
    fullName: string;
    department?: string;
    positionTitle?: string;
    locationId?: string; // Sincronizado desde profile
    employmentType: 'full_time' | 'part_time' | 'contractor';
    shiftType: 'diurnal' | 'nocturnal' | 'mixed';
    hireDate: string;
    status: 'active' | 'on_leave' | 'terminated';
    managerId?: string;
    rfc_curp?: string;
    nss?: string;
    clabe?: string;
    costCenter?: string;
    onboardingStatus?: 'pending' | 'in_progress' | 'completed';
    createdAt: string;
    updatedAt: string;
}

export interface Compensation {
    id: string;
    employeeId: string;
    salaryDaily: number;
    salaryMonthly: number;
    sdiBase: number;
    sdiFactor: number;
    vacationDays: number;
    vacationPremium: number;
    aguinaldoDays: number;
    savingsFundPercentage?: number;
    foodVouchersDaily?: number;
    effectiveDate: string;
    createdAt: string;
    updatedAt: string;
    createdById: string;
}

export interface AttendanceRecord {
    id: string;
    employeeId: string;
    date: string;
    checkIn: string;
    checkInLocation?: {
        latitude: number;
        longitude: number;
    };
    checkOut: string;
    checkOutLocation?: {
        latitude: number;
        longitude: number;
    };
    locationId?: string; // Ubicacion asignada o donde hizo check-in
    hoursWorked: number;
    regularHours: number;
    overtimeHours: number;
    overtimeType?: 'double' | 'triple';
    isValid: boolean;
    validationNotes?: string;
    importBatchId?: string;
    createdAt: string;
}

export interface Incidence {
    id: string;
    employeeId: string;
    employeeName: string;
    type: 'vacation' | 'sick_leave' | 'personal_leave' | 'maternity' | 'paternity' | 'bereavement' | 'unjustified_absence';
    startDate: string;
    endDate: string;
    totalDays: number;
    isPaid: boolean;
    status: 'pending' | 'approved' | 'rejected' | 'cancelled';
    notes?: string;
    imssReference?: string;
    approvedById?: string;
    approvedByName?: string;
    approvedAt?: string;
    rejectionReason?: string;
    createdAt: string;
    updatedAt: string;
}

export interface PrenominaRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    employeeRfc?: string;
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    daysWorked: number;
    overtimeDoubleHours: number;
    overtimeTripleHours: number;
    sundayPremiumDays: number;
    absenceDays: number;
    vacationDaysTaken: number;
    sickLeaveDays: number;
    paidLeaveDays: number;
    unpaidLeaveDays: number;     // Días de permiso sin goce
    companyBenefitDaysTaken?: number; // Días de beneficio tomados (pagados)
    status: 'draft' | 'review' | 'approved' | 'exported';
    costCenter?: string;
    createdAt: string;
    updatedAt: string;
}

export interface TardinessRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    scheduledTime: string;
    actualTime: string;
    minutesLate: number;
    isJustified: boolean;
    justificationStatus: 'pending' | 'justified' | 'auto_justified' | 'unjustified';
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    linkedIncidenceId?: string;
    sanctionApplied?: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface EarlyDeparture {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    scheduledTime: string;
    actualTime: string;
    minutesEarly: number;
    isJustified: boolean;
    justificationStatus: 'pending' | 'justified' | 'auto_justified' | 'unjustified';
    justifiedById?: string;
    justifiedByName?: string;
    justifiedAt?: string;
    linkedIncidenceId?: string;
    createdAt: string;
    updatedAt: string;
}

export interface Notification {
    id: string;
    userId: string;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'task' | 'alert';
    link?: string;
    isRead: boolean;
    createdAt: string;
}

export interface Task {
    id: string;
    title: string;
    description: string;
    assignedTo: string;
    assignedToName?: string;
    status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
    priority: 'low' | 'medium' | 'high';
    dueDate?: string;
    link?: string;
    metadata?: {
        pendingInfractionsCount?: number;
        lastUpdated?: string;
    };
    createdAt: string;
    updatedAt: string;
    completedAt?: string;
}
