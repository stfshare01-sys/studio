'use client';

import { useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { Plus, Trash2 } from 'lucide-react';
import { useTableFormulas } from './hooks/useTableFormulas';
import type { FormField, TableRowData, TableColumnDefinition } from '@/lib/types';

interface FormTableFieldProps {
  field: FormField;
  value: TableRowData[];
  onChange: (rows: TableRowData[]) => void;
  formData: Record<string, any>;
  disabled?: boolean;
  error?: string | null;
}

export function FormTableField({
  field,
  value,
  onChange,
  formData,
  disabled = false,
  error,
}: FormTableFieldProps) {
  const columns = field.tableColumns || [];
  const rows = value || [];
  const minRows = field.minRows || 0;
  const maxRows = field.maxRows || 100;

  // Calculate formulas
  const { calculatedRows, summaryRow, recalculateRow } = useTableFormulas(
    rows,
    columns,
    formData
  );

  // Generate unique row ID
  const generateRowId = useCallback(() => {
    return `row-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Create empty row
  const createEmptyRow = useCallback((): TableRowData => {
    const newRow: TableRowData = { _rowId: generateRowId() };
    for (const col of columns) {
      if (col.type !== 'formula') {
        newRow[col.id] = col.type === 'number' ? 0 : '';
      }
    }
    return newRow;
  }, [columns, generateRowId]);

  // Add new row
  const handleAddRow = useCallback(() => {
    if (rows.length >= maxRows) return;
    const newRow = createEmptyRow();
    onChange([...rows, newRow]);
  }, [rows, maxRows, createEmptyRow, onChange]);

  // Remove row
  const handleRemoveRow = useCallback((rowId: string) => {
    if (rows.length <= minRows) return;
    const newRows = rows.filter(r => r._rowId !== rowId);
    onChange(newRows);
  }, [rows, minRows, onChange]);

  // Update cell value
  const handleCellChange = useCallback((
    rowId: string,
    columnId: string,
    cellValue: any
  ) => {
    const newRows = rows.map(row => {
      if (row._rowId === rowId) {
        const updatedRow = { ...row, [columnId]: cellValue };
        // Recalculate formula columns
        return recalculateRow(updatedRow);
      }
      return row;
    });
    onChange(newRows);
  }, [rows, recalculateRow, onChange]);

  // Render cell input based on column type
  const renderCellInput = (
    row: TableRowData,
    calculatedRow: TableRowData,
    column: TableColumnDefinition
  ) => {
    const cellValue = calculatedRow[column.id];

    if (column.type === 'formula') {
      // Formula columns are read-only
      return (
        <span className="text-right block font-medium">
          {typeof cellValue === 'number' ? cellValue.toLocaleString('es-ES', { maximumFractionDigits: 2 }) : cellValue}
        </span>
      );
    }

    switch (column.type) {
      case 'number':
        return (
          <Input
            type="number"
            value={row[column.id] ?? ''}
            onChange={(e) => {
              const numVal = e.target.value === '' ? 0 : parseFloat(e.target.value);
              handleCellChange(row._rowId, column.id, isNaN(numVal) ? 0 : numVal);
            }}
            className="h-8 text-right"
            disabled={disabled}
          />
        );

      case 'date':
        return (
          <Input
            type="date"
            value={row[column.id] ?? ''}
            onChange={(e) => handleCellChange(row._rowId, column.id, e.target.value)}
            className="h-8"
            disabled={disabled}
          />
        );

      case 'select':
        return (
          <Select
            value={row[column.id] ?? ''}
            onValueChange={(val) => handleCellChange(row._rowId, column.id, val)}
            disabled={disabled}
          >
            <SelectTrigger className="h-8">
              <SelectValue placeholder="Seleccionar" />
            </SelectTrigger>
            <SelectContent>
              {(column.options || []).map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'text':
      default:
        return (
          <Input
            type="text"
            value={row[column.id] ?? ''}
            onChange={(e) => handleCellChange(row._rowId, column.id, e.target.value)}
            className="h-8"
            disabled={disabled}
          />
        );
    }
  };

  // Check if we have formula columns to show summary
  const hasFormulaColumns = columns.some(col => col.type === 'formula');
  const hasNumberColumns = columns.some(col => col.type === 'number');
  const showSummary = field.showSummaryRow !== false && (hasFormulaColumns || hasNumberColumns);

  return (
    <div className="space-y-2">
      <div className="border rounded-md overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead
                  key={col.id}
                  style={{ width: col.width ? `${col.width}px` : 'auto' }}
                  className={col.type === 'number' || col.type === 'formula' ? 'text-right' : ''}
                >
                  {col.name}
                  {col.required && <span className="text-destructive ml-1">*</span>}
                </TableHead>
              ))}
              {!disabled && (
                <TableHead className="w-12">
                  <span className="sr-only">Acciones</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {calculatedRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (disabled ? 0 : 1)}
                  className="text-center text-muted-foreground py-8"
                >
                  No hay filas. Haga clic en &quot;Agregar fila&quot; para comenzar.
                </TableCell>
              </TableRow>
            ) : (
              calculatedRows.map((calcRow, index) => {
                const originalRow = rows[index];
                return (
                  <TableRow key={originalRow._rowId}>
                    {columns.map((col) => (
                      <TableCell key={col.id} className="p-1">
                        {renderCellInput(originalRow, calcRow, col)}
                      </TableCell>
                    ))}
                    {!disabled && (
                      <TableCell className="p-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => handleRemoveRow(originalRow._rowId)}
                          disabled={rows.length <= minRows}
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Eliminar fila</span>
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })
            )}
          </TableBody>
          {showSummary && calculatedRows.length > 0 && (
            <TableFooter>
              <TableRow className="bg-muted/50">
                {columns.map((col, index) => (
                  <TableCell key={col.id} className="font-semibold">
                    {index === 0 ? (
                      'Total'
                    ) : (col.type === 'number' || col.type === 'formula') && summaryRow[col.id] !== undefined ? (
                      <span className="text-right block">
                        {summaryRow[col.id].toLocaleString('es-ES', { maximumFractionDigits: 2 })}
                      </span>
                    ) : null}
                  </TableCell>
                ))}
                {!disabled && <TableCell />}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>

      {!disabled && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleAddRow}
          disabled={rows.length >= maxRows}
        >
          <Plus className="h-4 w-4 mr-2" />
          Agregar fila
          {maxRows < 100 && (
            <span className="ml-2 text-muted-foreground">
              ({rows.length}/{maxRows})
            </span>
          )}
        </Button>
      )}

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
