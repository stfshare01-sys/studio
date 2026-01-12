
"use client";

import { useState } from "react";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2, UserSquare, Pencil, GripVertical, X, AlertTriangle } from "lucide-react";
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
import { useFirestore } from "@/firebase";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType, FormFieldType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";


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
        select: 'Desplegable', checkbox: 'Casilla', radio: 'Opciones', file: 'Archivo'
    };

    return (
        <div ref={setNodeRef} style={style} className="group flex items-center gap-2 rounded-md p-3 bg-muted">
            <button {...attributes} {...listeners} className="cursor-grab p-1">
                <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="flex-1 font-medium">{field.label}</div>
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
    onUpdateStep 
}: { 
    step: WorkflowStepDefinition, 
    poolId: string, 
    laneId: string, 
    onUpdateStep: (poolId: string, laneId: string, stepId: string, updates: Partial<WorkflowStepDefinition>) => void 
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
                 <div className="flex items-center gap-1 text-muted-foreground">
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
                    )}
                </div>
            </div>
            
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
    
    if (stepType === 'gateway-exclusive') {
        newStep.name = 'Decisión';
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
    
    // Flatten steps from pools and lanes for saving
    const allSteps = pools.flatMap(pool => pool.lanes.flatMap(lane => lane.steps));

    const newTemplate = {
        name: templateName,
        description: templateDescription,
        fields,
        steps: allSteps, // Includes all properties like 'outcomes'
        rules,
    };

    try {
      const templatesCollection = collection(firestore, 'request_templates');
      await addDocumentNonBlocking(templatesCollection, newTemplate);

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

  const handleAddRule = (rule: Rule) => {
    setRules([...rules, rule]);
    setIsRuleDialogOpen(false);
  }

  const handleRemoveRule = (index: number) => {
    setRules(rules.filter((_, i) => i !== index));
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
      setRules(data.rules);
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
                           <FieldBuilderDialog onAddField={handleAddField} onClose={() => setIsFieldDialogOpen(false)} />
                        </Dialog>
                        </CardContent>
                    </Card>
                    <Card>
                    <CardHeader>
                        <CardTitle>Motor de Reglas de Negocio</CardTitle>
                        <CardDescription>Defina la lógica condicional para automatizar las decisiones.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2 rounded-md border p-4">
                            {rules.length === 0 && (
                                <div className="text-center text-sm text-muted-foreground py-4 space-y-1">
                                    <p>No hay reglas definidas.</p>
                                    <p className="text-xs">Las reglas permiten enrutar el flujo basado en resultados o datos.</p>
                                </div>
                            )}
                            {rules.map((rule, index) => {
                                const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));
                                const source = rule.condition.type === 'form' 
                                    ? fields.find(f => f.id === rule.condition.fieldId)
                                    : allSteps.find(s => s.id === rule.condition.fieldId);
                                const actionStep = allSteps.find(s => s.id === rule.action.stepId);
                                return (
                                    <div key={index} className="group relative flex items-center gap-4 rounded-md bg-muted p-4">
                                        <div className="absolute left-[-9px] top-[calc(50%-8px)] h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
                                            <GitBranch className="h-3 w-3 text-primary" />
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">SI</span>
                                            <span className="font-mono text-sm bg-background p-1 rounded-sm">
                                                {source?.name || source?.label || '??'} {rule.condition.operator} {rule.condition.value}
                                            </span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-bold">ENTONCES</span>
                                            <span className="font-mono text-sm bg-background p-1 rounded-sm">
                                                Ruta a: {actionStep?.name || '??'}
                                            </span>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute right-2 top-2 h-6 w-6 opacity-0 group-hover:opacity-100"
                                            onClick={() => handleRemoveRule(index)}
                                        >
                                            <Trash2 className="h-4 w-4 text-destructive" />
                                            <span className="sr-only">Eliminar regla</span>
                                        </Button>
                                    </div>
                                )
                            })}
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
                                <div key={pool.id} className="rounded-lg border bg-card p-4 space-y-4">
                                    <div className="flex items-center">
                                        <Input
                                            value={pool.name}
                                            onChange={(e) => handleUpdate('pool', { poolId: pool.id }, e.target.value)}
                                            className="text-base font-semibold border-none focus-visible:ring-1 focus-visible:ring-ring bg-transparent p-0 flex-1"
                                        />
                                        <Button variant="ghost" size="sm" onClick={() => handleAddLaneToPool(pool.id)}>
                                            <PlusCircle className="mr-2 h-4 w-4" /> Añadir Carril
                                        </Button>
                                    </div>
                                    <div className="space-y-2 pl-6">
                                        {pool.lanes.map((lane) => (
                                            <div key={lane.id} className="rounded-md border bg-background">
                                                <div className="flex items-center p-2 border-b">
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
                                                            <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Decisión", 'gateway-exclusive')}>
                                                                <BpmnIcon type="gateway-exclusive" className="mr-2"/> Gateway Exclusivo
                                                            </DropdownMenuItem>
                                                             <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Gateway Paralelo", 'gateway-parallel')}>
                                                                <BpmnIcon type="gateway-parallel" className="mr-2"/> Gateway Paralelo
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </div>
                                                <div className="p-2 min-h-[50px] space-y-2">
                                                    <SortableContext items={lane.steps.map(s => s.id)} strategy={verticalListSortingStrategy} id={`lane-${lane.id}`}>
                                                        {lane.steps.map((step) => (
                                                            <SortableStep key={step.id} step={step} poolId={pool.id} laneId={lane.id} onUpdateStep={handleUpdateStep}/>
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


function FieldBuilderDialog({ onAddField, onClose }: { onAddField: (field: Omit<FormField, 'id'>) => void, onClose: () => void }) {
    const [label, setLabel] = useState("");
    const [type, setType] = useState<FormFieldType>('text');
    const [options, setOptions] = useState<string[]>(['']);

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
        if (['select', 'radio'].includes(type)) {
            finalField.options = options.map(o => o.trim()).filter(o => o);
        }
        if (type === 'checkbox') {
            finalField.options = [label.trim()]; // Checkbox often has one option which is the label itself
        }
        onAddField(finalField);
        onClose();
    };

    const needsOptions = ['select', 'radio'].includes(type);

    return (
        <DialogContent>
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
                            <SelectItem value="text">Texto</SelectItem>
                            <SelectItem value="textarea">Área de texto</SelectItem>
                            <SelectItem value="number">Número</SelectItem>
                            <SelectItem value="date">Fecha</SelectItem>
                            <SelectItem value="select">Lista desplegable</SelectItem>
                            <SelectItem value="radio">Botones de opción</SelectItem>
                            <SelectItem value="checkbox">Casilla de verificación</SelectItem>
                            <SelectItem value="file">Carga de archivos</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
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


function RuleBuilderDialog({ fields, steps, onAddRule, onClose }: { fields: FormField[], steps: WorkflowStepDefinition[], onAddRule: (rule: Rule) => void, onClose: () => void }) {
    const { toast } = useToast();
    const [ruleType, setRuleType] = useState<'form' | 'outcome'>('form');
    const [conditionSource, setConditionSource] = useState<string>('');
    const [conditionOperator, setConditionOperator] = useState<RuleCondition['operator'] | ''>('');
    const [conditionValue, setConditionValue] = useState<string>('');
    const [actionStep, setActionStep] = useState<string>('');

    const decisionTasks = steps.filter(s => s.outcomes && s.outcomes.length > 0);
    const formFieldsForRules = fields.filter(f => ['number', 'select', 'radio'].includes(f.type));

    const selectedSource = ruleType === 'form' ? formFieldsForRules.find(f => f.id === conditionSource) : decisionTasks.find(s => s.id === conditionSource);

    const handleSubmit = () => {
        if (!conditionSource || !conditionOperator || !conditionValue || !actionStep) {
            toast({
                variant: "destructive",
                title: "Campos incompletos",
                description: "Por favor, rellene todos los campos de la regla.",
            });
            return;
        }

        const newRule: Rule = {
            condition: {
                type: ruleType,
                fieldId: conditionSource,
                operator: conditionOperator as RuleCondition['operator'],
                value: conditionValue,
            },
            action: {
                type: 'ROUTE_TO_STEP',
                stepId: actionStep,
            }
        };
        onAddRule(newRule);
        toast({
            title: "Regla agregada",
            description: "La regla de negocio se ha creado correctamente.",
        });
        onClose();
    };

    return (
        <DialogContent className="sm:max-w-3xl">
            <DialogHeader>
                <DialogTitle>Constructor de Reglas de Negocio</DialogTitle>
                <DialogDescription>
                    Cree una regla "SI-ENTONCES" para enrutar su flujo de trabajo.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary"/> Condición (SI)</h3>
                    <div className="grid grid-cols-4 gap-4">
                        <div className="space-y-2 col-span-1">
                            <Label>Tipo de Condición</Label>
                            <Select value={ruleType} onValueChange={(v) => { setRuleType(v as any); setConditionSource(''); }}>
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
                                <Select value={conditionSource} onValueChange={setConditionSource}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione fuente..."/></SelectTrigger>
                                    <SelectContent>
                                        {ruleType === 'form' && formFieldsForRules.map(field => (
                                            <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>
                                        ))}
                                         {ruleType === 'outcome' && decisionTasks.map(task => (
                                            <SelectItem key={task.id} value={task.id}>{task.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Operador</Label>
                                <Select value={conditionOperator} onValueChange={(v) => setConditionOperator(v as any)}>
                                    <SelectTrigger><SelectValue placeholder="Seleccione..."/></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="==">{'=='} (Igual a)</SelectItem>
                                        <SelectItem value="!=">{'!='} (No es igual a)</SelectItem>
                                        {ruleType === 'form' && selectedSource?.type === 'number' && <>
                                            <SelectItem value=">">{'>'} (Mayor que)</SelectItem>
                                            <SelectItem value="<">{'<'} (Menor que)</SelectItem>
                                            <SelectItem value=">=">{'>='} (Mayor o igual que)</SelectItem>
                                            <SelectItem value="<=">{'<='} (Menor o igual que)</SelectItem>
                                        </>}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>Valor</Label>
                                {ruleType === 'form' && selectedSource?.type === 'number' && (
                                    <Input type="number" placeholder="p.ej., 5000" value={conditionValue} onChange={(e) => setConditionValue(e.target.value)} />
                                )}
                                {ruleType === 'form' && (selectedSource?.type === 'select' || selectedSource?.type === 'radio') && (
                                     <Select value={conditionValue} onValueChange={setConditionValue}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione valor..."/></SelectTrigger>
                                        <SelectContent>
                                            {selectedSource.options?.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                                {ruleType === 'outcome' && (
                                     <Select value={conditionValue} onValueChange={setConditionValue}>
                                        <SelectTrigger><SelectValue placeholder="Seleccione resultado..."/></SelectTrigger>
                                        <SelectContent>
                                            {selectedSource?.outcomes?.map(out => <SelectItem key={out} value={out}>{out}</SelectItem>)}
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
                            <Select value="ROUTE_TO_STEP" >
                                <SelectTrigger><SelectValue/></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ROUTE_TO_STEP">Enrutar a Paso</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Paso de Destino</Label>
                            <Select value={actionStep} onValueChange={setActionStep}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un paso..."/>
                                </SelectTrigger>
                                <SelectContent>
                                    {steps.map(step => (
                                        <SelectItem key={step.id} value={step.id}>{step.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </div>
                 <div className="bg-amber-50 border-l-4 border-amber-400 p-3 text-amber-800 text-xs rounded-r-md">
                    <div className="flex items-start">
                        <AlertTriangle className="h-5 w-5 mr-2 shrink-0" />
                        <p>Las reglas de "Ruta" se evalúan después de completar una tarea de decisión. Las reglas de "Añadir Paso" (basadas en campos de formulario) se evalúan solo al crear la solicitud.</p>
                    </div>
                </div>
            </div>
            <DialogFooter>
                <DialogClose asChild>
                    <Button variant="ghost">Cancelar</Button>
                </DialogClose>
                <Button onClick={handleSubmit}>Añadir Regla</Button>
            </DialogFooter>
        </DialogContent>
    )
}

    