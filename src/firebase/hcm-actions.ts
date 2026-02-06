'use client';

/**
 * DEPRECATED: hcm-actions.ts
 * 
 * This file has been split into modular files in ./actions/
 * Please import from there or via the re-exports below.
 * 
 * ARCHITECTURE NOTE:
 * - Critical operations (prenomina, settlements, employee import) now use Cloud Functions
 * - Simple CRUD operations remain client-side for responsive UI
 * - LFT payroll calculations are performed server-side for security
 */

import { Firestore, doc, collection, addDoc, updateDoc, getDoc, getDocs, query, where, orderBy, limit, Timestamp, setDoc } from 'firebase/firestore';
import { initializeFirebase } from '.';
import { setDocumentNonBlocking, updateDocumentNonBlocking, addDocumentNonBlocking } from './non-blocking-updates';
import {
    callConsolidatePrenomina,
    callProcessEmployeeImport,
    callCalculateSettlement,
    callApproveIncidence,
    CloudFunctionError,
    type EmployeeImportRow as CFEmployeeImportRow
} from './callable-functions';
import type {
    Employee,
    Compensation,
    AttendanceRecord,
    Incidence,
    PrenominaRecord,
    AttendanceImportBatch,
    TimeBank,
    SettlementCalculation,
    ShiftType,
    EmployeeImportBatch,
    Department,
} from '@/lib/types';
import {
    calculateVacationDays,
    calculateYearsOfService,
    validateWorkday,
    calculateHoursWorked
} from '@/lib/hcm-utils';

// =========================================================================
// LOCAL HELPER FUNCTIONS (Compensation calculations)
// =========================================================================

/**
 * Calcula el factor de integración del SDI según LFT
 * SDI Factor = 1 + (prima_vacacional * dias_vacaciones / 365) + (aguinaldo / 365)
 */
function calculateSDIFactor(
    vacationDays: number,
    vacationPremium: number = 0.25,
    aguinaldoDays: number = 15
): number {
    const factor = 1 + ((vacationPremium * vacationDays) / 365) + (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000;
}

/**
 * Calcula el Salario Diario Integrado
 * SDI = Salario Diario * Factor de Integración
 */
function calculateSDI(salaryDaily: number, sdiFactor: number): number {
    return Math.round(salaryDaily * sdiFactor * 100) / 100;
}

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

        const employeeData: Partial<Employee> = {
            id: userId,
            ...payload,
            role: 'Member',
            status: 'active',
            onboardingStatus: 'day_0',
            onboardingObjectives: [],
        };

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
// COMPENSATION MANAGEMENT
// =========================================================================

interface CreateCompensationPayload {
    employeeId: string;
    salaryDaily: number;
    vacationPremium?: number;
    aguinaldoDays?: number;
    savingsFundPercentage?: number;
    foodVouchersDaily?: number;
    effectiveDate: string;
    createdById: string;
}

/**
 * Creates a new compensation record with automatic SDI calculation
 */
export async function createCompensation(
    payload: CreateCompensationPayload
): Promise<{ success: boolean; compensationId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get employee to calculate years of service
        const employeeRef = doc(firestore, 'employees', payload.employeeId);
        const employeeSnap = await getDoc(employeeRef);

        if (!employeeSnap.exists()) {
            return { success: false, error: 'Empleado no encontrado.' };
        }

        const employee = employeeSnap.data() as Employee;
        const yearsOfService = calculateYearsOfService(employee.hireDate);

        // Calculate vacation days based on seniority
        const vacationDays = calculateVacationDays(yearsOfService);
        const vacationPremium = payload.vacationPremium ?? 0.25; // 25% minimum
        const aguinaldoDays = payload.aguinaldoDays ?? 15; // 15 days minimum

        // Calculate SDI factor and SDI
        const sdiFactor = calculateSDIFactor(vacationDays, vacationPremium, aguinaldoDays);
        const sdiBase = calculateSDI(payload.salaryDaily, sdiFactor);

        const now = new Date().toISOString();

        const compensationData: Omit<Compensation, 'id'> = {
            employeeId: payload.employeeId,
            salaryDaily: payload.salaryDaily,
            salaryMonthly: Math.round(payload.salaryDaily * 30.4 * 100) / 100,
            sdiBase,
            sdiFactor,
            vacationDays,
            vacationPremium,
            aguinaldoDays,
            savingsFundPercentage: payload.savingsFundPercentage,
            foodVouchersDaily: payload.foodVouchersDaily,
            effectiveDate: payload.effectiveDate,
            createdAt: now,
            updatedAt: now,
            createdById: payload.createdById
        };

        const compensationRef = collection(firestore, 'compensation');
        const docRef = await addDoc(compensationRef, compensationData);

        console.log(`[HCM] Created compensation record ${docRef.id} for employee ${payload.employeeId}`);
        return { success: true, compensationId: docRef.id };
    } catch (error) {
        console.error('[HCM] Error creating compensation:', error);
        return { success: false, error: 'No se pudo crear el registro de compensación.' };
    }
}

