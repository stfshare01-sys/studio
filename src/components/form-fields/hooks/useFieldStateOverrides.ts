'use client';

import { useMemo, useCallback } from 'react';
import type { FormField, FieldStateOverride, WorkflowStepDefinition } from '@/lib/types';

interface UseFieldStateOverridesOptions {
  fields: FormField[];
  currentStep?: WorkflowStepDefinition;
}

interface FieldState {
  visible: boolean;
  readOnly: boolean;
  required: boolean;
  defaultValue?: any;
}

/**
 * Hook for computing field states based on step-level overrides
 */
export function useFieldStateOverrides({
  fields,
  currentStep,
}: UseFieldStateOverridesOptions) {
  /**
   * Build a map of field ID to override configuration
   */
  const overrideMap = useMemo(() => {
    const map = new Map<string, FieldStateOverride>();

    if (currentStep?.fieldOverrides) {
      for (const override of currentStep.fieldOverrides) {
        map.set(override.fieldId, override);
      }
    }

    return map;
  }, [currentStep?.fieldOverrides]);

  /**
   * Get the computed state for a field (combining base config with step override)
   */
  const getFieldState = useCallback((field: FormField): FieldState => {
    const override = overrideMap.get(field.id);

    // Start with base field configuration
    let visible = true;
    let readOnly = field.readOnly ?? false;
    let required = field.required ?? false;
    let defaultValue = field.defaultValue;

    // Apply step-level overrides
    if (override) {
      if (override.visible !== undefined) {
        visible = override.visible;
      }
      if (override.readOnly !== undefined) {
        readOnly = override.readOnly;
      }
      if (override.required !== undefined) {
        required = override.required;
      }
      if (override.defaultValue !== undefined) {
        defaultValue = override.defaultValue;
      }
    }

    return {
      visible,
      readOnly,
      required,
      defaultValue,
    };
  }, [overrideMap]);

  /**
   * Check if a field is visible
   */
  const isFieldVisible = useCallback((fieldId: string): boolean => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return false;
    return getFieldState(field).visible;
  }, [fields, getFieldState]);

  /**
   * Check if a field is read-only
   */
  const isFieldReadOnly = useCallback((fieldId: string): boolean => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return false;
    return getFieldState(field).readOnly;
  }, [fields, getFieldState]);

  /**
   * Check if a field is required
   */
  const isFieldRequired = useCallback((fieldId: string): boolean => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return false;
    return getFieldState(field).required;
  }, [fields, getFieldState]);

  /**
   * Get all visible fields for the current step
   */
  const visibleFields = useMemo(() => {
    return fields.filter(field => getFieldState(field).visible);
  }, [fields, getFieldState]);

  /**
   * Get all required fields for the current step
   */
  const requiredFields = useMemo(() => {
    return fields.filter(field => {
      const state = getFieldState(field);
      return state.visible && state.required;
    });
  }, [fields, getFieldState]);

  /**
   * Get field states for all fields
   */
  const fieldStates = useMemo(() => {
    const states = new Map<string, FieldState>();
    for (const field of fields) {
      states.set(field.id, getFieldState(field));
    }
    return states;
  }, [fields, getFieldState]);

  /**
   * Validate that all required fields have values
   */
  const validateRequiredFields = useCallback((
    formData: Record<string, any>
  ): { valid: boolean; missingFields: string[] } => {
    const missingFields: string[] = [];

    for (const field of requiredFields) {
      const value = formData[field.id];
      const isEmpty =
        value === undefined ||
        value === null ||
        value === '' ||
        (Array.isArray(value) && value.length === 0);

      if (isEmpty) {
        missingFields.push(field.id);
      }
    }

    return {
      valid: missingFields.length === 0,
      missingFields,
    };
  }, [requiredFields]);

  return {
    getFieldState,
    isFieldVisible,
    isFieldReadOnly,
    isFieldRequired,
    visibleFields,
    requiredFields,
    fieldStates,
    validateRequiredFields,
  };
}
