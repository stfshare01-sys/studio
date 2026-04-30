
'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';
import type { ValidationRule, ValidationType, FormFieldType } from "@/types/workflow.types";

interface FieldValidationConfigProps {
  fieldType: FormFieldType;
  validations: ValidationRule[];
  onValidationsChange: (validations: ValidationRule[]) => void;
}

// Validation types available for each field type
const VALIDATION_TYPES: Record<string, { value: ValidationType; label: string; hasValue: boolean }[]> = {
  text: [
    { value: 'required', label: 'Requerido', hasValue: false },
    { value: 'minLength', label: 'Longitud mínima', hasValue: true },
    { value: 'maxLength', label: 'Longitud máxima', hasValue: true },
    { value: 'pattern', label: 'Patrón (Regex)', hasValue: true },
  ],
  textarea: [
    { value: 'required', label: 'Requerido', hasValue: false },
    { value: 'minLength', label: 'Longitud mínima', hasValue: true },
    { value: 'maxLength', label: 'Longitud máxima', hasValue: true },
  ],
  number: [
    { value: 'required', label: 'Requerido', hasValue: false },
    { value: 'min', label: 'Valor mínimo', hasValue: true },
    { value: 'max', label: 'Valor máximo', hasValue: true },
  ],
  email: [
    { value: 'required', label: 'Requerido', hasValue: false },
    { value: 'email', label: 'Formato de email', hasValue: false },
  ],
  date: [
    { value: 'required', label: 'Requerido', hasValue: false },
  ],
  select: [
    { value: 'required', label: 'Requerido', hasValue: false },
  ],
  'dynamic-select': [
    { value: 'required', label: 'Requerido', hasValue: false },
  ],
  radio: [
    { value: 'required', label: 'Requerido', hasValue: false },
  ],
  checkbox: [
    { value: 'required', label: 'Requerido', hasValue: false },
  ],
  file: [
    { value: 'required', label: 'Requerido', hasValue: false },
    { value: 'fileSize', label: 'Tamaño máximo (bytes)', hasValue: true },
  ],
  table: [
    { value: 'required', label: 'Al menos una fila', hasValue: false },
  ],
  'user-identity': [],
};

