'use client';

/**
 * team-queries.ts
 *
 * Consultas de estructura jerárquica de equipo (subordinados).
 * Esta es la base de todos los demás módulos del dominio Team.
 *
 * Extraído de team-actions.ts como parte de la segmentación de módulos.
 *
 * Funciones exportadas:
 *  - getDirectReports
 *  - getHierarchicalReports
 *  - hasDirectReports
 */

import {
    collection,
    getDocs,
    query,
    where,
    orderBy
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Employee } from '@/lib/types';

// =========================================================================
// SUBORDINADOS DIRECTOS
// =========================================================================

/**
 * Obtiene los subordinados directos de un manager
 * Si managerId === 'all', devuelve TODOS los empleados activos (requiere permisos globales)
 */
export async function getDirectReports(
    managerId: string
): Promise<{ success: boolean; employees?: Employee[]; error?: string }> {
    try {
        const { firestore } = initializeFirebase();
        let employeesQuery;

        if (managerId === 'all') {
            employeesQuery = query(
                collection(firestore, 'employees'),
                where('status', '==', 'active'),
                orderBy('fullName')
            );
        } else {
            employeesQuery = query(
                collection(firestore, 'employees'),
                where('directManagerId', '==', managerId),
                where('status', '==', 'active'),
                orderBy('fullName')
            );
        }

        const snapshot = await getDocs(employeesQuery);
        const employees = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data()
        })) as Employee[];

        return { success: true, employees };
    } catch (error) {
        console.error('[Team] Error getting direct reports:', error);
        return { success: false, error: 'Error obteniendo subordinados.' };
    }
}

/**
 * Obtiene subordinados recursivos (directos + subordinados de subordinados)
 * Útil para que el jefe del jefe pueda ver las solicitudes de toda su cadena.
 * maxDepth controla cuántos niveles de jerarquía recorrer (default: 3)
 */
export async function getHierarchicalReports(
    managerId: string,
    maxDepth: number = 3
): Promise<{ success: boolean; employees?: Employee[]; error?: string }> {
    try {
        // Caso especial: "all" → delegar a getDirectReports que ya maneja la vista global
        if (managerId === 'all') {
            return getDirectReports('all');
        }

        const { firestore } = initializeFirebase();
        const allEmployees = new Map<string, Employee>();
        let currentManagerIds = [managerId];

        for (let depth = 0; depth < maxDepth; depth++) {
            if (currentManagerIds.length === 0) break;

            // Firestore 'in' supports up to 30 elements — batch if needed
            const nextLevelManagerIds: string[] = [];

            for (let i = 0; i < currentManagerIds.length; i += 30) {
                const batch = currentManagerIds.slice(i, i + 30);
                const employeesQuery = query(
                    collection(firestore, 'employees'),
                    where('directManagerId', 'in', batch),
                    where('status', '==', 'active')
                );

                const snapshot = await getDocs(employeesQuery);
                snapshot.docs.forEach(d => {
                    const emp = { id: d.id, ...d.data() } as Employee;
                    if (!allEmployees.has(emp.id)) {
                        allEmployees.set(emp.id, emp);
                        // This employee could also be a manager with their own subordinates
                        nextLevelManagerIds.push(emp.id);
                    }
                });
            }

            currentManagerIds = nextLevelManagerIds;
        }

        // Sort by fullName
        const sorted = Array.from(allEmployees.values()).sort((a, b) =>
            (a.fullName || '').localeCompare(b.fullName || '')
        );

        return { success: true, employees: sorted };
    } catch (error) {
        console.error('[Team] Error getting hierarchical reports:', error);
        return { success: false, error: 'Error obteniendo subordinados jerárquicos.' };
    }
}

/**
 * Verifica si un usuario tiene subordinados directos
 */
export async function hasDirectReports(
    managerId: string
): Promise<boolean> {
    try {
        const { firestore } = initializeFirebase();

        const employeesQuery = query(
            collection(firestore, 'employees'),
            where('directManagerId', '==', managerId),
            where('status', '==', 'active')
        );

        const snapshot = await getDocs(employeesQuery);
        return !snapshot.empty;
    } catch (error) {
        console.error('[Team] Error checking direct reports:', error);
        return false;
    }
}
