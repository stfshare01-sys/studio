'use client';

import { useMemo, useCallback } from 'react';
import type { TableColumnDefinition, TableRowData, TableColumnFormula } from "@/types/workflow.types";

/**
 * Parses and evaluates a simple arithmetic expression
 * Supports: +, -, *, /, parentheses, column references, @fieldId references
 */
function evaluateExpression(
  expression: string,
  row: TableRowData,
  formData: Record<string, any>,
  columns: TableColumnDefinition[]
): number {
  if (!expression) return 0;

  let parsedExpression = expression;

  // Replace @fieldId references with values from main form
  const fieldRefRegex = /@([a-zA-Z0-9_-]+)/g;
  parsedExpression = parsedExpression.replace(fieldRefRegex, (_, fieldId) => {
    const value = formData[fieldId];
    return typeof value === 'number' ? String(value) : '0';
  });

  // Replace column references with values from the row
  for (const col of columns) {
    const colRegex = new RegExp(`\\b${col.id}\\b`, 'g');
    const value = row[col.id];
    parsedExpression = parsedExpression.replace(
      colRegex,
      typeof value === 'number' ? String(value) : '0'
    );

    // Also support column name references
    const nameRegex = new RegExp(`\\b${col.name}\\b`, 'gi');
    parsedExpression = parsedExpression.replace(
      nameRegex,
      typeof value === 'number' ? String(value) : '0'
    );
  }

  // Safely evaluate the expression
  try {
    // Only allow numbers, operators, parentheses, and whitespace
    const sanitized = parsedExpression.replace(/[^0-9+\-*/().s]/g, '');
    // Use Function constructor for safer evaluation than eval
    const result = new Function(`return (${sanitized})`)();
    return typeof result === 'number' && isFinite(result) ? result : 0;
  } catch {
    return 0;
  }
}

/**
 * Calculates aggregation functions on a column
 */
function calculateAggregation(
  type: TableColumnFormula['type'],
  rows: TableRowData[],
  targetColumnId: string
): number {
  const values = rows
    .map(row => row[targetColumnId])
    .filter(v => typeof v === 'number' && !isNaN(v)) as number[];

  if (values.length === 0) return 0;

  switch (type) {
    case 'SUM':
      return values.reduce((sum, v) => sum + v, 0);

    case 'AVG':
      return values.reduce((sum, v) => sum + v, 0) / values.length;

    case 'COUNT':
      return values.length;

    case 'MIN':
      return Math.min(...values);

    case 'MAX':
      return Math.max(...values);

    default:
      return 0;
  }
}

/**
 * Calculates formula column value for a single row
 */
export function calculateFormulaValue(
  formula: TableColumnFormula,
  row: TableRowData,
  allRows: TableRowData[],
  formData: Record<string, any>,
  columns: TableColumnDefinition[]
): number {
  if (formula.type === 'CUSTOM' && formula.expression) {
    return evaluateExpression(formula.expression, row, formData, columns);
  }

  if (formula.targetColumn) {
    // For aggregations, we calculate based on all rows
    // But this is typically used for summary row, not individual rows
    return calculateAggregation(formula.type, allRows, formula.targetColumn);
  }

  return 0;
}

/**
 * Hook for calculating all formula values in a table
 */
export function useTableFormulas(
  rows: TableRowData[],
  columns: TableColumnDefinition[],
  formData: Record<string, any>
) {
  // Calculate formula values for each row
  const calculatedRows = useMemo(() => {
    return rows.map(row => {
      const calculatedRow = { ...row };

      for (const col of columns) {
        if (col.type === 'formula' && col.formula) {
          // For CUSTOM formulas, calculate per-row
          if (col.formula.type === 'CUSTOM' && col.formula.expression) {
            calculatedRow[col.id] = evaluateExpression(
              col.formula.expression,
              row,
              formData,
              columns
            );
          }
        }
      }

      return calculatedRow;
    });
  }, [rows, columns, formData]);

  // Calculate summary row
  const summaryRow = useMemo(() => {
    const summary: Record<string, number> = {};

    for (const col of columns) {
      if (col.type === 'formula' && col.formula) {
        // Use aggregation type for summary
        if (col.formula.targetColumn) {
          summary[col.id] = calculateAggregation(
            col.formula.type,
            calculatedRows,
            col.formula.targetColumn
          );
        } else if (col.formula.type !== 'CUSTOM') {
          // If no target column specified, aggregate this column itself
          summary[col.id] = calculateAggregation(
            col.formula.type,
            calculatedRows,
            col.id
          );
        }
      } else if (col.type === 'number') {
        // Auto-sum number columns
        summary[col.id] = calculateAggregation('SUM', calculatedRows, col.id);
      }
    }

    return summary;
  }, [calculatedRows, columns]);

  // Helper to recalculate a single row's formulas
  const recalculateRow = useCallback((row: TableRowData): TableRowData => {
    const calculatedRow = { ...row };

    for (const col of columns) {
      if (col.type === 'formula' && col.formula?.type === 'CUSTOM' && col.formula.expression) {
        calculatedRow[col.id] = evaluateExpression(
          col.formula.expression,
          row,
          formData,
          columns
        );
      }
    }

    return calculatedRow;
  }, [columns, formData]);

  return {
    calculatedRows,
    summaryRow,
    recalculateRow,
  };
}

/**
 * Gets formula columns that need recalculation
 */
export function getFormulaColumns(columns: TableColumnDefinition[]): TableColumnDefinition[] {
  return columns.filter(col => col.type === 'formula');
}
