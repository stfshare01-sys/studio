
'use server';

import { getFirestore, doc } from 'firebase/firestore';
import { initializeFirebase } from '.';
import { updateDocumentNonBlocking, setDocumentNonBlocking } from './non-blocking-updates';
import type { UserRole } from '@/lib/types';
// This is a placeholder for a secure way to call a backend function.
// In a real app, you'd use a Firebase Function (Callable Function)
// to securely interact with the Firebase Admin SDK.

async function callAdminBackend(action: string, payload: any) {
    // In a real application, this would be an HTTPS call to a Firebase Function.
    // For this prototype, we'll simulate the behavior.
    console.log(`[SIMULATED ADMIN ACTION] Action: ${action}, Payload:`, payload);
    
    // Simulate updating Firestore from the "backend"
    const { firestore } = initializeFirebase();
    if (action === 'toggleUserStatus' && payload.uid) {
        const userRef = doc(firestore, 'users', payload.uid);
        updateDocumentNonBlocking(userRef, { status: payload.enable ? 'active' : 'disabled' });
    }
     if (action === 'createUser' && payload.email) {
        // This is a very simplified simulation. A real backend would use the Admin SDK
        // to create a user, which returns a UID. We'll generate a mock UID.
        const mockUid = `mock_${Date.now()}`;
        console.log(`[SIMULATED ADMIN ACTION] Generated mock UID: ${mockUid}`);

        const userRef = doc(firestore, 'users', mockUid);
        setDocumentNonBlocking(userRef, {
            id: mockUid,
            fullName: payload.fullName,
            email: payload.email,
            department: payload.department,
            role: payload.role,
            status: 'active',
        }, {});
         return { success: true, uid: mockUid };
    }
    
    // Simulate a successful response
    return { success: true };
}


/**
 * Toggles a user's status in Firebase Auth (simulated) and Firestore.
 * @param uid The UID of the user to update.
 * @param enable True to enable the user, false to disable.
 */
export async function toggleUserStatus(uid: string, enable: boolean): Promise<void> {
  const action = 'toggleUserStatus';
  const payload = { uid, enable };
  
  try {
    const result = await callAdminBackend(action, payload);
    if (!result.success) {
        throw new Error('La acción de administrador simulada falló.');
    }
  } catch (error) {
    console.error(`Error al cambiar el estado del usuario ${uid}:`, error);
    throw new Error(`No se pudo ${enable ? 'habilitar' : 'deshabilitar'} al usuario.`);
  }
}

interface CreateUserPayload {
    email: string;
    fullName: string;
    department: string;
    role: UserRole;
}

/**
 * Creates a new user via a simulated admin backend call.
 * @param payload The user data for the new user.
 */
export async function createNewUser(payload: CreateUserPayload): Promise<{ success: boolean, uid?: string }> {
    const action = 'createUser';
    try {
        const result = await callAdminBackend(action, payload);
        if (!result.success) {
            throw new Error('La creación de usuario simulada en el backend falló.');
        }
        return { success: true, uid: result.uid };
    } catch (error) {
        console.error(`Error creando nuevo usuario:`, error);
        throw new Error('No se pudo crear el nuevo usuario.');
    }
}
