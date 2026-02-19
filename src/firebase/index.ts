
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, Firestore, connectFirestoreEmulator, initializeFirestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage, connectStorageEmulator } from 'firebase/storage';
import { getFunctions, Functions, connectFunctionsEmulator } from 'firebase/functions';

// Define a type for our singleton object
type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
  functions: Functions;
};

// A private variable to hold the singleton instance
let firebaseServices: FirebaseServices | null = null;

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase(): FirebaseServices {
  // If the instance already exists, return it (Singleton pattern)
  if (firebaseServices) {
    return firebaseServices;
  }

  // Capture whether this is the FIRST load before calling initializeApp/getApp.
  // We need this flag to decide whether to call initializeFirestore (first time)
  // or getFirestore (HMR re-run). Calling initializeFirestore() twice on the same
  // app causes: "FIRESTORE INTERNAL ASSERTION FAILED: Unexpected state (ID: ca9)"
  const isNewApp = !getApps().length;
  const app = isNewApp ? initializeApp(firebaseConfig) : getApp();
  const auth = getAuth(app);

  // First load: initialize Firestore with our settings.
  // HMR re-run: reuse the existing Firestore instance (getFirestore is idempotent).
  const firestore: Firestore = isNewApp
    ? initializeFirestore(app, { experimentalForceLongPolling: true })
    : getFirestore(app);

  const storage = getStorage(app);
  const functions = getFunctions(app, 'us-central1');

  // Connect to emulators ONLY when explicitly enabled via env variable
  // In Firebase Studio or cloud environments, emulators are not available
  // Set NEXT_PUBLIC_USE_EMULATORS=true in .env.local to use emulators
  const useEmulators = process.env.NEXT_PUBLIC_USE_EMULATORS === 'true';
  if (useEmulators) {
    // Prevent double connection if HMR re-runs this
    // @ts-ignore - Internal properties check
    if (!auth.emulatorConfig) {
      connectAuthEmulator(auth, 'http://127.0.0.1:9099');
      connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
      connectStorageEmulator(storage, '127.0.0.1', 9199);
      connectFunctionsEmulator(functions, '127.0.0.1', 5001);
      console.log('[Firebase] Connected to local emulators');
    }
  }

  // Create the singleton instance
  firebaseServices = {
    app,
    auth,
    firestore,
    storage,
    functions
  };

  return firebaseServices;
}


export * from './provider';
export * from './client-provider';
export * from './firestore/use-collection';
export * from './firestore/use-doc';
export * from './non-blocking-updates';
export * from './non-blocking-login';
export * from './errors';
export * from './error-emitter';
export * from './role-actions';
