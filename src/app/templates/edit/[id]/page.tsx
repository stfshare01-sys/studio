

"use client";

import { useState, useEffect } from "react";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2, UserSquare, Pencil, GripVertical, X, AlertTriangle, User, Bell, ChevronsRight, Hash, CaseSensitive, Timer, Siren, ArrowUp, ArrowDown } from "lucide-react";
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
import { useCollection, useDoc, useFirestore, useMemoFirebase, updateDocumentNonBlocking } from "@/firebase";
import { collection, doc } from "firebase/firestore";
import { useRouter, useParams } from "next/navigation";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType, FormFieldType, RuleOperator, User as UserType, RequestPriority, UserRole, EscalationPolicy, VisibilityRule, TableColumnDefinition, DynamicSelectSource, UserIdentityConfig, ValidationRule, Template, FieldLayoutConfig, DefaultValueRule, TypographyConfig as TypographyConfigType } from "@/lib/types";
import { VisibilityRulesBuilder, FieldValidationConfig, TableColumnDialog, useMasterLists, FieldLayoutEditor, GatewayRoutingConfig, DefaultValueRulesBuilder, TypographyConfig, HtmlFieldEditor, TimerStepConfig } from "@/components/form-fields";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";


const BpmnIcon = ({ type, className }: { type: WorkflowStepType, className?: string }) => {
    switch (type) {
        case 'task':
            return <CheckCircle className={cn("h-5 w-5 text-sky-500", className)} />;
        case 'gateway-exclusive':
            return <GitMerge className={cn("h-5 w-5 text-amber-500", className)} />;
        case 'gateway-parallel':
            return <GitFork className={cn("h-5 w-5 text-purple-500", className)} />;
        case 'gateway-inclusive':
            return <GitFork className={cn("h-5 w-5 text-green-500", className)} />;
        case 'timer':
            return <Timer className={cn("h-5 w-5 text-orange-500", className)} />;
        default:
            return null;
    }
};

type Lane = {
    id: string;
    name: string;
    steps: WorkflowStepDefinition[];
};

type Pool = {
    id: string;
    name: string;
    lanes: Lane[];
};


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
                    <DialogDescription>
                        Describe el proceso que quieres modelar en lenguaje natural. La IA generará un borrador del diagrama, campos y reglas por ti.
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-4">
                    <Label htmlFor="process-description" className="sr-only">Descripción del Proceso</Label>
                    <Textarea 
                        id="process-description"
                        placeholder='Ej: "Crear un flujo para aprobar facturas. Si la factura supera los $5,000, necesita aprobación del gerente en el departamento de Finanzas. De lo contrario, solo requiere la aprobación del analista financiero. El proceso lo inicia cualquiera. Se necesita un campo para el nivel de prioridad (Alta, Media, Baja) y un campo para adjuntar la factura en PDF."'
                        rows={6}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={isLoading}
                    />
                </div>
                <DialogFooter>
                    <DialogClose asChild>
                        <Button variant="ghost" disabled={isLoading}>Cancelar</Button>
                    </DialogClose>
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
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
        id: field.id,
        data: { type: 'field' }
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const fieldTypeLabels: Record<FormFieldType, string> = {
        text: 'Texto', textarea: 'Área de texto', date: 'Fecha', number: 'Número',
        select: 'Desplegable', checkbox: 'Casilla', radio: 'Opciones', file: 'Archivo',
        table: 'Tabla', 'dynamic-select': 'Desplegable dinámico', 'user-identity': 'Identidad usuario', email: 'Email', html: 'HTML'
    };

    return (
        <div ref={setNodeRef} style={style} className="group flex items-center gap-2 rounded-md p-3 bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex-1 font-medium">{field.label}</div>
            <div className="text-sm text-muted-foreground">({fieldTypeLabels[field.type]})</div>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onEdit(field)}>
                <Pencil className="h-4 w-4 text-primary" />
                <span className="sr-only">Editar campo</span>
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => onRemove(field.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="sr-only">Eliminar campo</span>
            </Button>
        </div>
    );
}

