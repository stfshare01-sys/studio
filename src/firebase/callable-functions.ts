'use client';

/**
 * HCM Callable Functions Client
 * 
 * Client-side wrappers for calling Cloud Functions.
 * These functions handle authentication context automatically
 * and provide proper error handling.
 */

import { httpsCallable, HttpsCallableResult } from 'firebase/functions';
import { initializeFirebase } from '.';

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

// Request/Response types matching Cloud Functions

interface ConsolidatePrenominaRequest {
    periodStart: string;
    periodEnd: string;
    periodType: 'weekly' | 'biweekly' | 'monthly';
    employeeIds?: string[];
    closedBy?: string; // Optional for backward compatibility, though not used in backend v2
}

interface ConsolidatePrenominaResponse {
    success: boolean;
    recordIds: string[];
    processedCount: number;
    skippedCount: number;
    errors: { employeeId: string; message: string }[];
}

interface EmployeeImportRow {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: 'full_time' | 'part_time' | 'contractor';
    shiftType: 'diurnal' | 'nocturnal' | 'mixed';
    hireDate: string;
    salaryDaily: string;
    managerEmail?: string;
}

interface ProcessEmployeeImportRequest {
    rows: EmployeeImportRow[];
    filename: string;
}

interface ProcessEmployeeImportResponse {
    success: boolean;
    batchId: string;
    recordCount: number;
    successCount: number;
    errorCount: number;
    errors: { row: number; message: string }[];
}

interface CalculateSettlementRequest {
    employeeId: string;
    terminationType: 'resignation' | 'dismissal_justified' | 'dismissal_unjustified' | 'mutual_agreement';
    terminationDate: string;
}

interface CalculateSettlementResponse {
    success: boolean;
    settlementId: string;
    settlement: {
        id: string;
        employeeId: string;
        employeeName: string;
        type: string;
        terminationDate: string;
        proportionalVacation: number;
        proportionalVacationPremium: number;
        proportionalAguinaldo: number;
        salaryPending: number;
        severancePay: number;
        seniorityPremium: number;
        twentyDaysPerYear: number;
        totalPerceptions: number;
        totalDeductions: number;
        netSettlement: number;
        status: string;
        calculatedAt: string;
        calculatedById: string;
    };
}

interface ApproveIncidenceRequest {
    incidenceId: string;
    action: 'approve' | 'reject';
    rejectionReason?: string;
}

interface ApproveIncidenceResponse {
    success: boolean;
}

// =========================================================================
// ERROR HANDLING
// =========================================================================

export class CloudFunctionError extends Error {
    code: string;
    details?: unknown;

    constructor(code: string, message: string, details?: unknown) {
        super(message);
        this.name = 'CloudFunctionError';
        this.code = code;
        this.details = details;
    }
}

function handleCallableError(error: unknown): never {
    if (error && typeof error === 'object' && 'code' in error) {
        const fbError = error as { code: string; message: string; details?: unknown };
        throw new CloudFunctionError(
            fbError.code,
            fbError.message || 'Error en la operación',
            fbError.details
        );
    }
    throw new CloudFunctionError('unknown', 'Error desconocido en la operación');
}

// =========================================================================
// CALLABLE FUNCTION WRAPPERS
// =========================================================================

/**
 * Consolidates prenomina records for a period.
 * Uses Firestore transactions on the server for atomicity.
 * 
 * @requires Role: Admin or HRManager
 */
export async function callConsolidatePrenomina(
    params: ConsolidatePrenominaRequest
): Promise<ConsolidatePrenominaResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<ConsolidatePrenominaRequest, ConsolidatePrenominaResponse>(
            functions,
            'consolidatePrenomina'
        );

        const result: HttpsCallableResult<ConsolidatePrenominaResponse> = await callable(params);
        return result.data;
    } catch (error) {
        handleCallableError(error);
    }
}

/**
 * Processes bulk employee import with validation.
 * Creates employees and compensation records atomically.
 * 
 * @requires Role: Admin or HRManager
 */
export async function callProcessEmployeeImport(
    params: ProcessEmployeeImportRequest
): Promise<ProcessEmployeeImportResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<ProcessEmployeeImportRequest, ProcessEmployeeImportResponse>(
            functions,
            'processEmployeeImport'
        );

        const result = await callable(params);
        return result.data;
    } catch (error) {
        handleCallableError(error);
    }
}

/**
 * Calculates termination settlement using protected LFT formulas.
 * All calculations run server-side.
 * 
 * @requires Role: Admin or HRManager
 */
export async function callCalculateSettlement(
    params: CalculateSettlementRequest
): Promise<CalculateSettlementResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<CalculateSettlementRequest, CalculateSettlementResponse>(
            functions,
            'calculateSettlement'
        );

        const result = await callable(params);
        return result.data;
    } catch (error) {
        handleCallableError(error);
    }
}

/**
 * Approves or rejects an incidence request.
 * 
 * @requires Role: Admin, HRManager, or Manager
 */
export async function callApproveIncidence(
    params: ApproveIncidenceRequest
): Promise<ApproveIncidenceResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<ApproveIncidenceRequest, ApproveIncidenceResponse>(
            functions,
            'approveIncidence'
        );

        const result = await callable(params);
        return result.data;
    } catch (error) {
        handleCallableError(error);
    }
}

// =========================================================================
// PAYROLL REPORTS
// =========================================================================

interface GeneratePayrollReportsRequest {
    periodStart: string;
    periodEnd: string;
}

interface GeneratePayrollReportsResponse {
    success: boolean;
    downloadUrl: string;
    file1Name: string;
    file2Name: string;
}

/**
 * Generates two Excel payroll reports (Tiempos/Ausentismos + Asistencia/Estatus)
 * and returns a signed URL to download the ZIP file.
 *
 * @requires Role: Admin or HRManager
 */
export async function callGeneratePayrollReports(
    params: GeneratePayrollReportsRequest
): Promise<GeneratePayrollReportsResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<GeneratePayrollReportsRequest, GeneratePayrollReportsResponse>(
            functions,
            'generatePayrollReports'
        );

        const result = await callable(params);
        return result.data;
    } catch (error) {
        handleCallableError(error);
    }
}

// =========================================================================
// EXPORTS FOR COMPATIBILITY
// =========================================================================

export type {
    ConsolidatePrenominaRequest,
    ConsolidatePrenominaResponse,
    ProcessEmployeeImportRequest,
    ProcessEmployeeImportResponse,
    CalculateSettlementRequest,
    CalculateSettlementResponse,
    ApproveIncidenceRequest,
    ApproveIncidenceResponse,
    GeneratePayrollReportsRequest,
    GeneratePayrollReportsResponse,
    EmployeeImportRow
};
