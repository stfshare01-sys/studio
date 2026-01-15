

"use client";

import { useState } from "react";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2, UserSquare, Pencil, GripVertical, X, AlertTriangle, User, Bell, ChevronsRight, Hash, CaseSensitive, Timer, Siren } from "lucide-react";
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
import { addDocumentNonBlocking, setDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection, doc } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType, FormFieldType, RuleOperator, User as UserType, RequestPriority, UserRole, EscalationPolicy } from "@/lib/types";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";


const BpmnIcon = ({ type, className }: { type: WorkflowStepType, className?: string }) => {
    switch (type) {
        case 'task':
            return <CheckCircle className={cn("h-5 w-5 text-sky-500", className)} />;
        case 'gateway-exclusive':
            return <GitMerge className={cn("h-5 w-5 text-amber-500", className)} />;
        case 'gateway-parallel':
            return <GitFork className={cn("h-5 w-5 text-purple-500", className)} />;
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

function SortableField({ field, onRemove }: { field: FormField, onRemove: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: field.id });
    const style = { transform: CSS.Transform.toString(transform), transition };
    const fieldTypeLabels: Record<FormFieldType, string> = {
        text: 'Texto', textarea: 'Área de texto', date: 'Fecha', number: 'Número',
        select: 'Desplegable', checkbox: 'Casilla', radio: 'Opciones', file: 'Archivo',
        table: 'Tabla', autocalculated: 'Autocalculado', signature: 'Firma', checklist: 'Checklist', webservice: 'Web Service'
    };
    const visibilityBadges: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
        required: { label: '✱', variant: 'destructive' },
        readonly: { label: '👁', variant: 'secondary' },
        hidden: { label: '⊘', variant: 'outline' },
    };

    const visInfo = field.visibility && visibilityBadges[field.visibility];

    return (
        <div ref={setNodeRef} style={style} className="group flex items-center gap-2 rounded-md p-3 bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex-1 font-medium flex items-center gap-2">
                {field.label}
                {visInfo && <Badge variant={visInfo.variant} className="text-[10px] px-1 py-0">{visInfo.label}</Badge>}
            </div>
            <div className="text-sm text-muted-foreground">({fieldTypeLabels[field.type]})</div>
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
    onDeleteStep
}: {
    step: WorkflowStepDefinition,
    poolId: string,
    laneId: string,
    onUpdateStep: (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => void,
    onDeleteStep: (poolId: string, laneId: string, stepId: string) => void
}) {
    const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id });
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
                                                <div className="flex items-center gap-2"><Checkbox id={`esc-notify-assignee-${step.id}`} checked={step.escalationPolicy.notify?.includes('assignee')} onCheckedChange={(checked) => updateEscalationPolicy({ notify: checked ? [...(step.escalationPolicy.notify || []), 'assignee'] : (step.escalationPolicy.notify || []).filter(n => n !== 'assignee') })} /><Label htmlFor={`esc-notify-assignee-${step.id}`} className="text-xs font-normal">Asignado Actual</Label></div>
                                                <div className="flex items-center gap-2"><Checkbox id={`esc-notify-manager-${step.id}`} checked={step.escalationPolicy.notify?.includes('manager')} onCheckedChange={(checked) => updateEscalationPolicy({ notify: checked ? [...(step.escalationPolicy.notify || []), 'manager'] : (step.escalationPolicy.notify || []).filter(n => n !== 'manager') })} /><Label htmlFor={`esc-notify-manager-${step.id}`} className="text-xs font-normal">Gerente del Asignado</Label></div>
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

