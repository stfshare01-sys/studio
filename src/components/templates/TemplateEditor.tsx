"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2, UserSquare, Pencil, GripVertical, X, AlertTriangle, User, Bell, ChevronsRight, Hash, CaseSensitive, Timer, Siren, ArrowUp, ArrowDown, Save } from "lucide-react";
import Link from "next/link";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogClose,
    DialogDescription,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useFirestore, useMemoFirebase } from "@/firebase";
import { addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType, FormFieldType, RuleOperator, User as UserType, RequestPriority, UserRole, EscalationPolicy, VisibilityRule, TableColumnDefinition, DynamicSelectSource, UserIdentityConfig, ValidationRule, Template, FieldLayoutConfig, DefaultValueRule, TypographyConfig as TypographyConfigType } from "@/lib/types";
import { VisibilityRulesBuilder, FieldValidationConfig, TableColumnDialog, useMasterLists, FieldLayoutEditor, GatewayRoutingConfig, DefaultValueRulesBuilder, TypographyConfig, HtmlFieldEditor, TimerStepConfig } from "@/components/form-fields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

// --- Helper Components (Extracting strictly what is needed) ---

const BpmnIcon = ({ type, className }: { type: WorkflowStepType, className?: string }) => {
    switch (type) {
        case 'task': return <CheckCircle className={cn("h-5 w-5 text-sky-500", className)} />;
        case 'gateway-exclusive': return <GitMerge className={cn("h-5 w-5 text-amber-500", className)} />;
        case 'gateway-parallel': return <GitFork className={cn("h-5 w-5 text-purple-500", className)} />;
        case 'gateway-inclusive': return <GitFork className={cn("h-5 w-5 text-green-500", className)} />;
        case 'timer': return <Timer className={cn("h-5 w-5 text-orange-500", className)} />;
        default: return null;
    }
};

type Lane = { id: string; name: string; steps: WorkflowStepDefinition[]; };
type Pool = { id: string; name: string; lanes: Lane[]; };