function SortableStep({
    step,
    poolId,
    laneId,
    onUpdateStep,
    onDeleteStep,
    allSteps,
    formFields
}: {
    step: WorkflowStepDefinition,
    poolId: string,
    laneId: string,
    onUpdateStep: (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => void,
    onDeleteStep: (poolId: string, laneId: string, stepId: string) => void,
    allSteps: WorkflowStepDefinition[],
    formFields: FormField[]
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ 
        id: step.id,
        data: { type: 'step' }
    });
    const style = { transform: CSS.Transform.toString(transform), transition };
    
    const [newOutcome, setNewOutcome] = useState('');

    const addOutcome = () => {
        if(newOutcome.trim()) {
            const updatedOutcomes = [...(step.outcomes || []), newOutcome.trim()];
            onUpdateStep(poolId, laneId, step.id, { outcomes: updatedOutcomes });
            setNewOutcome('');
        }
    }
    
    const removeOutcome = (index: number) => {
        const updatedOutcomes = (step.outcomes || []).filter((_, i) => i !== index);
        onUpdateStep(poolId, laneId, step.id, { outcomes: updatedOutcomes });
    };

    const updateEscalationPolicy = (updates: Partial<EscalationPolicy>) => {
        onUpdateStep(poolId, laneId, step.id, { escalationPolicy: { ...step.escalationPolicy, ...updates } as EscalationPolicy });
    }

    return (
        <div ref={setNodeRef} style={style} className="group flex items-start gap-3 rounded-md p-2 border text-sm bg-card hover:bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1 mt-1">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <BpmnIcon type={step.type} className="h-4 w-4 mt-1.5" />
            <div className="flex-1 space-y-1">
                <Input 
                    value={step.name}
                    onChange={(e) => onUpdateStep(poolId, laneId, step.id, { name: e.target.value })}
                    className="h-8 border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-0"
                    placeholder="Nombre del paso"
                />
                 <div className="flex flex-wrap items-center gap-1 text-muted-foreground">
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-auto p-1">
                                <UserSquare className="h-3.5 w-3.5 mr-1" />
                                <span className="text-xs truncate max-w-[80px]">{step.assigneeRole || "Asignar Rol"}</span>
                                <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-2">
                            <div className="space-y-2">
                                <Label htmlFor={`role-${step.id}`} className="text-xs">Rol de Asignación</Label>
                                <Input
                                    id={`role-${step.id}`}
                                    placeholder="Ej: Finanzas"
                                    value={step.assigneeRole || ''}
                                    onChange={(e) => onUpdateStep(poolId, laneId, step.id, { assigneeRole: e.target.value })}
                                    className="h-8"
                                />
                            </div>
                        </PopoverContent>
                    </Popover>

                    {step.type === 'task' && (
                        <>
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto p-1">
                                    <GitBranch className="h-3.5 w-3.5 mr-1" />
                                    <span className="text-xs">{step.outcomes?.length || 0} Salidas</span>
                                    <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                                </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-60 p-2">
                                <div className="space-y-2">
                                    <Label className="text-xs">Resultados de la Tarea (para decisiones)</Label>
                                    <div className="flex flex-wrap gap-1">
                                        {(step.outcomes || []).map((o, i) => (
                                            <Badge key={i} variant="secondary" className="group/badge relative">
                                                {o}
                                                <button onClick={() => removeOutcome(i)} className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/badge:opacity-100 flex items-center justify-center p-0.5">
                                                    <X className="h-2 w-2" />
                                                </button>
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex gap-1">
                                        <Input placeholder="Ej: Aprobado" value={newOutcome} onChange={e => setNewOutcome(e.target.value)} className="h-8"/>
                                        <Button size="sm" onClick={addOutcome}>Añadir</Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground pt-1">Define los posibles resultados para esta tarea si precede a un Gateway Exclusivo.</p>
                                </div>
                            </PopoverContent>
                        </Popover>
                        
                        <Popover>
                            <PopoverTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto p-1">
                                    <Timer className="h-3.5 w-3.5 mr-1" />
                                    <span className="text-xs truncate max-w-[80px]">SLA: {step.slaHours ? `${step.slaHours}h` : 'N/A'}</span>
                                    <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                                </Button>
                            </PopoverTrigger>
                             <PopoverContent className="w-auto p-2">
                                <div className="space-y-2">
                                    <Label htmlFor={`sla-${step.id}`} className="text-xs">SLA (horas)</Label>
                                    <Input
                                        id={`sla-${step.id}`}
                                        type="number"
                                        placeholder="Ej: 8"
                                        value={step.slaHours || ''}
                                        onChange={(e) => onUpdateStep(poolId, laneId, step.id, { slaHours: e.target.value ? Number(e.target.value) : undefined })}
                                        className="h-8"
                                    />
                                </div>
                            </PopoverContent>
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
                                            onValueChange={(val) => updateEscalationPolicy({ action: val as 'NOTIFY' | 'REASSIGN' })}
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
                                                <div className="flex items-center gap-2"><Checkbox id={`esc-notify-assignee-${step.id}`} checked={step.escalationPolicy?.notify?.includes('assignee')} onCheckedChange={(checked) => updateEscalationPolicy({ notify: checked ? [...(step.escalationPolicy?.notify || []), 'assignee'] : (step.escalationPolicy?.notify || []).filter(n => n !== 'assignee') })} /><Label htmlFor={`esc-notify-assignee-${step.id}`} className="text-xs font-normal">Asignado Actual</Label></div>
                                                <div className="flex items-center gap-2"><Checkbox id={`esc-notify-manager-${step.id}`} checked={step.escalationPolicy?.notify?.includes('manager')} onCheckedChange={(checked) => updateEscalationPolicy({ notify: checked ? [...(step.escalationPolicy?.notify || []), 'manager'] : (step.escalationPolicy?.notify || []).filter(n => n !== 'manager') })} /><Label htmlFor={`esc-notify-manager-${step.id}`} className="text-xs font-normal">Gerente del Asignado</Label></div>
                                            </div>
                                        </div>
                                    )}
                                    {step.escalationPolicy?.action === 'REASSIGN' && (
                                        <div className="space-y-2 pl-2 border-l-2 ml-1">
                                            <Label htmlFor={`esc-target-${step.id}`} className="text-xs font-normal">Reasignar a Rol</Label>
                                            <Input id={`esc-target-${step.id}`} placeholder="Ej: Gerentes de TI" value={step.escalationPolicy.targetRole || ''} onChange={e => updateEscalationPolicy({ targetRole: e.target.value })} className="h-8" />
                                        </div>
                                    )}
                                </div>
                            </PopoverContent>
                        </Popover>
                        </>
                    )}

                    {/* Gateway configuration */}
                    {(step.type === 'gateway-exclusive' || step.type === 'gateway-parallel' || step.type === 'gateway-inclusive') && (
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-auto p-1">
                                    <GitBranch className="h-3.5 w-3.5 mr-1" />
                                    <span className="text-xs">Configurar Rutas</span>
                                    <Pencil className="h-3 w-3 ml-1 opacity-0 group-hover:opacity-100" />
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                    <DialogTitle>
                                        Configurar {step.type === 'gateway-exclusive' ? 'Gateway Exclusivo' :
                                                    step.type === 'gateway-parallel' ? 'Gateway Paralelo' : 'Gateway Inclusivo'}
                                    </DialogTitle>
                                    <DialogDescription>
                                        Configure las rutas de salida y condiciones para este gateway.
                                    </DialogDescription>
                                </DialogHeader>
                                <GatewayRoutingConfig
                                    gatewayType={step.type as 'gateway-exclusive' | 'gateway-parallel' | 'gateway-inclusive'}
                                    routes={(step as any).routes || []}
                                    onRoutesChange={(routes) => onUpdateStep(poolId, laneId, step.id, { routes } as any)}
                                    availableSteps={allSteps.filter(s => s.id !== step.id)}
                                    formFields={formFields}
                                    precedingStep={allSteps.find((s, i) => {
                                        const stepIndex = allSteps.findIndex(x => x.id === step.id);
                                        return i === stepIndex - 1;
                                    })}
                                />
                            </DialogContent>
                        </Dialog>
                    )}

                    {/* Timer configuration */}
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
                                    <DialogDescription>
                                        Configure cuándo debe activarse este paso del flujo.
                                    </DialogDescription>
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
            <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10 self-start mt-1"
                onClick={() => onDeleteStep(poolId, laneId, step.id)}
            >
                <Trash2 className="h-4 w-4" />
                <span className="sr-only">Eliminar paso</span>
            </Button>
        </div>
    );
}

function PageSkeleton() {
    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center justify-between p-4 sm:p-6">
                    <Skeleton className="h-8 w-64" />
                    <div className="flex gap-2">
                        <Skeleton className="h-10 w-24" />
                        <Skeleton className="h-10 w-32" />
                    </div>
                </header>
                 <main className="grid flex-1 items-start gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-[1fr_2fr]">
                    <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-64 w-full" />
                        <Skeleton className="h-64 w-full" />
                    </div>
                    <Skeleton className="h-[80vh] w-full" />
                 </main>
            </div>
        </SiteLayout>
    )
}

