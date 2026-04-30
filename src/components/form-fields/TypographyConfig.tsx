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
import { Switch } from '@/components/ui/switch';
import { Card, CardContent } from '@/components/ui/card';
import { Type, AlignLeft, AlignCenter, AlignRight, Palette } from 'lucide-react';
import type { TypographyConfig as TypographyConfigType } from "@/types/workflow.types";

interface TypographyConfigProps {
  value: TypographyConfigType | undefined;
  onChange: (config: TypographyConfigType | undefined) => void;
}

const FONT_FAMILIES = [
  { value: 'default', label: 'Por defecto (Sans-serif)' },
  { value: 'serif', label: 'Serif (Times)' },
  { value: 'mono', label: 'Monospace (Código)' },
  { value: 'custom', label: 'Personalizada' },
];

const FONT_SIZES = [
  { value: 'xs', label: 'Extra pequeño' },
  { value: 'sm', label: 'Pequeño' },
  { value: 'base', label: 'Normal' },
  { value: 'lg', label: 'Grande' },
  { value: 'xl', label: 'Extra grande' },
  { value: '2xl', label: 'Muy grande' },
];

const FONT_WEIGHTS = [
  { value: 'normal', label: 'Normal' },
  { value: 'medium', label: 'Medio' },
  { value: 'semibold', label: 'Semi-negrita' },
  { value: 'bold', label: 'Negrita' },
];

export function TypographyConfig({
  value,
  onChange,
}: TypographyConfigProps) {
  const config = value || {};

  const handleChange = (updates: Partial<TypographyConfigType>) => {
    onChange({ ...config, ...updates });
  };

  // Preview styles based on configuration
  const getPreviewStyles = (): React.CSSProperties => {
    const styles: React.CSSProperties = {};

    if (config.fontFamily === 'serif') {
      styles.fontFamily = 'Georgia, "Times New Roman", serif';
    } else if (config.fontFamily === 'mono') {
      styles.fontFamily = 'ui-monospace, monospace';
    } else if (config.fontFamily === 'custom' && config.customFont) {
      styles.fontFamily = config.customFont;
    }

    if (config.fontSize) {
      const sizes: Record<string, string> = {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
      };
      styles.fontSize = sizes[config.fontSize];
    }

    if (config.fontWeight) {
      const weights: Record<string, number> = {
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
      };
      styles.fontWeight = weights[config.fontWeight];
    }

    if (config.textColor) {
      styles.color = config.textColor;
    }

    if (config.textAlign) {
      styles.textAlign = config.textAlign;
    }

    return styles;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Type className="h-4 w-4 text-muted-foreground" />
        <Label className="font-medium">Configuración de Tipografía</Label>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Font Family */}
        <div className="space-y-2">
          <Label className="text-sm">Familia de fuente</Label>
          <Select
            value={config.fontFamily || 'default'}
            onValueChange={(v) => handleChange({ fontFamily: v as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_FAMILIES.map(f => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Custom Font (if selected) */}
        {config.fontFamily === 'custom' && (
          <div className="space-y-2">
            <Label className="text-sm">Nombre de fuente</Label>
            <Input
              value={config.customFont || ''}
              onChange={(e) => handleChange({ customFont: e.target.value })}
              placeholder="Ej: Arial, Roboto"
            />
          </div>
        )}

        {/* Font Size */}
        <div className="space-y-2">
          <Label className="text-sm">Tamaño</Label>
          <Select
            value={config.fontSize || 'base'}
            onValueChange={(v) => handleChange({ fontSize: v as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_SIZES.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Font Weight */}
        <div className="space-y-2">
          <Label className="text-sm">Peso</Label>
          <Select
            value={config.fontWeight || 'normal'}
            onValueChange={(v) => handleChange({ fontWeight: v as any })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FONT_WEIGHTS.map(w => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Text Color */}
        <div className="space-y-2">
          <Label className="text-sm flex items-center gap-1">
            <Palette className="h-3 w-3" />
            Color del texto
          </Label>
          <div className="flex gap-2">
            <Input
              type="color"
              value={config.textColor || '#000000'}
              onChange={(e) => handleChange({ textColor: e.target.value })}
              className="w-12 h-9 p-1 cursor-pointer"
            />
            <Input
              value={config.textColor || ''}
              onChange={(e) => handleChange({ textColor: e.target.value })}
              placeholder="#000000"
              className="flex-1"
            />
          </div>
        </div>

        {/* Text Align */}
        <div className="space-y-2">
          <Label className="text-sm">Alineación</Label>
          <div className="flex gap-1">
            <button
              type="button"
              className={`p-2 rounded border ${config.textAlign === 'left' || !config.textAlign ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => handleChange({ textAlign: 'left' })}
            >
              <AlignLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`p-2 rounded border ${config.textAlign === 'center' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => handleChange({ textAlign: 'center' })}
            >
              <AlignCenter className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={`p-2 rounded border ${config.textAlign === 'right' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              onClick={() => handleChange({ textAlign: 'right' })}
            >
              <AlignRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Hide Label Toggle */}
      <div className="flex items-center justify-between py-2 border-t">
        <div>
          <Label className="text-sm">Ocultar etiqueta del campo</Label>
          <p className="text-xs text-muted-foreground">
            La etiqueta no se mostrará en el formulario
          </p>
        </div>
        <Switch
          checked={config.labelHidden || false}
          onCheckedChange={(checked) => handleChange({ labelHidden: checked })}
        />
      </div>

      {/* Preview */}
      <Card>
        <CardContent className="p-4">
          <Label className="text-xs text-muted-foreground mb-2 block">Vista previa:</Label>
          <div
            className="p-3 bg-muted/30 rounded border min-h-[40px]"
            style={getPreviewStyles()}
          >
            Texto de ejemplo con la configuración aplicada
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