function CopilotDialog({ onApply }: { onApply: (data: GenerateProcessOutput) => void }) {
    const [description, setDescription] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const { toast } = useToast();

    const handleGenerate = async () => {
        if (!description.trim()) {
            toast({ variant: 'destructive', title: 'Descripción vacía', description: 'Por favor, describe el proceso que quieres generar.' });
            return;
        }
        setIsLoading(true);
        try {
            const result = await generateProcessFromDescription(description);
            onApply(result);
            setIsOpen(false);
            toast({ title: '¡Borrador Generado!', description: 'El lienzo ha sido actualizado con el borrador de la IA.' });
        } catch (error) {
            console.error("AI process generation failed:", error);
            toast({ variant: 'destructive', title: 'Error de la IA', description: 'No se pudo generar el proceso. Por favor, inténtelo de nuevo.' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline"><WandSparkles className="mr-2 h-4 w-4" /> Generar con IA</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>Asistente de Procesos (Copilot)</DialogTitle>
                    <DialogDescription>Describe el proceso que quieres modelar en lenguaje natural.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <Textarea
                        placeholder='Ej: "Crear un flujo para aprobar facturas..."'
                        rows={6}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost" disabled={isLoading}>Cancelar</Button></DialogClose>
                    <Button onClick={handleGenerate} disabled={isLoading}>
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <WandSparkles className="mr-2 h-4 w-4" />}
                        Generar Borrador
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function SortableField({ field, onRemove, onEdit }: { field: FormField, onRemove: (id: string) => void, onEdit: (field: FormField) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id, data: { type: 'field' } });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const fieldTypeLabels: Record<FormFieldType, string> = {
        text: 'Texto', textarea: 'Área de texto', date: 'Fecha', number: 'Número',
        select: 'Desplegable', checkbox: 'Casilla', radio: 'Opciones', file: 'Archivo',
        table: 'Tabla', 'dynamic-select': 'Desplegable dinámico', 'user-identity': 'Identidad usuario', email: 'Email', html: 'HTML'
    };

    return (
        <div ref={setNodeRef} style={style} className="group flex items-center gap-2 rounded-md p-3 bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1"><GripVertical className="h-4 w-4 text-muted-foreground" /></button>
            <div className="flex-1 font-medium">{field.label}</div>
            <div className="text-sm text-muted-foreground">({fieldTypeLabels[field.type]})</div>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(field)}><Pencil className="h-4 w-4 text-primary" /></Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onRemove(field.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
        </div>
    );
}

function SortableStep({
    step, poolId, laneId, onUpdateStep, onDeleteStep, allSteps, formFields
}: {
    step: WorkflowStepDefinition, poolId: string, laneId: string,
    onUpdateStep: (pid: string, lid: string, sid: string, u: Partial<WorkflowStepDefinition>) => void,
    onDeleteStep: (pid: string, lid: string, sid: string) => void,
    allSteps: WorkflowStepDefinition[], formFields: FormField[]
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id, data: { type: 'step' } });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const [newOutcome, setNewOutcome] = useState('');

    const addOutcome = () => {
        if (newOutcome.trim()) {
            onUpdateStep(poolId, laneId, step.id, { outcomes: [...(step.outcomes || []), newOutcome.trim()] });
            setNewOutcome('');
        }
    }
    const removeOutcome = (index: number) => {
        onUpdateStep(poolId, laneId, step.id, { outcomes: (step.outcomes || []).filter((_, i) => i !== index) });
    };
    const updateEscalationForSla = (u: Partial<EscalationPolicy>) => {
        onUpdateStep(poolId, laneId, step.id, { escalationPolicy: { ...step.escalationPolicy, ...u } as EscalationPolicy });
    }

    return (
        <div ref={setNodeRef} style={style} className="group flex items-start gap-3 rounded-md p-2 border text-sm bg-card hover:bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1 mt-1"><GripVertical className="h-4 w-4 text-muted-foreground" /></button>
            <BpmnIcon type={step.type} className="h-4 w-4 mt-1.5" />
            <div className="flex-1 space-y-1">
                <Input value={step.name} onChange={(e) => onUpdateStep(poolId, laneId, step.id, { name: e.target.value })} className="h-8 border-none bg-transparent p-0" placeholder="Nombre del paso" />
                <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                    <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto p-1"><UserSquare className="h-3.5 w-3.5 mr-1" /><span className="text-xs truncate max-w-[80px]">{step.assigneeRole || "Asignar"}</span><Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" /></Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-2"><div className="space-y-2"><Label className="text-xs">Rol de Asignación</Label><Input value={step.assigneeRole || ''} onChange={(e) => onUpdateStep(poolId, laneId, step.id, { assigneeRole: e.target.value })} className="h-8" /></div></PopoverContent>
                    </Popover>
                    {step.type === 'task' && (
                        <>
                            <Popover>
                                <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto p-1"><GitBranch className="h-3.5 w-3.5 mr-1" /><span className="text-xs">{step.outcomes?.length || 0} Salidas</span><Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" /></Button></PopoverTrigger>
                                <PopoverContent className="w-60 p-2">
                                    <div className="space-y-2">
                                        <Label className="text-xs">Resultados (Decisiones)</Label>
                                        <div className="flex flex-wrap gap-1">{(step.outcomes || []).map((o, i) => (<Badge key={i} variant="secondary" className="group/badge relative">{o}<button onClick={() => removeOutcome(i)} className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/badge:opacity-100 flex items-center justify-center p-0.5"><X className="h-2 w-2" /></button></Badge>))}</div>
                                        <div className="flex gap-1"><Input placeholder="Ej: Aprobado" value={newOutcome} onChange={e => setNewOutcome(e.target.value)} className="h-8" /><Button size="sm" onClick={addOutcome}>+</Button></div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto p-1"><Timer className="h-3.5 w-3.5 mr-1" /><span className="text-xs truncate max-w-[80px]">SLA: {step.slaHours ? `${step.slaHours}h` : 'N/A'}</span><Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" /></Button></PopoverTrigger>
                                <PopoverContent className="w-auto p-2"><div className="space-y-2"><Label className="text-xs">SLA (horas)</Label><Input type="number" value={step.slaHours || ''} onChange={e => onUpdateStep(poolId, laneId, step.id, { slaHours: e.target.value ? Number(e.target.value) : undefined })} className="h-8" /></div></PopoverContent>
                            </Popover>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-auto p-1">
                                        <Siren className="h-3.5 w-3.5 mr-1" />
                                        <span className="text-xs">Escalado: {step.escalationPolicy?.action || 'Ninguno'}</span>
                                        <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-64 p-2" align="start">
                                    <div className="space-y-3">
                                        <Label className="text-xs">Política de Escalado por SLA</Label>
                                        <div className="space-y-2">
                                            <Label htmlFor={`esc-action-${step.id}`} className="text-xs font-normal">Acción</Label>
                                            <Select
                                                value={step.escalationPolicy?.action}
                                                onValueChange={(val) => updateEscalationForSla({ action: val as 'NOTIFY' | 'REASSIGN' })}
                                            >
                                                <SelectTrigger id={`esc-action-${step.id}`} className="h-8"><SelectValue placeholder="Seleccionar acción..." /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="NOTIFY">Notificar</SelectItem>
                                                    <SelectItem value="REASSIGN">Reasignar</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        {step.escalationPolicy?.action === 'NOTIFY' && (
                                            <div className="space-y-2 pl-2 border-l-2 ml-1">
                                                <Label className="text-xs font-normal">Notificar a</Label>
                                                <div className="space-y-1">
                                                    <div className="flex items-center gap-2"><Checkbox id={`esc-notify-assignee-${step.id}`} checked={step.escalationPolicy?.notify?.includes('assignee')} onCheckedChange={(checked) => updateEscalationForSla({ notify: checked ? [...(step.escalationPolicy?.notify || []), 'assignee'] : (step.escalationPolicy?.notify || []).filter(n => n !== 'assignee') })} /><Label htmlFor={`esc-notify-assignee-${step.id}`} className="text-xs font-normal">Asignado Actual</Label></div>
                                                    <div className="flex items-center gap-2"><Checkbox id={`esc-notify-manager-${step.id}`} checked={step.escalationPolicy?.notify?.includes('manager')} onCheckedChange={(checked) => updateEscalationForSla({ notify: checked ? [...(step.escalationPolicy?.notify || []), 'manager'] : (step.escalationPolicy?.notify || []).filter(n => n !== 'manager') })} /><Label htmlFor={`esc-notify-manager-${step.id}`} className="text-xs font-normal">Gerente del Asignado</Label></div>
                                                </div>
                                            </div>
                                        )}
                                        {step.escalationPolicy?.action === 'REASSIGN' && (
                                            <div className="space-y-2 pl-2 border-l-2 ml-1">
                                                <Label htmlFor={`esc-target-${step.id}`} className="text-xs font-normal">Reasignar a Rol</Label>
                                                <Input id={`esc-target-${step.id}`} placeholder="Ej: Gerentes de TI" value={step.escalationPolicy.targetRole || ''} onChange={e => updateEscalationForSla({ targetRole: e.target.value })} className="h-8" />
                                            </div>
                                        )}
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </>
                    )}
                    {(step.type.startsWith('gateway')) && (
                        <Dialog>
                            <DialogTrigger asChild><Button variant="ghost" size="sm" className="h-auto p-1"><GitBranch className="h-3.5 w-3.5 mr-1" /><span className="text-xs">Rutas</span><Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" /></Button></DialogTrigger>
                            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader><DialogTitle>Configurar Gateway</DialogTitle></DialogHeader>
                                <GatewayRoutingConfig
                                    gatewayType={step.type as any}
                                    routes={(step as any).routes || []}
                                    onRoutesChange={(routes) => onUpdateStep(poolId, laneId, step.id, { routes } as any)}
                                    availableSteps={allSteps.filter(s => s.id !== step.id)}
                                    formFields={formFields}
                                    precedingStep={allSteps.find((s, i) => i === allSteps.findIndex(x => x.id === step.id) - 1)}
                                />
                            </DialogContent>
                        </Dialog>
                    )}
                    {step.type === 'timer' && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto p-1">
                                    <Timer className="h-3.5 w-3.5 mr-1" />
                                    <span className="text-xs">Configurar Timer</span>
                                    <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>Configurar Temporizador</DialogTitle>
                                </DialogHeader>
                                <TimerStepConfig
                                    value={(step as any).timerConfig}
                                    onChange={(config) => onUpdateStep(poolId, laneId, step.id, { timerConfig: config } as any)}
                                    formFields={formFields}
                                />
                            </DialogContent>
                        </Dialog>
                    )}
                </div>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive self-start mt-1" onClick={() => onDeleteStep(poolId, laneId, step.id)}><Trash2 className="h-4 w-4" /></Button>
        </div>
    )
}

function LaneItem({ poolId, lane, laneIndex, totalLanes, handleUpdate, handleAddStep, handleDelete, onUpdateStep, allSteps, formFields, moveLane }: any) {
    return (
        <div className="group/lane rounded-md border bg-background">
            <div className="flex items-center gap-2 p-2 border-b">
                <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveLane(poolId, laneIndex, 'up')} disabled={laneIndex === 0}><ArrowUp className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => moveLane(poolId, laneIndex, 'down')} disabled={laneIndex === totalLanes - 1}><ArrowDown className="h-3 w-3" /></Button>
                </div>
                <Input value={lane.name} onChange={(e) => handleUpdate('lane', { poolId, laneId: lane.id }, e.target.value)} className="h-8 border-none bg-transparent p-0 flex-1" />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4" />Añadir</Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Nueva Tarea", 'task')}><BpmnIcon type="task" className="mr-2" /> Tarea</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Exclusivo", 'gateway-exclusive')}><BpmnIcon type="gateway-exclusive" className="mr-2" /> Gateway X</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Paralelo", 'gateway-parallel')}><BpmnIcon type="gateway-parallel" className="mr-2" /> Gateway +</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Inclusivo", 'gateway-inclusive')}><BpmnIcon type="gateway-inclusive" className="mr-2" /> Gateway O</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Temporizador", 'timer')}><BpmnIcon type="timer" className="mr-2" /> Temporizador</DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover/lane:opacity-100 text-destructive" onClick={() => handleDelete('lane', poolId, lane.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="p-2 min-h-[50px] space-y-2">
                <SortableContext items={lane.steps.map((s: any) => s.id)} strategy={verticalListSortingStrategy} id={lane.id}>
                    {lane.steps.map((step: any) => (
                        <SortableStep key={step.id} step={step} poolId={poolId} laneId={lane.id} onUpdateStep={onUpdateStep} onDeleteStep={(p, l, s) => handleDelete('step', p, l, s)} allSteps={allSteps} formFields={formFields} />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}

function PoolItem({ pool, index, totalPools, handleUpdate, handleAddLane, handleDelete, handleAddStep, onUpdateStep, allSteps, formFields, movePool, moveLane }: any) {
    return (
        <div className="group/pool rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
                <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => movePool(index, 'up')} disabled={index === 0}><ArrowUp className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => movePool(index, 'down')} disabled={index === totalPools - 1}><ArrowDown className="h-3 w-3" /></Button>
                </div>
                <Input value={pool.name} onChange={(e) => handleUpdate('pool', { poolId: pool.id }, e.target.value)} className="text-base font-semibold border-none bg-transparent p-0 flex-1" />
                <Button variant="ghost" size="sm" onClick={() => handleAddLane(pool.id)}><PlusCircle className="mr-2 h-4 w-4" /> Añadir Carril</Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover/pool:opacity-100 text-destructive" onClick={() => handleDelete('pool', pool.id)}><Trash2 className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-2 pl-6">
                <SortableContext items={pool.lanes.map((l: any) => l.id)} strategy={verticalListSortingStrategy} id={pool.id}>
                    {pool.lanes.map((lane: any, i: number) => (
                        <LaneItem key={lane.id} poolId={pool.id} lane={lane} laneIndex={i} totalLanes={pool.lanes.length} handleUpdate={handleUpdate} handleAddStep={handleAddStep} handleDelete={handleDelete} onUpdateStep={onUpdateStep} allSteps={allSteps} formFields={formFields} moveLane={moveLane} />
                    ))}
                </SortableContext>
            </div>
        </div>
    )
}


