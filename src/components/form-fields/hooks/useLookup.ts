'use client';

import { useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase';
import type { LookupConfig, FormField } from '@/lib/types';

interface UseLookupOptions {
  fields: FormField[];
  formData: Record<string, any>;
  onFormDataChange: (updates: Record<string, any>) => void;
}

export function useLookup({ fields, formData, onFormDataChange }: UseLookupOptions) {
  /**
   * Process a lookup when a field value changes
   */
  const processLookup = useCallback(async (
    fieldId: string,
    newValue: any
  ): Promise<void> => {
    const field = fields.find(f => f.id === fieldId);
    if (!field?.lookupConfig || !newValue) return;

    const config = field.lookupConfig;

    try {
      let sourceData: Record<string, any> | null = null;

      const { firestore } = initializeFirebase();

      if (config.sourceType === 'master-list' && config.masterListId) {
        // Fetch from master list items
        const itemsRef = collection(firestore, 'master_lists', config.masterListId, 'items');
        const q = query(itemsRef, where(config.lookupKeyField, '==', newValue));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          sourceData = snapshot.docs[0].data();
        }
      } else if (config.sourceType === 'collection' && config.collectionPath) {
        // Fetch from direct collection
        const collectionRef = collection(firestore, config.collectionPath);
        const q = query(collectionRef, where(config.lookupKeyField, '==', newValue));
        const snapshot = await getDocs(q);

        if (!snapshot.empty) {
          sourceData = snapshot.docs[0].data();
        }
      }

      if (sourceData && config.mappings) {
        // Build updates object
        const updates: Record<string, any> = {};

        for (const mapping of config.mappings) {
          const sourceValue = sourceData[mapping.sourceField];
          if (sourceValue !== undefined) {
            updates[mapping.targetFieldId] = sourceValue;
          }
        }

        if (Object.keys(updates).length > 0) {
          onFormDataChange(updates);
        }
      }
    } catch (error) {
      console.error('Error processing lookup:', error);
    }
  }, [fields, onFormDataChange]);

  /**
   * Check if a field has lookup configuration
   */
  const hasLookup = useCallback((fieldId: string): boolean => {
    const field = fields.find(f => f.id === fieldId);
    return !!field?.lookupConfig;
  }, [fields]);

  /**
   * Get the fields that will be auto-populated by a lookup field
   */
  const getLookupTargetFields = useCallback((fieldId: string): string[] => {
    const field = fields.find(f => f.id === fieldId);
    return field?.lookupConfig?.mappings?.map(m => m.targetFieldId) || [];
  }, [fields]);

  return {
    processLookup,
    hasLookup,
    getLookupTargetFields,
  };
}
