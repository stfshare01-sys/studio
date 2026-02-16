'use client';

import {
    collection,
    doc,
    addDoc,
    updateDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    limit
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Department } from '@/lib/types';

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