function LaneItem({
    poolId,
    lane,
    laneIndex,
    totalLanes,
    handleUpdate,
    handleAddStepToLane,
    handleDeleteLane,
    handleDeleteStep,
    onUpdateStep,
    allSteps,
    formFields,
    handleMoveLane
}: {
    poolId: string;
    lane: Lane;
    laneIndex: number;
    totalLanes: number;
    handleUpdate: (type: 'pool' | 'lane', ids: { poolId: string, laneId?: string }, value: string) => void;
    handleAddStepToLane: (poolId: string, laneId: string, stepName: string, stepType: WorkflowStepType) => void;
    handleDeleteLane: (poolId: string, laneId: string) => void;
    handleDeleteStep: (poolId: string, laneId: string, stepId: string) => void;
    onUpdateStep: (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => void;
    allSteps: WorkflowStepDefinition[];
    formFields: FormField[];
    handleMoveLane: (poolId: string, laneIndex: number, direction: 'up' | 'down') => void;
}) {
    return (
        <div className="group/lane rounded-md border bg-background">
            <div className="flex items-center gap-2 p-2 border-b">
                <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveLane(poolId, laneIndex, 'up')} disabled={laneIndex === 0}>
                        <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMoveLane(poolId, laneIndex, 'down')} disabled={laneIndex === totalLanes - 1}>
                        <ArrowDown className="h-3 w-3" />
                    </Button>
                </div>
                <Input
                    value={lane.name}
                    onChange={(e) => handleUpdate('lane', { poolId: poolId, laneId: lane.id }, e.target.value)}
                    className="h-8 text-sm font-medium border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-0 flex-1"
                />
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4" />Añadir</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuLabel>Elementos de BPMN</DropdownMenuLabel>
                        <DropdownMenuItem onSelect={() => handleAddStepToLane(poolId, lane.id, "Nueva Tarea", 'task')}>
                            <BpmnIcon type="task" className="mr-2"/> Tarea
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStepToLane(poolId, lane.id, "Gateway Exclusivo", 'gateway-exclusive')}>
                            <BpmnIcon type="gateway-exclusive" className="mr-2"/> Gateway Exclusivo (XOR)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStepToLane(poolId, lane.id, "Gateway Paralelo", 'gateway-parallel')}>
                            <BpmnIcon type="gateway-parallel" className="mr-2"/> Gateway Paralelo (AND)
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => handleAddStepToLane(poolId, lane.id, "Gateway Inclusivo", 'gateway-inclusive')}>
                            <BpmnIcon type="gateway-inclusive" className="mr-2"/> Gateway Inclusivo (OR)
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onSelect={() => handleAddStepToLane(poolId, lane.id, "Temporizador", 'timer')}>
                            <BpmnIcon type="timer" className="mr-2"/> Temporizador
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover/lane:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeleteLane(poolId, lane.id)}
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Eliminar carril</span>
                </Button>
            </div>
            <div className="p-2 min-h-[50px] space-y-2">
                <SortableContext items={lane.steps.map(s => s.id)} strategy={verticalListSortingStrategy} id={lane.id}>
                    {lane.steps.map((step) => (
                        <SortableStep
                            key={step.id}
                            step={step}
                            poolId={poolId}
                            laneId={lane.id}
                            onUpdateStep={onUpdateStep}
                            onDeleteStep={handleDeleteStep}
                            allSteps={allSteps}
                            formFields={formFields}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    );
}

function PoolItem({
    pool,
    index,
    totalPools,
    handleUpdate,
    handleAddLaneToPool,
    handleDeletePool,
    handleAddStepToLane,
    handleDeleteLane,
    handleDeleteStep,
    onUpdateStep,
    allSteps,
    formFields,
    handleMovePool,
    handleMoveLane
}: {
    pool: Pool;
    index: number;
    totalPools: number;
    handleUpdate: (type: 'pool' | 'lane', ids: { poolId: string, laneId?: string }, value: string) => void;
    handleAddLaneToPool: (poolId: string) => void;
    handleDeletePool: (poolId: string) => void;
    handleAddStepToLane: (poolId: string, laneId: string, stepName: string, stepType: WorkflowStepType) => void;
    handleDeleteLane: (poolId: string, laneId: string) => void;
    handleDeleteStep: (poolId: string, laneId: string, stepId: string) => void;
    onUpdateStep: (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => void;
    allSteps: WorkflowStepDefinition[];
    formFields: FormField[];
    handleMovePool: (index: number, direction: 'up' | 'down') => void;
    handleMoveLane: (poolId: string, laneIndex: number, direction: 'up' | 'down') => void;
}) {
    return (
        <div className="group/pool rounded-lg border bg-card p-4 space-y-4">
            <div className="flex items-center gap-2">
                 <div className="flex flex-col">
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMovePool(index, 'up')} disabled={index === 0}>
                        <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => handleMovePool(index, 'down')} disabled={index === totalPools - 1}>
                        <ArrowDown className="h-3 w-3" />
                    </Button>
                </div>
                <Input
                    value={pool.name}
                    onChange={(e) => handleUpdate('pool', { poolId: pool.id }, e.target.value)}
                    className="text-base font-semibold border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-0 flex-1"
                />
                <Button variant="ghost" size="sm" onClick={() => handleAddLaneToPool(pool.id)}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Carril
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover/pool:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDeletePool(pool.id)}
                >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Eliminar piscina</span>
                </Button>
            </div>
            <div className="space-y-2 pl-6">
                <SortableContext items={pool.lanes.map(l => l.id)} strategy={verticalListSortingStrategy} id={pool.id}>
                    {pool.lanes.map((lane, laneIndex) => (
                        <LaneItem
                            key={lane.id}
                            poolId={pool.id}
                            lane={lane}
                            laneIndex={laneIndex}
                            totalLanes={pool.lanes.length}
                            handleUpdate={handleUpdate}
                            handleAddStepToLane={handleAddStepToLane}
                            handleDeleteLane={handleDeleteLane}
                            handleDeleteStep={handleDeleteStep}
                            onUpdateStep={onUpdateStep}
                            handleMoveLane={handleMoveLane}
                            allSteps={allSteps}
                            formFields={formFields}
                        />
                    ))}
                </SortableContext>
            </div>
        </div>
    );
}

