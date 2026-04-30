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
import { Plus, Trash2, ArrowRight, Database, Link2 } from 'lucide-react';
import type { LookupConfig, LookupMapping, FormField } from "@/types/workflow.types";
import type { MasterList } from "@/types/common.types";

interface LookupFieldConfigProps {
  value: LookupConfig | undefined;
  onChange: (config: LookupConfig | undefined) => void;
  formFields: FormField[];
  masterLists: MasterList[];
  currentFieldId: string;
}

export function LookupFieldConfig({
  value,
  onChange,
  formFields,
  masterLists,
  currentFieldId,
}: LookupFieldConfigProps) {
  const [newSourceField, setNewSourceField] = useState('');
  const [newTargetFieldId, setNewTargetFieldId] = useState('');

  // Filter out current field from target options
  const targetFields = formFields.filter(f => f.id !== currentFieldId);

  // Get available source fields from selected master list
  const selectedMasterList = masterLists.find(ml => ml.id === value?.masterListId);
  const sourceFields = selectedMasterList?.fields || [];

  const handleSourceTypeChange = (sourceType: 'master-list' | 'collection') => {
    onChange({
      sourceType,
      lookupKeyField: '',
      mappings: [],
      masterListId: sourceType === 'master-list' && masterLists.length > 0 ? masterLists[0].id : undefined,
      collectionPath: sourceType === 'collection' ? '' : undefined,
    });
  };

  const handleMasterListChange = (masterListId: string) => {
    onChange({
      ...value!,
      masterListId,
      collectionPath: undefined,
      lookupKeyField: '',
      mappings: [],
    });
  };

  const handleCollectionPathChange = (collectionPath: string) => {
    onChange({
      ...value!,
      collectionPath,
      masterListId: undefined,
    });
  };

  const handleKeyFieldChange = (lookupKeyField: string) => {
    onChange({
      ...value!,
      lookupKeyField,
    });
  };

  const handleAddMapping = () => {
    if (!newSourceField || !newTargetFieldId) return;

    const newMapping: LookupMapping = {
      sourceField: newSourceField,
      targetFieldId: newTargetFieldId,
    };

    onChange({
      ...value!,
      mappings: [...(value?.mappings || []), newMapping],
    });

    setNewSourceField('');
    setNewTargetFieldId('');
  };

  const handleRemoveMapping = (index: number) => {
    onChange({
      ...value!,
      mappings: value!.mappings.filter((_, i) => i !== index),
    });
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  const handleClearConfig = () => {
    onChange(undefined);
  };

  if (!value) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Configuración de Look-up</Label>
        </div>
        <Card>
          <CardContent className="py-6 text-center">
            <Database className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              Configure este campo para auto-completar otros campos basándose en una selección.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSourceTypeChange('master-list')}
            >
              <Link2 className="h-4 w-4 mr-2" />
              Habilitar Look-up
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Configuración de Look-up</Label>
        <Button variant="ghost" size="sm" onClick={handleClearConfig}>
          Deshabilitar
        </Button>
      </div>

      {/* Source type selector */}
      <div className="space-y-2">
        <Label className="text-sm">Fuente de datos</Label>
        <div className="grid grid-cols-2 gap-2">
          <Card
            className={`cursor-pointer transition-colors ${value.sourceType === 'master-list'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted/50'
              }`}
            onClick={() => handleSourceTypeChange('master-list')}
          >
            <CardContent className="p-3">
              <div className="font-medium text-sm">Lista Maestra</div>
              <p className="text-xs text-muted-foreground">
                Datos de listas maestras del sistema
              </p>
            </CardContent>
          </Card>
          <Card
            className={`cursor-pointer transition-colors ${value.sourceType === 'collection'
                ? 'border-primary bg-primary/5'
                : 'hover:bg-muted/50'
              }`}
            onClick={() => handleSourceTypeChange('collection')}
          >
            <CardContent className="p-3">
              <div className="font-medium text-sm">Colección Firestore</div>
              <p className="text-xs text-muted-foreground">
                Ruta directa a una colección
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Master list selector */}
      {value.sourceType === 'master-list' && (
        <div className="space-y-2">
          <Label className="text-sm">Lista Maestra</Label>
          <Select
            value={value.masterListId || ''}
            onValueChange={handleMasterListChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione una lista" />
            </SelectTrigger>
            <SelectContent>
              {masterLists.length > 0 ? (
                masterLists.map(ml => (
                  <SelectItem key={ml.id} value={ml.id}>
                    {ml.name}
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="__empty__" disabled>
                  No hay listas maestras disponibles
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Collection path input */}
      {value.sourceType === 'collection' && (
        <div className="space-y-2">
          <Label className="text-sm">Ruta de la colección</Label>
          <Input
            value={value.collectionPath || ''}
            onChange={(e) => handleCollectionPathChange(e.target.value)}
            placeholder="Ej: productos, clientes/activos"
          />
          <p className="text-xs text-muted-foreground">
            Ruta de la colección en Firestore.
          </p>
        </div>
      )}

      {/* Lookup key field */}
      <div className="space-y-2">
        <Label className="text-sm">Campo clave de búsqueda</Label>
        {value.sourceType === 'master-list' && sourceFields.length > 0 ? (
          <Select
            value={value.lookupKeyField || ''}
            onValueChange={handleKeyFieldChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccione el campo clave" />
            </SelectTrigger>
            <SelectContent>
              {sourceFields.map(field => (
                <SelectItem key={field.id} value={field.id}>
                  {field.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            value={value.lookupKeyField || ''}
            onChange={(e) => handleKeyFieldChange(e.target.value)}
            placeholder="Nombre del campo clave"
          />
        )}
        <p className="text-xs text-muted-foreground">
          Campo en los datos fuente que se comparará con el valor seleccionado.
        </p>
      </div>

      {/* Mappings section */}
      <div className="space-y-3 border-t pt-4">
        <Label className="text-sm">Mapeo de campos</Label>
        <p className="text-xs text-muted-foreground">
          Configure qué campos del formulario se auto-completarán con datos de la fuente.
        </p>

        {/* Existing mappings */}
        {value.mappings && value.mappings.length > 0 && (
          <div className="space-y-2">
            {value.mappings.map((mapping, index) => (
              <div
                key={index}
                className="flex items-center gap-2 p-2 bg-muted/30 rounded-md"
              >
                <Badge variant="outline" className="shrink-0">
                  {mapping.sourceField}
                </Badge>
                <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                <Badge variant="secondary" className="shrink-0">
                  {getFieldLabel(mapping.targetFieldId)}
                </Badge>
                <div className="flex-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-destructive hover:text-destructive"
                  onClick={() => handleRemoveMapping(index)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add new mapping */}
        <div className="flex items-end gap-2">
          {value.sourceType === 'master-list' && sourceFields.length > 0 ? (
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Campo fuente</Label>
              <Select value={newSourceField} onValueChange={setNewSourceField}>
                <SelectTrigger className="h-8">
                  <SelectValue placeholder="Campo fuente" />
                </SelectTrigger>
                <SelectContent>
                  {sourceFields
                    .filter(f => !value.mappings?.some(m => m.sourceField === f.id))
                    .map(field => (
                      <SelectItem key={field.id} value={field.id}>
                        {field.label}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Campo fuente</Label>
              <Input
                className="h-8"
                value={newSourceField}
                onChange={(e) => setNewSourceField(e.target.value)}
                placeholder="Nombre del campo"
              />
            </div>
          )}

          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 mb-2" />

          <div className="flex-1 space-y-1">
            <Label className="text-xs">Campo destino</Label>
            <Select value={newTargetFieldId} onValueChange={setNewTargetFieldId}>
              <SelectTrigger className="h-8">
                <SelectValue placeholder="Campo del formulario" />
              </SelectTrigger>
              <SelectContent>
                {targetFields
                  .filter(f => !value.mappings?.some(m => m.targetFieldId === f.id))
                  .map(field => (
                    <SelectItem key={field.id} value={field.id}>
                      {field.label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleAddMapping}
            disabled={!newSourceField || !newTargetFieldId}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Preview */}
      {value.mappings && value.mappings.length > 0 && (
        <div className="p-3 bg-muted/50 rounded-md text-sm">
          <p className="text-muted-foreground">
            Cuando el usuario seleccione un valor en este campo, se buscarán los datos
            correspondientes y se auto-completarán {value.mappings.length} campo(s) relacionado(s).
          </p>
        </div>
      )}
    </div>
  );
}
