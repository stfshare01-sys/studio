'use client';

import { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { useDynamicOptions, staticOptionsToDynamic } from './hooks/useDynamicOptions';
import type { FormField } from '@/lib/types';

interface DynamicSelectProps {
  field: FormField;
  value: string | undefined;
  onChange: (value: string) => void;
  formData: Record<string, any>;
  disabled?: boolean;
  error?: string | null;
}

export function DynamicSelect({
  field,
  value,
  onChange,
  formData,
  disabled = false,
  error,
}: DynamicSelectProps) {
  // Get dynamic options from Firestore if configured
  const {
    options: dynamicOptions,
    isLoading,
    error: fetchError,
  } = useDynamicOptions(field.dynamicSource, formData);

  // Combine static and dynamic options
  const allOptions = useMemo(() => {
    if (field.dynamicSource) {
      return dynamicOptions;
    }
    // Fall back to static options
    return staticOptionsToDynamic(field.options);
  }, [field.dynamicSource, field.options, dynamicOptions]);

  // Check if parent field has value (for cascade filtering)
  const parentFieldId = field.dynamicSource?.filterConfig?.dependsOn;
  const parentHasValue = parentFieldId
    ? formData[parentFieldId] !== undefined && formData[parentFieldId] !== ''
    : true;

  // Determine placeholder text
  const getPlaceholder = (): string => {
    if (isLoading) return 'Cargando opciones...';
    if (!parentHasValue && parentFieldId) {
      return `Primero seleccione ${parentFieldId}`;
    }
    if (allOptions.length === 0) return 'Sin opciones disponibles';
    return field.placeholder || `Seleccione ${field.label.toLowerCase()}`;
  };

  return (
    <div className="space-y-2">
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled || isLoading || (!parentHasValue && !!parentFieldId)}
      >
        <SelectTrigger
          id={field.id}
          className={error ? 'border-destructive' : ''}
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-muted-foreground">Cargando...</span>
            </div>
          ) : (
            <SelectValue placeholder={getPlaceholder()} />
          )}
        </SelectTrigger>
        <SelectContent>
          {allOptions.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
          {allOptions.length === 0 && !isLoading && (
            <div className="py-2 px-2 text-sm text-muted-foreground text-center">
              Sin opciones disponibles
            </div>
          )}
        </SelectContent>
      </Select>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {fetchError && (
        <p className="text-sm text-destructive">
          Error al cargar opciones: {fetchError.message}
        </p>
      )}

      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
