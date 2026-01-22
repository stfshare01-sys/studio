
'use client';

import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GripVertical, Columns, LayoutGrid, Maximize2 } from 'lucide-react';
import type { FormField, FieldLayoutConfig } from '@/lib/types';

interface FieldLayoutEditorProps {
  fields: FormField[];
  layout: FieldLayoutConfig[];
  onLayoutChange: (layout: FieldLayoutConfig[]) => void;
}

const COLSPAN_OPTIONS = [
  { value: 1, label: '1/5 (20%)', icon: '▮' },
  { value: 2, label: '2/5 (40%)', icon: '▮▮' },
  { value: 3, label: '3/5 (60%)', icon: '▮▮▮' },
  { value: 4, label: '4/5 (80%)', icon: '▮▮▮▮' },
  { value: 5, label: 'Ancho completo', icon: '▮▮▮▮▮' },
];

export function FieldLayoutEditor({
  fields,
  layout,
  onLayoutChange,
}: FieldLayoutEditorProps) {
  // Build layout map for quick access
  const layoutMap = useMemo(() => {
    const map = new Map<string, FieldLayoutConfig>();
    layout.forEach(l => map.set(l.fieldId, l));
    return map;
  }, [layout]);

  // Group fields by row
  const rows = useMemo(() => {
    const rowsMap = new Map<number, { field: FormField; config: FieldLayoutConfig }[]>();

    fields.forEach((field, index) => {
      const config = layoutMap.get(field.id) || {
        fieldId: field.id,
        row: index,
        column: 1,
        colspan: 5, // Default full width
      };

      const rowFields = rowsMap.get(config.row) || [];
      rowFields.push({ field, config });
      rowsMap.set(config.row, rowFields);
    });

    // Sort rows by row number and fields by column within each row
    const sortedRows: { row: number; items: { field: FormField; config: FieldLayoutConfig }[] }[] = [];

    Array.from(rowsMap.keys())
      .sort((a, b) => a - b)
      .forEach(rowNum => {
        const items = rowsMap.get(rowNum) || [];
        items.sort((a, b) => a.config.column - b.config.column);
        sortedRows.push({ row: rowNum, items });
      });

    return sortedRows;
  }, [fields, layoutMap]);

  const handleColspanChange = (fieldId: string, colspan: number) => {
    const existing = layoutMap.get(fieldId);
    if (existing) {
      onLayoutChange(
        layout.map(l => (l.fieldId === fieldId ? { ...l, colspan } : l))
      );
    } else {
      // Find field index to set default row
      const fieldIndex = fields.findIndex(f => f.id === fieldId);
      onLayoutChange([
        ...layout,
        {
          fieldId,
          row: fieldIndex,
          column: 1,
          colspan,
        },
      ]);
    }
  };

  const handleMoveToRow = (fieldId: string, targetRow: number) => {
    const existing = layoutMap.get(fieldId);
    if (existing) {
      onLayoutChange(
        layout.map(l => (l.fieldId === fieldId ? { ...l, row: targetRow } : l))
      );
    } else {
      onLayoutChange([
        ...layout,
        {
          fieldId,
          row: targetRow,
          column: 1,
          colspan: 5,
        },
      ]);
    }
  };

  const handleColumnChange = (fieldId: string, column: number) => {
    const existing = layoutMap.get(fieldId);
    if (existing) {
      onLayoutChange(
        layout.map(l => (l.fieldId === fieldId ? { ...l, column } : l))
      );
    } else {
      const fieldIndex = fields.findIndex(f => f.id === fieldId);
      onLayoutChange([
        ...layout,
        {
          fieldId,
          row: fieldIndex,
          column,
          colspan: 5,
        },
      ]);
    }
  };

  const getFieldConfig = (fieldId: string): FieldLayoutConfig => {
    return layoutMap.get(fieldId) || {
      fieldId,
      row: fields.findIndex(f => f.id === fieldId),
      column: 1,
      colspan: 5,
    };
  };

  // Calculate visual width percentage
  const getWidthClass = (colspan: number): string => {
    const widths: Record<number, string> = {
      1: 'w-[20%]',
      2: 'w-[40%]',
      3: 'w-[60%]',
      4: 'w-[80%]',
      5: 'w-full',
    };
    return widths[colspan] || 'w-full';
  };

  const getWidthStyle = (colspan: number): string => {
    return `${(colspan / 5) * 100}%`;
  };

  // Reset to default (all full width, sequential rows)
  const handleResetLayout = () => {
    const defaultLayout: FieldLayoutConfig[] = fields.map((field, index) => ({
      fieldId: field.id,
      row: index,
      column: 1,
      colspan: 5,
    }));
    onLayoutChange(defaultLayout);
  };

  // Create a new row and add field to it
  const getNextRow = (): number => {
    if (rows.length === 0) return 0;
    return Math.max(...rows.map(r => r.row)) + 1;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Layout de Formulario</h4>
          <p className="text-sm text-muted-foreground">
            Configure la disposición de campos en filas y columnas.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleResetLayout}>
          Restablecer
        </Button>
      </div>

      {/* Visual preview */}
      <Card>
        <CardHeader className="py-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" />
            Vista Previa del Layout
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map(({ row, items }) => (
            <div key={row} className="flex gap-2 p-2 bg-muted/30 rounded-md min-h-[40px]">
              <Badge variant="outline" className="shrink-0 h-6">
                Fila {row + 1}
              </Badge>
              <div className="flex-1 flex gap-1">
                {items.map(({ field, config }) => (
                  <div
                    key={field.id}
                    className="bg-primary/10 border border-primary/20 rounded px-2 py-1 text-xs truncate"
                    style={{ width: getWidthStyle(config.colspan || 5) }}
                    title={field.label}
                  >
                    {field.label}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Field configuration list */}
      <div className="space-y-2">
        <Label>Configuración por Campo</Label>
        {fields.map((field) => {
          const config = getFieldConfig(field.id);

          return (
            <div
              key={field.id}
              className="flex items-center gap-3 p-3 border rounded-md bg-background"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{field.label}</div>
                <div className="text-xs text-muted-foreground">{field.type}</div>
              </div>

              <div className="flex items-center gap-2">
                {/* Row selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Fila:</span>
                  <Select
                    value={String(config.row)}
                    onValueChange={(v) => handleMoveToRow(field.id, parseInt(v))}
                  >
                    <SelectTrigger className="h-8 w-16">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: fields.length }, (_, i) => (
                        <SelectItem key={i} value={String(i)}>
                          {i + 1}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Column selector */}
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground">Col:</span>
                  <Select
                    value={String(config.column)}
                    onValueChange={(v) => handleColumnChange(field.id, parseInt(v))}
                  >
                    <SelectTrigger className="h-8 w-14">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5].map((col) => (
                        <SelectItem key={col} value={String(col)}>
                          {col}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Colspan selector */}
                <div className="flex items-center gap-1">
                  <Columns className="h-4 w-4 text-muted-foreground" />
                  <Select
                    value={String(config.colspan || 5)}
                    onValueChange={(v) => handleColspanChange(field.id, parseInt(v))}
                  >
                    <SelectTrigger className="h-8 w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLSPAN_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={String(option.value)}>
                          <span className="flex items-center gap-2">
                            <span className="font-mono text-xs">{option.icon}</span>
                            <span>{option.label}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Help text */}
      <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground">
        <div className="flex items-start gap-2">
          <Maximize2 className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground">Consejos de Layout</p>
            <ul className="list-disc list-inside space-y-1 mt-1">
              <li>Use la misma fila para campos que deben aparecer juntos horizontalmente</li>
              <li>El ancho total de campos en una fila no debe exceder 5 columnas</li>
              <li>Campos de tabla, textarea y archivos generalmente funcionan mejor a ancho completo</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