export default function EditTemplatePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();
  const params = useParams();
  const templateId = params.id as string;

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);
  const [visibilityRules, setVisibilityRules] = useState<VisibilityRule[]>([]);
  const [fieldLayout, setFieldLayout] = useState<FieldLayoutConfig[]>([]);
  const [defaultValueRules, setDefaultValueRules] = useState<DefaultValueRule[]>([]);
  const [pools, setPools] = useState<Pool[]>([]);

  // Fetching data
  const templateRef = useMemoFirebase(() => {
    if (!firestore || !templateId) return null;
    return doc(firestore, 'request_templates', templateId);
  }, [firestore, templateId]);
  
  const { data: templateData, isLoading: isLoadingTemplate } = useDoc<any>(templateRef);
  
  const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users } = useCollection<UserType>(usersQuery);

  // Effect to populate state from fetched template data
    useEffect(() => {
    if (templateData) {
        setTemplateName(templateData.name || "");
        setTemplateDescription(templateData.description || "");
        setFields(templateData.fields || []);
        
        if (templateData.pools && templateData.pools.length > 0) {
            setPools(templateData.pools);
        } else {
            setPools([{
                id: 'pool-default',
                name: 'Proceso Principal',
                lanes: [{
                    id: 'lane-default',
                    name: 'Actores Principales',
                    steps: templateData.steps || [],
                }]
            }]);
        }
        
        setRules(templateData.rules || []);
        setVisibilityRules(templateData.visibilityRules || []);
        setFieldLayout(templateData.fieldLayout || []);
        setDefaultValueRules(templateData.defaultValueRules || []);
    }
  }, [templateData]);


  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeContainer = active.data.current?.sortable.containerId;
    
    if (active.data.current?.type === 'step' && over.data.current?.type === 'step') {
        const overContainer = over.data.current?.sortable.containerId;
        if (activeContainer !== overContainer) return;
        setPools(prevPools => prevPools.map(pool => ({
            ...pool,
            lanes: pool.lanes.map(lane => {
                if (lane.id === activeContainer) {
                    const oldIndex = lane.steps.findIndex(s => s.id === active.id);
                    const newIndex = lane.steps.findIndex(s => s.id === over.id);
                    if (oldIndex === -1 || newIndex === -1) return lane;
                    return { ...lane, steps: arrayMove(lane.steps, oldIndex, newIndex) };
                }
                return lane;
            })
        })));
        return;
    }
    
    if (active.data.current?.type === 'field' && over.data.current?.type === 'field') {
        setFields((items) => {
            const oldIndex = items.findIndex(item => item.id === active.id);
            const newIndex = items.findIndex(item => item.id === over.id);
            if (oldIndex === -1 || newIndex === -1) return items;
            return arrayMove(items, oldIndex, newIndex);
        });
    }
  };

  const handleMovePool = (index: number, direction: 'up' | 'down') => {
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === pools.length - 1)) return;
    const newPools = [...pools];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newPools[index], newPools[targetIndex]] = [newPools[targetIndex], newPools[index]];
    setPools(newPools);
  };

  const handleMoveLane = (poolId: string, laneIndex: number, direction: 'up' | 'down') => {
      setPools(prevPools => prevPools.map(pool => {
          if (pool.id === poolId) {
              if ((direction === 'up' && laneIndex === 0) || (direction === 'down' && laneIndex === pool.lanes.length - 1)) {
                  return pool;
              }
              const newLanes = [...pool.lanes];
              const targetIndex = direction === 'up' ? laneIndex - 1 : laneIndex + 1;
              [newLanes[laneIndex], newLanes[targetIndex]] = [newLanes[targetIndex], newLanes[laneIndex]];
              return { ...pool, lanes: newLanes };
          }
          return pool;
      }));
  };

  const handleUpdate = (type: 'pool' | 'lane', ids: { poolId: string, laneId?: string }, value: string) => {
      setPools(prevPools => prevPools.map(pool => {
          if (pool.id === ids.poolId) {
              if (type === 'pool') {
                  return { ...pool, name: value };
              }
              if (type === 'lane' && ids.laneId) {
                  return {
                      ...pool,
                      lanes: pool.lanes.map(lane => lane.id === ids.laneId ? { ...lane, name: value } : lane)
                  };
              }
          }
          return pool;
      }));
  };

  const handleUpdateStep = (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => {
    setPools(prevPools => prevPools.map(pool => {
        if (pool.id === poolId) {
            return {
                ...pool,
                lanes: pool.lanes.map(lane => {
                    if (lane.id === laneId) {
                        return {
                            ...lane,
                            steps: lane.steps.map(step =>
                                step.id === stepId ? { ...step, ...updates } : step
                            )
                        };
                    }
                    return lane;
                })
            };
        }
        return pool;
    }));
  };

  const handleAddStepToLane = (poolId: string, laneId: string, stepName: string, stepType: WorkflowStepType) => {
    if (stepName.trim() === "") return;
    
    const newStep: WorkflowStepDefinition = {
        id: `step-${Date.now()}`,
        name: stepName.trim(),
        type: stepType,
        assigneeRole: ''
    };
    
    if (stepType === 'gateway-exclusive' || stepType === 'gateway-parallel') {
        newStep.name = stepType === 'gateway-exclusive' ? 'Decisión Exclusiva' : 'Gateway Paralelo';
    }

    setPools(prevPools => prevPools.map(pool => {
        if (pool.id === poolId) {
            return {
                ...pool,
                lanes: pool.lanes.map(lane => {
                    if (lane.id === laneId) {
                        return { ...lane, steps: [...lane.steps, newStep] };
                    }
                    return lane;
                })
            };
        }
        return pool;
    }));
  }

  const handleAddField = (field: Omit<FormField, 'id'>) => {
    if (field.label.trim() !== "") {
        const newField: FormField = {
            id: `field-${Date.now()}`,
            ...field
        };
        setFields([...fields, newField]);
        setIsFieldDialogOpen(false);
    }
  };

  const handleUpdateField = (updatedField: FormField) => {
    setFields(fields.map(f => f.id === updatedField.id ? updatedField : f));
    setEditingField(null);
    setIsFieldDialogOpen(false);
  }

  const handleOpenFieldDialog = (field: FormField | null) => {
    setEditingField(field);
    setIsFieldDialogOpen(true);
  }

  const handleRemoveField = (id: string) => {
    setFields(fields.filter(field => field.id !== id));
  };
  
  const handleAddPool = () => {
      const newPool: Pool = {
          id: `pool-${Date.now()}`,
          name: `Nueva Piscina ${pools.length + 1}`,
          lanes: []
      };
      setPools([...pools, newPool]);
  }

  const handleAddLaneToPool = (poolId: string) => {
      const newLane: Lane = {
          id: `lane-${Date.now()}`,
          name: 'Nuevo Carril',
          steps: [],
      };
      setPools(pools.map(pool => pool.id === poolId ? { ...pool, lanes: [...pool.lanes, newLane] } : pool));
  }

  const handleDeletePool = (poolId: string) => {
    setPools(pools.filter(pool => pool.id !== poolId));
  }

  const handleDeleteLane = (poolId: string, laneId: string) => {
      setPools(pools.map(pool => {
          if (pool.id === poolId) {
              return { ...pool, lanes: pool.lanes.filter(lane => lane.id !== laneId) };
          }
          return pool;
      }));
  }

  const handleDeleteStep = (poolId: string, laneId: string, stepId: string) => {
      setPools(pools.map(pool => {
          if (pool.id === poolId) {
              return {
                  ...pool,
                  lanes: pool.lanes.map(lane => {
                      if (lane.id === laneId) {
                          return { ...lane, steps: lane.steps.filter(step => step.id !== stepId) };
                      }
                      return lane;
                  })
              };
          }
          return pool;
      }));
  }


  const handleSaveTemplate = async () => {
    if(!templateRef) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se puede encontrar la plantilla para actualizar.",
    });
      return;
    }
    if(!templateName) {
        toast({
            variant: "destructive",
            title: "Error",
            description: "El nombre de la plantilla es obligatorio.",
        });
        return;
    }
    
    const allSteps = pools.flatMap(pool => pool.lanes.flatMap(lane => lane.steps));

    const updatedTemplate = {
        name: templateName,
        description: templateDescription,
        fields,
        steps: allSteps,
        rules,
        pools,
        visibilityRules,
        fieldLayout,
        defaultValueRules,
    };

    try {
      await updateDocumentNonBlocking(templateRef, updatedTemplate);

      toast({
          title: "¡Plantilla Actualizada!",
          description: `La plantilla "${templateName}" ha sido actualizada con éxito.`,
      });
      
      router.push('/templates');

    } catch (error) {
       console.error("Error updating template: ", error);
       toast({
        variant: "destructive",
        title: "Error al actualizar",
        description: "No se pudo actualizar la plantilla. Por favor, inténtalo de nuevo.",
      });
    }
  }

  const handleAddRule = (rule: Omit<Rule, 'id'>) => {
    setRules([...rules, { ...rule, id: `rule-${Date.now()}` }]);
    setIsRuleDialogOpen(false);
  }

  const handleUpdateRule = (updatedRule: Rule) => {
    setRules(rules.map(r => r.id === updatedRule.id ? updatedRule : r));
    setEditingRule(null);
    setIsRuleDialogOpen(false);
  }

  const handleOpenRuleDialog = (rule: Rule | null) => {
    setEditingRule(rule);
    setIsRuleDialogOpen(true);
  }

  const handleRemoveRule = (id: string) => {
    setRules(rules.filter((rule) => rule.id !== id));
  }
  
  const applyCopilotDraft = (data: GenerateProcessOutput) => {
      setTemplateName(data.name);
      setTemplateDescription(data.description);
      setFields(data.fields.map(f => ({ ...f, options: f.options || [] })));
      setPools(data.pools.map(p => ({
          ...p,
          lanes: p.lanes.map(l => ({
              ...l,
              steps: l.steps.map(s => ({...s, assigneeRole: ''}))
          }))
      })));
      setRules(data.rules.map(r => ({...r, id: `rule-ai-${Date.now()}-${Math.random()}`, condition: { ...r.condition, type: 'form' as const }})));
  };

  if (isLoadingTemplate) {
      return <PageSkeleton />;
  }
  
  const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));
  
  return (
    <SiteLayout>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-1 flex-col">
            <header className="flex items-center justify-between p-4 sm:p-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">Editar Plantilla</h1>
                     <CopilotDialog onApply={applyCopilotDraft} />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild><Link href="/templates">Cancelar</Link></Button>
                    <Button onClick={handleSaveTemplate}>Guardar Cambios</Button>
                </div>
            </header>
            <main className="grid flex-1 items-start gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-[1fr_2fr]">
                <div className="grid auto-rows-max items-start gap-4 lg:gap-8">
                    <Card>
                        <CardContent className="p-6">
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
                                <Label htmlFor="template-description">Descripción</Label>
                                <Textarea 
                                id="template-description" 
                                placeholder="Una breve descripción de para qué sirve este flujo de trabajo."
                                value={templateDescription}
                                onChange={(e) => setTemplateDescription(e.target.value)}
                                />
                            </div>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                        <CardTitle>Campos del Formulario</CardTitle>
                        <CardDescription>
                            Defina los datos que se recopilarán para esta plantilla.
                        </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2 rounded-md border p-4 min-h-[120px]">
                                {fields.length === 0 ? (
                                    <p className="text-center text-sm text-muted-foreground py-4">Añada campos a su formulario.</p>
                                ) : (
                                    <SortableContext items={fields.map(f => f.id)} strategy={verticalListSortingStrategy} id="form-fields">
                                        {fields.map((field) => (
                                            <SortableField key={field.id} field={field} onRemove={handleRemoveField} onEdit={handleOpenFieldDialog} />
                                        ))}
                                    </SortableContext>
                                )}
                            </div>

                        <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full" onClick={() => handleOpenFieldDialog(null)}>
                                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Campo
                                </Button>
                            </DialogTrigger>
                           <FieldBuilderDialog 
                                onAddField={handleAddField} 
                                onUpdateField={handleUpdateField}
                                fieldToEdit={editingField}
                                onClose={() => setIsFieldDialogOpen(false)}
                            />
                        </Dialog>
                        </CardContent>
                    </Card>

                    {fields.length > 1 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Diseño del Formulario</CardTitle>
                                <CardDescription>
                                    Arrastre y ajuste los campos en una grilla.
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <FieldLayoutEditor 
                                    fields={fields} 
                                    layout={fieldLayout} 
                                    onLayoutChange={setFieldLayout} 
                                />
                            </CardContent>
                        </Card>
                    )}

                    {/* Visibility Rules Section */}
                    {fields.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Reglas de Visibilidad</CardTitle>
                                <CardDescription>
                                    Configure cuándo mostrar u ocultar campos basándose en el valor de otros campos.
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

                    {/* Default Value Rules Section */}
                    {fields.length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle>Valores por Defecto Condicionales</CardTitle>
                                <CardDescription>
                                    Configure valores que se asignan automáticamente basándose en condiciones.
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
                            <CardDescription>Defina la lógica condicional para automatizar las decisiones.</CardDescription>
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
                                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Regla
                                    </Button>
                                </DialogTrigger>
                                <RuleBuilderDialog 
                                    fields={fields} 
                                    steps={allSteps} 
                                    users={users || []}
                                    onAddRule={handleAddRule} 
                                    onUpdateRule={handleUpdateRule}
                                    ruleToEdit={editingRule}
                                    onClose={() => setIsRuleDialogOpen(false)} 
                                />
                            </Dialog>
                        </CardContent>
                    </Card>
                </div>
                <Card>
                    <CardHeader>
                        <CardTitle>Lienzo del Flujo de Trabajo (BPMN)</CardTitle>
                        <CardDescription>
                            Diseñe y ordene las etapas de su proceso usando Piscinas (Pools) y Carriles (Lanes).
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4 rounded-md bg-muted/50 p-4 min-h-[300px]">
                            <div className="space-y-4">
                                {pools.map((pool, index) => (
                                    <PoolItem
                                        key={pool.id}
                                        pool={pool}
                                        index={index}
                                        totalPools={pools.length}
                                        handleUpdate={handleUpdate}
                                        handleAddLaneToPool={handleAddLaneToPool}
                                        handleDeletePool={handleDeletePool}
                                        handleDeleteLane={handleDeleteLane}
                                        handleDeleteStep={handleDeleteStep}
                                        onUpdateStep={handleUpdateStep}
                                        handleMovePool={handleMovePool}
                                        handleMoveLane={handleMoveLane}
                                        handleAddStepToLane={handleAddStepToLane}
                                        allSteps={allSteps}
                                        formFields={fields}
                                    />
                                ))}
                            </div>
                        </div>
                        <Button variant="outline" className="w-full mt-4" onClick={handleAddPool}>
                            <Library className="mr-2 h-4 w-4" /> Añadir Piscina
                        </Button>
                    </CardContent>
                </Card>
            </main>
            </div>
        </DndContext>
    </SiteLayout>
  );
}


