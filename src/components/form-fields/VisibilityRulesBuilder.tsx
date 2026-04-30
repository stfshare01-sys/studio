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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Eye, EyeOff, X } from 'lucide-react';
import type { FormField, VisibilityRule, VisibilityCondition, VisibilityLogicalOperator, RuleOperator } from "@/types/workflow.types";

interface VisibilityRulesBuilderProps {
  fields: FormField[];
  rules: VisibilityRule[];
  onRulesChange: (rules: VisibilityRule[]) => void;
}

const OPERATORS: { value: RuleOperator; label: string; types: string[] }[] = [
  { value: '==', label: 'Es igual a', types: ['text', 'number', 'select', 'radio', 'checkbox'] },
  { value: '!=', label: 'No es igual a', types: ['text', 'number', 'select', 'radio', 'checkbox'] },
  { value: '>', label: 'Mayor que', types: ['number'] },
  { value: '<', label: 'Menor que', types: ['number'] },
  { value: '>=', label: 'Mayor o igual que', types: ['number'] },
  { value: '<=', label: 'Menor o igual que', types: ['number'] },
  { value: 'contains', label: 'Contiene', types: ['text', 'textarea'] },
  { value: 'not_contains', label: 'No contiene', types: ['text', 'textarea'] },
];

function getOperatorsForFieldType(fieldType: string): { value: RuleOperator; label: string }[] {
  return OPERATORS.filter(op => op.types.includes(fieldType));
}

