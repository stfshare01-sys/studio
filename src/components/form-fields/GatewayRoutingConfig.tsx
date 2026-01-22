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
import { Plus, Trash2, ArrowRight, GitMerge, GitFork, AlertCircle } from 'lucide-react';
import type {
  WorkflowStepDefinition,
  RuleOperator,
  FormField,
  GatewayRoute,
} from '@/lib/types';

interface GatewayRoutingConfigProps {
  gatewayType: 'gateway-exclusive' | 'gateway-parallel' | 'gateway-inclusive';
  routes: GatewayRoute[];
  onRoutesChange: (routes: GatewayRoute[]) => void;
  availableSteps: WorkflowStepDefinition[];
  formFields: FormField[];
  precedingStep?: WorkflowStepDefinition;
}

const OPERATORS: { value: RuleOperator; label: string }[] = [
  { value: '==', label: 'Es igual a' },
  { value: '!=', label: 'No es igual a' },
  { value: '>', label: 'Mayor que' },
  { value: '<', label: 'Menor que' },
  { value: '>=', label: 'Mayor o igual' },
  { value: '<=', label: 'Menor o igual' },
  { value: 'is', label: 'Es (selección)' },
  { value: 'is_not', label: 'No es (selección)' },
  { value: 'contains', label: 'Contiene' },
];

