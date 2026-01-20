'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, Code } from 'lucide-react';
import DOMPurify from 'dompurify';

interface HtmlFieldProps {
  htmlContent: string;
  label?: string;
  showLabel?: boolean;
}

interface HtmlFieldEditorProps {
  value: string;
  onChange: (content: string) => void;
}

/**
 * Renders sanitized HTML content as a form field
 */
export function HtmlField({ htmlContent, label, showLabel = true }: HtmlFieldProps) {
  // Sanitize HTML to prevent XSS attacks
  const sanitizedHtml = useMemo(() => {
    if (typeof window === 'undefined') return htmlContent;

    return DOMPurify.sanitize(htmlContent, {
      ALLOWED_TAGS: [
        'div', 'span', 'p', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img',
        'blockquote', 'pre', 'code',
        'style',
      ],
      ALLOWED_ATTR: [
        'class', 'id', 'style',
        'href', 'target', 'rel',
        'src', 'alt', 'width', 'height',
        'colspan', 'rowspan',
      ],
      ALLOW_DATA_ATTR: false,
    });
  }, [htmlContent]);

  return (
    <div className="space-y-2">
      {showLabel && label && (
        <Label className="text-sm font-medium">{label}</Label>
      )}
      <div
        className="html-field-content"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    </div>
  );
}

/**
 * Editor component for configuring HTML content in the template builder
 */
export function HtmlFieldEditor({ value, onChange }: HtmlFieldEditorProps) {
  // Preview the sanitized HTML
  const previewHtml = useMemo(() => {
    if (typeof window === 'undefined' || !value) return '';

    return DOMPurify.sanitize(value, {
      ALLOWED_TAGS: [
        'div', 'span', 'p', 'br', 'hr',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's',
        'ul', 'ol', 'li',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
        'a', 'img',
        'blockquote', 'pre', 'code',
        'style',
      ],
      ALLOWED_ATTR: [
        'class', 'id', 'style',
        'href', 'target', 'rel',
        'src', 'alt', 'width', 'height',
        'colspan', 'rowspan',
      ],
    });
  }, [value]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Code className="h-4 w-4 text-muted-foreground" />
        <Label className="font-medium">Contenido HTML Personalizado</Label>
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md text-sm">
        <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
        <div className="text-amber-700 dark:text-amber-300">
          <p className="font-medium">Nota de Seguridad</p>
          <p className="text-xs">
            El contenido HTML se sanitiza automáticamente para prevenir scripts maliciosos.
            Solo se permiten etiquetas HTML seguras y estilos CSS inline.
          </p>
        </div>
      </div>

      {/* HTML Editor */}
      <div className="space-y-2">
        <Label className="text-sm">Código HTML</Label>
        <Textarea
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`<div style="padding: 20px; background: #f0f0f0; border-radius: 8px;">
  <h3 style="margin: 0 0 10px 0;">Título personalizado</h3>
  <p>Contenido con <strong>formato</strong> y <em>estilos</em>.</p>
</div>`}
          rows={10}
          className="font-mono text-sm"
        />
      </div>

      {/* Allowed Tags Reference */}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          Ver etiquetas permitidas
        </summary>
        <div className="mt-2 p-3 bg-muted/30 rounded-md font-mono text-xs space-y-1">
          <p><strong>Estructura:</strong> div, span, p, br, hr</p>
          <p><strong>Títulos:</strong> h1, h2, h3, h4, h5, h6</p>
          <p><strong>Formato:</strong> strong, b, em, i, u, s</p>
          <p><strong>Listas:</strong> ul, ol, li</p>
          <p><strong>Tablas:</strong> table, thead, tbody, tr, th, td</p>
          <p><strong>Enlaces/Imágenes:</strong> a, img</p>
          <p><strong>Otros:</strong> blockquote, pre, code, style</p>
          <p className="mt-2"><strong>Atributos:</strong> class, id, style, href, target, src, alt, width, height</p>
        </div>
      </details>

      {/* Preview */}
      {value && (
        <Card>
          <CardContent className="p-4">
            <Label className="text-xs text-muted-foreground mb-2 block">Vista previa:</Label>
            <div
              className="p-3 bg-background rounded border min-h-[60px]"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </CardContent>
        </Card>
      )}

      {/* Quick Templates */}
      <div className="space-y-2">
        <Label className="text-sm text-muted-foreground">Plantillas rápidas:</Label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-muted"
            onClick={() => onChange(`<div style="padding: 16px; background: #e3f2fd; border-left: 4px solid #2196f3; border-radius: 4px;">
  <strong>Información importante</strong>
  <p style="margin: 8px 0 0 0;">Escriba su mensaje aquí.</p>
</div>`)}
          >
            Alerta Info
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-muted"
            onClick={() => onChange(`<div style="padding: 16px; background: #fff3e0; border-left: 4px solid #ff9800; border-radius: 4px;">
  <strong>⚠️ Advertencia</strong>
  <p style="margin: 8px 0 0 0;">Mensaje de advertencia.</p>
</div>`)}
          >
            Alerta Advertencia
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-muted"
            onClick={() => onChange(`<table style="width: 100%; border-collapse: collapse;">
  <thead>
    <tr style="background: #f5f5f5;">
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Columna 1</th>
      <th style="padding: 8px; border: 1px solid #ddd; text-align: left;">Columna 2</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding: 8px; border: 1px solid #ddd;">Dato 1</td>
      <td style="padding: 8px; border: 1px solid #ddd;">Dato 2</td>
    </tr>
  </tbody>
</table>`)}
          >
            Tabla
          </button>
          <button
            type="button"
            className="px-2 py-1 text-xs border rounded hover:bg-muted"
            onClick={() => onChange(`<div style="text-align: center; padding: 24px;">
  <h2 style="margin: 0 0 8px 0; color: #333;">Título de Sección</h2>
  <p style="margin: 0; color: #666;">Subtítulo o descripción</p>
  <hr style="margin: 16px auto; width: 50%; border: none; border-top: 2px solid #eee;">
</div>`)}
          >
            Encabezado
          </button>
        </div>
      </div>
    </div>
  );
}
