import {
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { Incidence } from "@/types/hcm.types";

/**
 * Checks for any pending incidences within the given date range.
 */
export async function getPendingIncidences(startDate: string, endDate: string): Promise<Incidence[]> {
    const { firestore } = initializeFirebase();
    const q = query(
        collection(firestore, 'incidences'),
        where('status', '==', 'pending'),
        where('startDate', '>=', startDate),
        where('startDate', '<=', endDate)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Incidence));
}