// =========================================================================
// ATTENDANCE IMPORT
// =========================================================================

interface AttendanceImportRow {
    employeeId: string;
    date: string;
    checkIn: string;
    checkOut: string;
}

interface ProcessAttendanceResult {
    success: boolean;
    batchId?: string;
    recordCount?: number;
    successCount?: number;
    errorCount?: number;
    errors?: Array<{ row: number; message: string }>;
}

/**
 * Processes imported attendance data from Excel/CSV
 * Validates work hours according to LFT shift rules
 */

// =========================================================================
// DEPARTMENT MANAGEMENT
// =========================================================================

interface CreateDepartmentPayload {
    name: string;
    code: string;
    description?: string;
    managerPositionId?: string;
    parentDepartmentId?: string;
    costCenter?: string;
    budget?: number;
    budgetPeriod?: 'monthly' | 'quarterly' | 'annual';
    locationId?: string;
    createdById: string;
}

/**
 * Creates a new department
 */
export async function createDepartment(
    payload: CreateDepartmentPayload
): Promise<{ success: boolean; departmentId?: string; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // Check if code is unique
        const codeQuery = query(
            collection(firestore, 'departments'),
            where('code', '==', payload.code),
            limit(1)
        );
        const codeSnap = await getDocs(codeQuery);

        if (!codeSnap.empty) {
            return { success: false, error: 'Ya existe un departamento con este codigo.' };
        }

        // Validate parent department exists if provided
        if (payload.parentDepartmentId) {
            const parentRef = doc(firestore, 'departments', payload.parentDepartmentId);
            const parentSnap = await getDoc(parentRef);
            if (!parentSnap.exists()) {
                return { success: false, error: 'Departamento padre no encontrado.' };
            }
        }

        // Validate manager position exists if provided
        if (payload.managerPositionId) {
            const managerPositionRef = doc(firestore, 'positions', payload.managerPositionId);
            const managerPositionSnap = await getDoc(managerPositionRef);
            if (!managerPositionSnap.exists()) {
                return { success: false, error: 'Puesto responsable no encontrado.' };
            }
        }

        const departmentData: Omit<Department, 'id'> = {
            name: payload.name,
            code: payload.code,
            description: payload.description,
            managerPositionId: payload.managerPositionId,
            parentDepartmentId: payload.parentDepartmentId,
            costCenter: payload.costCenter,
            budget: payload.budget,
            budgetPeriod: payload.budgetPeriod,
            locationId: payload.locationId,
            isActive: true,
            createdAt: now,
            updatedAt: now,
            createdById: payload.createdById,
        };

        const departmentRef = await addDoc(collection(firestore, 'departments'), departmentData);

        console.log(`[HCM] Created department ${departmentRef.id}: ${payload.name}`);
        return { success: true, departmentId: departmentRef.id };
    } catch (error) {
        console.error('[HCM] Error creating department:', error);
        return { success: false, error: 'No se pudo crear el departamento.' };
    }
}

interface UpdateDepartmentPayload {
    name?: string;
    description?: string;
    managerPositionId?: string;
    parentDepartmentId?: string;
    costCenter?: string;
    budget?: number;
    budgetPeriod?: 'monthly' | 'quarterly' | 'annual';
    locationId?: string;
    isActive?: boolean;
}

/**
 * Updates an existing department
 */
