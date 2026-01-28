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
    checkOut: string;
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
    unpaidLeaveDays: number;
    status: 'draft' | 'review' | 'approved' | 'exported';
    costCenter?: string;
    createdAt: string;
    updatedAt: string;
}