function FieldBuilderDialog({ onAddField, onUpdateField, fieldToEdit, onClose }: { onAddField: (field: Omit<FormField, 'id'>) => void, onUpdateField: (field: FormField) => void, fieldToEdit: FormField | null, onClose: () => void }) {
    const [label, setLabel] = useState("");
    const [type, setType] = useState<FormFieldType>('text');
    const [options, setOptions] = useState<string[]>(['']);
    const isEditing = !!fieldToEdit;

    useEffect(() => {
        if (fieldToEdit) {
            setLabel(fieldToEdit.label);
            setType(fieldToEdit.type);
            setOptions(fieldToEdit.options && fieldToEdit.options.length > 0 ? fieldToEdit.options : ['']);
        } else {
            setLabel('');
            setType('text');
            setOptions(['']);
        }
    }, [fieldToEdit]);

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
        const finalField: Omit<FormField, 'id'> = { label: label.trim(), type };

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

        onAddField(finalField);
        onClose();
    };

    const needsOptions = ['select', 'radio'].includes(type);

    return (
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Añadir Nuevo Campo de Formulario</DialogTitle>
                <DialogDescription>Configure las propiedades del campo.</DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
                {/* Basic field info */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label htmlFor="field-label">Etiqueta del Campo</Label>
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
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="ghost" onClick={onClose}>Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={!label.trim() || (type === 'table' && tableColumns.length === 0)}>
                    Añadir Campo
                </Button>
            </DialogFooter>
        </DialogContent>
    );
}

