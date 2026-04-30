"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2, UserSquare, Pencil, GripVertical, X, AlertTriangle, User, Bell, ChevronsRight, Hash, CaseSensitive, Timer, Siren, ArrowUp, ArrowDown, Save, Globe, Lock, Users, Building2, Briefcase, UserCog, Eye, EyeOff } from "lucide-react";
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
import { useCollection, useFirestore, useMemoFirebase, useAuth } from "@/firebase";
import { addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { User as UserType, UserRole } from '@/types/auth.types';
import { VisibilityRulesBuilder, FieldValidationConfig, TableColumnDialog, useMasterLists, FieldLayoutEditor, GatewayRoutingConfig, DefaultValueRulesBuilder, TypographyConfig, HtmlFieldEditor, TimerStepConfig } from "@/components/form-fields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import { CopilotDialog } from "./CopilotDialog";
import { FieldFormDialog } from "./FieldFormDialog";
import { RuleDisplay, RuleBuilderDialog } from "./RuleBuilder";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType, FormFieldType, RuleOperator, RequestPriority, EscalationPolicy, VisibilityRule, TableColumnDefinition, DynamicSelectSource, UserIdentityConfig, ValidationRule, Template, FieldLayoutConfig, DefaultValueRule, TypographyConfig as TypographyConfigType, InitiatorPermission } from "@/types/workflow.types";

// --- Helper Components ---

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


