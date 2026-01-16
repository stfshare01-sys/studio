'use client';

import { useMemo } from 'react';
import { collection, query, where } from 'firebase/firestore';
import { useFirestore, useMemoFirebase, useCollection } from '@/firebase';
import type { DynamicSelectSource, CascadeFilter } from '@/lib/types';

export type DynamicOption = {
  value: string;
  label: string;
  rawData?: Record<string, any>;
};

/**
 * Hook for fetching dynamic options from Firestore
 * Supports master lists, direct collections, and cascade filtering
 */
export function useDynamicOptions(
  dynamicSource: DynamicSelectSource | undefined,
  formData: Record<string, any>
): {
  options: DynamicOption[];
  isLoading: boolean;
  error: Error | null;
} {
  const firestore = useFirestore();

  // Get parent field value for cascade filtering
  const parentValue = dynamicSource?.filterConfig?.dependsOn
    ? formData[dynamicSource.filterConfig.dependsOn]
    : undefined;

  // Build the query based on source type
  const queryRef = useMemoFirebase(() => {
    if (!firestore || !dynamicSource) return null;

    // For static sources, we don't need a query
    if (dynamicSource.type === 'static') return null;

    let collectionPath: string;

    if (dynamicSource.type === 'master-list' && dynamicSource.masterListId) {
      // Master list data is stored in master_lists/{id}/items
      collectionPath = `master_lists/${dynamicSource.masterListId}/items`;
    } else if (dynamicSource.type === 'collection' && dynamicSource.collectionPath) {
      collectionPath = dynamicSource.collectionPath;
    } else {
      return null;
    }

    const collectionRef = collection(firestore, collectionPath);

    // Apply cascade filter if configured and parent has value
    if (dynamicSource.filterConfig && parentValue !== undefined && parentValue !== '') {
      const { filterField, operator } = dynamicSource.filterConfig;

      switch (operator) {
        case '==':
          return query(collectionRef, where(filterField, '==', parentValue));
        case 'contains':
          // Firestore doesn't support contains directly, so we fetch all and filter client-side
          return collectionRef;
        case 'in':
          if (Array.isArray(parentValue)) {
            return query(collectionRef, where(filterField, 'in', parentValue.slice(0, 10)));
          }
          return collectionRef;
        default:
          return collectionRef;
      }
    }

    return collectionRef;
  }, [firestore, dynamicSource, parentValue]);

  // Fetch the data
  const { data, isLoading, error } = useCollection<Record<string, any>>(queryRef);

  // Transform data into options
  const options = useMemo<DynamicOption[]>(() => {
    if (!dynamicSource || !data) return [];

    const { labelField, valueField, filterConfig } = dynamicSource;

    let filteredData = data;

    // Client-side filtering for 'contains' operator
    if (filterConfig?.operator === 'contains' && parentValue) {
      filteredData = data.filter(item => {
        const fieldValue = item[filterConfig.filterField];
        if (typeof fieldValue === 'string' && typeof parentValue === 'string') {
          return fieldValue.toLowerCase().includes(parentValue.toLowerCase());
        }
        return false;
      });
    }

    return filteredData.map(item => ({
      value: String(item[valueField] ?? item.id),
      label: String(item[labelField] ?? item[valueField] ?? item.id),
      rawData: item,
    }));
  }, [data, dynamicSource, parentValue]);

  return {
    options,
    isLoading,
    error: error as Error | null,
  };
}

/**
 * Hook for fetching master lists metadata (for configuration UI)
 */
export function useMasterLists() {
  const firestore = useFirestore();

  const masterListsRef = useMemoFirebase(() => {
    if (!firestore) return null;
    return collection(firestore, 'master_lists');
  }, [firestore]);

  const { data, isLoading, error } = useCollection<{
    id: string;
    name: string;
    description: string;
    fields: { id: string; label: string; type: string }[];
  }>(masterListsRef);

  return {
    masterLists: data || [],
    isLoading,
    error,
  };
}

/**
 * Converts static options array to DynamicOption format
 */
export function staticOptionsToDynamic(options?: string[]): DynamicOption[] {
  if (!options) return [];
  return options.map(opt => ({
    value: opt,
    label: opt,
  }));
}
