'use client';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Progress } from '@/components/ui/progress';
import { XCircle } from 'lucide-react';
import {
    DynamicSelect,
    FormTableField,
    UserIdentityField,
    HtmlField,
    isValidNumber,
} from '@/components/form-fields';
import type { FormField } from "@/types/workflow.types";

interface RequestFormFieldProps {
    field: FormField;
    value: any;
    formData: Record<string, any>;
    uploadProgress?: number;
    fileError?: string;
    validationError?: string | null;
    disabled?: boolean;
    onChange: (fieldId: string, value: any) => void;
    onBlur: (field: FormField, value: any) => void;
    onFileChange: (fieldId: string, file: File | undefined) => void;
}

export function RequestFormField({
    field, value, formData,
    uploadProgress = 0, fileError, validationError,
    disabled, onChange, onBlur, onFileChange,
}: RequestFormFieldProps) {
    switch (field.type) {
        case 'textarea':
            return (
                <div className="space-y-2">
                    <Textarea
                        id={field.id}
                        value={value || ''}
                        onChange={(e) => onChange(field.id, e.target.value)}
                        onBlur={() => onBlur(field, value)}
                        placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                        disabled={disabled}
                        className={validationError ? 'border-destructive' : ''}
                    />
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'select':
            return (
                <div className="space-y-2">
                    <Select value={value} onValueChange={(val) => onChange(field.id, val)} disabled={disabled}>
                        <SelectTrigger id={field.id} className={validationError ? 'border-destructive' : ''}>
                            <SelectValue placeholder={field.placeholder || `Seleccione ${field.label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                            {field.options?.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'dynamic-select':
            return (
                <DynamicSelect
                    field={field}
                    value={value}
                    onChange={(val) => onChange(field.id, val)}
                    formData={formData}
                    disabled={disabled}
                    error={validationError}
                />
            );

        case 'radio':
            return (
                <div className="space-y-2">
                    <RadioGroup
                        id={field.id}
                        value={value}
                        onValueChange={(val) => onChange(field.id, val)}
                        className="flex flex-wrap items-center gap-4"
                        disabled={disabled}
                    >
                        {field.options?.map(option => (
                            <div key={option} className="flex items-center space-x-2">
                                <RadioGroupItem value={option} id={`${field.id}-${option}`} />
                                <Label htmlFor={`${field.id}-${option}`}>{option}</Label>
                            </div>
                        ))}
                    </RadioGroup>
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'checkbox':
            return (
                <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                        <Checkbox id={field.id} checked={!!value} onCheckedChange={(checked) => onChange(field.id, checked)} disabled={disabled} />
                        <Label htmlFor={field.id} className="font-normal">{field.label}</Label>
                    </div>
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'file':
            return (
                <div className="space-y-2">
                    <Input id={field.id} type="file" onChange={(e) => onFileChange(field.id, e.target.files?.[0])} disabled={disabled} />
                    {fileError && <p className="text-sm text-destructive flex items-center gap-1"><XCircle className="h-4 w-4" /> {fileError}</p>}
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {uploadProgress > 0 && uploadProgress < 100 && <Progress value={uploadProgress} className="w-full" />}
                    {uploadProgress === 100 && <p className="text-sm text-green-600">Carga completa.</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'table':
            return (
                <FormTableField
                    field={field}
                    value={value || []}
                    onChange={(rows) => onChange(field.id, rows)}
                    formData={formData}
                    disabled={disabled}
                    error={validationError}
                />
            );

        case 'user-identity':
            return (
                <UserIdentityField
                    field={field}
                    value={value}
                    onChange={(val) => onChange(field.id, val)}
                />
            );

        case 'html':
            return <HtmlField htmlContent={field.htmlContent || ''} label={field.label} showLabel={false} />;

        case 'email':
            return (
                <div className="space-y-2">
                    <Input
                        id={field.id} type="email" value={value || ''}
                        onChange={(e) => onChange(field.id, e.target.value)}
                        onBlur={() => onBlur(field, value)}
                        placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                        disabled={disabled}
                        className={validationError ? 'border-destructive' : ''}
                    />
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'number':
            return (
                <div className="space-y-2">
                    <Input
                        id={field.id} type="number" value={value ?? ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || isValidNumber(val)) {
                                onChange(field.id, val === '' ? '' : parseFloat(val));
                            }
                        }}
                        onBlur={() => onBlur(field, value)}
                        placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                        disabled={disabled}
                        className={validationError ? 'border-destructive' : ''}
                    />
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'date':
            return (
                <div className="space-y-2">
                    <Input
                        id={field.id} type="date" value={value || ''}
                        onChange={(e) => onChange(field.id, e.target.value)}
                        onBlur={() => onBlur(field, value)}
                        disabled={disabled}
                        className={validationError ? 'border-destructive' : ''}
                    />
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );

        case 'text':
        default:
            return (
                <div className="space-y-2">
                    <Input
                        id={field.id} type="text" value={value || ''}
                        onChange={(e) => onChange(field.id, e.target.value)}
                        onBlur={() => onBlur(field, value)}
                        placeholder={field.placeholder || `Introduzca ${field.label.toLowerCase()}`}
                        disabled={disabled}
                        className={validationError ? 'border-destructive' : ''}
                    />
                    {validationError && <p className="text-sm text-destructive">{validationError}</p>}
                    {field.helpText && <p className="text-xs text-muted-foreground">{field.helpText}</p>}
                </div>
            );
    }
}
