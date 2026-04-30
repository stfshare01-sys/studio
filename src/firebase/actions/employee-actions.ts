'use client';

import { doc, setDoc, collection, query, getDocs, updateDoc, deleteField, DocumentSnapshot, getDoc, where, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import { updateDocumentNonBlocking } from '../non-blocking-updates';
import { callProcessEmployeeImport, CloudFunctionError, type EmployeeImportRow as CFEmployeeImportRow } from '../callable-functions';
import type { Employee, ShiftType, Incidence } from "@/types/hcm.types";

// =========================================================================
// EMPLOYEE MANAGEMENT
// =========================================================================

interface CreateEmployeePayload {
    fullName: string;
    email: string;
    department: string;
    departmentId?: string;
    positionId?: string;
    positionTitle: string;
    employmentType: Employee['employmentType'];
    shiftType: ShiftType;
    shiftId?: string;
    hireDate: string;
    managerId?: string;
    rfc?: string;
    curp?: string;
    nss?: string;
    clabe?: string;
    costCenter?: string;
    locationId?: string; // Added locationId
    allowTimeForTime?: boolean;
    employeeId?: string; // ZKTeco / Biometric ID
    legalEntity?: string;
    avatarUrl?: string; // URL of the uploaded profile photo
    homeOfficeDays?: number[]; // [0,1,2,3,4,5,6]
    workMode?: Employee['workMode'];
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
        if (payload.positionId) employeeData.positionId = payload.positionId;
        if (payload.avatarUrl) employeeData.avatarUrl = payload.avatarUrl;
        if (payload.rfc) employeeData.rfc = payload.rfc;
        if (payload.curp) employeeData.curp = payload.curp;
        if (payload.nss) employeeData.nss = payload.nss;
        if (payload.clabe) employeeData.clabe = payload.clabe;
        if (payload.costCenter) employeeData.costCenter = payload.costCenter;
        if (payload.locationId) employeeData.locationId = payload.locationId; // Map locationId
        if (payload.allowTimeForTime !== undefined) employeeData.allowTimeForTime = payload.allowTimeForTime;
        if (payload.shiftId) employeeData.customShiftId = payload.shiftId;
        if (payload.employeeId) employeeData.employeeId = payload.employeeId;
        if (payload.legalEntity) employeeData.legalEntity = payload.legalEntity;
        if (payload.homeOfficeDays) employeeData.homeOfficeDays = payload.homeOfficeDays;
        if (payload.workMode) employeeData.workMode = payload.workMode;

        await setDoc(employeeRef, employeeData, {});

        // Sync managerId and avatarUrl to the user record for Org Chart visibility
        const userUpdates: Record<string, any> = {};
        if (payload.managerId) userUpdates.managerId = payload.managerId;
        if (payload.avatarUrl) userUpdates.avatarUrl = payload.avatarUrl;
        
        if (Object.keys(userUpdates).length > 0) {
            updateDocumentNonBlocking(doc(firestore, 'users', userId), userUpdates);
        }

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
            blacklistDate: serverTimestamp(),
            status: 'disabled',
            terminationDate: serverTimestamp()
        });

        console.log(`[HCM] Blacklisted employee ${employeeId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error blacklisting employee:', error);
        return { success: false, error: 'No se pudo agregar a lista negra.' };
    }
}

/**
 * Marks an employee as inactive ("Dar de Baja").
 * Writes `status: 'disabled'` and `terminationDate` to both the `employees`
 * and `users` Firestore collections.
 *
 * This is the only thing the prenomina NomiPAQ export needs to generate the
 * 'BJ' (Baja) code for that employee in the period closure.
 */
export async function deactivateEmployee(
    employeeId: string,
    terminationDate: string // ISO date string: 'YYYY-MM-DD'
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        // 1. Update the employees collection
        const employeeRef = doc(firestore, 'employees', employeeId);
        await updateDoc(employeeRef, {
            status: 'disabled',
            terminationDate,
            updatedAt: serverTimestamp(),
        });

        // 2. Sync status to the users collection so auth/nav guards also work
        try {
            const userRef = doc(firestore, 'users', employeeId);
            await updateDoc(userRef, {
                status: 'disabled',
                updatedAt: serverTimestamp(),
            });
        } catch (syncError) {
            // Non-blocking: log but don't fail the whole operation
            console.warn('[HCM] Could not sync status to users collection:', syncError);
        }

        console.log(`[HCM] Deactivated employee ${employeeId}. Termination date: ${terminationDate}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error deactivating employee:', error);
        return { success: false, error: 'No se pudo dar de baja al empleado.' };
    }
}

