'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Clock, Calendar, ArrowRight } from 'lucide-react';
import type { TimerConfig, TimerType, FormField } from "@/types/workflow.types";

interface TimerStepConfigProps {
  value: TimerConfig | undefined;
  onChange: (config: TimerConfig | undefined) => void;
  formFields: FormField[];
}

const TIMER_TYPES: { value: TimerType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'duration',
    label: 'Duración',
    icon: <Clock className="h-4 w-4" />,
    description: 'Esperar un tiempo específico antes de continuar'
  },
  {
    value: 'date',
    label: 'Fecha/Hora',
    icon: <Calendar className="h-4 w-4" />,
    description: 'Esperar hasta una fecha específica o valor de campo'
  },
];

export function TimerStepConfig({
  value,
  onChange,
  formFields,
}: TimerStepConfigProps) {
  const timerType = value?.type || 'duration';

  // Get date fields that can be used for timer
  const dateFields = formFields.filter(f => f.type === 'date');

  const handleTypeChange = (type: TimerType) => {
    const newConfig: TimerConfig = { type };
    if (type === 'duration') {
      newConfig.durationHours = 24;
    }
    onChange(newConfig);
  };

  const handleDurationChange = (field: 'durationHours' | 'durationDays', val: string) => {
    const numVal = parseInt(val) || 0;
    onChange({
      ...value,
      type: 'duration',
      [field]: numVal > 0 ? numVal : undefined,
    });
  };

  const handleDateChange = (targetDate: string) => {
    onChange({
      ...value,
      type: 'date',
      targetDate,
      targetDateFieldId: undefined,
    });
  };

  const handleDateFieldChange = (fieldId: string) => {
    onChange({
      ...value,
      type: 'date',
      targetDateFieldId: fieldId,
      targetDate: undefined,
    });
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  // Calculate total hours for preview
  const getTotalHours = (): number => {
    if (!value || value.type !== 'duration') return 0;
    return (value.durationHours || 0) + (value.durationDays || 0) * 24;
  };

  const formatDuration = (hours: number): string => {
    if (hours === 0) return 'Sin espera';
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;

    const parts = [];
    if (days > 0) parts.push(`${days} día${days !== 1 ? 's' : ''}`);
    if (remainingHours > 0) parts.push(`${remainingHours} hora${remainingHours !== 1 ? 's' : ''}`);

    return parts.join(' y ');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Temporizador</Label>
        <div className="grid grid-cols-2 gap-2">
          {TIMER_TYPES.map(type => (
            <Card
              key={type.value}
              className={`cursor-pointer transition-colors ${
                timerType === type.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => handleTypeChange(type.value)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 ${timerType === type.value ? 'text-primary' : 'text-muted-foreground'}`}>
                    {type.icon}
                  </div>
                  <div>
                    <div className="font-medium text-sm">{type.label}</div>
                    <p className="text-xs text-muted-foreground">{type.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Duration configuration */}
      {timerType === 'duration' && (
        <div className="space-y-4 p-3 border rounded-md bg-muted/30">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Días</Label>
              <Input
                type="number"
                min="0"
                value={value?.durationDays ?? ''}
                onChange={(e) => handleDurationChange('durationDays', e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label>Horas</Label>
              <Input
                type="number"
                min="0"
                max="23"
                value={value?.durationHours ?? ''}
                onChange={(e) => handleDurationChange('durationHours', e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          {/* Duration preview */}
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Tiempo de espera:</span>
            <span className="font-medium">{formatDuration(getTotalHours())}</span>
          </div>
        </div>
      )}

      {/* Date configuration */}
      {timerType === 'date' && (
        <div className="space-y-4 p-3 border rounded-md bg-muted/30">
          <div className="space-y-2">
            <Label>Origen de la fecha</Label>
            <Select
              value={value?.targetDateFieldId ? 'field' : 'fixed'}
              onValueChange={(v) => {
                if (v === 'field' && dateFields.length > 0) {
                  handleDateFieldChange(dateFields[0].id);
                } else {
                  handleDateChange('');
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fecha fija</SelectItem>
                <SelectItem value="field" disabled={dateFields.length === 0}>
                  Desde campo del formulario
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {!value?.targetDateFieldId ? (
            <div className="space-y-2">
              <Label>Fecha y hora objetivo</Label>
              <Input
                type="datetime-local"
                value={value?.targetDate || ''}
                onChange={(e) => handleDateChange(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                El flujo continuará cuando se alcance esta fecha y hora.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Campo de fecha</Label>
              <Select
                value={value.targetDateFieldId}
                onValueChange={handleDateFieldChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un campo" />
                </SelectTrigger>
                <SelectContent>
                  {dateFields.map(field => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                El flujo continuará cuando se alcance la fecha almacenada en este campo.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Flow preview */}
      <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md text-sm">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-green-500" />
          <span>Tarea anterior</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/30 rounded">
          <Clock className="h-3 w-3 text-amber-600" />
          <span className="text-amber-700 dark:text-amber-400">Espera</span>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground" />
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-blue-500" />
          <span>Siguiente tarea</span>
        </div>
      </div>
    </div>
  );
}
