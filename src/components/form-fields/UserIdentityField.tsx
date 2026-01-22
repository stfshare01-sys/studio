'use client';

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { useUser } from '@/firebase';
import type { FormField, UserIdentityValue } from '@/lib/types';
import { User, Clock } from 'lucide-react';

interface UserIdentityFieldProps {
  field: FormField;
  value: UserIdentityValue | undefined;
  onChange: (value: UserIdentityValue) => void;
}

export function UserIdentityField({ field, value, onChange }: UserIdentityFieldProps) {
  const { user, isUserLoading } = useUser();
  const config = field.userIdentityConfig;

  // Auto-populate with current user data when component mounts
  useEffect(() => {
    if (user && !value) {
      const identityValue: UserIdentityValue = {
        userId: user.uid || user.id || '',
        email: user.email || '',
        fullName: user.fullName || '',
      };

      if (config?.includeTimestamp) {
        identityValue.timestamp = new Date().toISOString();
      }

      onChange(identityValue);
    }
  }, [user, value, config?.includeTimestamp, onChange]);

  // Determine what to display based on configuration
  const getDisplayValue = (): string => {
    if (isUserLoading) return 'Cargando...';
    if (!value) return '';

    switch (config?.displayField) {
      case 'email':
        return value.email;
      case 'fullName':
        return value.fullName || value.email;
      case 'both':
        return value.fullName
          ? `${value.fullName} (${value.email})`
          : value.email;
      default:
        return value.fullName || value.email;
    }
  };

  const displayValue = getDisplayValue();

  return (
    <div className="space-y-2">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={field.id}
          type="text"
          value={displayValue}
          readOnly
          disabled
          className="pl-10 bg-muted cursor-not-allowed"
          placeholder={field.placeholder || 'Usuario actual'}
        />
      </div>
      {config?.includeTimestamp && value?.timestamp && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Capturado: {new Date(value.timestamp).toLocaleString('es-ES')}
          </span>
        </div>
      )}
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
    </div>
  );
}
