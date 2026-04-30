import { Firestore } from 'firebase/firestore';
import type { 
    Employee, 
    AttendanceRecord, 
    AttendanceImportBatch, 
    TimeBank, 
    TardinessRecord, 
    EarlyDeparture, 
    EmployeeShiftAssignment,
    ShiftType
} from "@/types/hcm.types";

export interface AttendanceImportRow {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string;
}

export type OvertimeMode = 'daily_limit' | 'weekly_only';

export interface ProcessAttendanceResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    skippedCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

export interface EmployeeShiftConfig {
    type: ShiftType;
    breakMinutes: number;
    fullName: string;
    startTime: string;
    endTime: string;
    toleranceMinutes: number;
    locationId?: string;
    daySchedules?: Record<number, { startTime: string; endTime: string; breakMinutes: number }>;
    customShiftId?: string;
    allowOvertime: boolean;
    workDays: number[];
    restDays: number[];
    realUid: string;
    isExempt: boolean;
    status?: string;
    terminationDate?: string;
    directManagerId?: string | null;
    overtimeResetDay?: string;
}

export interface AttendanceImportContext {
    firestore: Firestore;
    now: string;
    batchId: string;
    uploadedById: string;
    uploadedByName: string;
    filename: string;
    overtimeMode: OvertimeMode;
    minDate: string;
    maxDate: string;
    
    // Tracking Variables
    successCount: number;
    skippedCount: number;
    errors: Array<{ row: number; message: string }>;
    newRecordsToJustify: Array<{ id: string; employeeId: string; date: string; type: 'tardiness' | 'early_departure' }>;
    
    // Caches & Pre-fetched Data
    existingRecordsMap: Set<string>;
    existingTardinessMap: Set<string>;
    existingDeparturesMap: Set<string>;
    existingIncidencesAutoMap: Set<string>;
    
    employeeShifts: Record<string, EmployeeShiftConfig>;
    
    employeeTimeBankBalances: Record<string, number>;
    shiftCache: Record<string, any>;
    locationCache: Record<string, any>;
    positionCache: Record<string, any>;
    employeeAssignments: Record<string, EmployeeShiftAssignment[]>;
    
    officialHolidayDates: Record<string, string>;
    locationBenefitDatesMap: Record<string, Set<string>>;
    approvedIncidencesMap: Record<string, Array<{ startDate: string; endDate: string; type: string }>>;
    weeklyOvertimeAccum: Record<string, { doubleUsed: number; weekKey: string }>;
}