function RuleConditionDisplay({ condition, fields, steps }: { condition: RuleCondition, fields: FormField[], steps: WorkflowStepDefinition[] }) {
    const source = condition.type === 'form' 
        ? fields.find(f => f.id === condition.fieldId)
        : steps.find(s => s.id === condition.fieldId);
    
    const operatorLabels: Partial<Record<RuleOperator, string>> = {
        '==': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=',
        'contains': 'contiene', 'not_contains': 'no contiene', 'is': 'es', 'is_not': 'no es',
    };

    const getSourceTypeIcon = (type: FormFieldType | 'outcome' | undefined) => {
        switch(type) {
            case 'number': return <Hash className="h-4 w-4 text-muted-foreground"/>;
            case 'text':
            case 'textarea':
                return <CaseSensitive className="h-4 w-4 text-muted-foreground"/>;
            case 'select':
            case 'radio':
            case 'checkbox':
            case 'outcome':
                return <GitBranch className="h-4 w-4 text-muted-foreground" />;
            default: return null;
        }
    }

    return (
        <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-muted-foreground">SI</span>
            <div className="flex items-center gap-1">
                {getSourceTypeIcon((source?.type || (condition.type === 'outcome' ? 'outcome' : undefined)) as FormFieldType | 'outcome' | undefined)}
                <Badge variant="outline">{(source as any)?.name || (source as any)?.label || '??'}</Badge>
            </div>
            <span className="font-semibold text-muted-foreground">{operatorLabels[condition.operator] || condition.operator}</span>
            <Badge variant="secondary" className="font-mono">{condition.value}</Badge>
        </div>
    );
}


