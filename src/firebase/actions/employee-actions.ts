'use client';

import { doc, setDoc, collection, query, getDocs, updateDoc, deleteField, DocumentSnapshot } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '../non-blocking-updates';
import { callProcessEmployeeImport, CloudFunctionError, type EmployeeImportRow as CFEmployeeImportRow } from '../callable-functions';
import type { Employee, ShiftType } from '@/lib/types';

// =========================================================================
// EMPLOYEE MANAGEMENT
// =========================================================================

interface CreateEmployeePayload {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: Employee['employmentType'];
    shiftType: ShiftType;
    hireDate: string;
    managerId?: string;
    rfc_curp?: string;
    nss?: string;
    clabe?: string;
    costCenter?: string;
}

/**
 * Creates a new employee record extending the base user
 */
export async function createEmployee(
    userId: string,
    payload: CreateEmployeePayload
): Promise<{ success: boolean; employeeId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const employeeRef = doc(firestore, 'employees', userId);

        // Build employee data, excluding undefined values (Firestore doesn't accept undefined)
        const employeeData: Record<string, unknown> = {
            id: userId,
            fullName: payload.fullName,
            email: payload.email,
            department: payload.department,
            positionTitle: payload.positionTitle,
            employmentType: payload.employmentType,
            shiftType: payload.shiftType,
            hireDate: payload.hireDate,
            role: 'Member',
            status: 'active',
            onboardingStatus: 'day_0',
            onboardingObjectives: [],
        };

        // Only add optional fields if they have values
        if (payload.managerId) employeeData.directManagerId = payload.managerId;
        if (payload.rfc_curp) employeeData.rfc_curp = payload.rfc_curp;
        if (payload.nss) employeeData.nss = payload.nss;
        if (payload.clabe) employeeData.clabe = payload.clabe;
        if (payload.costCenter) employeeData.costCenter = payload.costCenter;

        await setDoc(employeeRef, employeeData, {});

        console.log(`[HCM] Created employee record for ${userId}`);
        return { success: true, employeeId: userId };
    } catch (error) {
        console.error('[HCM] Error creating employee:', error);
        return { success: false, error: 'No se pudo crear el registro del empleado.' };
    }
}

/**
 * Updates an employee's onboarding status
 */
export async function updateOnboardingStatus(
    employeeId: string,
    phase: Employee['onboardingStatus']
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const employeeRef = doc(firestore, 'employees', employeeId);

        updateDocumentNonBlocking(employeeRef, {
            onboardingStatus: phase
        });

        console.log(`[HCM] Updated onboarding status for ${employeeId} to ${phase}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating onboarding:', error);
        return { success: false, error: 'No se pudo actualizar el estatus de onboarding.' };
    }
}

/**
 * Adds an employee to the blacklist
 */
export async function blacklistEmployee(
    employeeId: string,
    reason: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const employeeRef = doc(firestore, 'employees', employeeId);

        updateDocumentNonBlocking(employeeRef, {
            isBlacklisted: true,
            blacklistReason: reason,
            blacklistDate: new Date().toISOString(),
            status: 'disabled',
            terminationDate: new Date().toISOString()
        });

        console.log(`[HCM] Blacklisted employee ${employeeId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error blacklisting employee:', error);
        return { success: false, error: 'No se pudo agregar a lista negra.' };
    }
}

// =========================================================================
// EMPLOYEE IMPORT
// =========================================================================

interface EmployeeImportRow {
    fullName: string;
    email: string;
    department: string;
    positionTitle: string;
    employmentType: Employee['employmentType'];
    shiftType: ShiftType;
    hireDate: string;
    salaryDaily: string;
    // NOTE: salaryDaily retained in interface for compatibility with UI form,
    // but should be ignored or strictly passed to secure backend without client processing.
    managerEmail?: string;
}

interface ProcessEmployeeImportResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

/**
 * Processes bulk employee import with validation.
 */
export async function processEmployeeImport(
    rows: EmployeeImportRow[],
    uploadedById: string,
    uploadedByName: string,
    filename: string
): Promise<ProcessEmployeeImportResult> {
    try {
        // Convert to Cloud Function format with type validation
        const validEmploymentTypes = ['full_time', 'part_time', 'contractor'] as const;
        const cfRows: CFEmployeeImportRow[] = rows.map(row => {
            // Map employment type - default to full_time for unsupported types
            const empType = validEmploymentTypes.includes(row.employmentType as any)
                ? row.employmentType as 'full_time' | 'part_time' | 'contractor'
                : 'full_time';

            return {
                fullName: row.fullName,
                email: row.email,
                department: row.department,
                positionTitle: row.positionTitle,
                employmentType: empType,
                shiftType: row.shiftType || 'diurnal',
                hireDate: row.hireDate,
                salaryDaily: row.salaryDaily, // Passing through to backend, not using here
                managerEmail: row.managerEmail
            };
        });

        const result = await callProcessEmployeeImport({
            rows: cfRows,
            filename
        });

        console.log(`[HCM] Processed employee import: ${result.successCount} success, ${result.errorCount} errors`);

        return {
            success: result.success,
            batchId: result.batchId,
            recordCount: result.recordCount,
            successCount: result.successCount,
            errorCount: result.errorCount,
            errors: result.errors
        };
    } catch (error) {
        console.error('[HCM] Error processing employee import:', error);
        if (error instanceof CloudFunctionError) {
            return { success: false, errors: [{ row: 0, message: error.message }] };
        }
        return { success: false, errors: [{ row: 0, message: 'Error general en la importación de empleados' }] };
    }
}

/**
 * Migrates employees with 'managerId' field to use 'directManagerId'
 * This is needed because the field name was inconsistent in older code
 */
export async function migrateManagerIdField(): Promise<{
    success: boolean;
    migratedCount: number;
    error?: string
}> {
    try {
        const { firestore } = initializeFirebase();

        // Get all employees
        const employeesQuery = query(collection(firestore, 'employees'));
        const snapshot = await getDocs(employeesQuery);

        let migratedCount = 0;
        const batch: Promise<void>[] = [];

        snapshot.docs.forEach((docSnap) => {
            const data = docSnap.data();
            // Check if employee has managerId but not directManagerId
            if (data.managerId && !data.directManagerId) {
                const employeeRef = doc(firestore, 'employees', docSnap.id);
                batch.push(
                    updateDoc(employeeRef, {
                        directManagerId: data.managerId,
                        managerId: deleteField(), // Remove the old field
                        updatedAt: new Date().toISOString()
                    }).then(() => {
                        migratedCount++;
                    })
                );
            }
        });

        await Promise.all(batch);

        console.log(`[HCM] Migrated ${migratedCount} employees from managerId to directManagerId`);
        return { success: true, migratedCount };
    } catch (error) {
        console.error('[HCM] Error migrating managerId field:', error);
        return { success: false, migratedCount: 0, error: 'Error migrando campo managerId.' };
    }
}
