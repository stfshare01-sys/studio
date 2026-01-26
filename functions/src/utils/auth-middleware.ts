/**
 * Authentication Middleware for Cloud Functions
 * 
 * Provides role verification utilities that read from Firestore users collection.
 * Designed for easy future migration to Custom Claims.
 */

import * as admin from 'firebase-admin';
import { HttpsError } from 'firebase-functions/v2/https';

// Initialize Firebase Admin SDK (singleton pattern)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

/**
 * User role types matching the client-side types
 */
export type UserRole = 'Admin' | 'HRManager' | 'Designer' | 'Manager' | 'Member';

/**
 * Role hierarchy for permission checks
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
    'Admin': 100,
    'HRManager': 80,
    'Designer': 60,
    'Manager': 50,
    'Member': 10,
};

/**
 * Roles allowed for HCM operations
 */
export const HCM_ROLES: UserRole[] = ['Admin', 'HRManager'];
export const MANAGER_ROLES: UserRole[] = ['Admin', 'HRManager', 'Manager'];

/**
 * Gets the user's role from Firestore users collection.
 * 
 * @param uid - Firebase Auth user ID
 * @returns User role or null if not found
 * 
 * @note This function reads from Firestore for compatibility with existing system.
 *       Future migration to Custom Claims would change this implementation only.
 */
export async function getUserRole(uid: string): Promise<UserRole | null> {
    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return null;
        }

        const userData = userDoc.data();
        return (userData?.role as UserRole) || null;
    } catch (error) {
        console.error(`Error fetching user role for ${uid}:`, error);
        return null;
    }
}

/**
 * Verifies that the authenticated user has one of the required roles.
 * Throws HttpsError if verification fails.
 * 
 * @param uid - Firebase Auth user ID
 * @param allowedRoles - Array of roles that are permitted
 * @param operation - Description of the operation for error messages
 * @returns User role if verification passes
 * @throws HttpsError with 'unauthenticated' or 'permission-denied' code
 * 
 * @example
 * // In a callable function:
 * const role = await verifyRole(context.auth?.uid, ['Admin', 'HRManager'], 'consolidate prenomina');
 */
export async function verifyRole(
    uid: string | undefined,
    allowedRoles: UserRole[],
    operation: string
): Promise<UserRole> {
    if (!uid) {
        throw new HttpsError(
            'unauthenticated',
            `Autenticación requerida para ${operation}`
        );
    }

    const role = await getUserRole(uid);

    if (!role) {
        throw new HttpsError(
            'permission-denied',
            `Usuario no encontrado o sin rol asignado`
        );
    }

    if (!allowedRoles.includes(role)) {
        throw new HttpsError(
            'permission-denied',
            `Permisos insuficientes para ${operation}. Roles permitidos: ${allowedRoles.join(', ')}`
        );
    }

    return role;
}

/**
 * Checks if a role has at least the specified minimum level.
 * Uses role hierarchy for comparison.
 * 
 * @param userRole - User's current role
 * @param minimumRole - Minimum required role
 * @returns true if user has sufficient privileges
 */
export function hasMinimumRole(userRole: UserRole, minimumRole: UserRole): boolean {
    return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[minimumRole];
}

/**
 * Gets user data including role for audit logging.
 * 
 * @param uid - Firebase Auth user ID
 * @returns User data object or null
 */
export async function getUserData(uid: string): Promise<{
    id: string;
    fullName: string;
    email: string;
    role: UserRole;
} | null> {
    try {
        const userDoc = await db.collection('users').doc(uid).get();

        if (!userDoc.exists) {
            return null;
        }

        const data = userDoc.data()!;
        return {
            id: uid,
            fullName: data.fullName || 'Unknown',
            email: data.email || '',
            role: data.role as UserRole,
        };
    } catch (error) {
        console.error(`Error fetching user data for ${uid}:`, error);
        return null;
    }
}
