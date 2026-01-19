'use client';

import { useState } from 'react';
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
import { Badge } from '@/components/ui/badge';
import { Users, User, Mail, UserCircle } from 'lucide-react';
import type { AssigneeSource, AssigneeSourceType, FormField, User as UserType } from '@/lib/types';

interface AssigneeSourceConfigProps {
  value: AssigneeSource | undefined;
  onChange: (source: AssigneeSource | undefined) => void;
  formFields: FormField[];
  users?: UserType[];
  roles?: string[];
}

const SOURCE_TYPES: { value: AssigneeSourceType; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'role',
    label: 'Por Rol',
    icon: <Users className="h-4 w-4" />,
    description: 'Asignar a cualquier usuario con el rol especificado'
  },
  {
    value: 'user',
    label: 'Usuario Específico',
    icon: <User className="h-4 w-4" />,
    description: 'Asignar siempre al mismo usuario'
  },
  {
    value: 'field',
    label: 'Desde Campo',
    icon: <Mail className="h-4 w-4" />,
    description: 'Tomar el responsable del valor de un campo del formulario'
  },
  {
    value: 'submitter',
    label: 'Solicitante',
    icon: <UserCircle className="h-4 w-4" />,
    description: 'Asignar a quien envió la solicitud'
  },
];

const DEFAULT_ROLES = ['Admin', 'Member', 'Designer', 'Finance Approver', 'IT Support', 'HR Manager'];

export function AssigneeSourceConfig({
  value,
  onChange,
  formFields,
  users = [],
  roles = DEFAULT_ROLES,
}: AssigneeSourceConfigProps) {
  const sourceType = value?.type || 'role';

  // Get email/user-identity fields that can be used for assignment
  const assignableFields = formFields.filter(
    f => f.type === 'email' || f.type === 'user-identity' || f.type === 'text'
  );

  const handleTypeChange = (type: AssigneeSourceType) => {
    const newSource: AssigneeSource = { type };

    if (type === 'role' && roles.length > 0) {
      newSource.role = roles[0];
    }

    onChange(newSource);
  };

  const handleRoleChange = (role: string) => {
    onChange({ ...value, type: 'role', role });
  };

  const handleUserChange = (userId: string) => {
    onChange({ ...value, type: 'user', userId });
  };

  const handleFieldChange = (fieldId: string) => {
    onChange({ ...value, type: 'field', fieldId });
  };

  const getFieldLabel = (fieldId: string): string => {
    const field = formFields.find(f => f.id === fieldId);
    return field?.label || fieldId;
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Tipo de Asignación</Label>
        <div className="grid grid-cols-2 gap-2">
          {SOURCE_TYPES.map(type => (
            <Card
              key={type.value}
              className={`cursor-pointer transition-colors ${
                sourceType === type.value
                  ? 'border-primary bg-primary/5'
                  : 'hover:bg-muted/50'
              }`}
              onClick={() => handleTypeChange(type.value)}
            >
              <CardContent className="p-3">
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 ${sourceType === type.value ? 'text-primary' : 'text-muted-foreground'}`}>
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

      {/* Role selector */}
      {sourceType === 'role' && (
        <div className="space-y-2">
          <Label>Rol</Label>
          <Select value={value?.role || ''} onValueChange={handleRoleChange}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione un rol" />
            </SelectTrigger>
            <SelectContent>
              {roles.map(role => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* User selector */}
      {sourceType === 'user' && (
        <div className="space-y-2">
          <Label>Usuario</Label>
          {users.length > 0 ? (
            <Select value={value?.userId || ''} onValueChange={handleUserChange}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un usuario" />
              </SelectTrigger>
              <SelectContent>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    <div className="flex items-center gap-2">
                      <span>{user.fullName}</span>
                      <Badge variant="outline" className="text-xs">
                        {user.role}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              value={value?.userId || ''}
              onChange={(e) => handleUserChange(e.target.value)}
              placeholder="ID del usuario"
            />
          )}
        </div>
      )}

      {/* Field selector */}
      {sourceType === 'field' && (
        <div className="space-y-2">
          <Label>Campo del formulario</Label>
          <Select value={value?.fieldId || ''} onValueChange={handleFieldChange}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione un campo" />
            </SelectTrigger>
            <SelectContent>
              {assignableFields.length > 0 ? (
                assignableFields.map(field => (
                  <SelectItem key={field.id} value={field.id}>
                    <div className="flex items-center gap-2">
                      <span>{field.label}</span>
                      <Badge variant="outline" className="text-xs">
                        {field.type}
                      </Badge>
                    </div>
                  </SelectItem>
                ))
              ) : (
                <SelectItem value="" disabled>
                  No hay campos de email o identidad
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            El valor del campo debe ser un email o ID de usuario válido.
          </p>
        </div>
      )}

      {/* Submitter info */}
      {sourceType === 'submitter' && (
        <div className="p-3 bg-muted/30 rounded-md">
          <p className="text-sm text-muted-foreground">
            La tarea se asignará automáticamente al usuario que envió la solicitud original.
          </p>
        </div>
      )}

      {/* Summary */}
      {value && (
        <div className="flex items-center gap-2 pt-2 border-t">
          <span className="text-sm text-muted-foreground">Asignación:</span>
          <Badge variant="secondary">
            {sourceType === 'role' && `Rol: ${value.role}`}
            {sourceType === 'user' && `Usuario: ${value.userId}`}
            {sourceType === 'field' && `Campo: ${getFieldLabel(value.fieldId || '')}`}
            {sourceType === 'submitter' && 'Solicitante original'}
          </Badge>
        </div>
      )}
    </div>
  );
}