function RuleActionDisplay({ action, steps, users }: { action: RuleAction, steps: WorkflowStepDefinition[], users: UserType[] }) {
    const getActionIcon = (type: RuleAction['type']) => {
        switch(type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP':
                return <GitBranch className="h-5 w-5 text-primary"/>;
            case 'ASSIGN_USER':
                return <User className="h-5 w-5 text-primary"/>;
            case 'SEND_NOTIFICATION':
                return <Bell className="h-5 w-5 text-primary"/>;
            case 'CHANGE_REQUEST_PRIORITY':
                return <AlertTriangle className="h-5 w-5 text-primary"/>;
        }
    }

    const renderActionDetails = () => {
        switch (action.type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP':
                const step = steps.find(s => s.id === action.stepId);
                return <>{action.type === 'ROUTE_TO_STEP' ? 'Enrutar a' : 'Añadir paso'}: <Badge>{step?.name || '??'}</Badge></>;
            case 'ASSIGN_USER':
                const assignUser = users.find(u => u.id === action.userId);
                const assignStep = steps.find(s => s.id === action.stepId);
                return <>Asignar <Badge variant="secondary">{assignUser?.fullName || '??'}</Badge> a <Badge>{assignStep?.name || '??'}</Badge></>;
            case 'SEND_NOTIFICATION':
                return <>Notificar a <Badge variant="secondary">{action.target}</Badge> con mensaje: <span className="italic">"{action.message}"</span></>;
            case 'CHANGE_REQUEST_PRIORITY':
                return <>Cambiar prioridad a <Badge variant="destructive">{action.priority}</Badge></>;
            default:
                return null;
        }
    }

    return (
        <div className="flex items-center gap-3">
             <div className="flex-shrink-0">{getActionIcon(action.type)}</div>
            <div className="flex flex-wrap items-center gap-2 text-sm">{renderActionDetails()}</div>
        </div>
    );
}

function RuleDisplay({ rule, fields, pools, users, onRemove, onEdit }: { rule: Rule, fields: FormField[], pools: Pool[], users: UserType[], onRemove: (id: string) => void, onEdit: (rule: Rule) => void }) {
    const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));

    return (
        <div className="group relative rounded-lg border bg-card p-4 transition-all hover:shadow-md">
            <div className="grid grid-cols-[1fr,auto,1fr] items-center gap-4">
                {/* Condition */}
                <RuleConditionDisplay condition={rule.condition} fields={fields} steps={allSteps} />

                {/* Arrow */}
                <div className="flex justify-center">
                    <ChevronsRight className="h-6 w-6 text-muted-foreground" />
                </div>

                {/* Action */}
                <RuleActionDisplay action={rule.action} steps={allSteps} users={users} />
            </div>

            <Button
                variant="ghost"
                size="icon"
                className="absolute right-8 top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onEdit(rule)}
            >
                <Pencil className="h-4 w-4 text-primary" />
                <span className="sr-only">Editar regla</span>
            </Button>
            <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1 h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onRemove(rule.id)}
            >
                <Trash2 className="h-4 w-4 text-destructive" />
                <span className="sr-only">Eliminar regla</span>
            </Button>
        </div>
    );
}