export function VisibilityRulesBuilder({
  fields,
  rules,
  onRulesChange,
}: VisibilityRulesBuilderProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<VisibilityRule | null>(null);

  // Form state for new/editing rule
  const [targetFieldId, setTargetFieldId] = useState('');
  const [logic, setLogic] = useState<VisibilityLogicalOperator>('AND');
  const [action, setAction] = useState<'show' | 'hide'>('show');
  const [conditions, setConditions] = useState<VisibilityCondition[]>([]);

  const resetForm = () => {
    setTargetFieldId('');
    setLogic('AND');
    setAction('show');
    setConditions([]);
    setEditingRule(null);
  };

  const handleAddCondition = () => {
    setConditions([
      ...conditions,
      { fieldId: '', operator: '==' as RuleOperator, value: '' },
    ]);
  };

  const handleRemoveCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (
    index: number,
    field: keyof VisibilityCondition,
    value: any
  ) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const handleSaveRule = () => {
    if (!targetFieldId || conditions.length === 0) return;

    const newRule: VisibilityRule = {
      id: editingRule?.id || `vis-${Date.now()}`,
      targetFieldId,
      logic,
      action,
      conditions,
    };

    if (editingRule) {
      // Update existing rule
      onRulesChange(rules.map(r => (r.id === editingRule.id ? newRule : r)));
    } else {
      // Add new rule
      onRulesChange([...rules, newRule]);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleEditRule = (rule: VisibilityRule) => {
    setEditingRule(rule);
    setTargetFieldId(rule.targetFieldId);
    setLogic(rule.logic);
    setAction(rule.action);
    setConditions([...rule.conditions]);
    setIsDialogOpen(true);
  };

  const handleDeleteRule = (ruleId: string) => {
    onRulesChange(rules.filter(r => r.id !== ruleId));
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = fields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const getFieldType = (fieldId: string): string => {
    const field = fields.find(f => f.id === fieldId);
    return field?.type || 'text';
  };

  // Fields that can be used as condition sources (exclude some types)
  const conditionSourceFields = fields.filter(f =>
    !['file', 'table', 'user-identity'].includes(f.type)
  );

  // Fields that can have visibility rules applied
  const targetableFields = fields;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Reglas de Visibilidad</h4>
          <p className="text-sm text-muted-foreground">
            Configure cuándo mostrar u ocultar campos basándose en condiciones.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-2" />
              Nueva Regla
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? 'Editar Regla de Visibilidad' : 'Nueva Regla de Visibilidad'}
              </DialogTitle>
              <DialogDescription>
                Configure cuándo mostrar u ocultar un campo basándose en el valor de otros campos.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Target Field */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campo objetivo</Label>
                  <Select value={targetFieldId} onValueChange={setTargetFieldId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {targetableFields.map(field => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Acción</Label>
                  <Select value={action} onValueChange={(v) => setAction(v as 'show' | 'hide')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="show">
                        <div className="flex items-center gap-2">
                          <Eye className="h-4 w-4" />
                          Mostrar cuando se cumpla
                        </div>
                      </SelectItem>
                      <SelectItem value="hide">
                        <div className="flex items-center gap-2">
                          <EyeOff className="h-4 w-4" />
                          Ocultar cuando se cumpla
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Logic Operator */}
              <div className="space-y-2">
                <Label>Lógica de condiciones</Label>
                <Select value={logic} onValueChange={(v) => setLogic(v as VisibilityLogicalOperator)}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AND">
                      Todas las condiciones (AND)
                    </SelectItem>
                    <SelectItem value="OR">
                      Cualquier condición (OR)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Conditions */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Condiciones</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleAddCondition}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar Condición
                  </Button>
                </div>

                {conditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center border rounded-md">
                    Agregue al menos una condición
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => {
                      const sourceField = fields.find(f => f.id === condition.fieldId);
                      const availableOperators = getOperatorsForFieldType(
                        sourceField?.type || 'text'
                      );

                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 border rounded-md bg-muted/30"
                        >
                          {index > 0 && (
                            <Badge variant="secondary" className="shrink-0">
                              {logic}
                            </Badge>
                          )}

                          {/* Source Field */}
                          <Select
                            value={condition.fieldId}
                            onValueChange={(v) => handleConditionChange(index, 'fieldId', v)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Campo" />
                            </SelectTrigger>
                            <SelectContent>
                              {conditionSourceFields.map(field => (
                                <SelectItem key={field.id} value={field.id}>
                                  {field.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Operator */}
                          <Select
                            value={condition.operator}
                            onValueChange={(v) => handleConditionChange(index, 'operator', v)}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue placeholder="Operador" />
                            </SelectTrigger>
                            <SelectContent>
                              {availableOperators.map(op => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

                          {/* Value */}
                          {sourceField?.type === 'select' || sourceField?.type === 'radio' ? (
                            <Select
                              value={String(condition.value)}
                              onValueChange={(v) => handleConditionChange(index, 'value', v)}
                            >
                              <SelectTrigger className="flex-1">
                                <SelectValue placeholder="Valor" />
                              </SelectTrigger>
                              <SelectContent>
                                {(sourceField.options || []).map(opt => (
                                  <SelectItem key={opt} value={opt}>
                                    {opt}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Input
                              type={sourceField?.type === 'number' ? 'number' : 'text'}
                              value={condition.value ?? ''}
                              onChange={(e) =>
                                handleConditionChange(
                                  index,
                                  'value',
                                  sourceField?.type === 'number'
                                    ? parseFloat(e.target.value)
                                    : e.target.value
                                )
                              }
                              placeholder="Valor"
                              className="flex-1"
                            />
                          )}

                          {/* Remove */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveCondition(index)}
                            className="shrink-0 text-destructive hover:text-destructive"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleSaveRule}
                disabled={!targetFieldId || conditions.length === 0}
              >
                {editingRule ? 'Guardar Cambios' : 'Crear Regla'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay reglas de visibilidad configuradas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <Card key={rule.id} className="cursor-pointer hover:bg-muted/30">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {rule.action === 'show' ? (
                    <Eye className="h-4 w-4 text-green-600" />
                  ) : (
                    <EyeOff className="h-4 w-4 text-orange-600" />
                  )}
                  <div>
                    <div className="font-medium">
                      {rule.action === 'show' ? 'Mostrar' : 'Ocultar'}{' '}
                      <span className="text-primary">{getFieldLabel(rule.targetFieldId)}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Cuando{' '}
                      {rule.conditions.map((c, i) => (
                        <span key={i}>
                          {i > 0 && <span className="font-medium"> {rule.logic} </span>}
                          <span className="font-medium">{getFieldLabel(c.fieldId)}</span>
                          {' '}{c.operator}{' '}
                          <span className="font-medium">{String(c.value)}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleEditRule(rule)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDeleteRule(rule.id)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
