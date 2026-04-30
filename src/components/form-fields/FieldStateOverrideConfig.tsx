'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Plus, Trash2, Eye, EyeOff, Lock, Unlock, AlertCircle } from 'lucide-react';
import type { FormField, FieldStateOverride } from "@/types/workflow.types";

interface FieldStateOverrideConfigProps {
  fields: FormField[];
  overrides: FieldStateOverride[];
  onOverridesChange: (overrides: FieldStateOverride[]) => void;
  stepName?: string;
}

export function FieldStateOverrideConfig({
  fields,
  overrides,
  onOverridesChange,
  stepName = 'esta tarea',
}: FieldStateOverrideConfigProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedFieldId, setSelectedFieldId] = useState('');
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [isRequired, setIsRequired] = useState(false);
  const [isVisible, setIsVisible] = useState(true);
  const [editingOverride, setEditingOverride] = useState<FieldStateOverride | null>(null);

  const resetForm = () => {
    setSelectedFieldId('');
    setIsReadOnly(false);
    setIsRequired(false);
    setIsVisible(true);
    setEditingOverride(null);
  };

  const handleOpenDialog = (override?: FieldStateOverride) => {
    if (override) {
      setEditingOverride(override);
      setSelectedFieldId(override.fieldId);
      setIsReadOnly(override.readOnly ?? false);
      setIsRequired(override.required ?? false);
      setIsVisible(override.visible ?? true);
    } else {
      resetForm();
    }
    setIsDialogOpen(true);
  };

  const handleSaveOverride = () => {
    if (!selectedFieldId) return;

    const newOverride: FieldStateOverride = {
      fieldId: selectedFieldId,
      readOnly: isReadOnly,
      required: isRequired,
      visible: isVisible,
    };

    if (editingOverride) {
      onOverridesChange(
        overrides.map(o => (o.fieldId === editingOverride.fieldId ? newOverride : o))
      );
    } else {
      // Check if override already exists for this field
      const existingIndex = overrides.findIndex(o => o.fieldId === selectedFieldId);
      if (existingIndex >= 0) {
        const newOverrides = [...overrides];
        newOverrides[existingIndex] = newOverride;
        onOverridesChange(newOverrides);
      } else {
        onOverridesChange([...overrides, newOverride]);
      }
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleRemoveOverride = (fieldId: string) => {
    onOverridesChange(overrides.filter(o => o.fieldId !== fieldId));
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = fields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  // Fields not yet configured
  const availableFields = fields.filter(
    f => !overrides.some(o => o.fieldId === f.id) || editingOverride?.fieldId === f.id
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-medium text-sm">Estados de Campos para {stepName}</h4>
          <p className="text-xs text-muted-foreground">
            Configure qué campos son editables, requeridos u ocultos en esta tarea específica.
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" disabled={availableFields.length === 0}>
              <Plus className="h-4 w-4 mr-1" />
              Configurar Campo
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingOverride ? 'Editar Estado de Campo' : 'Configurar Estado de Campo'}
              </DialogTitle>
              <DialogDescription>
                Define cómo se comportará el campo durante esta tarea del flujo.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Campo</Label>
                <Select
                  value={selectedFieldId}
                  onValueChange={setSelectedFieldId}
                  disabled={!!editingOverride}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccione un campo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(editingOverride ? fields : availableFields).map(field => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-md hover:bg-muted/50">
                  <Checkbox
                    checked={isVisible}
                    onCheckedChange={(checked) => setIsVisible(checked === true)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isVisible ? <Eye className="h-4 w-4 text-green-600" /> : <EyeOff className="h-4 w-4 text-orange-600" />}
                      <span className="font-medium">Visible</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isVisible ? 'El campo se mostrará en el formulario' : 'El campo estará oculto'}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-md hover:bg-muted/50">
                  <Checkbox
                    checked={isReadOnly}
                    onCheckedChange={(checked) => setIsReadOnly(checked === true)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {isReadOnly ? <Lock className="h-4 w-4 text-orange-600" /> : <Unlock className="h-4 w-4 text-green-600" />}
                      <span className="font-medium">Solo lectura</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isReadOnly ? 'El usuario no podrá modificar el valor' : 'El usuario puede editar el campo'}
                    </p>
                  </div>
                </label>

                <label className="flex items-center gap-3 cursor-pointer p-3 border rounded-md hover:bg-muted/50">
                  <Checkbox
                    checked={isRequired}
                    onCheckedChange={(checked) => setIsRequired(checked === true)}
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <AlertCircle className={`h-4 w-4 ${isRequired ? 'text-red-600' : 'text-muted-foreground'}`} />
                      <span className="font-medium">Obligatorio</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {isRequired ? 'El campo debe completarse para avanzar' : 'El campo es opcional'}
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSaveOverride} disabled={!selectedFieldId}>
                {editingOverride ? 'Guardar' : 'Agregar'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overrides List */}
      {overrides.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-muted-foreground text-sm">
            Sin configuración especial. Los campos usarán su configuración global.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {overrides.map(override => (
            <Card key={override.fieldId} className="cursor-pointer hover:bg-muted/30">
              <CardContent className="py-2 px-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-sm">{getFieldLabel(override.fieldId)}</span>
                  <div className="flex items-center gap-1">
                    {override.visible === false && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <EyeOff className="h-3 w-3" /> Oculto
                      </Badge>
                    )}
                    {override.readOnly && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <Lock className="h-3 w-3" /> Solo lectura
                      </Badge>
                    )}
                    {override.required && (
                      <Badge variant="destructive" className="text-xs gap-1">
                        <AlertCircle className="h-3 w-3" /> Obligatorio
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenDialog(override)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRemoveOverride(override.fieldId)}
                    className="text-destructive hover:text-destructive h-8 w-8"
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
