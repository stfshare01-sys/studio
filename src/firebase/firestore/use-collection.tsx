
'use client';

import { useState, useEffect } from 'react';
import {
  Query,
  onSnapshot,
  DocumentData,
  FirestoreError,
  QuerySnapshot,
  CollectionReference,
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

/**
 * Extracts the path from a Firestore reference or query.
 * Uses multiple strategies to handle different Firebase SDK versions.
 */
function extractPath(refOrQuery: CollectionReference<DocumentData> | Query<DocumentData>): string {
  try {
    // Strategy 1: Direct path property (CollectionReference)
    if ('path' in refOrQuery && typeof (refOrQuery as CollectionReference).path === 'string') {
      return (refOrQuery as CollectionReference).path;
    }

    // Strategy 2: Access through _query (Query objects in some SDK versions)
    const queryObj = refOrQuery as any;
    if (queryObj._query?.path?.segments) {
      return queryObj._query.path.segments.join('/');
    }

    // Strategy 3: Try canonicalString method
    if (queryObj._query?.path?.canonicalString) {
      return queryObj._query.path.canonicalString();
    }

    // Strategy 4: Try to get from query converter
    if (queryObj.query?.path) {
      return queryObj.query.path;
    }

    // Strategy 5: Convert to string and extract path
    const str = refOrQuery.toString();
    const pathMatch = str.match(/path=([^,)]+)/);
    if (pathMatch) {
      return pathMatch[1];
    }
  } catch (e) {
    console.warn("Could not extract path from Firestore reference:", e);
  }

  return 'ruta_desconocida';
}

/** Utility type to add an 'id' field to a given type T. */
export type WithId<T> = T & { id: string };

/**
 * Interface for the return value of the useCollection hook.
 * @template T Type of the document data.
 */
export interface UseCollectionResult<T> {
  data: WithId<T>[] | null; // Document data with ID, or null.
  isLoading: boolean;       // True if loading.
  error: FirestoreError | Error | null; // Error object, or null.
}

/**
 * React hook to subscribe to a Firestore collection or query in real-time.
 * Handles nullable references/queries.
 * 
 *
 * IMPORTANT! YOU MUST MEMOIZE the inputted memoizedTargetRefOrQuery or BAD THINGS WILL HAPPEN
 * use useMemo to memoize it per React guidence.  Also make sure that it's dependencies are stable
 * references
 *  
 * @template T Optional type for document data. Defaults to any.
 * @param {CollectionReference<DocumentData> | Query<DocumentData> | null | undefined} targetRefOrQuery -
 * The Firestore CollectionReference or Query. Waits if null/undefined.
 * @returns {UseCollectionResult<T>} Object with data, isLoading, error.
 */
export function useCollection<T = any>(
  memoizedTargetRefOrQuery: ((CollectionReference<DocumentData> | Query<DocumentData>) & { __memo?: boolean }) | null | undefined,
): UseCollectionResult<T> {
  type ResultItemType = WithId<T>;
  type StateDataType = ResultItemType[] | null;

  const [data, setData] = useState<StateDataType>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<FirestoreError | Error | null>(null);

  useEffect(() => {
    if (!memoizedTargetRefOrQuery) {
      setData(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    // Directly use memoizedTargetRefOrQuery as it's assumed to be the final query
    const unsubscribe = onSnapshot(
      memoizedTargetRefOrQuery,
      (snapshot: QuerySnapshot<DocumentData>) => {
        const results: ResultItemType[] = [];
        for (const doc of snapshot.docs) {
          results.push({ ...(doc.data() as T), id: doc.id });
        }
        setData(results);
        setError(null);
        setIsLoading(false);
      },
      (error: FirestoreError) => {
        // Only handle permission-denied errors specially
        // Other errors (like network issues) should be handled differently
        if (error.code === 'permission-denied') {
          // Extract path using robust extraction function
          const path = extractPath(memoizedTargetRefOrQuery);

          const contextualError = new FirestorePermissionError({
            operation: 'list',
            path: path,
          });

          setError(contextualError);
          setData(null);
          setIsLoading(false);

          // Trigger global error propagation (FirebaseErrorListener will check auth state)
          errorEmitter.emit('permission-error', contextualError);
        } else {
          // For other errors, just set the error state without global propagation
          setError(error);
          setData(null);
          setIsLoading(false);
          console.error("useCollection error:", error);
        }
      }
    );

    return () => unsubscribe();
  }, [memoizedTargetRefOrQuery]); // Re-run if the target query/reference changes.
  if (memoizedTargetRefOrQuery && !memoizedTargetRefOrQuery.__memo) {
    throw new Error(memoizedTargetRefOrQuery + ' was not properly memoized using useMemoFirebase');
  }
  return { data, isLoading, error };
}
