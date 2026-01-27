
'use client';

import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

// Define a type for our singleton object
type FirebaseServices = {
  app: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
  storage: FirebaseStorage;
};

// A private variable to hold the singleton instance
let firebaseServices: FirebaseServices | null = null;

// IMPORTANT: DO NOT MODIFY THIS FUNCTION
export function initializeFirebase(): FirebaseServices {
  // If the instance already exists, return it (Singleton pattern)
  if (firebaseServices) {
    return firebaseServices;
  }

  // Get the Firebase App instance, initializing it if necessary
  const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

  // Create the singleton instance
  firebaseServices = {
    app,
    auth: getAuth(app),
    firestore: getFirestore(app),
    storage: getStorage(app),
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
