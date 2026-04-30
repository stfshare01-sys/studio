'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { initializeFirebase, useUser } from '@/firebase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft,
  Plus,
  Trash2,
  GripVertical,
  Database,
  Key,
  Save,
  AlertCircle,
} from 'lucide-react';
import Link from 'next/link';
import type { MasterListField } from "@/types/common.types";

type FieldType = 'text' | 'number' | 'boolean' | 'date';

const FIELD_TYPES: { value: FieldType; label: string; description: string }[] = [
  { value: 'text', label: 'Texto', description: 'Cadena de caracteres' },
  { value: 'number', label: 'Número', description: 'Valor numérico' },
  { value: 'boolean', label: 'Sí/No', description: 'Valor booleano' },
  { value: 'date', label: 'Fecha', description: 'Fecha y hora' },
];

export default function NewMasterListPage() {
  const router = useRouter();
  const { user } = useUser();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [fields, setFields] = useState<MasterListField[]>([
    { id: uuidv4(), label: 'Código', type: 'text' },
    { id: uuidv4(), label: 'Nombre', type: 'text' },
  ]);
  const [primaryKey, setPrimaryKey] = useState<string>('');

  // New field form
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState<FieldType>('text');

  const handleAddField = () => {
    if (!newFieldLabel.trim()) return;

    const newField: MasterListField = {
      id: uuidv4(),
      label: newFieldLabel.trim(),
      type: newFieldType,
    };

    setFields([...fields, newField]);
    setNewFieldLabel('');
    setNewFieldType('text');
  };

  const handleRemoveField = (fieldId: string) => {
    setFields(fields.filter(f => f.id !== fieldId));
    if (primaryKey === fieldId) {
      setPrimaryKey('');
    }
  };

  const handleMoveField = (index: number, direction: 'up' | 'down') => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === fields.length - 1)
    ) {
      return;
    }

    const newFields = [...fields];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newFields[index], newFields[targetIndex]] = [newFields[targetIndex], newFields[index]];
    setFields(newFields);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('El nombre de la lista es requerido');
      return;
    }

    if (fields.length === 0) {
      setError('Debe agregar al menos un campo');
      return;
    }

    if (!primaryKey) {
      setError('Debe seleccionar un campo como clave primaria');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { firestore } = initializeFirebase();
      const listId = uuidv4();

      await setDoc(doc(firestore, 'master_lists', listId), {
        id: listId,
        name: name.trim(),
        description: description.trim(),
        primaryKey,
        fields,
        createdAt: serverTimestamp(),
        createdBy: user?.id || 'unknown',
        updatedAt: serverTimestamp(),
      });

      router.push('/master-lists');
    } catch (err) {
      console.error('Error saving master list:', err);
      setError('Error al guardar la lista. Intente de nuevo.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container mx-auto py-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" className="text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
          <Link href="/master-lists">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Database className="h-6 w-6" />
            Nueva Lista Maestra
          </h1>
          <p className="text-muted-foreground">
            Cree una base de datos para almacenar información reutilizable
          </p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-2" />
          {saving ? 'Guardando...' : 'Guardar Lista'}
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-md flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-6">
        {/* Basic Info */}
        <Card>
          <CardHeader>
            <CardTitle>Información Básica</CardTitle>
            <CardDescription>
              Configure el nombre y descripción de la lista maestra
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nombre de la Lista *</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ej: Productos, Clientes, Proveedores"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descripción</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describa el propósito de esta lista..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Fields Definition */}
        <Card>
          <CardHeader>
            <CardTitle>Estructura de Campos</CardTitle>
            <CardDescription>
              Defina los campos que tendrá cada registro de la lista
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Fields table */}
            {fields.length > 0 && (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Campo</TableHead>
                      <TableHead className="w-32">Tipo</TableHead>
                      <TableHead className="w-24 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Key className="h-3 w-3" />
                          PK
                        </div>
                      </TableHead>
                      <TableHead className="w-16"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={() => handleMoveField(index, 'up')}
                              disabled={index === 0}
                            >
                              <GripVertical className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{field.label}</TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {FIELD_TYPES.find(t => t.value === field.type)?.label || field.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Checkbox
                            checked={primaryKey === field.id}
                            onCheckedChange={(checked) => {
                              setPrimaryKey(checked ? field.id : '');
                            }}
                          />
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => handleRemoveField(field.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Add new field */}
            <div className="flex items-end gap-3 p-4 border rounded-md bg-muted/30">
              <div className="flex-1 space-y-2">
                <Label>Nombre del Campo</Label>
                <Input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="Ej: Código, Descripción, Precio"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddField();
                    }
                  }}
                />
              </div>
              <div className="w-40 space-y-2">
                <Label>Tipo</Label>
                <Select value={newFieldType} onValueChange={(v) => setNewFieldType(v as FieldType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(type => (
                      <SelectItem key={type.value} value={type.value}>
                        <div>
                          <div>{type.label}</div>
                          <div className="text-xs text-muted-foreground">{type.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddField} disabled={!newFieldLabel.trim()}>
                <Plus className="h-4 w-4 mr-2" />
                Agregar
              </Button>
            </div>

            {/* Primary key info */}
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md text-sm">
              <div className="flex items-start gap-2">
                <Key className="h-4 w-4 text-blue-600 mt-0.5" />
                <div>
                  <p className="font-medium text-blue-700 dark:text-blue-300">Clave Primaria (PK)</p>
                  <p className="text-blue-600 dark:text-blue-400">
                    Seleccione el campo que identificará de forma única cada registro.
                    Este campo se usará para búsquedas y relaciones con otros formularios.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Preview */}
        <Card>
          <CardHeader>
            <CardTitle>Vista Previa</CardTitle>
            <CardDescription>
              Así se verá la estructura de su lista maestra
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="p-4 border rounded-md bg-muted/20">
              <div className="flex items-center gap-2 mb-3">
                <Database className="h-5 w-5 text-primary" />
                <span className="font-semibold">{name || 'Sin nombre'}</span>
              </div>
              {fields.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {fields.map(field => (
                    <Badge
                      key={field.id}
                      variant={primaryKey === field.id ? 'default' : 'secondary'}
                      className="flex items-center gap-1"
                    >
                      {primaryKey === field.id && <Key className="h-3 w-3" />}
                      {field.label}
                      <span className="text-xs opacity-60">({field.type})</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Agregue campos para ver la estructura
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
