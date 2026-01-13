
'use server';

import { getFirestore, doc } from 'firebase/firestore';
import { initializeFirebase } from '.';
import { updateDocumentNonBlocking } from './non-blocking-updates';
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
