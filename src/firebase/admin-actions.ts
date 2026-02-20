// Admin actions for user management.
// createNewUser uses a Cloud Function (Firebase Admin SDK) for real Auth user creation.
// toggleUserStatus and updateUserRole use client-side Firestore directly.

import { doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '.';
import { updateDocumentNonBlocking } from './non-blocking-updates';
import type { UserRole } from '@/lib/types';

// =========================================================================
// TOGGLE USER STATUS (Client-side Firestore update)
// =========================================================================

/**
 * Toggles a user's status in Firestore.
 * @param uid The UID of the user to update.
 * @param enable True to enable the user, false to disable.
 */
export async function toggleUserStatus(uid: string, enable: boolean): Promise<void> {
    try {
        const { firestore } = initializeFirebase();
        const userRef = doc(firestore, 'users', uid);
        updateDocumentNonBlocking(userRef, { status: enable ? 'active' : 'disabled' });
    } catch (error) {
        console.error(`Error al cambiar el estado del usuario ${uid}:`, error);
        throw new Error(`No se pudo ${enable ? 'habilitar' : 'deshabilitar'} al usuario.`);
    }
}

// =========================================================================
// CREATE NEW USER (Cloud Function with Firebase Admin SDK)
// =========================================================================

interface CreateUserPayload {
    email: string;
    fullName: string;
    department: string;
    role: UserRole;
}

/**
 * Creates a new user via the createSystemUser Cloud Function.
 * This creates a real Firebase Auth user + Firestore document.
 * @param payload The user data for the new user.
 */
export async function createNewUser(payload: CreateUserPayload): Promise<{ success: boolean, uid?: string, emailSent?: boolean }> {
    try {
        const { functions } = initializeFirebase();
        const createSystemUserFn = httpsCallable<CreateUserPayload, { success: boolean; uid: string; emailSent: boolean }>(
            functions,
            'createSystemUser'
        );

        const result = await createSystemUserFn(payload);

        if (result.data.success && result.data.uid) {
            console.log(`[Admin] User created successfully: ${result.data.uid}`);
            return { success: true, uid: result.data.uid, emailSent: result.data.emailSent };
        }

        throw new Error('La función de creación de usuario no retornó éxito.');
    } catch (error: any) {
        console.error('Error creando nuevo usuario:', error);

        // Extract meaningful error message from Cloud Function errors
        const message = error?.message || error?.details || 'Error desconocido al crear usuario';
        throw new Error(message);
    }
}

// =========================================================================
// UPDATE USER ROLE (Client-side Firestore update)
// =========================================================================

/**
 * Updates a user's role in Firestore.
 * @param uid The UID of the user.
 * @param role The new role to assign.
 * @param customRoleId Optional ID of a custom role (for non-system roles).
 */
export async function updateUserRole(uid: string, role: UserRole, customRoleId?: string): Promise<void> {
    try {
        const { firestore } = initializeFirebase();
        const userRef = doc(firestore, 'users', uid);
        const updateData: Record<string, any> = { role };
        if (customRoleId) {
            updateData.customRoleId = customRoleId;
        } else {
            updateData.customRoleId = null;
        }
        updateDocumentNonBlocking(userRef, updateData);
    } catch (error) {
        console.error(`Error al actualizar el rol para el usuario ${uid}:`, error);
        throw new Error('No se pudo actualizar el rol del usuario.');
    }
}
