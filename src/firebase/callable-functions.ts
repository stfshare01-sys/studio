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
}

interface ConsolidatePrenominaResponse {
    success: boolean;
    recordIds: string[];
    processedCount: number;
    skippedCount: number;
    errors: { employeeId: string; message: string }[];
}

export interface EmployeeImportRow {
    employeeNumber: string;       // ID NomiPAQ del empleado
    fullName: string;
    email: string;
    hireDate: string;             // YYYY-MM-DD
    employmentType: 'full_time' | 'part_time' | 'contractor' | 'intern';
    positionCode: string;         // Código del puesto (debe existir en catálogo)
    shiftCode: string;            // Código del turno (debe existir en catálogo)
    locationCode: string;         // Código de ubicación (debe existir en catálogo)
    managerNumber?: string;       // Número NomiPAQ del jefe directo
    rfc?: string;
    curp?: string;
    nss?: string;
    legalEntity?: string;         // STFLatin America, Stuffactory, etc.
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

interface ApproveIncidenceRequest {
    incidenceId: string;
    action: 'approve' | 'reject' | 'cancel';
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
// INCIDENCE NOTIFICATION WITH ESCALATION
// =========================================================================

interface NotifyNewIncidenceRequest {
    incidenceId: string;
    employeeId: string;
    employeeName: string;
    managerId: string;
    type: string;
    startDate: string;
    endDate: string;
}

interface NotifyNewIncidenceResponse {
    success: boolean;
    notifiedId: string;
    notifiedName: string;
    escalated: boolean;
    absentManagerNames?: string[];
}

/**
 * Notifies the appropriate approver about a new incidence.
 * If the direct manager is absent, escalates to the next available manager + HR.
 */
export async function callNotifyNewIncidence(
    params: NotifyNewIncidenceRequest
): Promise<NotifyNewIncidenceResponse> {
    try {
        const { functions } = initializeFirebase();
        const callable = httpsCallable<NotifyNewIncidenceRequest, NotifyNewIncidenceResponse>(
            functions,
            'notifyNewIncidence'
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
    legalEntity?: string;
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
    ApproveIncidenceRequest,
    ApproveIncidenceResponse,
    GeneratePayrollReportsRequest,
    GeneratePayrollReportsResponse,
};