function RuleBuilderDialog({ fields, steps, users, onAddRule, onUpdateRule, ruleToEdit, onClose }: { fields: FormField[], steps: WorkflowStepDefinition[], users: UserType[], onAddRule: (rule: Omit<Rule, 'id'>) => void, onUpdateRule: (rule: Rule) => void, ruleToEdit: Rule | null, onClose: () => void }) {
    const { toast } = useToast();
    const [condition, setCondition] = useState<Partial<RuleCondition>>({ type: 'form' });
    const [action, setAction] = useState<Partial<RuleAction>>({ type: 'REQUIRE_ADDITIONAL_STEP' });
    const isEditing = !!ruleToEdit;

    useEffect(() => {
        if (ruleToEdit) {
            setCondition(ruleToEdit.condition);
            setAction(ruleToEdit.action);
        } else {
            setCondition({ type: 'form' });
            setAction({ type: 'REQUIRE_ADDITIONAL_STEP' });
        }
    }, [ruleToEdit]);

    const decisionTasks = steps.filter(s => s.outcomes && s.outcomes.length > 0);
    const formFieldsForRules = fields.filter(f => ['number', 'select', 'radio', 'text', 'textarea'].includes(f.type));
    const selectedSource = condition.type === 'form' ? formFieldsForRules.find(f => f.id === condition.fieldId) : decisionTasks.find(s => s.id === condition.fieldId);
    
    const getOperatorsForType = (type?: FormFieldType | 'outcome'): { value: RuleOperator, label: string }[] => {
        if (type === 'outcome') return [{ value: '==', label: 'es igual a' }];
        switch (type) {
            case 'number':
                return [ { value: '==', label: 'es igual a' }, { value: '!=', label: 'no es igual a' }, { value: '>', label: 'es mayor que' }, { value: '<', label: 'es menor que' }, { value: '>=', label: 'es mayor o igual que' }, { value: '<=', label: 'es menor o igual que' } ];
            case 'text':
            case 'textarea':
                return [ { value: 'is', label: 'es igual a' }, { value: 'is_not', label: 'no es igual a' }, { value: 'contains', label: 'contiene' }, { value: 'not_contains', label: 'no contiene' }];
            case 'select':
            case 'radio':
                return [ { value: 'is', label: 'es' }, { value: 'is_not', label: 'no es' } ];
            default: return [];
        }
    };
    
    const availableOperators = getOperatorsForType((selectedSource?.type || (condition.type === 'outcome' ? 'outcome' : undefined)) as FormFieldType | 'outcome' | undefined);

    const handleSubmit = () => {
        if (!condition.fieldId || !condition.operator || (condition.value === undefined || condition.value === '')) {
            toast({ variant: "destructive", title: "Condición incompleta" }); return;
        }

        const newRule: Omit<Rule, 'id'> = { condition: condition as RuleCondition, action: action as RuleAction };
        
        if (isEditing) {
            onUpdateRule({ ...newRule, id: ruleToEdit.id });
        } else {
            onAddRule(newRule);
        }
        toast({ title: isEditing ? "Regla actualizada" : "Regla agregada" });
        onClose();
    };

    return (
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>{isEditing ? "Editar Regla de Negocio" : "Constructor de Reglas de Negocio"}</DialogTitle>
                <DialogDescription>Cree una regla "SI-ENTONCES" para automatizar su flujo de trabajo.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary"/> Condición (SI)</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2 col-span-1">
                            <Label>Tipo de Condición</Label>
                            <Select value={condition.type} onValueChange={(v) => setCondition({ type: v as any })}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="form">Basada en Campo de Formulario</SelectItem>
                                    <SelectItem value="outcome">Basada en Resultado de Tarea</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                         <div className="space-y-2 col-span-3 grid grid-cols-3 gap-4">
                            <div className="space-y-2">
                                <Label>Fuente</Label>
                                <Select value={condition.fieldId} onValueChange={(v) => setCondition(c => ({...c, fieldId: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione fuente..."/></SelectTrigger>
                                    <SelectContent>
                                        {condition.type === 'form' && formFieldsForRules.map(field => <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>)}
                                        {condition.type === 'outcome' && decisionTasks.map(task => <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Operador</Label>
                                <Select value={condition.operator} onValueChange={(v) => setCondition(c => ({...c, operator: v as any }))} disabled={!selectedSource}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                    <SelectContent>{availableOperators.map(op => <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor</Label>
                                {selectedSource && (selectedSource.type === 'number' || selectedSource.type === 'text' || selectedSource.type === 'textarea') ? (
                                    <Input type={selectedSource?.type === 'number' ? 'number' : 'text'} placeholder="p.ej., 5000" value={condition.value || ''} onChange={(e) => setCondition(c => ({...c, value: e.target.value}))} />
                                ) : (
                                     <Select value={condition.value} onValueChange={(v) => setCondition(c => ({...c, value: v}))} disabled={!selectedSource}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione valor..."/></SelectTrigger>
                                        <SelectContent>
                                            {((selectedSource as any)?.options || (selectedSource as any)?.outcomes)?.map((opt: string) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                         </div>
                    </div>
                </div>

                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><GitBranch className="mr-2 h-5 w-5 text-primary"/> Acción (ENTONCES)</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>Tipo de Acción</Label>
                            <Select value={action.type} onValueChange={(v) => setAction({ type: v as any })}>
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="REQUIRE_ADDITIONAL_STEP">Añadir Paso Requerido</SelectItem>
                                    <SelectItem value="ROUTE_TO_STEP">Enrutar a Paso</SelectItem>
                                    <SelectItem value="ASSIGN_USER">Asignar Usuario a Tarea</SelectItem>
                                    <SelectItem value="SEND_NOTIFICATION">Enviar Notificación</SelectItem>
                                    <SelectItem value="CHANGE_REQUEST_PRIORITY">Cambiar Prioridad de Solicitud</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            { (action.type === 'REQUIRE_ADDITIONAL_STEP' || action.type === 'ROUTE_TO_STEP') &&
                                <><Label>Paso de Destino</Label><Select value={(action as any).stepId} onValueChange={(v) => setAction(a => ({...a, stepId: v}))}><SelectTrigger><SelectValue placeholder="Seleccione un paso..."/></SelectTrigger><SelectContent>{steps.map(step => <SelectItem key={step.id} value={step.id}>{step.name}</SelectItem>)}</SelectContent></Select></>
                            }
                            { action.type === 'ASSIGN_USER' &&
                                <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label>Tarea</Label><Select value={(action as any).stepId} onValueChange={(v) => setAction(a => ({...a, stepId: v}))}><SelectTrigger><SelectValue placeholder="Seleccione tarea..."/></SelectTrigger><SelectContent>{steps.map(step => <SelectItem key={step.id} value={step.id}>{step.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Usuario</Label><Select value={(action as any).userId} onValueChange={(v) => setAction(a => ({...a, userId: v}))}><SelectTrigger><SelectValue placeholder="Seleccione usuario..."/></SelectTrigger><SelectContent>{users.map(user => <SelectItem key={user.id} value={user.id}>{user.fullName}</SelectItem>)}</SelectContent></Select></div></div>
                            }
                            { action.type === 'SEND_NOTIFICATION' &&
                                <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label>Destinatario</Label><Select value={(action as any).target} onValueChange={(v) => setAction(a => ({...a, target: v}) as Partial<RuleAction>)}><SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger><SelectContent><SelectItem value="submitter">Creador de la solicitud</SelectItem><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Member">Miembro</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Mensaje</Label><Input placeholder="Tu mensaje aquí" value={(action as any).message || ''} onChange={(e) => setAction(a => ({...a, message: e.target.value}) as Partial<RuleAction>)}/></div></div>
                            }
                             { action.type === 'CHANGE_REQUEST_PRIORITY' &&
                                <><Label>Nueva Prioridad</Label><Select value={(action as any).priority} onValueChange={(v) => setAction(a => ({...a, priority: v}) as Partial<RuleAction>)}><SelectTrigger><SelectValue placeholder="Seleccione prioridad..."/></SelectTrigger><SelectContent><SelectItem value="Alta">Alta</SelectItem><SelectItem value="Media">Media</SelectItem><SelectItem value="Baja">Baja</SelectItem></SelectContent></Select></>
                            }
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="ghost" onClick={onClose}>Cancelar</Button></DialogClose>
                <Button onClick={handleSubmit}>{isEditing ? "Guardar Cambios" : "Añadir Regla"}</Button>
            </DialogFooter>
        </DialogContent>
    )
}