export default function NewTemplatePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  
  const [fields, setFields] = useState<FormField[]>([]);
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);

  const [pools, setPools] = useState<Pool[]>([]);

  const usersQuery = useMemoFirebase(() => collection(firestore, 'users'), [firestore]);
  const { data: users } = useCollection<UserType>(usersQuery);

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
        const activeContainer = (active.data.current as any)?.sortable.containerId;
        const overContainer = (over?.data.current as any)?.sortable.containerId;
        
        if (activeContainer === 'form-fields' && overContainer === 'form-fields') {
            setFields((items) => {
                const oldIndex = items.findIndex(item => item.id === active.id);
                const newIndex = items.findIndex(item => item.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        } else if (activeContainer?.startsWith('lane-') && activeContainer === overContainer) {
            setPools(prevPools => prevPools.map(pool => ({
                ...pool,
                lanes: pool.lanes.map(lane => {
                    if (`lane-${lane.id}` === activeContainer) {
                        const oldIndex = lane.steps.findIndex(step => step.id === active.id);
                        const newIndex = lane.steps.findIndex(step => step.id === over.id);
                        return { ...lane, steps: arrayMove(lane.steps, oldIndex, newIndex) };
                    }
                    return lane;
                })
            })));
        }
    }
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
    if(!firestore) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Firestore no está disponible. No se puede guardar la plantilla.",
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
    const templatesCollection = collection(firestore, 'request_templates');
    const newTemplateRef = doc(templatesCollection);

    const newTemplate = {
        id: newTemplateRef.id, // Add the generated ID to the document
        name: templateName,
        description: templateDescription,
        fields,
        steps: allSteps,
        rules,
        pools,
    };

    try {
      await setDocumentNonBlocking(newTemplateRef, newTemplate, {});

      toast({
          title: "¡Plantilla Guardada!",
          description: `La plantilla "${templateName}" ha sido guardada con éxito.`,
      });
      
      router.push('/templates');

    } catch (error) {
       console.error("Error saving template: ", error);
       toast({
        variant: "destructive",
        title: "Error al guardar",
        description: "No se pudo guardar la plantilla. Por favor, inténtalo de nuevo.",
      });
    }
  }

  const handleAddRule = (rule: Omit<Rule, 'id'>) => {
    setRules([...rules, { ...rule, id: `rule-${Date.now()}` }]);
    setIsRuleDialogOpen(false);
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
      setRules(data.rules.map(r => ({...r, id: `rule-ai-${Date.now()}-${Math.random()}`})));
  };
  
  return (
    <SiteLayout>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <div className="flex flex-1 flex-col">
            <header className="flex items-center justify-between p-4 sm:p-6">
                <div className="flex items-center gap-4">
                    <h1 className="text-2xl font-bold tracking-tight">Crear Nueva Plantilla</h1>
                    <CopilotDialog onApply={applyCopilotDraft} />
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" asChild><Link href="/templates">Cancelar</Link></Button>
                    <Button onClick={handleSaveTemplate}>Guardar Plantilla</Button>
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
                                            <SortableField key={field.id} field={field} onRemove={handleRemoveField} />
                                        ))}
                                    </SortableContext>
                                )}
                            </div>

                        <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full">
                                    <PlusCircle className="mr-2 h-4 w-4" /> Añadir Campo
                                </Button>
                            </DialogTrigger>
                           <FieldBuilderDialog onAddField={handleAddField} onClose={() => setIsFieldDialogOpen(false)} existingFields={fields} />
                        </Dialog>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader>
                            <CardTitle>Motor de Reglas de Negocio</CardTitle>
                            <CardDescription>Defina la lógica condicional para automatizar las decisiones.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3">
                                {rules.length === 0 && (
                                    <div className="rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 space-y-3">
                                        <div className="text-center space-y-2">
                                            <ShieldCheck className="h-10 w-10 mx-auto text-muted-foreground/50" />
                                            <p className="font-medium">No hay reglas definidas</p>
                                            <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                                                Las reglas automatizan decisiones en el flujo usando lógica <strong>SI-ENTONCES</strong>.
                                            </p>
                                        </div>
                                        <div className="text-xs text-muted-foreground space-y-1 bg-muted/50 rounded-md p-3">
                                            <p className="font-medium text-foreground">Ejemplos de uso:</p>
                                            <ul className="list-disc list-inside space-y-1 ml-1">
                                                <li><strong>SI</strong> Monto &gt; $5,000 → <strong>ENTONCES</strong> Requiere aprobación de Gerente</li>
                                                <li><strong>SI</strong> Resultado de Revisión = "Rechazado" → <strong>ENTONCES</strong> Enrutar a correcciones</li>
                                                <li><strong>SI</strong> Prioridad = "Alta" → <strong>ENTONCES</strong> Notificar al Administrador</li>
                                            </ul>
                                        </div>
                                        <p className="text-xs text-center text-muted-foreground">
                                            ⓘ Primero cree campos de formulario y pasos en el flujo para usarlos en las reglas.
                                        </p>
                                    </div>
                                )}
                                {rules.map((rule) => (
                                    <RuleDisplay key={rule.id} rule={rule} fields={fields} pools={pools} users={users || []} onRemove={handleRemoveRule} />
                                ))}
                            </div>
                            <Dialog open={isRuleDialogOpen} onOpenChange={setIsRuleDialogOpen}>
                                <DialogTrigger asChild>
                                    <Button variant="outline" className="w-full">
                                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Regla
                                    </Button>
                                </DialogTrigger>
                                <RuleBuilderDialog 
                                    fields={fields} 
                                    steps={pools.flatMap(p => p.lanes.flatMap(l => l.steps))} 
                                    users={users || []}
                                    onAddRule={handleAddRule} 
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
                            {pools.map((pool) => (
                                <div key={pool.id} className="group/pool rounded-lg border bg-card p-4 space-y-4">
                                    <div className="flex items-center gap-2">
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
                                        {pool.lanes.map((lane) => (
                                            <div key={lane.id} className="group/lane rounded-md border bg-background">
                                                <div className="flex items-center gap-2 p-2 border-b">
                                                    <Input
                                                        value={lane.name}
                                                        onChange={(e) => handleUpdate('lane', { poolId: pool.id, laneId: lane.id }, e.target.value)}
                                                        className="h-8 text-sm font-medium border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-0 flex-1"
                                                    />
                                                    <DropdownMenu>
                                                        <DropdownMenuTrigger asChild>
                                                            <Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4" />Añadir</Button>
                                                        </DropdownMenuTrigger>
                                                        <DropdownMenuContent>
                                                            <DropdownMenuLabel>Elementos de BPMN</DropdownMenuLabel>
                                                            <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Nueva Tarea", 'task')}>
                                                                <BpmnIcon type="task" className="mr-2"/> Tarea
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Gateway Exclusivo", 'gateway-exclusive')}>
                                                                <BpmnIcon type="gateway-exclusive" className="mr-2"/> Gateway Exclusivo
                                                            </DropdownMenuItem>
                                                             <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Gateway Paralelo", 'gateway-parallel')}>
                                                                <BpmnIcon type="gateway-parallel" className="mr-2"/> Gateway Paralelo
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-8 w-8 opacity-0 group-hover/lane:opacity-100 text-destructive hover:text-destructive hover:bg-destructive/10"
                                                        onClick={() => handleDeleteLane(pool.id, lane.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                        <span className="sr-only">Eliminar carril</span>
                                                    </Button>
                                                </div>
                                                <div className="p-2 min-h-[50px] space-y-2">
                                                    <SortableContext items={lane.steps.map(s => s.id)} strategy={verticalListSortingStrategy} id={`lane-${lane.id}`}>
                                                        {lane.steps.map((step) => (
                                                            <SortableStep key={step.id} step={step} poolId={pool.id} laneId={lane.id} onUpdateStep={handleUpdateStep} onDeleteStep={handleDeleteStep}/>
                                                        ))}
                                                    </SortableContext>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
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


function FieldBuilderDialog({ onAddField, onClose, existingFields = [] }: { onAddField: (field: Omit<FormField, 'id'>) => void, onClose: () => void, existingFields?: FormField[] }) {
    const [label, setLabel] = useState("");
    const [type, setType] = useState<FormFieldType>('text');
    const [options, setOptions] = useState<string[]>(['']);
    // Autocalculated field state
    const [formula, setFormula] = useState("");
    // Checklist state
    const [checklistItems, setChecklistItems] = useState<string[]>(['']);
    // Webservice state
    const [webserviceUrl, setWebserviceUrl] = useState("");
    const [webserviceValueField, setWebserviceValueField] = useState("value");
    const [webserviceLabelField, setWebserviceLabelField] = useState("label");
    // Visibility state
    const [visibility, setVisibility] = useState<'editable' | 'readonly' | 'required' | 'hidden'>('editable');

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

    const handleAddChecklistItem = () => setChecklistItems([...checklistItems, '']);
    const handleChecklistItemChange = (index: number, value: string) => {
        const newItems = [...checklistItems];
        newItems[index] = value;
        setChecklistItems(newItems);
    };
    const handleRemoveChecklistItem = (index: number) => {
        if (checklistItems.length > 1) {
            setChecklistItems(checklistItems.filter((_, i) => i !== index));
        }
    };

    const handleSubmit = () => {
        const finalField: Omit<FormField, 'id'> = { label: label.trim(), type, visibility };
        if (['select', 'radio'].includes(type)) {
            finalField.options = options.map(o => o.trim()).filter(o => o);
        }
        if (type === 'checkbox') {
            finalField.options = [label.trim()];
        }
        if (type === 'autocalculated') {
            finalField.formula = formula;
            // Extract referenced field IDs from formula (e.g., {field-123} -> field-123)
            const matches = formula.match(/\{([^}]+)\}/g);
            if (matches) {
                finalField.referencedFields = matches.map(m => m.slice(1, -1));
            }
        }
        if (type === 'checklist') {
            finalField.checklistItems = checklistItems.map(i => i.trim()).filter(i => i);
        }
        if (type === 'webservice') {
            finalField.webserviceUrl = webserviceUrl;
            finalField.webserviceValueField = webserviceValueField;
            finalField.webserviceLabelField = webserviceLabelField;
        }
        onAddField(finalField);
        onClose();
    };

    const needsOptions = ['select', 'radio'].includes(type);

    // Get numeric fields for formula references
    const numericFields = existingFields.filter(f => f.type === 'number');

    return (
        <DialogContent className="max-h-[90vh] overflow-y-auto">
            <DialogHeader>
                <DialogTitle>Añadir Nuevo Campo de Formulario</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
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
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Campos Básicos</DropdownMenuLabel>
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="textarea">Área de texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="date">Fecha</SelectItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Campos de Selección</DropdownMenuLabel>
                            <SelectItem value="select">Lista desplegable</SelectItem>
                            <SelectItem value="radio">Botones de opción</SelectItem>
                            <SelectItem value="checkbox">Casilla de verificación</SelectItem>
                            <SelectItem value="webservice">Combo por Web Service</SelectItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel className="text-xs text-muted-foreground">Campos Avanzados</DropdownMenuLabel>
                            <SelectItem value="file">Carga de archivos</SelectItem>
                            <SelectItem value="table">Tabla dinámica</SelectItem>
                            <SelectItem value="autocalculated">Campo autocalculado</SelectItem>
                            <SelectItem value="signature">Firma digital</SelectItem>
                            <SelectItem value="checklist">Lista de verificación</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Options for select/radio */}
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

                {/* Autocalculated field configuration */}
                {type === 'autocalculated' && (
                    <div className="space-y-3 rounded-md border p-4 bg-muted/30">
                        <Label>Fórmula de Cálculo</Label>
                        <Textarea
                            value={formula}
                            onChange={(e) => setFormula(e.target.value)}
                            placeholder="Ej: {subtotal} * 0.16 + {subtotal}"
                            rows={2}
                        />
                        <p className="text-xs text-muted-foreground">
                            Use llaves para referenciar campos numéricos. Ej: <code className="bg-muted px-1 rounded">{'{campo1}'} + {'{campo2}'}</code>
                        </p>
                        {numericFields.length > 0 && (
                            <div className="text-xs">
                                <span className="text-muted-foreground">Campos disponibles: </span>
                                {numericFields.map(f => (
                                    <Badge key={f.id} variant="outline" className="mr-1 cursor-pointer" onClick={() => setFormula(prev => prev + `{${f.id}}`)}>
                                        {f.label}
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Checklist configuration */}
                {type === 'checklist' && (
                    <div className="space-y-2 rounded-md border p-4 bg-muted/30">
                        <Label>Elementos de la Lista</Label>
                        <div className="space-y-2">
                            {checklistItems.map((item, index) => (
                                <div key={index} className="flex items-center gap-2">
                                    <Checkbox disabled className="mt-0.5" />
                                    <Input
                                        value={item}
                                        onChange={(e) => handleChecklistItemChange(index, e.target.value)}
                                        placeholder={`Elemento ${index + 1}`}
                                    />
                                    <Button variant="ghost" size="icon" onClick={() => handleRemoveChecklistItem(index)} disabled={checklistItems.length <= 1}>
                                        <X className="h-4 w-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                        <Button variant="outline" size="sm" onClick={handleAddChecklistItem} className="mt-2">
                            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Elemento
                        </Button>
                    </div>
                )}

                {/* Webservice configuration */}
                {type === 'webservice' && (
                    <div className="space-y-3 rounded-md border p-4 bg-muted/30">
                        <div className="space-y-2">
                            <Label>URL del Servicio Web</Label>
                            <Input
                                value={webserviceUrl}
                                onChange={(e) => setWebserviceUrl(e.target.value)}
                                placeholder="https://api.example.com/options"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Campo de Valor</Label>
                                <Input
                                    value={webserviceValueField}
                                    onChange={(e) => setWebserviceValueField(e.target.value)}
                                    placeholder="id"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Campo de Etiqueta</Label>
                                <Input
                                    value={webserviceLabelField}
                                    onChange={(e) => setWebserviceLabelField(e.target.value)}
                                    placeholder="name"
                                />
                            </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            El servicio debe retornar un array JSON. Los campos indican qué propiedades usar para el valor y la etiqueta.
                        </p>
                    </div>
                )}

                {/* Table configuration placeholder */}
                {type === 'table' && (
                    <div className="rounded-md border p-4 bg-muted/30 text-center">
                        <p className="text-sm text-muted-foreground">
                            La configuración de columnas de la tabla estará disponible después de guardar el campo.
                        </p>
                    </div>
                )}

                {/* Signature info */}
                {type === 'signature' && (
                    <div className="rounded-md border p-4 bg-muted/30">
                        <p className="text-sm text-muted-foreground">
                            Este campo permitirá al usuario dibujar o subir su firma digital. La firma se almacenará como imagen.
                        </p>
                    </div>
                )}

                {/* Visibility configuration */}
                <div className="space-y-2 pt-2 border-t">
                    <Label>Comportamiento del Campo</Label>
                    <Select value={visibility} onValueChange={(v) => setVisibility(v as typeof visibility)}>
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="editable">Editable</SelectItem>
                            <SelectItem value="required">Obligatorio</SelectItem>
                            <SelectItem value="readonly">Solo lectura</SelectItem>
                            <SelectItem value="hidden">Oculto</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSubmit} disabled={!label.trim()}>Añadir Campo</Button>
            </DialogFooter>
        </DialogContent>
    );
}

function RuleConditionDisplay({ condition, fields, steps }: { condition: RuleCondition, fields: FormField[], steps: WorkflowStepDefinition[] }) {
    const source = condition.type === 'form'
        ? fields.find(f => f.id === condition.fieldId)
        : steps.find(s => s.id === condition.fieldId);

    const operatorLabels: Partial<Record<RuleOperator, string>> = {
        '==': 'es igual a', '!=': 'no es igual a', '>': 'es mayor que', '<': 'es menor que', '>=': '≥', '<=': '≤',
        'contains': 'contiene', 'not_contains': 'no contiene', 'is': 'es', 'is_not': 'no es',
    };

    const getSourceTypeIcon = (type: FormFieldType | 'outcome' | undefined) => {
        switch(type) {
            case 'number': return <Hash className="h-4 w-4 text-blue-500"/>;
            case 'text':
            case 'textarea':
                return <CaseSensitive className="h-4 w-4 text-blue-500"/>;
            case 'select':
            case 'radio':
            case 'checkbox':
            case 'outcome':
                return <GitBranch className="h-4 w-4 text-blue-500" />;
            default: return null;
        }
    }

    const sourceType = condition.type === 'form' ? 'Campo' : 'Resultado de Tarea';

    return (
        <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs text-muted-foreground">{sourceType}:</span>
            <div className="flex items-center gap-1">
                {getSourceTypeIcon(source?.type || (condition.type === 'outcome' ? 'outcome' : undefined))}
                <Badge variant="outline" className="bg-white dark:bg-background">{source?.name || source?.label || '??'}</Badge>
            </div>
            <span className="font-medium text-blue-600 dark:text-blue-400">{operatorLabels[condition.operator] || condition.operator}</span>
            <Badge variant="secondary" className="font-mono bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">{condition.value}</Badge>
        </div>
    );
}


function RuleActionDisplay({ action, steps, users }: { action: RuleAction, steps: WorkflowStepDefinition[], users: UserType[] }) {
    const getActionIcon = (type: RuleAction['type']) => {
        switch(type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP':
                return <GitBranch className="h-5 w-5 text-green-500"/>;
            case 'ASSIGN_USER':
                return <User className="h-5 w-5 text-green-500"/>;
            case 'SEND_NOTIFICATION':
                return <Bell className="h-5 w-5 text-green-500"/>;
            case 'CHANGE_REQUEST_PRIORITY':
                return <AlertTriangle className="h-5 w-5 text-green-500"/>;
        }
    }

    const actionTypeLabels: Record<RuleAction['type'], string> = {
        'REQUIRE_ADDITIONAL_STEP': 'Añadir paso requerido',
        'ROUTE_TO_STEP': 'Enrutar a paso',
        'ASSIGN_USER': 'Asignar usuario',
        'SEND_NOTIFICATION': 'Enviar notificación',
        'CHANGE_REQUEST_PRIORITY': 'Cambiar prioridad',
    };

    const renderActionDetails = () => {
        switch (action.type) {
            case 'REQUIRE_ADDITIONAL_STEP':
            case 'ROUTE_TO_STEP':
                const step = steps.find(s => s.id === action.stepId);
                return <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">{step?.name || '??'}</Badge>;
            case 'ASSIGN_USER':
                const assignUser = users.find(u => u.id === action.userId);
                const assignStep = steps.find(s => s.id === action.stepId);
                return (
                    <span className="flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">{assignUser?.fullName || '??'}</Badge>
                        <span className="text-muted-foreground">→</span>
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-200">{assignStep?.name || '??'}</Badge>
                    </span>
                );
            case 'SEND_NOTIFICATION':
                return (
                    <span className="flex flex-wrap items-center gap-1">
                        <Badge variant="secondary">{action.target}</Badge>
                        <span className="text-xs text-muted-foreground italic truncate max-w-[150px]">"{action.message}"</span>
                    </span>
                );
            case 'CHANGE_REQUEST_PRIORITY':
                return <Badge variant="destructive">{action.priority}</Badge>;
            default:
                return null;
        }
    }

    return (
        <div className="flex items-center gap-3">
            <div className="flex-shrink-0">{getActionIcon(action.type)}</div>
            <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">{actionTypeLabels[action.type]}</span>
                <div className="flex flex-wrap items-center gap-2 text-sm">{renderActionDetails()}</div>
            </div>
        </div>
    );
}

function RuleDisplay({ rule, fields, pools, users, onRemove }: { rule: Rule, fields: FormField[], pools: Pool[], users: UserType[], onRemove: (id: string) => void }) {
    const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));

    return (
        <div className="group relative rounded-lg border bg-card overflow-hidden transition-all hover:shadow-md">
            <div className="flex">
                {/* SI - Condition Side */}
                <div className="flex-1 p-4 bg-blue-50/50 dark:bg-blue-950/20 border-r">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-blue-500 text-white rounded">SI</span>
                        <span className="text-xs text-muted-foreground">Condición</span>
                    </div>
                    <RuleConditionDisplay condition={rule.condition} fields={fields} steps={allSteps} />
                </div>

                {/* Arrow */}
                <div className="flex items-center justify-center px-3 bg-muted/30">
                    <ChevronsRight className="h-6 w-6 text-muted-foreground" />
                </div>

                {/* ENTONCES - Action Side */}
                <div className="flex-1 p-4 bg-green-50/50 dark:bg-green-950/20">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold bg-green-500 text-white rounded">ENTONCES</span>
                        <span className="text-xs text-muted-foreground">Acción</span>
                    </div>
                    <RuleActionDisplay action={rule.action} steps={allSteps} users={users} />
                </div>
            </div>

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


function RuleBuilderDialog({ fields, steps, users, onAddRule, onClose }: { fields: FormField[], steps: WorkflowStepDefinition[], users: UserType[], onAddRule: (rule: Omit<Rule, 'id'>) => void, onClose: () => void }) {
    const { toast } = useToast();
    const [condition, setCondition] = useState<Partial<RuleCondition>>({ type: 'form' });
    const [action, setAction] = useState<Partial<RuleAction>>({ type: 'REQUIRE_ADDITIONAL_STEP' });

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
    
    const availableOperators = getOperatorsForType(selectedSource?.type || (condition.type === 'outcome' ? 'outcome' : undefined));

    const handleSubmit = () => {
        if (!condition.fieldId || !condition.operator || (condition.value === undefined || condition.value === '')) {
            toast({ variant: "destructive", title: "Condición incompleta" }); return;
        }

        const newRule: Omit<Rule, 'id'> = { condition: condition as RuleCondition, action: action as RuleAction };
        onAddRule(newRule);
        toast({ title: "Regla agregada" });
        onClose();
    };

    const hasDataForRules = formFieldsForRules.length > 0 || decisionTasks.length > 0;
    const hasStepsForActions = steps.length > 0;

    return (
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>Constructor de Reglas de Negocio</DialogTitle>
                <DialogDescription>Cree una regla "SI-ENTONCES" para automatizar su flujo de trabajo.</DialogDescription>
            </DialogHeader>

            {/* Warning if no data available */}
            {(!hasDataForRules || !hasStepsForActions) && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-900 p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="font-medium text-amber-700 dark:text-amber-400">Datos insuficientes para crear reglas</p>
                            <ul className="text-sm text-amber-600 dark:text-amber-500 list-disc list-inside">
                                {!hasDataForRules && (
                                    <li>Agregue campos al formulario (número, texto, desplegable) o tareas con resultados definidos</li>
                                )}
                                {!hasStepsForActions && (
                                    <li>Agregue pasos al flujo de trabajo para poder enrutar o asignar</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid gap-6 py-4">
                <div className="p-4 rounded-md border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-900">
                    <h3 className="mb-4 text-lg font-medium flex items-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-sm font-bold bg-blue-500 text-white rounded mr-2">SI</span>
                        Condición
                    </h3>
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
                                            {(selectedSource?.options || selectedSource?.outcomes)?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                         </div>
                    </div>
                </div>

                <div className="p-4 rounded-md border border-green-200 bg-green-50/50 dark:bg-green-950/20 dark:border-green-900">
                    <h3 className="mb-4 text-lg font-medium flex items-center">
                        <span className="inline-flex items-center justify-center px-2 py-0.5 text-sm font-bold bg-green-500 text-white rounded mr-2">ENTONCES</span>
                        Acción
                    </h3>
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
                                <div className="grid grid-cols-2 gap-2"><div className="space-y-2"><Label>Destinatario</Label><Select value={(action as any).target} onValueChange={(v) => setAction(a => ({...a, target: v}))}><SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger><SelectContent><SelectItem value="submitter">Creador de la solicitud</SelectItem><SelectItem value="Admin">Admin</SelectItem><SelectItem value="Member">Miembro</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Mensaje</Label><Input placeholder="Tu mensaje aquí" value={(action as any).message || ''} onChange={(e) => setAction(a => ({...a, message: e.target.value}))}/></div></div>
                            }
                             { action.type === 'CHANGE_REQUEST_PRIORITY' &&
                                <><Label>Nueva Prioridad</Label><Select value={(action as any).priority} onValueChange={(v) => setAction(a => ({...a, priority: v}))}><SelectTrigger><SelectValue placeholder="Seleccione prioridad..."/></SelectTrigger><SelectContent><SelectItem value="Alta">Alta</SelectItem><SelectItem value="Media">Media</SelectItem><SelectItem value="Baja">Baja</SelectItem></SelectContent></Select></>
                            }
                        </div>
                    </div>
                </div>

                {/* Preview Section */}
                <div className="p-4 rounded-md border bg-muted/30">
                    <h3 className="mb-3 text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <span className="h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center text-[10px]">👁</span>
                        Vista Previa de la Regla
                    </h3>
                    <div className="rounded-md bg-card p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold bg-blue-500 text-white rounded">SI</span>
                            {selectedSource ? (
                                <span className="text-blue-600 dark:text-blue-400">
                                    {condition.type === 'form' ? 'Campo' : 'Resultado'} "{selectedSource?.label || selectedSource?.name}"
                                    {condition.operator && ` ${condition.operator}`}
                                    {condition.value && ` "${condition.value}"`}
                                </span>
                            ) : (
                                <span className="text-muted-foreground italic">seleccione una condición...</span>
                            )}
                            <ChevronsRight className="h-4 w-4 text-muted-foreground mx-1" />
                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold bg-green-500 text-white rounded">ENTONCES</span>
                            {action.type ? (
                                <span className="text-green-600 dark:text-green-400">
                                    {action.type === 'REQUIRE_ADDITIONAL_STEP' && `Añadir paso "${steps.find(s => s.id === (action as any).stepId)?.name || '...'}"` }
                                    {action.type === 'ROUTE_TO_STEP' && `Enrutar a "${steps.find(s => s.id === (action as any).stepId)?.name || '...'}"` }
                                    {action.type === 'ASSIGN_USER' && `Asignar "${users.find(u => u.id === (action as any).userId)?.fullName || '...'}" a "${steps.find(s => s.id === (action as any).stepId)?.name || '...'}"` }
                                    {action.type === 'SEND_NOTIFICATION' && `Notificar a "${(action as any).target || '...'}"` }
                                    {action.type === 'CHANGE_REQUEST_PRIORITY' && `Cambiar prioridad a "${(action as any).priority || '...'}"` }
                                </span>
                            ) : (
                                <span className="text-muted-foreground italic">seleccione una acción...</span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                <Button onClick={handleSubmit}>Añadir Regla</Button>
            </DialogFooter>
        </DialogContent>
    )
}


    