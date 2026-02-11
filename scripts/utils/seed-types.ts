/**
 * Tipos TypeScript para el Script de Seeding
 */

export interface EmployeeSeedData {
    id: string;
    uid: string;
    fullName: string;
    email: string;
    department: string;
    departmentId: string;
    positionTitle: string;
    positionId: string;
    role: 'Admin' | 'Supervisor' | 'Employee';
    directManagerId?: string;
    locationId: string;
    customShiftId: string;
    hireDate: string;
    employmentType: string;
    shiftType: string;
    birthDate: string;
    rfc_curp: string;
    nss: string;
}

export interface AttendanceImportBatch {
    id: string;
    period: string;
    batchNumber: number;
    importDate: string;
    startDate: string;
    endDate: string;
    totalRecords: number;
    processedRecords: number;
    status: 'completed' | 'processing' | 'failed';
    importedBy: string;
    fileName: string;
}

export interface AttendanceRecord {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string;
    importBatchId: string;
    locationId: string;
    shiftId: string;
    hoursWorked: number;
    regularHours: number;
    overtimeHours: number;
}

export interface InfractionRecord {
    employeeId: string;
    employeeName: string;
    date: string;
    scheduledTime: string;
    actualTime: string;
    minutesLate?: number;
    minutesEarly?: number;
    isJustified: boolean;
    justificationStatus: 'pending' | 'approved' | 'rejected';
    importBatchId: string;
}

export interface OvertimeRequest {
    employeeId: string;
    employeeName: string;
    date: string;
    hoursRequested: number;
    reason: string;
    status: 'pending' | 'approved' | 'rejected';
    approvedBy?: string;
    approvedAt?: string;
    hoursApproved?: number;
    rejectedBy?: string;
    rejectedAt?: string;
    rejectionReason?: string;
}

export interface IncidenceRecord {
    employeeId: string;
    employeeName: string;
    type: 'personal_leave' | 'medical_leave' | 'vacation' | 'bereavement_leave' | 'paternity_leave';
    startDate: string;
    endDate: string;
    status: 'approved' | 'pending' | 'rejected';
    reason: string;
    approvedBy?: string;
    approvedAt?: string;
}

export interface PeriodClosure {
    userId: string;
    period: string;
    closedAt: string;
    closedBy: string;
    slaCompleted: boolean;
    consolidationCompleted: boolean;
}
