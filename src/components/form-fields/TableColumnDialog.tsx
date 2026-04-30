'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Trash2, GripVertical, Settings2 } from 'lucide-react';
import type { TableColumnDefinition, TableColumnType, FormField } from "@/types/workflow.types";

interface TableColumnDialogProps {
  columns: TableColumnDefinition[];
  onColumnsChange: (columns: TableColumnDefinition[]) => void;
  formFields?: FormField[]; // Other form fields for formula references
}

const COLUMN_TYPES: { value: TableColumnType; label: string }[] = [
  { value: 'text', label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'date', label: 'Fecha' },
  { value: 'select', label: 'Lista desplegable' },
  { value: 'formula', label: 'Fórmula (calculado)' },
];

const FORMULA_TYPES = [
  { value: 'SUM', label: 'Suma (SUM)' },
  { value: 'AVG', label: 'Promedio (AVG)' },
  { value: 'COUNT', label: 'Contar (COUNT)' },
  { value: 'MIN', label: 'Mínimo (MIN)' },
  { value: 'MAX', label: 'Máximo (MAX)' },
  { value: 'CUSTOM', label: 'Expresión personalizada' },
];

export function TableColumnDialog({
  columns,
  onColumnsChange,
  formFields = [],
}: TableColumnDialogProps) {
  const [editingColumn, setEditingColumn] = useState<TableColumnDefinition | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Form state
  const [columnName, setColumnName] = useState('');
  const [columnType, setColumnType] = useState<TableColumnType>('text');
  const [columnOptions, setColumnOptions] = useState('');
  const [formulaType, setFormulaType] = useState<'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX' | 'CUSTOM'>('SUM');
  const [formulaExpression, setFormulaExpression] = useState('');
  const [formulaTargetColumn, setFormulaTargetColumn] = useState('');
  const [columnWidth, setColumnWidth] = useState<number | undefined>();
  const [columnRequired, setColumnRequired] = useState(false);

  const resetForm = () => {
    setColumnName('');
    setColumnType('text');
    setColumnOptions('');
    setFormulaType('SUM');
    setFormulaExpression('');
    setFormulaTargetColumn('');
    setColumnWidth(undefined);
    setColumnRequired(false);
    setEditingColumn(null);
  };

  const handleOpenDialog = (column?: TableColumnDefinition) => {
    if (column) {
      setEditingColumn(column);
      setColumnName(column.name);
      setColumnType(column.type);
      setColumnOptions(column.options?.join('\n') || '');
      setFormulaType(column.formula?.type || 'SUM');
      setFormulaExpression(column.formula?.expression || '');
      setFormulaTargetColumn(column.formula?.targetColumn || '');
      setColumnWidth(column.width);
      setColumnRequired(column.required || false);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSaveColumn = () => {
    if (!columnName.trim()) return;

    const newColumn: TableColumnDefinition = {
      id: editingColumn?.id || `col-${Date.now()}`,
      name: columnName.trim(),
      type: columnType,
    };

    if (columnType === 'select' && columnOptions.trim()) {
      newColumn.options = columnOptions
        .split('\n')
        .map(o => o.trim())
        .filter(o => o);
    }

    if (columnType === 'formula') {
      newColumn.formula = {
        type: formulaType,
      };
      if (formulaType === 'CUSTOM') {
        newColumn.formula.expression = formulaExpression;
      } else if (formulaTargetColumn) {
        newColumn.formula.targetColumn = formulaTargetColumn;
      }
    }

    if (columnWidth) {
      newColumn.width = columnWidth;
    }

    if (columnRequired) {
      newColumn.required = true;
    }

    if (editingColumn) {
      onColumnsChange(
        columns.map(c => (c.id === editingColumn.id ? newColumn : c))
      );
    } else {
      onColumnsChange([...columns, newColumn]);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleRemoveColumn = (columnId: string) => {
    onColumnsChange(columns.filter(c => c.id !== columnId));
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= columns.length) return;

    const newColumns = [...columns];
    [newColumns[index], newColumns[newIndex]] = [newColumns[newIndex], newColumns[index]];
    onColumnsChange(newColumns);
  };

  // Get number columns for formula target selection
  const numberColumns = columns.filter(c => c.type === 'number');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Columnas de la tabla</Label>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" onClick={() => handleOpenDialog()}>
              <Plus className="h-4 w-4 mr-1" />
              Agregar Columna
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingColumn ? 'Editar Columna' : 'Nueva Columna'}
              </DialogTitle>
              <DialogDescription>
                Configure las propiedades de la columna de la tabla.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Column Name */}
              <div className="space-y-2">
                <Label>Nombre de la columna</Label>
                <Input
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value)}
                  placeholder="Ej: Cantidad, Precio, Descripción"
                />
              </div>

              {/* Column Type */}
              <div className="space-y-2">
                <Label>Tipo de columna</Label>
                <Select
                  value={columnType}
                  onValueChange={(v) => setColumnType(v as TableColumnType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {COLUMN_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Options for select type */}
              {columnType === 'select' && (
                <div className="space-y-2">
                  <Label>Opciones (una por línea)</Label>
                  <Textarea
                    value={columnOptions}
                    onChange={(e) => setColumnOptions(e.target.value)}
                    placeholder="Opción 1\nOpción 2\nOpción 3"
                    rows={4}
                  />
                </div>
              )}

              {/* Formula configuration */}
              {columnType === 'formula' && (
                <div className="space-y-4 p-3 border rounded-md bg-muted/30">
                  <div className="space-y-2">
                    <Label>Tipo de fórmula</Label>
                    <Select
                      value={formulaType}
                      onValueChange={(v) => setFormulaType(v as typeof formulaType)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {FORMULA_TYPES.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {formulaType === 'CUSTOM' ? (
                    <div className="space-y-2">
                      <Label>Expresión</Label>
                      <Input
                        value={formulaExpression}
                        onChange={(e) => setFormulaExpression(e.target.value)}
                        placeholder="Ej: cantidad * precio"
                      />
                      <p className="text-xs text-muted-foreground">
                        Use los IDs de columna o nombres. Para campos del formulario principal use @fieldId.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Columna a calcular</Label>
                      <Select
                        value={formulaTargetColumn}
                        onValueChange={setFormulaTargetColumn}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccione columna numérica" />
                        </SelectTrigger>
                        <SelectContent>
                          {numberColumns.map(col => (
                            <SelectItem key={col.id} value={col.id}>
                              {col.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {numberColumns.length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          Primero agregue columnas de tipo Número para usar funciones de agregación.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Optional settings */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ancho (px)</Label>
                  <Input
                    type="number"
                    value={columnWidth ?? ''}
                    onChange={(e) =>
                      setColumnWidth(e.target.value ? parseInt(e.target.value) : undefined)
                    }
                    placeholder="Auto"
                  />
                </div>
                <div className="space-y-2 flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={columnRequired}
                      onChange={(e) => setColumnRequired(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm">Requerido</span>
                  </label>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveColumn} disabled={!columnName.trim()}>
                {editingColumn ? 'Guardar' : 'Agregar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Columns List */}
      {columns.length === 0 ? (
        <div className="text-center py-6 border rounded-md border-dashed text-muted-foreground">
          No hay columnas definidas. Agregue al menos una columna.
        </div>
      ) : (
        <div className="space-y-2">
          {columns.map((column, index) => (
            <div
              key={column.id}
              className="flex items-center gap-2 p-2 border rounded-md bg-background"
            >
              <div className="flex flex-col gap-0.5">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => handleMoveColumn(index, 'up')}
                  disabled={index === 0}
                >
                  <span className="text-xs">▲</span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4"
                  onClick={() => handleMoveColumn(index, 'down')}
                  disabled={index === columns.length - 1}
                >
                  <span className="text-xs">▼</span>
                </Button>
              </div>

              <div className="flex-1">
                <div className="font-medium text-sm">{column.name}</div>
                <div className="text-xs text-muted-foreground">
                  {COLUMN_TYPES.find(t => t.value === column.type)?.label}
                  {column.formula && ` - ${column.formula.type}`}
                  {column.required && ' • Requerido'}
                </div>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleOpenDialog(column)}
              >
                <Settings2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleRemoveColumn(column.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