export function FieldValidationConfig({
  fieldType,
  validations,
  onValidationsChange,
}: FieldValidationConfigProps) {
  const availableTypes = VALIDATION_TYPES[fieldType] || [];

  // Quick toggle for required validation
  const hasRequired = validations.some(v => v.type === 'required');

  const toggleRequired = (checked: boolean) => {
    if (checked) {
      if (!hasRequired) {
        onValidationsChange([
          ...validations,
          { type: 'required', message: 'Este campo es requerido' },
        ]);
      }
    } else {
      onValidationsChange(validations.filter(v => v.type !== 'required'));
    }
  };

  const handleAddValidation = (type: ValidationType) => {
    // Don't add duplicate validation types
    if (validations.some(v => v.type === type)) return;

    const newValidation: ValidationRule = { type };

    // Set default values for certain types
    switch (type) {
      case 'minLength':
        newValidation.value = 1;
        newValidation.message = 'El campo es muy corto';
        break;
      case 'maxLength':
        newValidation.value = 255;
        newValidation.message = 'El campo es muy largo';
        break;
      case 'min':
        newValidation.value = 0;
        newValidation.message = 'El valor es menor al mínimo permitido';
        break;
      case 'max':
        newValidation.value = 1000000;
        newValidation.message = 'El valor excede el máximo permitido';
        break;
      case 'email':
        newValidation.message = 'Formato de correo electrónico inválido';
        break;
      case 'fileSize':
        newValidation.value = 10 * 1024 * 1024; // 10MB default
        newValidation.message = 'El archivo excede el tamaño máximo';
        break;
      case 'pattern':
        newValidation.value = '';
        newValidation.message = 'El formato no es válido';
        break;
    }

    onValidationsChange([...validations, newValidation]);
  };

  const handleUpdateValidation = (
    index: number,
    updates: Partial<ValidationRule>
  ) => {
    const newValidations = [...validations];
    newValidations[index] = { ...newValidations[index], ...updates };
    onValidationsChange(newValidations);
  };

  const handleRemoveValidation = (index: number) => {
    onValidationsChange(validations.filter((_, i) => i !== index));
  };

  // Get available types that haven't been added yet
  const unaddedTypes = availableTypes.filter(
    t => !validations.some(v => v.type === t.value)
  );

  if (availableTypes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Este tipo de campo no tiene opciones de validación disponibles.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Quick required toggle */}
      {availableTypes.some(t => t.value === 'required') && (
        <div className="flex items-center justify-between py-2 px-3 border rounded-md">
          <div className="space-y-0.5">
            <Label>Campo requerido</Label>
            <p className="text-xs text-muted-foreground">
              El usuario debe completar este campo
            </p>
          </div>
          <Switch
            checked={hasRequired}
            onCheckedChange={toggleRequired}
          />
        </div>
      )}

      {/* Other validations */}
      <div className="space-y-2">
        <Label>Validaciones adicionales</Label>

        {validations
          .filter(v => v.type !== 'required')
          .map((validation, index) => {
            const actualIndex = validations.findIndex(v => v === validation);
            const typeInfo = availableTypes.find(t => t.value === validation.type);

            return (
              <div
                key={actualIndex}
                className="flex items-start gap-2 p-3 border rounded-md bg-muted/30"
              >
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">
                      {typeInfo?.label || validation.type}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveValidation(actualIndex)}
                      className="h-6 w-6 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {typeInfo?.hasValue && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Valor</Label>
                        <Input
                          type={
                            ['min', 'max', 'minLength', 'maxLength', 'fileSize'].includes(
                              validation.type
                            )
                              ? 'number'
                              : 'text'
                          }
                          value={validation.value ?? ''}
                          onChange={(e) =>
                            handleUpdateValidation(actualIndex, {
                              value:
                                e.target.type === 'number'
                                  ? parseFloat(e.target.value)
                                  : e.target.value,
                            })
                          }
                          placeholder={
                            validation.type === 'pattern'
                              ? 'Expresión regular'
                              : 'Valor'
                          }
                          className="h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Mensaje de error</Label>
                        <Input
                          type="text"
                          value={validation.message ?? ''}
                          onChange={(e) =>
                            handleUpdateValidation(actualIndex, {
                              message: e.target.value,
                            })
                          }
                          placeholder="Mensaje personalizado"
                          className="h-8"
                        />
                      </div>
                    </div>
                  )}

                  {!typeInfo?.hasValue && validation.type !== 'required' && (
                    <div>
                      <Label className="text-xs">Mensaje de error</Label>
                      <Input
                        type="text"
                        value={validation.message ?? ''}
                        onChange={(e) =>
                          handleUpdateValidation(actualIndex, {
                            message: e.target.value,
                          })
                        }
                        placeholder="Mensaje personalizado"
                        className="h-8"
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}

        {/* Add validation button */}
        {unaddedTypes.filter(t => t.value !== 'required').length > 0 && (
          <Select
            value={undefined}
            onValueChange={(value) => handleAddValidation(value as ValidationType)}
          >
            <SelectTrigger className={cn(buttonVariants({ variant: 'outline' }), "w-full justify-start font-normal")}>
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                <span>Agregar validación</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              {unaddedTypes
                .filter(t => t.value !== 'required')
                .map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* File size helper text */}
      {fieldType === 'file' && validations.some(v => v.type === 'fileSize') && (
        <p className="text-xs text-muted-foreground">
          Tamaño en bytes. Ejemplo: 10485760 = 10MB, 5242880 = 5MB
        </p>
      )}
    </div>
  );
}