// --- MAIN COMPONENT ---

interface TemplateEditorProps {
    mode: 'create' | 'edit';
    initialData?: Partial<Template>;
    templateId?: string;
}

export function TemplateEditor({ mode, initialData, templateId }: TemplateEditorProps) {
    const { toast } = useToast();
    const firestore = useFirestore();
    const router = useRouter();

    const [templateName, setTemplateName] = useState(initialData?.name || "");
    const [templateDescription, setTemplateDescription] = useState(initialData?.description || "");

    // Form and Rules Data
    const [fields, setFields] = useState<FormField[]>(initialData?.fields || []);
    const [rules, setRules] = useState<Rule[]>(initialData?.rules || []);
    const [visibilityRules, setVisibilityRules] = useState<VisibilityRule[]>(initialData?.visibilityRules || []);
    const [fieldLayout, setFieldLayout] = useState<FieldLayoutConfig[]>(initialData?.fieldLayout || []);
    const [defaultValueRules, setDefaultValueRules] = useState<DefaultValueRule[]>(initialData?.defaultValueRules || []);

    // Flow Data
    const [pools, setPools] = useState<Pool[]>(initialData?.pools || []);

    // Load Default Pool if empty
    useEffect(() => {
        if (pools.length === 0 && mode === 'create') {
            setPools([{
                id: 'pool-default',
                name: 'Proceso Principal',
                lanes: [{
                    id: 'lane-default',
                    name: 'Principales',
                    steps: []
                }]
            }]);
        }
    }, []); // Run once on mount

    // Update state when initialData changes (for Edit mode async load)
    useEffect(() => {
        if (initialData && mode === 'edit') {
            setTemplateName(initialData.name || "");
            setTemplateDescription(initialData.description || "");
            setFields(initialData.fields || []);
            setRules(initialData.rules || []);
            setVisibilityRules(initialData.visibilityRules || []);
            setFieldLayout(initialData.fieldLayout || []);
            setDefaultValueRules(initialData.defaultValueRules || []);
            setPools(initialData.pools || []);
        }
    }, [initialData]);

    const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

    // --- HANDLERS ---

    const handleSave = async () => {
        if (!templateName.trim()) { toast({ variant: 'destructive', title: 'Error', description: 'El nombre es obligatorio' }); return; }

        // Flatten steps for validation and saving
        const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));
        if (allSteps.length === 0) { toast({ variant: 'destructive', title: 'Error', description: 'Debe haber al menos un paso en el proceso' }); return; }

        setIsSaving(true);
        try {
            const templateData: any = {
                name: templateName,
                description: templateDescription,
                fields,
                rules,
                visibilityRules,
                pools,
                steps: allSteps, // Flattened for backward compatibility/easier querying
                fieldLayout,
                defaultValueRules,
                updatedAt: new Date().toISOString()
            };

            if (mode === 'create') {
                templateData.createdAt = new Date().toISOString();
                templateData.createdBy = 'me'; // ToDo: Real user
                templateData.status = 'active';
                templateData.version = 1;

                // Logic to create document (using non-blocking for speed, but routing needs ID)
                // Since we need ID to redirect, we use addDocumentNonBlocking which returns REF.
                const docRef = await addDocumentNonBlocking(collection(firestore, 'request_templates'), templateData);
                toast({ title: 'Éxito', description: 'Plantilla creada correctamente' });
                router.push('/templates');
            } else {
                if (!templateId) throw new Error("No ID for edit");
                // Update
                const docRef = doc(firestore, 'request_templates', templateId);
                await updateDocumentNonBlocking(docRef, templateData);
                toast({ title: 'Éxito', description: 'Plantilla actualizada' });
                router.push('/templates');
            }

        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo guardar la plantilla' });
        } finally {
            setIsSaving(false);
        }
    };
    const [isSaving, setIsSaving] = useState(false);

    // DND Logic
    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        // Steps Logic
        if (active.data.current?.type === 'step' && over.data.current?.type === 'step') {
            const activeContainer = active.data.current?.sortable.containerId;
            const overContainer = over.data.current?.sortable.containerId;
            if (activeContainer !== overContainer) return; // No cross-lane dragging for now

            setPools(prev => prev.map(pool => ({
                ...pool, lanes: pool.lanes.map(lane => {
                    if (lane.id === activeContainer) {
                        const oldIndex = lane.steps.findIndex(s => s.id === active.id);
                        const newIndex = lane.steps.findIndex(s => s.id === over.id);
                        return { ...lane, steps: arrayMove(lane.steps, oldIndex, newIndex) };
                    }
                    return lane;
                })
            })));
        }

        // Fields Logic
        if (active.data.current?.type === 'field' && over.data.current?.type === 'field') {
            setFields((items) => {
                const oldIndex = items.findIndex(item => item.id === active.id);
                const newIndex = items.findIndex(item => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    };

    // Pool/Lane handlers
    const updatePoolOrLane = (type: 'pool' | 'lane', ids: { poolId: string, laneId?: string }, val: string) => {
        setPools(prev => prev.map(p => {
            if (p.id !== ids.poolId) return p;
            if (type === 'pool') return { ...p, name: val };
            if (type === 'lane') return { ...p, lanes: p.lanes.map(l => l.id === ids.laneId ? { ...l, name: val } : l) };
            return p;
        }));
    };

    const addPool = () => {
        const id = `pool-${Date.now()}`;
        setPools([...pools, { id, name: `Pool ${pools.length + 1}`, lanes: [] }]);
    };

    const addLane = (poolId: string) => {
        setPools(prev => prev.map(p => {
            if (p.id !== poolId) return p;
            return { ...p, lanes: [...p.lanes, { id: `lane-${Date.now()}`, name: 'Nuevo Carril', steps: [] }] };
        }));
    };

    const addStep = (poolId: string, laneId: string, name: string, type: WorkflowStepType) => {
        const step: WorkflowStepDefinition = { id: `step-${Date.now()}`, name, type, assigneeRole: '' };
        setPools(prev => prev.map(p => {
            if (p.id !== poolId) return p;
            return {
                ...p, lanes: p.lanes.map(l => {
                    if (l.id !== laneId) return l;
                    return { ...l, steps: [...l.steps, step] };
                })
            }
        }));
    };

    const updateStep = (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => {
        setPools(prev => prev.map(p => {
            if (p.id !== poolId) return p;
            return {
                ...p, lanes: p.lanes.map(l => {
                    if (l.id !== laneId) return l;
                    return { ...l, steps: l.steps.map(s => s.id === stepId ? { ...s, ...updates } : s) };
                })
            }
        }));
    };

    const deleteItem = (type: 'pool' | 'lane' | 'step', poolId: string, laneId?: string, stepId?: string) => {
        setPools(prev => {
            if (type === 'pool') return prev.filter(p => p.id !== poolId);
            return prev.map(p => {
                if (p.id !== poolId) return p;
                if (type === 'lane') return { ...p, lanes: p.lanes.filter(l => l.id !== laneId) };
                if (type === 'step') return { ...p, lanes: p.lanes.map(l => l.id === laneId ? { ...l, steps: l.steps.filter(s => s.id !== stepId) } : l) };
                return p;
            });
        });
    };

    const movePool = (index: number, dir: 'up' | 'down') => {
        if ((dir === 'up' && index === 0) || (dir === 'down' && index === pools.length - 1)) return;
        const newPools = [...pools];
        const target = dir === 'up' ? index - 1 : index + 1;
        [newPools[index], newPools[target]] = [newPools[target], newPools[index]];
        setPools(newPools);
    }

    const moveLane = (poolId: string, index: number, dir: 'up' | 'down') => {
        setPools(prev => prev.map(p => {
            if (p.id !== poolId) return p;
            if ((dir === 'up' && index === 0) || (dir === 'down' && index === p.lanes.length - 1)) return p;
            const newLanes = [...p.lanes];
            const target = dir === 'up' ? index - 1 : index + 1;
            [newLanes[index], newLanes[target]] = [newLanes[target], newLanes[index]];
            return { ...p, lanes: newLanes };
        }));
    }

    // AI Apply
    const applyAiDraft = (data: GenerateProcessOutput) => {
        setTemplateName(data.name || templateName);
        setTemplateDescription(data.description || templateDescription);
        if (data.fields) setFields(data.fields);
        if (data.pools) setPools(data.pools);
    };

    // Dialog state
    const [editingField, setEditingField] = useState<FormField | null>(null);
    const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);

    // --- RENDER ---
    const allStepsFlat = pools.flatMap(p => p.lanes.flatMap(l => l.steps));

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between p-4 sm:p-6 border-b">
                    <div className="flex flex-col gap-1">
                        <Input
                            value={templateName}
                            onChange={e => setTemplateName(e.target.value)}
                            className="text-lg font-bold border-none px-0 h-auto focus-visible:ring-0"
                            placeholder="Nombre de la Plantilla"
                        />
                        <Input
                            value={templateDescription}
                            onChange={e => setTemplateDescription(e.target.value)}
                            className="text-sm text-muted-foreground border-none px-0 h-auto focus-visible:ring-0"
                            placeholder="Descripción corta"
                        />
                    </div>
                    <div className="flex gap-2">
                        <CopilotDialog onApply={applyAiDraft} />
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" /> Guardar
                        </Button>
                    </div>
                </header>

                <main className="grid flex-1 items-start gap-4 p-4 sm:gap-8 sm:p-6 md:grid-cols-[1fr_2fr]">
                    {/* LEFT COLUMN: FIELDS & CONFIG */}
                    <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex justify-between items-center">
                                    <CardTitle>Campos del Formulario</CardTitle>
                                    <Button size="sm" variant="outline" onClick={() => { setEditingField(null); setIsFieldDialogOpen(true); }}>
                                        <PlusCircle className="mr-2 h-3.5 w-3.5" /> Agregar
                                    </Button>
                                    {/* Detailed Field Dialog would go here - omitting strictly for brevity, existing one works */}
                                </div>
                                <CardDescription>Define qué información debe proveer el solicitante.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy}>
                                        {fields.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No hay campos definidos.</p>}
                                        {fields.map(field => (
                                            <SortableField key={field.id} field={field}
                                                onRemove={(id) => setFields(fields.filter(f => f.id !== id))}
                                                onEdit={(f) => { setEditingField(f); setIsFieldDialogOpen(true); }}
                                            />
                                        ))}
                                    </SortableContext>
                                </div>
                            </CardContent>
                        </Card>

                        {/* RULES & LAYOUT TABS */}
                        <Card>
                            <Tabs defaultValue="visibility">
                                <CardHeader className="pb-3 px-4 pt-4">
                                    <TabsList className="grid w-full grid-cols-3">
                                        <TabsTrigger value="visibility">Visibilidad</TabsTrigger>
                                        <TabsTrigger value="layout">Diseño</TabsTrigger>
                                        <TabsTrigger value="defaults">Valores</TabsTrigger>
                                    </TabsList>
                                </CardHeader>
                                <CardContent className="px-4 pb-4">
                                    <TabsContent value="visibility">
                                        <VisibilityRulesBuilder
                                            fields={fields}
                                            rules={visibilityRules}
                                            onRulesChange={setVisibilityRules}
                                        />
                                    </TabsContent>
                                    <TabsContent value="layout">
                                        <FieldLayoutEditor
                                            fields={fields}
                                            layout={fieldLayout}
                                            onLayoutChange={setFieldLayout}
                                        />
                                    </TabsContent>
                                    <TabsContent value="defaults">
                                        <DefaultValueRulesBuilder
                                            fields={fields}
                                            rules={defaultValueRules}
                                            onRulesChange={setDefaultValueRules}
                                        />
                                    </TabsContent>
                                </CardContent>
                            </Tabs>
                        </Card>
                    </div>

                    {/* RIGHT COLUMN: FLOW DESIGNER */}
                    <Card className="h-full flex flex-col min-h-[500px]">
                        <CardHeader className="pb-3 border-b">
                            <div className="flex justify-between items-center">
                                <div>
                                    <CardTitle>Diseñador de Flujo (BPMN)</CardTitle>
                                    <CardDescription>Arrastra para reordenar pasos y configurar lógica.</CardDescription>
                                </div>
                                <Button size="sm" variant="outline" onClick={addPool}><PlusCircle className="mr-2 h-3.5 w-3.5" /> Nueva Piscina</Button>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1 bg-muted/20 p-4 space-y-4 overflow-y-auto max-h-[calc(100vh-250px)]">
                            <SortableContext items={pools.map(p => p.id)} strategy={verticalListSortingStrategy}>
                                {pools.map((pool, index) => (
                                    <PoolItem
                                        key={pool.id} pool={pool} index={index} totalPools={pools.length}
                                        handleUpdate={updatePoolOrLane}
                                        handleAddLane={addLane}
                                        handleDelete={deleteItem}
                                        handleAddStep={addStep}
                                        allSteps={allStepsFlat}
                                        formFields={fields}
                                        onUpdateStep={updateStep}
                                        movePool={movePool}
                                        moveLane={moveLane}
                                    />
                                ))}
                            </SortableContext>
                        </CardContent>
                    </Card>
                </main>

                {/* Field Dialog for adding/editing form fields */}
                <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
                    <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                            <DialogTitle>{editingField ? 'Editar Campo' : 'Agregar Campo'}</DialogTitle>
                            <DialogDescription>
                                {editingField ? 'Modifica las propiedades del campo.' : 'Configure las propiedades del campo.'}
                            </DialogDescription>
                        </DialogHeader>
                        <FieldFormDialog
                            field={editingField}
                            onSave={(field) => {
                                if (editingField) {
                                    setFields(fields.map(f => f.id === field.id ? field : f));
                                } else {
                                    setFields([...fields, field]);
                                }
                                setIsFieldDialogOpen(false);
                                setEditingField(null);
                            }}
                            onCancel={() => {
                                setIsFieldDialogOpen(false);
                                setEditingField(null);
                            }}
                        />
                    </DialogContent>
                </Dialog>
            </div>
        </DndContext>
    );
}

