'use client';

import { useEffect, useRef } from 'react';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';
import { useToast } from "@/hooks/use-toast";
import { useUser } from '@/firebase';

/**
 * An invisible component that listens for globally emitted 'permission-error' events.
 * Shows a toast notification when permission errors occur (only when user is authenticated).
 */
export function FirebaseErrorListener() {
  const { toast } = useToast();
  const { user } = useUser();
  const userRef = useRef(user);

  // Keep ref in sync so the callback always has the latest user state
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    const handleError = (error: FirestorePermissionError) => {
      // Use setTimeout(0) to allow React state updates to propagate before checking
      // This prevents showing permission errors during sign-out when auth state is changing
      setTimeout(() => {
        // Don't show permission errors when user is not authenticated (e.g., during sign-out)
        if (!userRef.current) return;

        toast({
          variant: "destructive",
          title: "Permisos Insuficientes",
          description: `No tienes permisos para realizar esta operación: ${error.request.method} en ${error.request.path}`,
        });
        console.error("FirebasePermissionError captured:", error);
      }, 0);
    };

    errorEmitter.on('permission-error', handleError);

    return () => {
      errorEmitter.off('permission-error', handleError);
    };
  }, [toast]);

  return null;
}
