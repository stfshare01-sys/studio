'use client';

import { useCallback, useEffect } from 'react';
import type {
  DefaultValueRule,
  DefaultValueRuleCondition,
  FormField,
  VisibilityLogicalOperator,
  RuleOperator,
} from '@/lib/types';

interface UseDefaultValueRulesOptions {
  rules: DefaultValueRule[];
  fields: FormField[];
  formData: Record<string, any>;
  onFormDataChange: (updates: Record<string, any>) => void;
}

/**
 * Hook for evaluating and applying default value rules
 */
export function useDefaultValueRules({
  rules,
  fields,
  formData,
  onFormDataChange,
}: UseDefaultValueRulesOptions) {
  /**
   * Evaluate a single condition
   */
  const evaluateCondition = useCallback((
    condition: DefaultValueRuleCondition,
    data: Record<string, any>
  ): boolean => {
    const fieldValue = data[condition.fieldId];
    const compareValue = condition.value;

    switch (condition.operator) {
      case '==':
      case 'is':
        return fieldValue == compareValue;
      case '!=':
      case 'is_not':
        return fieldValue != compareValue;
      case '>':
        return Number(fieldValue) > Number(compareValue);
      case '<':
        return Number(fieldValue) < Number(compareValue);
      case '>=':
        return Number(fieldValue) >= Number(compareValue);
      case '<=':
        return Number(fieldValue) <= Number(compareValue);
      case 'contains':
        return String(fieldValue || '').toLowerCase().includes(String(compareValue).toLowerCase());
      case 'not_contains':
        return !String(fieldValue || '').toLowerCase().includes(String(compareValue).toLowerCase());
      default:
        return false;
    }
  }, []);

  /**
   * Evaluate all conditions in a rule
   */
  const evaluateConditions = useCallback((
    conditions: DefaultValueRuleCondition[],
    logic: VisibilityLogicalOperator,
    data: Record<string, any>
  ): boolean => {
    if (conditions.length === 0) return true;

    if (logic === 'AND') {
      return conditions.every(c => evaluateCondition(c, data));
    } else {
      return conditions.some(c => evaluateCondition(c, data));
    }
  }, [evaluateCondition]);

  /**
   * Resolve a value that may contain field references (@fieldId)
   */
  const resolveValue = useCallback((
    value: any,
    data: Record<string, any>
  ): any => {
    if (typeof value === 'string' && value.startsWith('@')) {
      const referencedFieldId = value.substring(1);
      return data[referencedFieldId];
    }
    return value;
  }, []);

  /**
   * Evaluate a single rule and return the value to apply (or undefined if rule doesn't apply)
   */
  const evaluateRule = useCallback((
    rule: DefaultValueRule,
    data: Record<string, any>
  ): any | undefined => {
    // If there are no conditions, the rule always applies
    if (!rule.conditions || rule.conditions.length === 0) {
      return resolveValue(rule.value, data);
    }

    // Evaluate conditions
    const conditionsMet = evaluateConditions(
      rule.conditions,
      rule.logic || 'AND',
      data
    );

    if (conditionsMet) {
      return resolveValue(rule.value, data);
    }

    return undefined;
  }, [evaluateConditions, resolveValue]);

  /**
   * Process rules triggered by a field change
   */
  const processTriggeredRules = useCallback((
    changedFieldId: string,
    newFormData: Record<string, any>
  ): Record<string, any> => {
    const updates: Record<string, any> = {};

    for (const rule of rules) {
      // Check if this rule should be triggered by this field change
      const shouldTrigger =
        rule.triggerOnChange?.includes(changedFieldId) ||
        rule.conditions?.some(c => c.fieldId === changedFieldId);

      if (shouldTrigger) {
        const value = evaluateRule(rule, newFormData);
        if (value !== undefined) {
          updates[rule.targetFieldId] = value;
        }
      }
    }

    return updates;
  }, [rules, evaluateRule]);

  /**
   * Apply all unconditional rules on form initialization
   */
  const applyInitialRules = useCallback((): Record<string, any> => {
    const updates: Record<string, any> = {};

    for (const rule of rules) {
      // Only apply rules without conditions or triggers on init
      if (
        (!rule.conditions || rule.conditions.length === 0) &&
        (!rule.triggerOnChange || rule.triggerOnChange.length === 0)
      ) {
        const value = resolveValue(rule.value, formData);
        if (value !== undefined && formData[rule.targetFieldId] === undefined) {
          updates[rule.targetFieldId] = value;
        }
      }
    }

    return updates;
  }, [rules, formData, resolveValue]);

  /**
   * Get all rules that target a specific field
   */
  const getRulesForField = useCallback((fieldId: string): DefaultValueRule[] => {
    return rules.filter(r => r.targetFieldId === fieldId);
  }, [rules]);

  /**
   * Check if a field is a trigger for any rule
   */
  const isTriggerField = useCallback((fieldId: string): boolean => {
    return rules.some(
      r => r.triggerOnChange?.includes(fieldId) || r.conditions?.some(c => c.fieldId === fieldId)
    );
  }, [rules]);

  return {
    evaluateRule,
    processTriggeredRules,
    applyInitialRules,
    getRulesForField,
    isTriggerField,
  };
}
