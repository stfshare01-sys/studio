'use client';

import { useCallback, useState } from 'react';
import type { FormField, ValidationRule } from "@/types/workflow.types";

export type ValidationErrors = Record<string, string | null>;

/**
 * Validates a single field value against its validation rules
 */
export function validateFieldValue(
  field: FormField,
  value: any
): string | null {
  if (!field.validations || field.validations.length === 0) {
    return null;
  }

  for (const rule of field.validations) {
    const error = runValidation(rule, value, field);
    if (error) return error;
  }

  return null;
}

/**
 * Runs a single validation rule against a value
 */
function runValidation(
  rule: ValidationRule,
  value: any,
  field: FormField
): string | null {
  const isEmpty = value === undefined || value === null || value === '';

  switch (rule.type) {
    case 'required':
      if (isEmpty) {
        return rule.message || `${field.label} es requerido`;
      }
      break;

    case 'email':
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!isEmpty && !emailRegex.test(String(value))) {
        return rule.message || 'Formato de correo electrónico inválido';
      }
      break;

    case 'min':
      if (!isEmpty && typeof value === 'number' && value < rule.value) {
        return rule.message || `El valor mínimo es ${rule.value}`;
      }
      break;

    case 'max':
      if (!isEmpty && typeof value === 'number' && value > rule.value) {
        return rule.message || `El valor máximo es ${rule.value}`;
      }
      break;

    case 'minLength':
      if (!isEmpty && typeof value === 'string' && value.length < rule.value) {
        return rule.message || `Mínimo ${rule.value} caracteres`;
      }
      break;

    case 'maxLength':
      if (!isEmpty && typeof value === 'string' && value.length > rule.value) {
        return rule.message || `Máximo ${rule.value} caracteres`;
      }
      break;

    case 'pattern':
      if (!isEmpty && rule.value) {
        try {
          const regex = new RegExp(rule.value);
          if (!regex.test(String(value))) {
            return rule.message || 'Formato inválido';
          }
        } catch {
          // Invalid regex, skip validation
        }
      }
      break;

    case 'fileSize':
      if (value instanceof File && value.size > rule.value) {
        const maxMB = Math.round(rule.value / (1024 * 1024));
        return rule.message || `El archivo excede el límite de ${maxMB}MB`;
      }
      break;

    case 'fileType':
      if (value instanceof File && Array.isArray(rule.value)) {
        if (!rule.value.includes(value.type)) {
          return rule.message || 'Tipo de archivo no permitido';
        }
      }
      break;
  }

  return null;
}

/**
 * Hook for managing form field validations
 */
export function useFieldValidation(fields: FormField[]) {
  const [errors, setErrors] = useState<ValidationErrors>({});

  const validateField = useCallback((fieldId: string, value: any): string | null => {
    const field = fields.find(f => f.id === fieldId);
    if (!field) return null;

    const error = validateFieldValue(field, value);
    setErrors(prev => ({ ...prev, [fieldId]: error }));
    return error;
  }, [fields]);

  const validateAllFields = useCallback((formData: Record<string, any>): boolean => {
    const newErrors: ValidationErrors = {};
    let isValid = true;

    for (const field of fields) {
      const error = validateFieldValue(field, formData[field.id]);
      newErrors[field.id] = error;
      if (error) isValid = false;
    }

    setErrors(newErrors);
    return isValid;
  }, [fields]);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const clearFieldError = useCallback((fieldId: string) => {
    setErrors(prev => ({ ...prev, [fieldId]: null }));
  }, []);

  return {
    errors,
    validateField,
    validateAllFields,
    clearErrors,
    clearFieldError,
  };
}

/**
 * Validates that a number input is actually a number
 */
export function isValidNumber(value: string): boolean {
  if (value === '' || value === '-') return true; // Allow empty and negative sign
  const num = Number(value);
  return !isNaN(num) && isFinite(num);
}

/**
 * Validates email format
 */
export function isValidEmail(value: string): boolean {
  if (!value) return true; // Empty is valid (use 'required' rule for non-empty)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value);
}
