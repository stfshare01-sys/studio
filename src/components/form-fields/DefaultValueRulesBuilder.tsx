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
import { Plus, Trash2, X, Zap, ArrowRight } from 'lucide-react';
import type {
  FormField,
  DefaultValueRule,
  DefaultValueRuleCondition,
  VisibilityLogicalOperator,
  RuleOperator,
} from '@/lib/types';

interface DefaultValueRulesBuilderProps {
  fields: FormField[];
  rules: DefaultValueRule[];
  onRulesChange: (rules: DefaultValueRule[]) => void;
}

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: '==', label: 'Es igual a' },
  { value: '!=', label: 'No es igual a' },
  { value: '>', label: 'Mayor que' },
  { value: '<', label: 'Menor que' },
  { value: '>=', label: 'Mayor o igual' },
  { value: '<=', label: 'Menor o igual' },
  { value: 'contains', label: 'Contiene' },
];

export function DefaultValueRulesBuilder({
  fields,
  rules,
  onRulesChange,
}: DefaultValueRulesBuilderProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DefaultValueRule | null>(null);

  // Form state
  const [targetFieldId, setTargetFieldId] = useState('');
  const [defaultValue, setDefaultValue] = useState('');
  const [logic, setLogic] = useState<VisibilityLogicalOperator>('AND');
  const [conditions, setConditions] = useState<DefaultValueRuleCondition[]>([]);
  const [triggerFields, setTriggerFields] = useState<string[]>([]);

  const resetForm = () => {
    setTargetFieldId('');
    setDefaultValue('');
    setLogic('AND');
    setConditions([]);
    setTriggerFields([]);
    setEditingRule(null);
  };

  const handleOpenDialog = (rule?: DefaultValueRule) => {
    if (rule) {
      setEditingRule(rule);
      setTargetFieldId(rule.targetFieldId);
      setDefaultValue(String(rule.value));
      setLogic(rule.logic || 'AND');
      setConditions(rule.conditions || []);
      setTriggerFields(rule.triggerOnChange || []);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
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
    field: keyof DefaultValueRuleCondition,
    value: any
  ) => {
    const newConditions = [...conditions];
    newConditions[index] = { ...newConditions[index], [field]: value };
    setConditions(newConditions);
  };

  const handleToggleTriggerField = (fieldId: string) => {
    if (triggerFields.includes(fieldId)) {
      setTriggerFields(triggerFields.filter(f => f !== fieldId));
    } else {
      setTriggerFields([...triggerFields, fieldId]);
    }
  };

  const handleSaveRule = () => {
    if (!targetFieldId || !defaultValue) return;

    const newRule: DefaultValueRule = {
      id: editingRule?.id || `dvr-${Date.now()}`,
      targetFieldId,
      value: defaultValue.startsWith('@') ? defaultValue : parseValue(defaultValue, targetFieldId),
      conditions: conditions.length > 0 ? conditions : undefined,
      logic: conditions.length > 1 ? logic : undefined,
      triggerOnChange: triggerFields.length > 0 ? triggerFields : undefined,
    };

    if (editingRule) {
      onRulesChange(rules.map(r => (r.id === editingRule.id ? newRule : r)));
    } else {
      onRulesChange([...rules, newRule]);
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleDeleteRule = (ruleId: string) => {
    onRulesChange(rules.filter(r => r.id !== ruleId));
  };

  const parseValue = (val: string, fieldId: string): any => {
    const field = fields.find(f => f.id === fieldId);
    if (field?.type === 'number') {
      return parseFloat(val) || 0;
    }
    if (field?.type === 'checkbox') {
      return val === 'true';
    }
    return val;
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = fields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const getFieldType = (fieldId: string): string => {
    const field = fields.find(f => f.id === fieldId);
    return field?.type || 'text';
  };

  // Fields that can trigger default value changes
  const triggerableFields = fields.filter(
    f => f.id !== targetFieldId && !['file', 'table', 'user-identity'].includes(f.type)
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium">Valores por Defecto Condicionales</h4>
          <p className="text-sm text-muted-foreground">
            Establezca valores automáticos basados en condiciones o cambios en otros campos.
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
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingRule ? 'Editar Regla de Valor por Defecto' : 'Nueva Regla de Valor por Defecto'}
              </DialogTitle>
              <DialogDescription>
                Configure cuándo y qué valor establecer automáticamente en un campo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              {/* Target Field and Value */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Campo objetivo</Label>
                  <Select value={targetFieldId} onValueChange={setTargetFieldId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccione campo" />
                    </SelectTrigger>
                    <SelectContent>
                      {fields.filter(f => f.type !== 'file').map(field => (
                        <SelectItem key={field.id} value={field.id}>
                          {field.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Valor a establecer</Label>
                  <Input
                    value={defaultValue}
                    onChange={(e) => setDefaultValue(e.target.value)}
                    placeholder="Valor o @campoId"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use @campoId para referenciar el valor de otro campo
                  </p>
                </div>
              </div>

              {/* Trigger Fields */}
              {targetFieldId && (
                <div className="space-y-2 p-3 border rounded-md bg-muted/30">
                  <Label className="text-sm">Activar cuando cambien estos campos (opcional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {triggerableFields.map(field => (
                      <Badge
                        key={field.id}
                        variant={triggerFields.includes(field.id) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => handleToggleTriggerField(field.id)}
                      >
                        {field.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Conditions */}
              <div className="space-y-2 border-t pt-4">
                <div className="flex items-center justify-between">
                  <Label>Condiciones (opcional)</Label>
                  <div className="flex items-center gap-2">
                    {conditions.length > 1 && (
                      <Select value={logic} onValueChange={(v) => setLogic(v as VisibilityLogicalOperator)}>
                        <SelectTrigger className="w-32 h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="AND">Todas (AND)</SelectItem>
                          <SelectItem value="OR">Alguna (OR)</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddCondition}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Condición
                    </Button>
                  </div>
                </div>

                {conditions.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">
                    Sin condiciones: el valor se aplicará siempre al iniciar.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {conditions.map((condition, index) => {
                      const sourceField = fields.find(f => f.id === condition.fieldId);

                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 p-2 border rounded-md bg-background"
                        >
                          {index > 0 && (
                            <Badge variant="secondary" className="shrink-0">
                              {logic}
                            </Badge>
                          )}

                          <Select
                            value={condition.fieldId}
                            onValueChange={(v) => handleConditionChange(index, 'fieldId', v)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder="Campo" />
                            </SelectTrigger>
                            <SelectContent>
                              {fields
                                .filter(f => !['file', 'table'].includes(f.type))
                                .map(field => (
                                  <SelectItem key={field.id} value={field.id}>
                                    {field.label}
                                  </SelectItem>
                                ))}
                            </SelectContent>
                          </Select>

                          <Select
                            value={condition.operator}
                            onValueChange={(v) => handleConditionChange(index, 'operator', v)}
                          >
                            <SelectTrigger className="w-36">
                              <SelectValue placeholder="Operador" />
                            </SelectTrigger>
                            <SelectContent>
                              {OPERATORS.map(op => (
                                <SelectItem key={op.value} value={op.value}>
                                  {op.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>

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
                disabled={!targetFieldId || !defaultValue}
              >
                {editingRule ? 'Guardar' : 'Crear Regla'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Rules List */}
      {rules.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No hay reglas de valores por defecto configuradas.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <Card key={rule.id} className="hover:bg-muted/30">
              <CardContent className="py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Zap className="h-4 w-4 text-amber-500" />
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      <span className="text-primary">{getFieldLabel(rule.targetFieldId)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <code className="bg-muted px-1.5 py-0.5 rounded text-xs">
                        {String(rule.value)}
                      </code>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {rule.conditions && rule.conditions.length > 0 ? (
                        <span>
                          Cuando{' '}
                          {rule.conditions.map((c, i) => (
                            <span key={i}>
                              {i > 0 && <span className="font-medium"> {rule.logic} </span>}
                              <span>{getFieldLabel(c.fieldId)}</span>
                              {' '}{c.operator}{' '}
                              <span className="font-medium">{String(c.value)}</span>
                            </span>
                          ))}
                        </span>
                      ) : rule.triggerOnChange && rule.triggerOnChange.length > 0 ? (
                        <span>
                          Al cambiar: {rule.triggerOnChange.map(f => getFieldLabel(f)).join(', ')}
                        </span>
                      ) : (
                        'Siempre al iniciar'
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleOpenDialog(rule)}>
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
