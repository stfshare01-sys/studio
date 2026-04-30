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
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowRight, GitBranch, AlertCircle } from 'lucide-react';
import type { WorkflowStepDefinition, RuleCondition, RuleOperator, FormField } from "@/types/workflow.types";

interface InclusiveGatewayConfigProps {
  conditions: { targetStepId: string; condition: RuleCondition }[];
  onConditionsChange: (conditions: { targetStepId: string; condition: RuleCondition }[]) => void;
  availableSteps: WorkflowStepDefinition[];
  formFields: FormField[];
}

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: '==', label: 'Es igual a' },
  { value: '!=', label: 'No es igual a' },
  { value: '>', label: 'Mayor que' },
  { value: '<', label: 'Menor que' },
  { value: '>=', label: 'Mayor o igual' },
  { value: '<=', label: 'Menor o igual' },
  { value: 'contains', label: 'Contiene' },
  { value: 'is', label: 'Es (select/radio)' },
  { value: 'is_not', label: 'No es (select/radio)' },
];

export function InclusiveGatewayConfig({
  conditions,
  onConditionsChange,
  availableSteps,
  formFields,
}: InclusiveGatewayConfigProps) {
  // Filter out gateway steps from available targets
  const targetableSteps = availableSteps.filter(
    s => !s.type.startsWith('gateway')
  );

  const handleAddCondition = () => {
    const newCondition: { targetStepId: string; condition: RuleCondition } = {
      targetStepId: targetableSteps[0]?.id || '',
      condition: {
        fieldId: formFields[0]?.id || '',
        operator: '==',
        value: '',
        type: 'form',
      },
    };
    onConditionsChange([...conditions, newCondition]);
  };

  const handleRemoveCondition = (index: number) => {
    onConditionsChange(conditions.filter((_, i) => i !== index));
  };

  const handleConditionChange = (
    index: number,
    field: 'targetStepId' | 'fieldId' | 'operator' | 'value',
    value: any
  ) => {
    const newConditions = [...conditions];

    if (field === 'targetStepId') {
      newConditions[index] = { ...newConditions[index], targetStepId: value };
    } else {
      newConditions[index] = {
        ...newConditions[index],
        condition: {
          ...newConditions[index].condition,
          [field]: value,
        },
      };
    }

    onConditionsChange(newConditions);
  };

  const getStepName = (stepId: string): string => {
    const step = availableSteps.find(s => s.id === stepId);
    return step?.name || stepId;
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const getFieldOptions = (fieldId: string): string[] | undefined => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.options;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            Gateway Inclusivo
          </h4>
          <p className="text-sm text-muted-foreground">
            Configure múltiples caminos que se pueden activar simultáneamente.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleAddCondition}
          disabled={targetableSteps.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          Agregar Camino
        </Button>
      </div>

      {/* Info about inclusive gateway behavior */}
      <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
        <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
        <div className="text-blue-700 dark:text-blue-300">
          <strong>Gateway Inclusivo:</strong> A diferencia del exclusivo (XOR), este gateway
          puede activar <strong>múltiples caminos</strong> simultáneamente si sus condiciones
          se cumplen. Todos los caminos activos deben completarse antes de continuar.
        </div>
      </div>

      {/* Conditions list */}
      {conditions.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground">
            <GitBranch className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>No hay caminos configurados.</p>
            <p className="text-sm">Agregue condiciones para definir los posibles caminos.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {conditions.map((cond, index) => {
            const selectedField = formFields.find(f => f.id === cond.condition.fieldId);
            const fieldOptions = selectedField?.options;

            return (
              <Card key={index}>
                <CardContent className="py-3 space-y-3">
                  {/* Target step */}
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="shrink-0">
                      Camino {index + 1}
                    </Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    <Select
                      value={cond.targetStepId}
                      onValueChange={(v) => handleConditionChange(index, 'targetStepId', v)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Seleccione destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {targetableSteps.map(step => (
                          <SelectItem key={step.id} value={step.id}>
                            {step.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      onClick={() => handleRemoveCondition(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* Condition configuration */}
                  <div className="flex items-center gap-2 pl-4 border-l-2 border-muted">
                    <span className="text-sm text-muted-foreground shrink-0">Si</span>

                    {/* Field selector */}
                    <Select
                      value={cond.condition.fieldId}
                      onValueChange={(v) => handleConditionChange(index, 'fieldId', v)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Campo" />
                      </SelectTrigger>
                      <SelectContent>
                        {formFields
                          .filter(f => !['file', 'table'].includes(f.type))
                          .map(field => (
                            <SelectItem key={field.id} value={field.id}>
                              {field.label}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>

                    {/* Operator selector */}
                    <Select
                      value={cond.condition.operator}
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

                    {/* Value input */}
                    {fieldOptions ? (
                      <Select
                        value={String(cond.condition.value)}
                        onValueChange={(v) => handleConditionChange(index, 'value', v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Valor" />
                        </SelectTrigger>
                        <SelectContent>
                          {fieldOptions.map(opt => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input
                        type={selectedField?.type === 'number' ? 'number' : 'text'}
                        value={cond.condition.value ?? ''}
                        onChange={(e) =>
                          handleConditionChange(
                            index,
                            'value',
                            selectedField?.type === 'number'
                              ? parseFloat(e.target.value)
                              : e.target.value
                          )
                        }
                        placeholder="Valor"
                        className="flex-1"
                      />
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Visual representation */}
      {conditions.length > 0 && (
        <div className="p-4 bg-muted/30 rounded-md">
          <div className="text-sm font-medium mb-2">Flujo resultante:</div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="px-3 py-1.5 bg-background border rounded-md text-sm">
              Gateway Inclusivo
            </div>
            <div className="flex flex-col gap-1">
              {conditions.map((cond, index) => (
                <div key={index} className="flex items-center gap-1">
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-xs">
                    {getStepName(cond.targetStepId)}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    (si {getFieldLabel(cond.condition.fieldId)} {cond.condition.operator}{' '}
                    {String(cond.condition.value)})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