// --- Field Form Dialog Component (Full version with all field type configurations) ---
function FieldFormDialog({ field, onSave, onCancel }: {
    field: FormField | null;
    onSave: (field: FormField) => void;
    onCancel: () => void;
}) {
    const [label, setLabel] = useState(field?.label || '');
    const [type, setType] = useState<FormFieldType>(field?.type || 'text');
    const [options, setOptions] = useState<string[]>(field?.options || ['']);
    const isEditing = !!field;

    useEffect(() => {
        if (field) {
            setLabel(field.label);
            setType(field.type);
            setOptions(field.options && field.options.length > 0 ? field.options : ['']);
            // Load table config
            setTableColumns(field.tableColumns || []);
            setMinRows(field.minRows);
            setMaxRows(field.maxRows);
            setShowSummaryRow(field.showSummaryRow || false);
            // Load dynamic select config
            setDynamicSourceType(field.dynamicSource?.type || 'static');
            setMasterListId(field.dynamicSource?.masterListId || '');
            setCollectionPath(field.dynamicSource?.collectionPath || '');
            setLabelField(field.dynamicSource?.labelField || 'name');
            setValueField(field.dynamicSource?.valueField || 'id');
            setCascadeFieldId(field.dynamicSource?.filterConfig?.dependsOn || '');
            setCascadeFilterField(field.dynamicSource?.filterConfig?.filterField || '');
            // Load user identity config
            setUserIdentityDisplayField(field.userIdentityConfig?.displayField || 'both');
            setIncludeTimestamp(field.userIdentityConfig?.includeTimestamp ?? true);
            // Load validation and metadata
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

    // Load master lists
    const { masterLists } = useMasterLists();

    const handleAddOption = () => setOptions([...options, '']);
    const handleOptionChange = (index: number, value: string) => {
        const newOptions = [...options];
        newOptions[index] = value;
        setOptions(newOptions);
    };
    const handleRemoveOption = (index: number) => {
        if (options.length > 1) {
            setOptions(options.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = () => {
        const finalField: FormField = {
            id: field?.id || `field-${Date.now()}`,
            label: label.trim(),
            type
        };

        // Basic options for select/radio
        if (['select', 'radio'].includes(type)) {
            finalField.options = options.map(o => o.trim()).filter(o => o);
        }
        if (type === 'checkbox') {
            finalField.options = [label.trim()];
        }

        // Table configuration
        if (type === 'table') {
            finalField.tableColumns = tableColumns;
            if (minRows) finalField.minRows = minRows;
            if (maxRows) finalField.maxRows = maxRows;
            finalField.showSummaryRow = showSummaryRow;
        }

        // Dynamic select configuration
        if (type === 'dynamic-select') {
            finalField.dynamicSource = {
                type: dynamicSourceType,
                labelField,
                valueField,
            };
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

        // User identity configuration
        if (type === 'user-identity') {
            finalField.userIdentityConfig = {
                displayField: userIdentityDisplayField,
                includeTimestamp,
            };
            finalField.readOnly = true;
        }

        // Validation rules
        if (validations.length > 0) {
            finalField.validations = validations;
        }

        // Additional metadata
        if (placeholder) finalField.placeholder = placeholder;
        if (helpText) finalField.helpText = helpText;

        // Typography configuration
        if (typography && Object.keys(typography).length > 0) {
            finalField.typography = typography;
        }

        // HTML content
        if (type === 'html' && htmlContent) {
            finalField.htmlContent = htmlContent;
        }

        onSave(finalField);
    };

    const needsOptions = ['select', 'radio'].includes(type);

    return (
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-2">
            {/* Basic field info */}
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

            {/* Placeholder and help text */}
            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Placeholder (opcional)</Label>
                    <Input
                        value={placeholder}
                        onChange={(e) => setPlaceholder(e.target.value)}
                        placeholder="Texto de ayuda en el campo"
                    />
                </div>
                <div className="space-y-2">
                    <Label>Texto de ayuda (opcional)</Label>
                    <Input
                        value={helpText}
                        onChange={(e) => setHelpText(e.target.value)}
                        placeholder="Descripción adicional"
                    />
                </div>
            </div>

            {/* Static options for select/radio */}
            {needsOptions && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label>Opciones</Label>
                    <div className="space-y-2">
                        {options.map((option, index) => (
                            <div key={index} className="flex items-center gap-2">
                                <Input
                                    value={option}
                                    onChange={(e) => handleOptionChange(index, e.target.value)}
                                    placeholder={`Opción ${index + 1}`}
                                />
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

            {/* Table configuration */}
            {type === 'table' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Tabla</Label>
                    <TableColumnDialog
                        columns={tableColumns}
                        onColumnsChange={setTableColumns}
                    />
                    <div className="grid grid-cols-3 gap-4 pt-2">
                        <div className="space-y-2">
                            <Label>Filas mínimas</Label>
                            <Input
                                type="number"
                                min={0}
                                value={minRows ?? ''}
                                onChange={(e) => setMinRows(e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Sin límite"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Filas máximas</Label>
                            <Input
                                type="number"
                                min={1}
                                value={maxRows ?? ''}
                                onChange={(e) => setMaxRows(e.target.value ? parseInt(e.target.value) : undefined)}
                                placeholder="Sin límite"
                            />
                        </div>
                        <div className="space-y-2 flex items-end">
                            <label className="flex items-center gap-2 cursor-pointer pb-2">
                                <Checkbox
                                    checked={showSummaryRow}
                                    onCheckedChange={(checked) => setShowSummaryRow(checked === true)}
                                />
                                <span className="text-sm">Mostrar fila resumen</span>
                            </label>
                        </div>
                    </div>
                </div>
            )}

            {/* Dynamic select configuration */}
            {type === 'dynamic-select' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Lista Dinámica</Label>

                    <div className="space-y-2">
                        <Label>Fuente de datos</Label>
                        <Select value={dynamicSourceType} onValueChange={(v) => setDynamicSourceType(v as any)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
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
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione una lista..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {masterLists.map(ml => (
                                        <SelectItem key={ml.id} value={ml.id}>{ml.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}

                    {dynamicSourceType === 'collection' && (
                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-2">
                                <Label>Ruta de colección</Label>
                                <Input
                                    value={collectionPath}
                                    onChange={(e) => setCollectionPath(e.target.value)}
                                    placeholder="p.ej., productos"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Campo para etiqueta</Label>
                                <Input
                                    value={labelField}
                                    onChange={(e) => setLabelField(e.target.value)}
                                    placeholder="name"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Campo para valor</Label>
                                <Input
                                    value={valueField}
                                    onChange={(e) => setValueField(e.target.value)}
                                    placeholder="id"
                                />
                            </div>
                        </div>
                    )}

                    {dynamicSourceType === 'static' && (
                        <div className="space-y-2">
                            <Label>Opciones</Label>
                            <div className="space-y-2">
                                {options.map((option, index) => (
                                    <div key={index} className="flex items-center gap-2">
                                        <Input
                                            value={option}
                                            onChange={(e) => handleOptionChange(index, e.target.value)}
                                            placeholder={`Opción ${index + 1}`}
                                        />
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
                                <Input
                                    value={cascadeFieldId}
                                    onChange={(e) => setCascadeFieldId(e.target.value)}
                                    placeholder="ID del campo padre"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs">Filtrar por campo</Label>
                                <Input
                                    value={cascadeFilterField}
                                    onChange={(e) => setCascadeFilterField(e.target.value)}
                                    placeholder="Campo a filtrar"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* User identity configuration */}
            {type === 'user-identity' && (
                <div className="space-y-4 rounded-md border p-4">
                    <Label className="text-base font-semibold">Configuración de Identidad de Usuario</Label>
                    <p className="text-sm text-muted-foreground">
                        Este campo se completa automáticamente con los datos del usuario que llena el formulario.
                    </p>

                    <div className="space-y-2">
                        <Label>Mostrar</Label>
                        <Select value={userIdentityDisplayField} onValueChange={(v) => setUserIdentityDisplayField(v as any)}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="email">Solo email</SelectItem>
                                <SelectItem value="fullName">Solo nombre completo</SelectItem>
                                <SelectItem value="both">Email y nombre</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer">
                        <Checkbox
                            checked={includeTimestamp}
                            onCheckedChange={(checked) => setIncludeTimestamp(checked === true)}
                        />
                        <span className="text-sm">Incluir fecha y hora de llenado</span>
                    </label>
                </div>
            )}

            {/* HTML field configuration */}
            {type === 'html' && (
                <div className="space-y-4 rounded-md border p-4">
                    <HtmlFieldEditor
                        value={htmlContent}
                        onChange={setHtmlContent}
                    />
                </div>
            )}

            {/* Typography configuration - for all visual field types */}
            {!['user-identity', 'file', 'table'].includes(type) && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label className="text-base font-semibold">Tipografía y Estilo</Label>
                    <TypographyConfig
                        value={typography}
                        onChange={setTypography}
                    />
                </div>
            )}

            {/* Validation configuration */}
            {!['user-identity', 'html'].includes(type) && (
                <div className="space-y-2 rounded-md border p-4">
                    <Label className="text-base font-semibold">Validaciones</Label>
                    <FieldValidationConfig
                        fieldType={type}
                        validations={validations}
                        onValidationsChange={setValidations}
                    />
                </div>
            )}

            <DialogFooter className="pt-4 sticky bottom-0 bg-background">
                <Button variant="outline" onClick={onCancel}>
                    Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={!label.trim() || (type === 'table' && tableColumns.length === 0)}>
                    {isEditing ? 'Guardar Cambios' : 'Añadir Campo'}
                </Button>
            </DialogFooter>
        </div>
    );
}

