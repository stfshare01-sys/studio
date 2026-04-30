"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { PlusCircle, X } from "lucide-react";
import {
    TableColumnDialog,
    FieldValidationConfig,
    TypographyConfig,
    HtmlFieldEditor,
    useMasterLists,
} from "@/components/form-fields";
import type { FormField, FormFieldType, TableColumnDefinition, ValidationRule, TypographyConfig as TypographyConfigType } from "@/types/workflow.types";

interface FieldFormDialogProps {
    field: FormField | null;
    onSave: (field: FormField) => void;
    onCancel: () => void;
}

export function FieldFormDialog({ field, onSave, onCancel }: FieldFormDialogProps) {
    const [label, setLabel] = useState(field?.label || '');
    const [type, setType] = useState<FormFieldType>(field?.type || 'text');
    const [options, setOptions] = useState<string[]>(field?.options || ['']);
    const isEditing = !!field;

    // Table configuration
    const [tableColumns, setTableColumns] = useState<TableColumnDefinition[]>([]);
    const [minRows, setMinRows] = useState<number | undefined>();
    const [maxRows, setMaxRows] = useState<number | undefined>();
    const [showSummaryRow, setShowSummaryRow] = useState(false);

    // Dynamic select configuration
    const [dynamicSourceType, setDynamicSourceType] = useState<'master-list' | 'collection' | 'static'>('static');
    const [masterListId, setMasterListId] = useState('');
    const [collectionPath, setCollectionPath] = useState('');
    const [labelField, setLabelField] = useState('name');
    const [valueField, setValueField] = useState('id');
    const [cascadeFieldId, setCascadeFieldId] = useState('');
    const [cascadeFilterField, setCascadeFilterField] = useState('');

    // User identity configuration
    const [userIdentityDisplayField, setUserIdentityDisplayField] = useState<'email' | 'fullName' | 'both'>('both');
    const [includeTimestamp, setIncludeTimestamp] = useState(true);

    // Validation rules
    const [validations, setValidations] = useState<ValidationRule[]>([]);

    // Field metadata
    const [placeholder, setPlaceholder] = useState('');
    const [helpText, setHelpText] = useState('');

    // Typography configuration
    const [typography, setTypography] = useState<TypographyConfigType | undefined>(undefined);

    // HTML content
    const [htmlContent, setHtmlContent] = useState('');

    const { masterLists } = useMasterLists();

    useEffect(() => {
        if (field) {
            setLabel(field.label);
            setType(field.type);
            setOptions(field.options && field.options.length > 0 ? field.options : ['']);
            setTableColumns(field.tableColumns || []);
            setMinRows(field.minRows);
            setMaxRows(field.maxRows);
            setShowSummaryRow(field.showSummaryRow || false);
            setDynamicSourceType(field.dynamicSource?.type || 'static');
            setMasterListId(field.dynamicSource?.masterListId || '');
            setCollectionPath(field.dynamicSource?.collectionPath || '');
            setLabelField(field.dynamicSource?.labelField || 'name');
            setValueField(field.dynamicSource?.valueField || 'id');
            setCascadeFieldId(field.dynamicSource?.filterConfig?.dependsOn || '');
            setCascadeFilterField(field.dynamicSource?.filterConfig?.filterField || '');
            setUserIdentityDisplayField(field.userIdentityConfig?.displayField || 'both');
            setIncludeTimestamp(field.userIdentityConfig?.includeTimestamp ?? true);
            setValidations(field.validations || []);
            setPlaceholder(field.placeholder || '');
            setHelpText(field.helpText || '');
            setTypography(field.typography);
            setHtmlContent(field.htmlContent || '');
        } else {
            setLabel('');
            setType('text');
            setOptions(['']);
            setTableColumns([]);
            setMinRows(undefined);
            setMaxRows(undefined);
            setShowSummaryRow(false);
            setDynamicSourceType('static');
            setMasterListId('');
            setCollectionPath('');
            setLabelField('name');
            setValueField('id');
            setCascadeFieldId('');
            setCascadeFilterField('');
            setUserIdentityDisplayField('both');
            setIncludeTimestamp(true);
            setValidations([]);
            setPlaceholder('');
            setHelpText('');
            setTypography(undefined);
            setHtmlContent('');
        }
    }, [field]);

    const handleAddOption = () => setOptions([...options, '']);
    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };
    const handleRemoveOption = (index: number) => {
        if (options.length > 1) setOptions(options.filter((_, i) => i !== index));
    };

    const handleSubmit = () => {
        const finalField: FormField = {
            id: field?.id || `field-${Date.now()}`,
            label: label.trim(),
            type
        };

        if (['select', 'radio'].includes(type)) {
            finalField.options = options.map(o => o.trim()).filter(o => o);
        }
        if (type === 'checkbox') {
            finalField.options = [label.trim()];
        }
        if (type === 'table') {
            finalField.tableColumns = tableColumns;
            if (minRows) finalField.minRows = minRows;
            if (maxRows) finalField.maxRows = maxRows;
            finalField.showSummaryRow = showSummaryRow;
        }
        if (type === 'dynamic-select') {
            finalField.dynamicSource = { type: dynamicSourceType, labelField, valueField };
            if (dynamicSourceType === 'master-list' && masterListId) {
                finalField.dynamicSource.masterListId = masterListId;
            }
            if (dynamicSourceType === 'collection' && collectionPath) {
                finalField.dynamicSource.collectionPath = collectionPath;
            }
            if (cascadeFieldId && cascadeFilterField) {
                finalField.dynamicSource.filterConfig = {
                    dependsOn: cascadeFieldId,
                    filterField: cascadeFilterField,
                    operator: '==',
                };
            }
        }
        if (type === 'user-identity') {
            finalField.userIdentityConfig = { displayField: userIdentityDisplayField, includeTimestamp };
            finalField.readOnly = true;
        }
        if (validations.length > 0) finalField.validations = validations;
        if (placeholder) finalField.placeholder = placeholder;
        if (helpText) finalField.helpText = helpText;
        if (typography && Object.keys(typography).length > 0) finalField.typography = typography;
        if (type === 'html' && htmlContent) finalField.htmlContent = htmlContent;

        onSave(finalField);
    };

    const needsOptions = ['select', 'radio'].includes(type);

    return (
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="field-label">Etiqueta del Campo *</Label>
                    <Input
                        id="field-label"
                        value={label}
                        onChange={(e) => setLabel(e.target.value)}
                        placeholder="p.ej., Nombre del Solicitante"
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="field-type">Tipo de Campo</Label>
                    <Select value={type} onValueChange={(value) => setType(value as FormFieldType)}>
                        <SelectTrigger id="field-type">
                            <SelectValue placeholder="Seleccione un tipo..." />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="textarea">Área de texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="email">Email</SelectItem>
                            <SelectItem value="date">Fecha</SelectItem>
                            <SelectItem value="select">Lista desplegable</SelectItem>
                            <SelectItem value="dynamic-select">Lista desplegable dinámica</SelectItem>
                            <SelectItem value="radio">Botones de opción</SelectItem>
                            <SelectItem value="checkbox">Casilla de verificación</SelectItem>
                            <SelectItem value="file">Carga de archivos</SelectItem>
                            <SelectItem value="table">Tabla interactiva</SelectItem>
                            <SelectItem value="user-identity">Identidad del usuario</SelectItem>
                            <SelectItem value="html">HTML personalizado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Placeholder (opcional)</Label>
                    <Input value={placeholder} onChange={(e) => setPlaceholder(e.target.value)} placeholder="Texto de ayuda en el campo" />
                </div>
                <div className="space-y-2">
                    <Label>Texto de ayuda (opcional)</Label>
                    <Input value={helpText} onChange={(e) => setHelpText(e.target.value)} placeholder="Descripción adicional" />
                </div>
            </div>

            {needsOptions && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label>Opciones</Label>
                    <div className="space-y-2">
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input value={option} onChange={(e) => handleOptionChange(index, e.target.value)} placeholder={`Opción ${index + 1}`} />
                                <Button variant="ghost" size="icon" onClick={() => handleRemoveOption(index)} disabled={options.length <= 1}>
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        ))}
                    </div>
                    <Button variant="outline" size="sm" onClick={handleAddOption} className="mt-2">
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Opción
                    </Button>
                </div>
            )}

            {type === 'table' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Tabla</Label>
                    <TableColumnDialog columns={tableColumns} onColumnsChange={setTableColumns} />
                    <div className="grid grid-cols-3 gap-4 pt-2">
                        <div className="space-y-2">
                            <Label>Filas mínimas</Label>
                            <Input type="number" min={0} value={minRows ?? ''} onChange={(e) => setMinRows(e.target.value ? parseInt(e.target.value) : undefined)} placeholder="Sin límite" />
                        </div>
                        <div className="space-y-2">
                            <Label>Filas máximas</Label>
                            <Input type="number" min={1} value={maxRows ?? ''} onChange={(e) => setMaxRows(e.target.value ? parseInt(e.target.value) : undefined)} placeholder="Sin límite" />
                        </div>
                        <div className="space-y-2 flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer pb-2">
                                <Checkbox checked={showSummaryRow} onCheckedChange={(checked) => setShowSummaryRow(checked === true)} />
                                <span className="text-sm">Mostrar fila resumen</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {type === 'dynamic-select' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Lista Dinámica</Label>
                    <div className="space-y-2">
                        <Label>Fuente de datos</Label>
                        <Select value={dynamicSourceType} onValueChange={(v) => setDynamicSourceType(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="static">Opciones estáticas</SelectItem>
                                <SelectItem value="master-list">Lista maestra</SelectItem>
                                <SelectItem value="collection">Colección de Firestore</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    {dynamicSourceType === 'master-list' && (
                        <div className="space-y-2">
                            <Label>Lista maestra</Label>
                            <Select value={masterListId} onValueChange={setMasterListId}>
                                <SelectTrigger><SelectValue placeholder="Seleccione una lista..." /></SelectTrigger>
                                <SelectContent>
                                    {masterLists.map(ml => <SelectItem key={ml.id} value={ml.id}>{ml.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    {dynamicSourceType === 'collection' && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2">
                                <Label>Ruta de colección</Label>
                                <Input value={collectionPath} onChange={(e) => setCollectionPath(e.target.value)} placeholder="p.ej., productos" />
                            </div>
                            <div className="space-y-2">
                                <Label>Campo para etiqueta</Label>
                                <Input value={labelField} onChange={(e) => setLabelField(e.target.value)} placeholder="name" />
                            </div>
                            <div className="space-y-2">
                                <Label>Campo para valor</Label>
                                <Input value={valueField} onChange={(e) => setValueField(e.target.value)} placeholder="id" />
                            </div>
                        </div>
                    )}
                    {dynamicSourceType === 'static' && (
                        <div className="space-y-2">
                            <Label>Opciones</Label>
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input value={option} onChange={(e) => handleOptionChange(index, e.target.value)} placeholder={`Opción ${index + 1}`} />
                                        <Button variant="ghost" size="icon" onClick={() => handleRemoveOption(index)} disabled={options.length <= 1}>
                                            <X className="h-4 w-4" />
                                        </Button>
                                    </div>
                                ))}
                            </div>
                            <Button variant="outline" size="sm" onClick={handleAddOption}>
                                <PlusCircle className="mr-2 h-4 w-4" /> Añadir
                            </Button>
                        </div>
                    )}
                    <div className="pt-2 border-t">
                        <Label className="text-sm text-muted-foreground">Filtro en cascada (opcional)</Label>
                        <div className="grid grid-cols-2 gap-2 mt-2">
                            <div className="space-y-1">
                                <Label className="text-xs">Depende del campo ID</Label>
                                <Input value={cascadeFieldId} onChange={(e) => setCascadeFieldId(e.target.value)} placeholder="ID del campo padre" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Filtrar por campo</Label>
                                <Input value={cascadeFilterField} onChange={(e) => setCascadeFilterField(e.target.value)} placeholder="Campo a filtrar" />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {type === 'user-identity' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Identidad de Usuario</Label>
                    <p className="text-sm text-muted-foreground">Este campo se completa automáticamente con los datos del usuario que llena el formulario.</p>
                    <div className="space-y-2">
                        <Label>Mostrar</Label>
                        <Select value={userIdentityDisplayField} onValueChange={(v) => setUserIdentityDisplayField(v as any)}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="email">Solo email</SelectItem>
                                <SelectItem value="fullName">Solo nombre completo</SelectItem>
                                <SelectItem value="both">Email y nombre</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox checked={includeTimestamp} onCheckedChange={(checked) => setIncludeTimestamp(checked === true)} />
                        <span className="text-sm">Incluir fecha y hora de llenado</span>
                    </label>
                </div>
            )}

            {type === 'html' && (
                <div className="space-y-4 rounded-md border p-4">
                    <HtmlFieldEditor value={htmlContent} onChange={setHtmlContent} />
                </div>
            )}

            {!['user-identity', 'file', 'table'].includes(type) && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label className="text-base font-semibold">Tipografía y Estilo</Label>
                    <TypographyConfig value={typography} onChange={setTypography} />
                </div>
            )}

            {!['user-identity', 'html'].includes(type) && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label className="text-base font-semibold">Validaciones</Label>
                    <FieldValidationConfig fieldType={type} validations={validations} onValidationsChange={setValidations} />
                </div>
            )}

            <DialogFooter className="pt-4 sticky bottom-0 bg-background">
                <Button variant="outline" onClick={onCancel}>Cancelar</Button>
                <Button onClick={handleSubmit} disabled={!label.trim() || (type === 'table' && tableColumns.length === 0)}>
                    {isEditing ? 'Guardar Cambios' : 'Añadir Campo'}
                </Button>
            </DialogFooter>
        </div>
    );
}
