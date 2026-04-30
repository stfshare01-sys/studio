'use client';

import { useMemo } from 'react';
import type { FormField, VisibilityRule, VisibilityCondition, RuleOperator } from "@/types/workflow.types";

/**
 * Evaluates a single condition against form data
 */
function evaluateCondition(
  condition: VisibilityCondition,
  formData: Record<string, any>
): boolean {
  const fieldValue = formData[condition.fieldId];
  const ruleValue = condition.value;

  // Handle empty/null values
  if (fieldValue === undefined || fieldValue === null || fieldValue === '') {
    // Empty field only matches == '' or is ''
    return condition.operator === '==' && (ruleValue === '' || ruleValue === null);
  }

  switch (condition.operator) {
    case '==':
    case 'is':
      return fieldValue == ruleValue;

    case '!=':
    case 'is_not':
      return fieldValue != ruleValue;

    case '>':
      return parseFloat(fieldValue) > parseFloat(ruleValue);

    case '<':
      return parseFloat(fieldValue) < parseFloat(ruleValue);

    case '>=':
      return parseFloat(fieldValue) >= parseFloat(ruleValue);

    case '<=':
      return parseFloat(fieldValue) <= parseFloat(ruleValue);

    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());

    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(ruleValue).toLowerCase());

    default:
      return false;
  }
}

/**
 * Evaluates a visibility rule against form data
 */
function evaluateVisibilityRule(
  rule: VisibilityRule,
  formData: Record<string, any>
): boolean {
  if (rule.conditions.length === 0) {
    return false;
  }

  const conditionResults = rule.conditions.map(condition =>
    evaluateCondition(condition, formData)
  );

  // Apply AND/OR logic
  const ruleMatches = rule.logic === 'AND'
    ? conditionResults.every(Boolean)
    : conditionResults.some(Boolean);

  return ruleMatches;
}

/**
 * Determines if a field should be visible based on visibility rules
 * @param field The field to check
 * @param formData Current form data
 * @param globalRules Global visibility rules from template
 * @returns true if field should be visible, false if hidden
 */
export function evaluateFieldVisibility(
  field: FormField,
  formData: Record<string, any>,
  globalRules?: VisibilityRule[]
): boolean {
  // Find all rules that target this field
  const applicableRules = (globalRules || []).filter(
    rule => rule.targetFieldId === field.id
  );

  // No rules = always visible
  if (applicableRules.length === 0) {
    return true;
  }

  // Evaluate each rule
  for (const rule of applicableRules) {
    const ruleMatches = evaluateVisibilityRule(rule, formData);

    if (ruleMatches) {
      // Rule matched - apply the action
      return rule.action === 'show';
    }
  }

  // No rules matched
  // Default behavior: if there are 'show' rules and none matched, hide the field
  // If there are 'hide' rules and none matched, show the field
  const hasShowRules = applicableRules.some(r => r.action === 'show');
  const hasHideRules = applicableRules.some(r => r.action === 'hide');

  if (hasShowRules && !hasHideRules) {
    // Only 'show' rules exist but none matched - hide field
    return false;
  }

  // Default: show the field
  return true;
}

/**
 * Hook for computing visible fields based on form data and visibility rules
 */
export function useVisibleFields(
  fields: FormField[],
  formData: Record<string, any>,
  visibilityRules?: VisibilityRule[]
): FormField[] {
  return useMemo(() => {
    return fields.filter(field =>
      evaluateFieldVisibility(field, formData, visibilityRules)
    );
  }, [fields, formData, visibilityRules]);
}

/**
 * Hook for getting visibility status of all fields
 */
export function useFieldVisibility(
  fields: FormField[],
  formData: Record<string, any>,
  visibilityRules?: VisibilityRule[]
): Record<string, boolean> {
  return useMemo(() => {
    const visibility: Record<string, boolean> = {};
    for (const field of fields) {
      visibility[field.id] = evaluateFieldVisibility(field, formData, visibilityRules);
    }
    return visibility;
  }, [fields, formData, visibilityRules]);
}