export async function updateDepartment(
    departmentId: string,
    payload: UpdateDepartmentPayload
): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        const departmentRef = doc(firestore, 'departments', departmentId);
        const departmentSnap = await getDoc(departmentRef);

        if (!departmentSnap.exists()) {
            return { success: false, error: 'Departamento no encontrado.' };
        }

        // Prevent circular parent references
        if (payload.parentDepartmentId === departmentId) {
            return { success: false, error: 'Un departamento no puede ser su propio padre.' };
        }

        // Validate parent department exists if changing
        if (payload.parentDepartmentId) {
            const parentRef = doc(firestore, 'departments', payload.parentDepartmentId);
            const parentSnap = await getDoc(parentRef);
            if (!parentSnap.exists()) {
                return { success: false, error: 'Departamento padre no encontrado.' };
            }
        }

        // Validate manager position exists if changing
        if (payload.managerPositionId) {
            const managerPositionRef = doc(firestore, 'positions', payload.managerPositionId);
            const managerPositionSnap = await getDoc(managerPositionRef);
            if (!managerPositionSnap.exists()) {
                return { success: false, error: 'Puesto responsable no encontrado.' };
            }
        }

        await updateDoc(departmentRef, {
            ...payload,
            updatedAt: now,
        });

        console.log(`[HCM] Updated department ${departmentId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error updating department:', error);
        return { success: false, error: 'No se pudo actualizar el departamento.' };
    }
}

/**
 * Gets a single department by ID
 */
export async function getDepartment(
    departmentId: string
): Promise<{ success: boolean; department?: Department; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const departmentRef = doc(firestore, 'departments', departmentId);
        const departmentSnap = await getDoc(departmentRef);

        if (!departmentSnap.exists()) {
            return { success: false, error: 'Departamento no encontrado.' };
        }

        const department = { id: departmentSnap.id, ...departmentSnap.data() } as Department;
        return { success: true, department };
    } catch (error) {
        console.error('[HCM] Error getting department:', error);
        return { success: false, error: 'Error obteniendo departamento.' };
    }
}

/**
 * Gets all departments, optionally filtered by active status
 */
export async function getDepartments(
    activeOnly: boolean = true
): Promise<{ success: boolean; departments?: Department[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        let departmentsQuery;
        if (activeOnly) {
            departmentsQuery = query(
                collection(firestore, 'departments'),
                where('isActive', '==', true),
                orderBy('name')
            );
        } else {
            departmentsQuery = query(
                collection(firestore, 'departments'),
                orderBy('name')
            );
        }

        const departmentsSnap = await getDocs(departmentsQuery);
        const departments = departmentsSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Department[];

        return { success: true, departments };
    } catch (error) {
        console.error('[HCM] Error getting departments:', error);
        return { success: false, error: 'Error obteniendo departamentos.' };
    }
}

/**
 * Gets child departments of a parent department
 */
export async function getDepartmentsByParent(
    parentDepartmentId: string
): Promise<{ success: boolean; departments?: Department[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        const childrenQuery = query(
            collection(firestore, 'departments'),
            where('parentDepartmentId', '==', parentDepartmentId),
            where('isActive', '==', true),
            orderBy('name')
        );

        const childrenSnap = await getDocs(childrenQuery);
        const departments = childrenSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Department[];

        return { success: true, departments };
    } catch (error) {
        console.error('[HCM] Error getting child departments:', error);
        return { success: false, error: 'Error obteniendo subdepartamentos.' };
    }
}

/**
 * Gets root departments (no parent)
 */
export async function getRootDepartments(): Promise<{ success: boolean; departments?: Department[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();

        // Get all active departments
        const allDeptQuery = query(
            collection(firestore, 'departments'),
            where('isActive', '==', true),
            orderBy('name')
        );

        const allDeptSnap = await getDocs(allDeptQuery);

        // Filter to only root departments (no parentDepartmentId or empty)
        const rootDepartments = allDeptSnap.docs
            .map(d => ({ id: d.id, ...d.data() }) as Department)
            .filter(d => !d.parentDepartmentId);

        return { success: true, departments: rootDepartments };
    } catch (error) {
        console.error('[HCM] Error getting root departments:', error);
        return { success: false, error: 'Error obteniendo departamentos raiz.' };
    }
}

/**
 * Gets the department hierarchy tree
 */
export async function getDepartmentHierarchy(): Promise<{
    success: boolean;
    hierarchy?: Array<Department & { children: Department[] }>;
    error?: string
}> {
    try {
        const { firestore } = initializeFirebase();

        const allDeptQuery = query(
            collection(firestore, 'departments'),
            where('isActive', '==', true),
            orderBy('name')
        );

        const allDeptSnap = await getDocs(allDeptQuery);
        const allDepartments = allDeptSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Department[];

        // Build hierarchy
        const departmentMap = new Map<string, Department & { children: Department[] }>();

        // Initialize all departments with empty children arrays
        allDepartments.forEach(dept => {
            departmentMap.set(dept.id, { ...dept, children: [] });
        });

        // Build the tree
        const rootDepartments: Array<Department & { children: Department[] }> = [];

        allDepartments.forEach(dept => {
            const deptWithChildren = departmentMap.get(dept.id)!;

            if (dept.parentDepartmentId && departmentMap.has(dept.parentDepartmentId)) {
                departmentMap.get(dept.parentDepartmentId)!.children.push(deptWithChildren);
            } else {
                rootDepartments.push(deptWithChildren);
            }
        });

        return { success: true, hierarchy: rootDepartments };
    } catch (error) {
        console.error('[HCM] Error getting department hierarchy:', error);
        return { success: false, error: 'Error obteniendo jerarquia de departamentos.' };
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

// =========================================================================
// VACATION APPROVAL CALLBACKS
// =========================================================================

/**
 * Callback when a vacation request is approved
 * Deducts days from balance and updates incidence status
 */
export async function onVacationApproved(requestData: {
    employeeId: string;
    incidenceId: string;
    startDate: string;
    endDate: string;
    totalDays: number;
    approvedById: string;
    approvedByName?: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // 1. Update incidence status to approved
        const incidenceRef = doc(firestore, 'incidences', requestData.incidenceId);
        await updateDoc(incidenceRef, {
            status: 'approved',
            approvedById: requestData.approvedById,
            approvedByName: requestData.approvedByName,
            approvedAt: now,
            updatedAt: now,
        });

        // 2. Get current vacation balance
        const balanceQuery = query(
            collection(firestore, 'vacation_balances'),
            where('employeeId', '==', requestData.employeeId),
            orderBy('periodStart', 'desc'),
            limit(1)
        );
        const balanceSnap = await getDocs(balanceQuery);

        if (!balanceSnap.empty) {
            const balanceDoc = balanceSnap.docs[0];
            const balanceData = balanceDoc.data();

            // Update the balance - move from available to taken
            const newDaysTaken = (balanceData.daysTaken || 0) + requestData.totalDays;
            const newDaysScheduled = Math.max(0, (balanceData.daysScheduled || 0) - requestData.totalDays);
            const newDaysAvailable = (balanceData.daysEntitled || 0) - newDaysTaken - newDaysScheduled;

            // Add movement record
            const movement = {
                id: `mov-${Date.now()}`,
                date: now,
                type: 'taken' as const,
                days: -requestData.totalDays,
                description: `Vacaciones del ${requestData.startDate} al ${requestData.endDate}`,
                incidenceId: requestData.incidenceId,
                approvedById: requestData.approvedById,
            };

            const currentMovements = balanceData.movements || [];

            await updateDoc(doc(firestore, 'vacation_balances', balanceDoc.id), {
                daysTaken: newDaysTaken,
                daysScheduled: newDaysScheduled,
                daysAvailable: newDaysAvailable,
                movements: [...currentMovements, movement],
                lastUpdated: now,
            });
        }

        console.log(`[HCM] Vacation approved for employee ${requestData.employeeId}, ${requestData.totalDays} days deducted`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error processing vacation approval:', error);
        return { success: false, error: 'Error procesando aprobación de vacaciones.' };
    }
}

/**
 * Callback when a vacation request is rejected
 * Updates incidence status and releases scheduled days
 */
export async function onVacationRejected(requestData: {
    employeeId: string;
    incidenceId: string;
    rejectedById: string;
    rejectedByName?: string;
    reason: string;
}): Promise<{ success: boolean; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        const now = new Date().toISOString();

        // 1. Get the incidence to see how many days were requested
        const incidenceRef = doc(firestore, 'incidences', requestData.incidenceId);
        const incidenceSnap = await getDoc(incidenceRef);

        if (!incidenceSnap.exists()) {
            return { success: false, error: 'Incidencia no encontrada.' };
        }

        const incidenceData = incidenceSnap.data();

        // 2. Update incidence status to rejected
        await updateDoc(incidenceRef, {
            status: 'rejected',
            approvedById: requestData.rejectedById,
            approvedByName: requestData.rejectedByName,
            rejectionReason: requestData.reason,
            approvedAt: now,
            updatedAt: now,
        });

        // 3. Release scheduled days back to available
        if (incidenceData.type === 'vacation') {
            const balanceQuery = query(
                collection(firestore, 'vacation_balances'),
                where('employeeId', '==', requestData.employeeId),
                orderBy('periodStart', 'desc'),
                limit(1)
            );
            const balanceSnap = await getDocs(balanceQuery);

            if (!balanceSnap.empty) {
                const balanceDoc = balanceSnap.docs[0];
                const balanceData = balanceDoc.data();
                const totalDays = incidenceData.totalDays || 0;

                // Release scheduled days
                const newDaysScheduled = Math.max(0, (balanceData.daysScheduled || 0) - totalDays);
                const newDaysAvailable = (balanceData.daysEntitled || 0) - (balanceData.daysTaken || 0) - newDaysScheduled;

                // Add movement record
                const movement = {
                    id: `mov-${Date.now()}`,
                    date: now,
                    type: 'cancelled' as const,
                    days: totalDays,
                    description: `Rechazo: ${requestData.reason}`,
                    incidenceId: requestData.incidenceId,
                    approvedById: requestData.rejectedById,
                };

                const currentMovements = balanceData.movements || [];

                await updateDoc(doc(firestore, 'vacation_balances', balanceDoc.id), {
                    daysScheduled: newDaysScheduled,
                    daysAvailable: newDaysAvailable,
                    movements: [...currentMovements, movement],
                    lastUpdated: now,
                });
            }
        }

        console.log(`[HCM] Vacation rejected for employee ${requestData.employeeId}`);
        return { success: true };
    } catch (error) {
        console.error('[HCM] Error processing vacation rejection:', error);
        return { success: false, error: 'Error procesando rechazo de vacaciones.' };
    }
}