function SortableField({ field, onRemove, onEdit }: { field: FormField, onRemove: (id: string) => void, onEdit: (field: FormField) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id, data: { type: 'field' } });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const fieldTypeLabels: Record<FormFieldType, string> = {
        text: 'Texto', textarea: 'Ãrea de texto', date: 'Fecha', number: 'NÃºmero',
        select: 'Desplegable', checkbox: 'Casilla', radio: 'Opciones', file: 'Archivo',
        table: 'Tabla', 'dynamic-select': 'Desplegable dinÃ¡mico', 'user-identity': 'Identidad usuario', email: 'Email', html: 'HTML'
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
        <div ref={setNodeRef} style={style} className="group flex items-start gap-3 rounded-md p-2 border text-sm bg-card hover:bg-muted liquid-node">
            <button {...attributes} {...listeners} className="cursor-grab p-1 mt-1"><GripVertical className="h-4 w-4 text-muted-foreground" /></button>
            <BpmnIcon type={step.type} className="h-4 w-4 mt-1.5" />
            <div className="flex-1 space-y-1">
                <Input value={step.name} onChange={(e) => onUpdateStep(poolId, laneId, step.id, { name: e.target.value })} className="h-8 border-none bg-transparent p-0" placeholder="Nombre del paso" />
                <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                    <Popover>
                        <PopoverTrigger asChild><Button variant="ghost" size="sm" className="h-auto p-1"><UserSquare className="h-3.5 w-3.5 mr-1" /><span className="text-xs truncate max-w-[80px]">{step.assigneeRole || "Asignar"}</span><Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" /></Button></PopoverTrigger>
                        <PopoverContent className="w-auto p-2"><div className="space-y-2"><Label className="text-xs">Rol de AsignaciÃ³n</Label><Input value={step.assigneeRole || ''} onChange={(e) => onUpdateStep(poolId, laneId, step.id, { assigneeRole: e.target.value })} className="h-8" /></div></PopoverContent>
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
                                        <Label className="text-xs">PolÃ­tica de Escalado por SLA</Label>
                                        <div className="space-y-2">
                                            <Label htmlFor={`esc-action-${step.id}`} className="text-xs font-normal">AcciÃ³n</Label>
                                            <Select
                                                value={step.escalationPolicy?.action}
                                                onValueChange={(val) => updateEscalationForSla({ action: val as 'NOTIFY' | 'REASSIGN' })}
                                            >
                                                <SelectTrigger id={`esc-action-${step.id}`} className="h-8"><SelectValue placeholder="Seleccionar acciÃ³n..." /></SelectTrigger>
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
                    <DropdownMenuTrigger asChild><Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4" />AÃ±adir</Button></DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Nueva Tarea", 'task')}><BpmnIcon type="task" className="mr-2" /> Tarea</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Exclusivo", 'gateway-exclusive')}><BpmnIcon type="gateway-exclusive" className="mr-2" /> Gateway X</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Paralelo", 'gateway-parallel')}><BpmnIcon type="gateway-parallel" className="mr-2" /> Gateway +</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Gateway Inclusivo", 'gateway-inclusive')}><BpmnIcon type="gateway-inclusive" className="mr-2" /> Gateway O</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Sincronizador P.", 'gateway-parallel-join')}><BpmnIcon type="gateway-parallel" className="mr-2" /> Unir Paralelo</DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStep(poolId, lane.id, "Sincronizador I.", 'gateway-inclusive-join')}><BpmnIcon type="gateway-inclusive" className="mr-2" /> Unir Inclusivo</DropdownMenuItem>
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
                <Button variant="ghost" size="sm" onClick={() => handleAddLane(pool.id)}><PlusCircle className="mr-2 h-4 w-4" /> AÃ±adir Carril</Button>
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
    const auth = useAuth();
    const user = auth?.currentUser;

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

    // Publication and Permissions
    const [templateStatus, setTemplateStatus] = useState<'draft' | 'published' | 'archived'>(initialData?.status || 'draft');
    const [initiatorPermissions, setInitiatorPermissions] = useState<InitiatorPermission>(
        initialData?.initiatorPermissions || { type: 'all' }
    );

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
            setTemplateStatus(initialData.status || 'draft');
            setInitiatorPermissions(initialData.initiatorPermissions || { type: 'all' });
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
                status: templateStatus,
                initiatorPermissions,
                updatedAt: new Date().toISOString()
            };

            if (mode === 'create') {
                templateData.createdAt = new Date().toISOString();
                templateData.createdBy = user?.uid || 'Sistema'; // Fixed to use actual ID
                templateData.status = 'draft'; // New templates start as draft
                templateData.version = 1;

                // Logic to create document (using non-blocking for speed, but routing needs ID)
                // Since we need ID to redirect, we use addDocumentNonBlocking which returns REF.
                const docRef = await addDocumentNonBlocking(collection(firestore, 'request_templates'), templateData);
                toast({ title: 'Ã‰xito', description: 'Plantilla creada correctamente' });
                router.push('/templates');
            } else {
                if (!templateId) throw new Error("No ID for edit");
                // Update
                const docRef = doc(firestore, 'request_templates', templateId);
                await updateDocumentNonBlocking(docRef, templateData);
                toast({ title: 'Ã‰xito', description: 'Plantilla actualizada' });
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
    const [isPublishing, setIsPublishing] = useState(false);

    // Publish/Unpublish handler
    const handlePublish = async () => {
        if (!templateId && mode === 'edit') {
            toast({ variant: 'destructive', title: 'Error', description: 'Guarda la plantilla primero' });
            return;
        }

        // Validate before publishing
        const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));
        if (templateStatus === 'draft') {
            if (!templateName.trim()) {
                toast({ variant: 'destructive', title: 'Error', description: 'El nombre es obligatorio para publicar' });
                return;
            }
            if (allSteps.length === 0) {
                toast({ variant: 'destructive', title: 'Error', description: 'Debe haber al menos un paso en el proceso para publicar' });
                return;
            }
            if (fields.length === 0) {
                toast({ variant: 'destructive', title: 'Error', description: 'Debe haber al menos un campo en el formulario para publicar' });
                return;
            }
        }

        setIsPublishing(true);
        try {
            const newStatus = templateStatus === 'published' ? 'draft' : 'published';

            if (mode === 'create') {
                // First save the template, then publish
                const templateData: any = {
                    name: templateName,
                    description: templateDescription,
                    fields,
                    rules,
                    visibilityRules,
                    pools,
                    steps: allSteps,
                    fieldLayout,
                    defaultValueRules,
                    status: newStatus,
                    initiatorPermissions,
                    createdAt: new Date().toISOString(),
                    createdBy: 'me',
                    updatedAt: new Date().toISOString(),
                    publishedAt: newStatus === 'published' ? new Date().toISOString() : null,
                    version: 1,
                };
                await addDocumentNonBlocking(collection(firestore, 'request_templates'), templateData);
                toast({
                    title: newStatus === 'published' ? 'Â¡Publicada!' : 'Despublicada',
                    description: newStatus === 'published'
                        ? 'La plantilla estÃ¡ ahora disponible en "Nueva Solicitud"'
                        : 'La plantilla ya no estÃ¡ visible en "Nueva Solicitud"'
                });
                router.push('/templates');
            } else {
                if (!templateId) throw new Error("No ID for edit");
                const docRef = doc(firestore, 'request_templates', templateId);
                await updateDocumentNonBlocking(docRef, {
                    status: newStatus,
                    publishedAt: newStatus === 'published' ? new Date().toISOString() : null,
                    updatedAt: new Date().toISOString()
                });
                setTemplateStatus(newStatus);
                toast({
                    title: newStatus === 'published' ? 'Â¡Publicada!' : 'Despublicada',
                    description: newStatus === 'published'
                        ? 'La plantilla estÃ¡ ahora disponible en "Nueva Solicitud"'
                        : 'La plantilla ya no estÃ¡ visible en "Nueva Solicitud"'
                });
            }
        } catch (error) {
            console.error(error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo cambiar el estado de publicaciÃ³n' });
        } finally {
            setIsPublishing(false);
        }
    };

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

    // Rules dialog state
    const [editingRule, setEditingRule] = useState<Rule | null>(null);
    const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);

    // Load users for rule builder and initiator permissions
    const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
    const { data: users } = useCollection<UserType>(usersQuery);

    // Load positions for initiator permissions
    const positionsQuery = useMemoFirebase(() => collection(firestore, 'positions'), [firestore]);
    const { data: positions } = useCollection<{ id: string; name: string; department?: string }>(positionsQuery);

    // Load departments for initiator permissions
    const departmentsQuery = useMemoFirebase(() => collection(firestore, 'departments'), [firestore]);
    const { data: departments } = useCollection<{ id: string; name: string; parentId?: string }>(departmentsQuery);

    // Load roles from admin config or use default roles
    const rolesQuery = useMemoFirebase(() => collection(firestore, 'roles'), [firestore]);
    const { data: rolesData } = useCollection<{ id: string; name: string }>(rolesQuery);
    const roles = rolesData && rolesData.length > 0 ? rolesData : [
        { id: 'Admin', name: 'Administrador' },
        { id: 'Member', name: 'Miembro' },
        { id: 'Manager', name: 'Gerente' },
    ];

    // Rule handlers
    const handleAddRule = (rule: Omit<Rule, 'id'>) => {
        setRules([...rules, { ...rule, id: `rule-${Date.now()}` }]);
        setIsRuleDialogOpen(false);
    };

    const handleUpdateRule = (updatedRule: Rule) => {
        setRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
        setEditingRule(null);
        setIsRuleDialogOpen(false);
    };

    const handleOpenRuleDialog = (rule: Rule | null) => {
        setEditingRule(rule);
        setIsRuleDialogOpen(true);
    };

    const handleRemoveRule = (id: string) => {
        setRules(rules.filter((rule) => rule.id !== id));
    };

    // --- RENDER ---
    const allStepsFlat = pools.flatMap(p => p.lanes.flatMap(l => l.steps));

    return (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between p-4 sm:p-6">
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-bold tracking-tight">
                            {mode === 'create' ? 'Crear Nueva Plantilla' : 'Editar Plantilla'}
                        </h1>
                        <Badge
                            variant={templateStatus === 'published' ? 'default' : 'secondary'}
                            className={cn(
                                templateStatus === 'published' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100' : ''
                            )}
                        >
                            {templateStatus === 'published' ? (
                                <><Globe className="mr-1 h-3 w-3" /> Publicada</>
                            ) : (
                                <><Lock className="mr-1 h-3 w-3" /> Borrador</>
                            )}
                        </Badge>
                        <CopilotDialog onApply={applyAiDraft} />
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" asChild><Link href="/templates">Cancelar</Link></Button>
                        <Button variant="outline" onClick={handlePublish} disabled={isPublishing}>
                            {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {templateStatus === 'published' ? (
                                <><EyeOff className="mr-2 h-4 w-4" /> Despublicar</>
                            ) : (
                                <><Eye className="mr-2 h-4 w-4" /> Publicar</>
                            )}
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving}>
                            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Guardar Plantilla
                        </Button>
                    </div>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
                        {/* Left sidebar - Basic Info */}
                        <div className="space-y-4">
                            <Card>
                                <CardContent className="p-4">
                                    <div className="space-y-4">
                                        <div>
                                            <Label htmlFor="template-name">Nombre de la Plantilla</Label>
                                            <Input
                                                id="template-name"
                                                placeholder="p.ej., Orden de Compra"
                                                value={templateName}
                                                onChange={(e) => setTemplateName(e.target.value)}
                                            />
                                        </div>
                                        <div>
                                            <Label htmlFor="template-description">DescripciÃ³n</Label>
                                            <Textarea
                                                id="template-description"
                                                placeholder="DescripciÃ³n del flujo de trabajo."
                                                value={templateDescription}
                                                onChange={(e) => setTemplateDescription(e.target.value)}
                                                rows={3}
                                            />
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                            <Card className="p-4">
                                <div className="text-sm text-muted-foreground space-y-2">
                                    <p><strong>Campos:</strong> {fields.length}</p>
                                    <p><strong>Pasos:</strong> {allStepsFlat.length}</p>
                                    <p><strong>Reglas:</strong> {rules.length}</p>
                                </div>
                            </Card>
                        </div>

                        {/* Right area - Tabs */}
                        <Tabs defaultValue="formulario" className="w-full">
                            <TabsList className="grid w-full grid-cols-4">
                                <TabsTrigger value="formulario">Formulario</TabsTrigger>
                                <TabsTrigger value="reglas">Reglas</TabsTrigger>
                                <TabsTrigger value="flujo">Flujo de Trabajo</TabsTrigger>
                                <TabsTrigger value="config">ConfiguraciÃ³n</TabsTrigger>
                            </TabsList>

                            {/* Tab: Formulario */}
                            <TabsContent value="formulario" className="space-y-4 mt-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Campos del Formulario</CardTitle>
                                        <CardDescription>
                                            Defina los datos que se recopilarÃ¡n para esta plantilla.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2 rounded-md border p-4 min-h-[120px]">
                                            {fields.length === 0 ? (
                                                <p className="text-center text-sm text-muted-foreground py-4">AÃ±ada campos a su formulario.</p>
                                            ) : (
                                                <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy} id="form-fields">
                                                    {fields.map((field) => (
                                                        <SortableField key={field.id} field={field}
                                                            onRemove={(id) => setFields(fields.filter(f => f.id !== id))}
                                                            onEdit={(f) => { setEditingField(f); setIsFieldDialogOpen(true); }}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            )}
                                        </div>
                                        <Button variant="outline" className="w-full" onClick={() => { setEditingField(null); setIsFieldDialogOpen(true); }}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> AÃ±adir Campo
                                        </Button>
                                    </CardContent>
                                </Card>

                                {/* Field Layout Editor */}
                                {fields.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>DiseÃ±o del Formulario</CardTitle>
                                            <CardDescription>
                                                Configure la disposiciÃ³n de los campos en filas y columnas para mostrarlos lado a lado.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            {fields.length === 1 ? (
                                                <p className="text-sm text-muted-foreground py-4 text-center">
                                                    Agregue mÃ¡s campos para configurar el layout. Con mÃºltiples campos puede colocarlos lado a lado.
                                                </p>
                                            ) : (
                                                <FieldLayoutEditor
                                                    fields={fields}
                                                    layout={fieldLayout}
                                                    onLayoutChange={setFieldLayout}
                                                />
                                            )}
                                        </CardContent>
                                    </Card>
                                )}
                            </TabsContent>

                            {/* Tab: Reglas */}
                            <TabsContent value="reglas" className="space-y-4 mt-4">
                                {fields.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Reglas de Visibilidad</CardTitle>
                                            <CardDescription>
                                                Configure cuÃ¡ndo mostrar u ocultar campos.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <VisibilityRulesBuilder
                                                fields={fields}
                                                rules={visibilityRules}
                                                onRulesChange={setVisibilityRules}
                                            />
                                        </CardContent>
                                    </Card>
                                )}

                                {fields.length > 0 && (
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Valores por Defecto Condicionales</CardTitle>
                                            <CardDescription>
                                                Configure valores que se asignan automÃ¡ticamente basÃ¡ndose en condiciones.
                                            </CardDescription>
                                        </CardHeader>
                                        <CardContent>
                                            <DefaultValueRulesBuilder
                                                fields={fields}
                                                rules={defaultValueRules}
                                                onRulesChange={setDefaultValueRules}
                                            />
                                        </CardContent>
                                    </Card>
                                )}

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Motor de Reglas de Negocio</CardTitle>
                                        <CardDescription>Defina la lÃ³gica condicional para automatizar decisiones.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-3">
                                            {rules.length === 0 && (
                                                <div className="text-center text-sm text-muted-foreground py-4 space-y-1">
                                                    <p>No hay reglas definidas.</p>
                                                    <p className="text-xs">Las reglas permiten enrutar el flujo basado en resultados o datos.</p>
                                                </div>
                                            )}
                                            {rules.map((rule) => (
                                                <RuleDisplay key={rule.id} rule={rule} fields={fields} pools={pools} users={users || []} onRemove={handleRemoveRule} onEdit={handleOpenRuleDialog} />
                                            ))}
                                        </div>
                                        <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
                                            <DialogTrigger asChild>
                                                <Button variant="outline" className="w-full" onClick={() => handleOpenRuleDialog(null)}>
                                                    <PlusCircle className="mr-2 h-4 w-4" /> AÃ±adir Regla
                                                </Button>
                                            </DialogTrigger>
                                            <RuleBuilderDialog
                                                fields={fields}
                                                steps={allStepsFlat}
                                                users={users || []}
                                                onAddRule={handleAddRule}
                                                onUpdateRule={handleUpdateRule}
                                                ruleToEdit={editingRule}
                                                onClose={() => setIsRuleDialogOpen(false)}
                                            />
                                        </Dialog>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Tab: Flujo de Trabajo */}
                            <TabsContent value="flujo" className="mt-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Lienzo del Flujo de Trabajo (BPMN)</CardTitle>
                                        <CardDescription>
                                            DiseÃ±e y ordene las etapas de su proceso usando Piscinas (Pools) y Carriles (Lanes).
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-4 rounded-md bg-muted/50 p-4 min-h-[300px] glass-panel">
                                            <SortableContext items={pools.map(p => p.id)} strategy={verticalListSortingStrategy} id="pools">
                                                {pools.map((pool, index) => (
                                                    <PoolItem
                                                        key={pool.id}
                                                        pool={pool}
                                                        index={index}
                                                        totalPools={pools.length}
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
                                        </div>
                                        <Button variant="outline" className="w-full mt-4" onClick={addPool}>
                                            <Library className="mr-2 h-4 w-4" /> AÃ±adir Piscina
                                        </Button>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Tab: ConfiguraciÃ³n */}
                            <TabsContent value="config" className="space-y-4 mt-4">
                                <Card>
                                    <CardHeader>
                                        <CardTitle>Â¿QuiÃ©n puede iniciar esta solicitud?</CardTitle>
                                        <CardDescription>
                                            Configure quiÃ©n tiene permiso para crear nuevas solicitudes usando esta plantilla.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-4">
                                            <div className="space-y-2">
                                                <Label>Tipo de permiso</Label>
                                                <Select
                                                    value={initiatorPermissions.type}
                                                    onValueChange={(v) => setInitiatorPermissions({ type: v as InitiatorPermission['type'] })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccione quiÃ©n puede iniciar..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">
                                                            <div className="flex items-center gap-2">
                                                                <Globe className="h-4 w-4" />
                                                                <span>Todos los usuarios</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="user">
                                                            <div className="flex items-center gap-2">
                                                                <User className="h-4 w-4" />
                                                                <span>Usuarios especÃ­ficos</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="role">
                                                            <div className="flex items-center gap-2">
                                                                <UserCog className="h-4 w-4" />
                                                                <span>Por rol</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="position">
                                                            <div className="flex items-center gap-2">
                                                                <Briefcase className="h-4 w-4" />
                                                                <span>Por puesto</span>
                                                            </div>
                                                        </SelectItem>
                                                        <SelectItem value="department">
                                                            <div className="flex items-center gap-2">
                                                                <Building2 className="h-4 w-4" />
                                                                <span>Por departamento/Ã¡rea</span>
                                                            </div>
                                                        </SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Selector de usuarios especÃ­ficos */}
                                            {initiatorPermissions.type === 'user' && (
                                                <div className="space-y-2 rounded-md border p-4">
                                                    <Label>Seleccionar usuarios</Label>
                                                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                        {users?.map(user => (
                                                            <label key={user.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                                                                <Checkbox
                                                                    checked={initiatorPermissions.userIds?.includes(user.id) || false}
                                                                    onCheckedChange={(checked) => {
                                                                        const currentIds = initiatorPermissions.userIds || [];
                                                                        setInitiatorPermissions({
                                                                            ...initiatorPermissions,
                                                                            userIds: checked
                                                                                ? [...currentIds, user.id]
                                                                                : currentIds.filter(id => id !== user.id)
                                                                        });
                                                                    }}
                                                                />
                                                                <span className="text-sm">{user.fullName}</span>
                                                                <span className="text-xs text-muted-foreground">({user.email})</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                    {(initiatorPermissions.userIds?.length || 0) > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-2">
                                                            {initiatorPermissions.userIds?.length} usuario(s) seleccionado(s)
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Selector de roles */}
                                            {initiatorPermissions.type === 'role' && (
                                                <div className="space-y-2 rounded-md border p-4">
                                                    <Label>Seleccionar roles</Label>
                                                    <div className="space-y-2">
                                                        {roles.map(role => (
                                                            <label key={role.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                                                                <Checkbox
                                                                    checked={initiatorPermissions.roleIds?.includes(role.id) || false}
                                                                    onCheckedChange={(checked) => {
                                                                        const currentIds = initiatorPermissions.roleIds || [];
                                                                        setInitiatorPermissions({
                                                                            ...initiatorPermissions,
                                                                            roleIds: checked
                                                                                ? [...currentIds, role.id]
                                                                                : currentIds.filter(id => id !== role.id)
                                                                        });
                                                                    }}
                                                                />
                                                                <span className="text-sm">{role.name}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Selector de puestos */}
                                            {initiatorPermissions.type === 'position' && (
                                                <div className="space-y-2 rounded-md border p-4">
                                                    <Label>Seleccionar puestos</Label>
                                                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                        {positions?.map(position => (
                                                            <label key={position.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                                                                <Checkbox
                                                                    checked={initiatorPermissions.positionIds?.includes(position.id) || false}
                                                                    onCheckedChange={(checked) => {
                                                                        const currentIds = initiatorPermissions.positionIds || [];
                                                                        setInitiatorPermissions({
                                                                            ...initiatorPermissions,
                                                                            positionIds: checked
                                                                                ? [...currentIds, position.id]
                                                                                : currentIds.filter(id => id !== position.id)
                                                                        });
                                                                    }}
                                                                />
                                                                <span className="text-sm">{position.name}</span>
                                                            </label>
                                                        ))}
                                                        {(!positions || positions.length === 0) && (
                                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                                No hay puestos configurados. Vaya a HCM â†’ Admin â†’ Puestos para crearlos.
                                                            </p>
                                                        )}
                                                    </div>
                                                    {(initiatorPermissions.positionIds?.length || 0) > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-2">
                                                            {initiatorPermissions.positionIds?.length} puesto(s) seleccionado(s)
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {/* Selector de departamentos/Ã¡reas */}
                                            {initiatorPermissions.type === 'department' && (
                                                <div className="space-y-2 rounded-md border p-4">
                                                    <Label>Seleccionar departamentos o Ã¡reas</Label>
                                                    <div className="space-y-2 max-h-[200px] overflow-y-auto">
                                                        {departments?.map(dept => (
                                                            <label key={dept.id} className="flex items-center gap-2 cursor-pointer hover:bg-muted p-2 rounded">
                                                                <Checkbox
                                                                    checked={initiatorPermissions.departmentIds?.includes(dept.id) || false}
                                                                    onCheckedChange={(checked) => {
                                                                        const currentIds = initiatorPermissions.departmentIds || [];
                                                                        setInitiatorPermissions({
                                                                            ...initiatorPermissions,
                                                                            departmentIds: checked
                                                                                ? [...currentIds, dept.id]
                                                                                : currentIds.filter(id => id !== dept.id)
                                                                        });
                                                                    }}
                                                                />
                                                                <span className="text-sm">{dept.name}</span>
                                                                {dept.parentId && (
                                                                    <span className="text-xs text-muted-foreground">(Sub-Ã¡rea)</span>
                                                                )}
                                                            </label>
                                                        ))}
                                                        {(!departments || departments.length === 0) && (
                                                            <p className="text-sm text-muted-foreground text-center py-4">
                                                                No hay departamentos configurados. Vaya a HCM â†’ Admin â†’ Departamentos para crearlos.
                                                            </p>
                                                        )}
                                                    </div>
                                                    {(initiatorPermissions.departmentIds?.length || 0) > 0 && (
                                                        <p className="text-xs text-muted-foreground mt-2">
                                                            {initiatorPermissions.departmentIds?.length} departamento(s) seleccionado(s)
                                                        </p>
                                                    )}
                                                </div>
                                            )}

                                            {initiatorPermissions.type === 'all' && (
                                                <div className="rounded-md bg-muted/50 p-4 text-sm text-muted-foreground">
                                                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                                    <p className="text-center">Cualquier usuario autenticado podrÃ¡ crear solicitudes usando esta plantilla.</p>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>

                                <Card>
                                    <CardHeader>
                                        <CardTitle>Estado de PublicaciÃ³n</CardTitle>
                                        <CardDescription>
                                            Las plantillas en borrador no aparecen en "Nueva Solicitud".
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="flex items-center justify-between p-4 rounded-md border">
                                            <div className="flex items-center gap-3">
                                                {templateStatus === 'published' ? (
                                                    <div className="p-2 rounded-full bg-green-100 dark:bg-green-900">
                                                        <Globe className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                    </div>
                                                ) : (
                                                    <div className="p-2 rounded-full bg-muted">
                                                        <Lock className="h-5 w-5 text-muted-foreground" />
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-medium">
                                                        {templateStatus === 'published' ? 'Publicada' : 'Borrador'}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">
                                                        {templateStatus === 'published'
                                                            ? 'La plantilla estÃ¡ visible y disponible para crear solicitudes'
                                                            : 'La plantilla solo es visible para administradores'
                                                        }
                                                    </p>
                                                </div>
                                            </div>
                                            <Button
                                                variant={templateStatus === 'published' ? 'outline' : 'default'}
                                                onClick={handlePublish}
                                                disabled={isPublishing}
                                            >
                                                {isPublishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                                {templateStatus === 'published' ? 'Despublicar' : 'Publicar ahora'}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                        </Tabs>
                    </div>
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

