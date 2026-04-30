'use client';

import { Label } from '@/components/ui/label';
import { NewIncidenceForm } from '@/components/hcm/new-incidence-form';
import { evaluateFieldVisibility } from '@/components/form-fields';
import { RequestFormField } from './RequestFormField';
import type { Template, FormField, FieldLayoutConfig } from "@/types/workflow.types";

interface RequestFormSectionProps {
    template: Template;
    formData: Record<string, any>;
    validationErrors: Record<string, string | null>;
    uploadProgress: Record<string, number>;
    fileErrors: Record<string, string>;
    disabled?: boolean;
    userId: string;
    targetUserId: string;
    onSuccess: () => void;
    onCancel: () => void;
    onChange: (fieldId: string, value: any) => void;
    onBlur: (field: FormField, value: any) => void;
    onFileChange: (fieldId: string, file: File | undefined) => void;
}

const INCIDENCE_KEYWORDS = ['vacaciones', 'permiso', 'incapacidad', 'ausencia'];

export function RequestFormSection({
    template, formData, validationErrors, uploadProgress, fileErrors,
    disabled, userId, targetUserId, onSuccess, onCancel,
    onChange, onBlur, onFileChange,
}: RequestFormSectionProps) {
    const isIncidenceTemplate = INCIDENCE_KEYWORDS.some(kw =>
        template.name.toLowerCase().includes(kw)
    );

    if (isIncidenceTemplate) {
        return (
            <div className="border-t pt-6">
                <NewIncidenceForm
                    userId={userId}
                    targetUserId={targetUserId}
                    onSuccess={onSuccess}
                    onCancel={onCancel}
                />
            </div>
        );
    }

    const renderFieldWithLabel = (field: FormField) => {
        const isVisible = evaluateFieldVisibility(field, formData, template.visibilityRules);
        if (!isVisible) return null;

        return (
            <div key={field.id} className="space-y-2">
                {field.type !== 'checkbox' && field.type !== 'user-identity' && (
                    <Label htmlFor={field.id}>
                        {field.label}
                        {field.validations?.some(v => v.type === 'required') && (
                            <span className="text-destructive ml-1">*</span>
                        )}
                    </Label>
                )}
                <RequestFormField
                    field={field}
                    value={formData[field.id]}
                    formData={formData}
                    uploadProgress={uploadProgress[field.id]}
                    fileError={fileErrors[field.id]}
                    validationError={validationErrors[field.id]}
                    disabled={disabled}
                    onChange={onChange}
                    onBlur={onBlur}
                    onFileChange={onFileChange}
                />
            </div>
        );
    };

    const fieldLayout = template.fieldLayout || [];
    if (fieldLayout.length === 0) {
        return (
            <div className="space-y-4 border-t pt-6">
                {template.fields.map(renderFieldWithLabel)}
            </div>
        );
    }

    const rowsMap = new Map<number, { field: FormField; config: FieldLayoutConfig }[]>();
    const fieldsWithLayout = new Set<string>();

    fieldLayout.forEach(config => {
        const field = template.fields.find(f => f.id === config.fieldId);
        if (field) {
            fieldsWithLayout.add(field.id);
            const rowItems = rowsMap.get(config.row) || [];
            rowItems.push({ field, config });
            rowsMap.set(config.row, rowItems);
        }
    });

    const fieldsNotInLayout = template.fields.filter(f => !fieldsWithLayout.has(f.id));

    const sortedRows = Array.from(rowsMap.entries())
        .sort(([a], [b]) => a - b)
        .map(([, items]) => items.sort((a, b) => a.config.column - b.config.column));

    return (
        <div className="space-y-4 border-t pt-6">
            {sortedRows.map((rowItems, rowIdx) => (
                <div key={rowIdx} className="grid grid-cols-5 gap-4">
                    {rowItems.map(({ field, config }) => {
                        const isVisible = evaluateFieldVisibility(field, formData, template.visibilityRules);
                        if (!isVisible) return null;
                        const colspan = config.colspan || 5;
                        return (
                            <div
                                key={field.id}
                                className="space-y-2"
                                style={{ gridColumn: `${config.column} / span ${colspan}` }}
                            >
                                {field.type !== 'checkbox' && field.type !== 'user-identity' && (
                                    <Label htmlFor={field.id}>
                                        {field.label}
                                        {field.validations?.some(v => v.type === 'required') && (
                                            <span className="text-destructive ml-1">*</span>
                                        )}
                                    </Label>
                                )}
                                <RequestFormField
                                    field={field}
                                    value={formData[field.id]}
                                    formData={formData}
                                    uploadProgress={uploadProgress[field.id]}
                                    fileError={fileErrors[field.id]}
                                    validationError={validationErrors[field.id]}
                                    disabled={disabled}
                                    onChange={onChange}
                                    onBlur={onBlur}
                                    onFileChange={onFileChange}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
            {fieldsNotInLayout.map(renderFieldWithLabel)}
        </div>
    );
}
