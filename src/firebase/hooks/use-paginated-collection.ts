import { useState, useEffect, useCallback, useRef } from 'react';
import {
    collection,
    query,
    orderBy,
    startAfter,
    limit,
    getDocs,
    QueryConstraint,
    QuerySnapshot,
    DocumentData,
    where,
    Query
} from 'firebase/firestore';
import { useFirestore } from '../provider';
import { Firestore } from 'firebase/firestore';

interface PaginatedOptions {
    path: string;
    pageSize?: number;
    orderByField?: string;
    orderDirection?: 'asc' | 'desc';
    constraints?: QueryConstraint[];
}

export function usePaginatedCollection<T = DocumentData>({
    path,
    pageSize = 20,
    orderByField = 'createdAt',
    orderDirection = 'desc',
    constraints = []
}: PaginatedOptions) {
    const db = useFirestore();

    const [data, setData] = useState<(T & { id: string })[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [error, setError] = useState<Error | null>(null);

    const lastVisibleRef = useRef<any>(null);

    const loadInitial = useCallback(async () => {
        if (!path || !db) return;
        setLoading(true);
        setError(null);
        try {
            const colRef = collection(db, path);

            // Note: If using multiple where/orderBy, ensure Firestore indexes exist
            const q = query(
                colRef,
                ...constraints,
                orderBy(orderByField, orderDirection),
                limit(pageSize)
            );

            const snapshot = await getDocs(q);

            const docs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as (T & { id: string })[];

            setData(docs);
            lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1];
            setHasMore(snapshot.docs.length === pageSize);
        } catch (err: any) {
            console.error(`[usePaginatedCollection] Error loading initial ${path}:`, err);
            setError(err);
        } finally {
            setLoading(false);
        }
    }, [path, pageSize, orderByField, orderDirection, JSON.stringify(constraints)]);

    const loadMore = useCallback(async () => {
        if (!hasMore || loadingMore || !lastVisibleRef.current || !path || !db) return;

        setLoadingMore(true);
        setError(null);
        try {
            const colRef = collection(db, path);
            const q = query(
                colRef,
                ...constraints,
                orderBy(orderByField, orderDirection),
                startAfter(lastVisibleRef.current),
                limit(pageSize)
            );

            const snapshot = await getDocs(q);

            const newDocs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as (T & { id: string })[];

            setData(prev => [...prev, ...newDocs]);
            lastVisibleRef.current = snapshot.docs[snapshot.docs.length - 1];
            setHasMore(snapshot.docs.length === pageSize);
        } catch (err: any) {
            console.error(`[usePaginatedCollection] Error loading more for ${path}:`, err);
            setError(err);
        } finally {
            setLoadingMore(false);
        }
    }, [hasMore, loadingMore, path, pageSize, orderByField, orderDirection, JSON.stringify(constraints), db]);

    useEffect(() => {
        loadInitial();
    }, [loadInitial]);

    return {
        data,
        loading,
        loadingMore,
        hasMore,
        loadMore,
        error,
        refresh: loadInitial
    };
}