export function GatewayRoutingConfig({
  gatewayType,
  routes,
  onRoutesChange,
  availableSteps,
  formFields,
  precedingStep,
}: GatewayRoutingConfigProps) {
  // Get outcomes from preceding step if available
  const precedingOutcomes = precedingStep?.outcomes || [];

  // Filter steps that can be targets (not gateways)
  const targetableSteps = availableSteps.filter(
    s => !s.type.startsWith('gateway')
  );

  const handleAddRoute = () => {
    const newRoute: GatewayRoute = {
      id: `route-${Date.now()}`,
      targetStepId: targetableSteps[0]?.id || '',
      condition: precedingOutcomes.length > 0
        ? {
            sourceType: 'outcome',
            fieldId: precedingStep?.id || '',
            operator: 'is',
            value: precedingOutcomes[0] || '',
          }
        : {
            sourceType: 'form',
            fieldId: formFields[0]?.id || '',
            operator: '==',
            value: '',
          },
    };
    onRoutesChange([...routes, newRoute]);
  };

  const handleRemoveRoute = (routeId: string) => {
    onRoutesChange(routes.filter(r => r.id !== routeId));
  };

  const handleUpdateRoute = (
    routeId: string,
    updates: Partial<GatewayRoute>
  ) => {
    onRoutesChange(
      routes.map(r => (r.id === routeId ? { ...r, ...updates } : r))
    );
  };

  const handleUpdateCondition = (
    routeId: string,
    conditionUpdates: Partial<NonNullable<GatewayRoute['condition']>>
  ) => {
    onRoutesChange(
      routes.map(r =>
        r.id === routeId
          ? { ...r, condition: { ...r.condition!, ...conditionUpdates } }
          : r
      )
    );
  };

  const setDefaultRoute = (routeId: string) => {
    onRoutesChange(
      routes.map(r => ({
        ...r,
        isDefault: r.id === routeId,
        condition: r.id === routeId ? undefined : r.condition,
      }))
    );
  };

  const getStepName = (stepId: string): string => {
    const step = availableSteps.find(s => s.id === stepId);
    return step?.name || 'Paso desconocido';
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const getFieldOptions = (fieldId: string): string[] | undefined => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.options;
  };

  const isExclusive = gatewayType === 'gateway-exclusive';
  const isParallel = gatewayType === 'gateway-parallel';
  const isInclusive = gatewayType === 'gateway-inclusive';

  return (
    <div className="space-y-4">
      {/* Gateway type info */}
      <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-md">
        {isExclusive && (
          <>
            <GitMerge className="h-5 w-5 text-amber-500 mt-0.5" />
            <div>
              <div className="font-medium">Gateway Exclusivo (XOR)</div>
              <p className="text-sm text-muted-foreground">
                Solo UN camino se activará basado en las condiciones.
                Configure una ruta por defecto para casos no cubiertos.
              </p>
            </div>
          </>
        )}
        {isParallel && (
          <>
            <GitFork className="h-5 w-5 text-purple-500 mt-0.5" />
            <div>
              <div className="font-medium">Gateway Paralelo (AND)</div>
              <p className="text-sm text-muted-foreground">
                TODOS los caminos se ejecutarán simultáneamente.
                No requiere condiciones, solo destinos.
              </p>
            </div>
          </>
        )}
        {isInclusive && (
          <>
            <GitFork className="h-5 w-5 text-green-500 mt-0.5" />
            <div>
              <div className="font-medium">Gateway Inclusivo (OR)</div>
              <p className="text-sm text-muted-foreground">
                Múltiples caminos pueden activarse si sus condiciones se cumplen.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Preceding step outcomes notice */}
      {precedingOutcomes.length > 0 && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <span className="text-blue-700 dark:text-blue-300">
            El paso anterior tiene resultados definidos: {precedingOutcomes.join(', ')}
          </span>
        </div>
      )}

      {/* Routes list */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Rutas de Salida</Label>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAddRoute}
            disabled={targetableSteps.length === 0}
          >
            <Plus className="h-4 w-4 mr-1" />
            Agregar Ruta
          </Button>
        </div>

        {routes.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground">
              <p>No hay rutas configuradas.</p>
              <p className="text-sm">Agregue rutas para definir los posibles caminos del flujo.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {routes.map((route, index) => {
              const selectedField = formFields.find(
                f => f.id === route.condition?.fieldId
              );
              const fieldOptions = selectedField?.options || precedingOutcomes;

              return (
                <Card key={route.id} className={route.isDefault ? 'border-primary' : ''}>
                  <CardContent className="py-3 space-y-3">
                    {/* Route header */}
                    <div className="flex items-center gap-2">
                      <Badge variant={route.isDefault ? 'default' : 'secondary'}>
                        {route.isDefault ? 'Por Defecto' : `Ruta ${index + 1}`}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={route.targetStepId}
                        onValueChange={(v) =>
                          handleUpdateRoute(route.id, { targetStepId: v })
                        }
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

                      {isExclusive && !route.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDefaultRoute(route.id)}
                        >
                          Hacer Default
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleRemoveRoute(route.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    {/* Condition configuration (not for parallel or default routes) */}
                    {!isParallel && !route.isDefault && route.condition && (
                      <div className="flex items-center gap-2 pl-4 border-l-2 border-muted">
                        <span className="text-sm text-muted-foreground shrink-0">Si</span>

                        {/* Source type selector */}
                        <Select
                          value={route.condition.sourceType}
                          onValueChange={(v) =>
                            handleUpdateCondition(route.id, {
                              sourceType: v as 'form' | 'outcome',
                              fieldId:
                                v === 'outcome'
                                  ? precedingStep?.id || ''
                                  : formFields[0]?.id || '',
                            })
                          }
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="form">Campo</SelectItem>
                            {precedingOutcomes.length > 0 && (
                              <SelectItem value="outcome">Resultado</SelectItem>
                            )}
                          </SelectContent>
                        </Select>

                        {/* Field/Outcome selector */}
                        {route.condition.sourceType === 'form' ? (
                          <Select
                            value={route.condition.fieldId}
                            onValueChange={(v) =>
                              handleUpdateCondition(route.id, { fieldId: v })
                            }
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
                        ) : (
                          <Badge variant="outline" className="shrink-0">
                            {getStepName(route.condition.fieldId)}
                          </Badge>
                        )}

                        {/* Operator */}
                        <Select
                          value={route.condition.operator}
                          onValueChange={(v) =>
                            handleUpdateCondition(route.id, {
                              operator: v as RuleOperator,
                            })
                          }
                        >
                          <SelectTrigger className="w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {OPERATORS.map(op => (
                              <SelectItem key={op.value} value={op.value}>
                                {op.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Value */}
                        {fieldOptions && fieldOptions.length > 0 ? (
                          <Select
                            value={String(route.condition.value)}
                            onValueChange={(v) =>
                              handleUpdateCondition(route.id, { value: v })
                            }
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
                            value={String(route.condition.value)}
                            onChange={(e) =>
                              handleUpdateCondition(route.id, {
                                value:
                                  selectedField?.type === 'number'
                                    ? parseFloat(e.target.value) || 0
                                    : e.target.value,
                              })
                            }
                            placeholder="Valor"
                            className="flex-1"
                            type={selectedField?.type === 'number' ? 'number' : 'text'}
                          />
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Visual flow representation */}
      {routes.length > 0 && (
        <div className="p-4 bg-muted/30 rounded-md">
          <div className="text-sm font-medium mb-2">Flujo resultante:</div>
          <div className="flex items-start gap-4">
            <div className="px-3 py-2 bg-background border rounded-md text-sm text-center">
              <div className="text-xs text-muted-foreground mb-1">
                {isExclusive ? 'XOR' : isParallel ? 'AND' : 'OR'}
              </div>
              Gateway
            </div>
            <div className="flex flex-col gap-1 flex-1">
              {routes.map((route, index) => (
                <div key={route.id} className="flex items-center gap-2">
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="px-2 py-1 bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded text-xs">
                    {getStepName(route.targetStepId)}
                  </div>
                  {!isParallel && route.condition && (
                    <span className="text-xs text-muted-foreground">
                      (si {route.condition.sourceType === 'outcome' ? 'resultado' : getFieldLabel(route.condition.fieldId)} {route.condition.operator} {String(route.condition.value)})
                    </span>
                  )}
                  {route.isDefault && (
                    <span className="text-xs text-muted-foreground">(por defecto)</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