// =========================================================================
// EMPLOYEE IMPORT
// =========================================================================

interface ProcessEmployeeImportResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

/**
 * Processes bulk employee import with NomiPAQ codes.
 * Delegates to Cloud Function which performs Two-Pass processing:
 *   Pass 1: Create employees resolving position/shift/location by code
 *   Pass 2: Link manager hierarchy by employeeNumber
 */
export async function processEmployeeImport(
    rows: CFEmployeeImportRow[],
    filename: string
): Promise<ProcessEmployeeImportResult> {
    try {
        const validEmploymentTypes = ['full_time', 'part_time', 'contractor', 'intern'] as const;

        // Validate employment types before sending to backend
        const cfRows: CFEmployeeImportRow[] = rows.map(row => ({
            ...row,
            employmentType: validEmploymentTypes.includes(row.employmentType as typeof validEmploymentTypes[number])
                ? row.employmentType
                : 'full_time',
        }));

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
                        updatedAt: serverTimestamp()
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

// =========================================================================
// EMPLOYEE LOOKUP SERVICES
// =========================================================================

/**
 * Gets an employee by their Firebase Auth userId
 * Used for getting the logged-in user's employee data
 */
export async function getEmployeeByUserId(
    userId: string
): Promise<{ success: boolean; employee?: Employee; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // In this system, employee ID matches user ID
        const employeeRef = doc(firestore, 'employees', userId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado para este usuario.' };
        }

        const employee = { id: employeeSnap.id, ...employeeSnap.data() } as Employee;
        return { success: true, employee };
    } catch (error) {
        console.error('[HCM] Error getting employee by userId:', error);
        return { success: false, error: 'Error obteniendo datos del empleado.' };
    }
}

/**
 * Gets the approval limit for a position by limit type
 * Used by BPMN to determine if escalation is needed
 */
export async function getApprovalLimit(
    positionId: string,
    limitType: 'expenses' | 'purchases' | 'travel' | 'contracts' | 'vacationDays' | 'overtimeHours' | 'headcount'
): Promise<{ success: boolean; limit?: number; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const positionRef = doc(firestore, 'positions', positionId);
        const positionSnap = await getDoc(positionRef);

        if (!positionSnap.exists()) {
            return { success: false, error: 'Puesto no encontrado.' };
        }

        const position = positionSnap.data();
        const approvalLimits = position.approvalLimits;

        if (!approvalLimits || approvalLimits[limitType] === undefined) {
            // No limit defined means no restriction (or needs to escalate)
            return { success: true, limit: undefined };
        }

        return { success: true, limit: approvalLimits[limitType] };
    } catch (error) {
        console.error('[HCM] Error getting approval limit:', error);
        return { success: false, error: 'Error obteniendo límite de aprobación.' };
    }
}



/**
 * Gets upcoming leaves/incidences for an employee
 * Used for calendar display and conflict detection
 */
export async function getUpcomingLeaves(
    employeeId: string
): Promise<{ success: boolean; incidences?: Incidence[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const today = new Date().toISOString().split('T')[0];

        // Query for future and current approved/pending incidences
        const incidencesQuery = query(
            collection(firestore, 'incidences'),
            where('employeeId', '==', employeeId),
            where('endDate', '>=', today),
            where('status', 'in', ['approved', 'pending']),
            orderBy('endDate'),
            orderBy('startDate')
        );

        const incidencesSnap = await getDocs(incidencesQuery);
        const incidences = incidencesSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Incidence[];

        return { success: true, incidences };
    } catch (error) {
        console.error('[HCM] Error getting upcoming leaves:', error);
        return { success: false, error: 'Error obteniendo permisos programados.' };
    }
}
