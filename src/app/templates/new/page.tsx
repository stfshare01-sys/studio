

"use client";

import { useState } from "react";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, PlusCircle, Trash2, GitBranch, ShieldCheck, CheckCircle, GitMerge, GitFork, Library, WandSparkles, Loader2 } from "lucide-react";
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

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useFirestore } from "@/firebase";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { FormField, WorkflowStepDefinition, Rule, RuleCondition, RuleAction, WorkflowStepType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { generateProcessFromDescription, GenerateProcessOutput } from "@/ai/flows/process-generation";


const reorder = <T,>(list: T[], startIndex: number, endIndex: number): T[] => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);
  return result;
};


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
                        placeholder='Ej: "Crear un flujo para aprobar facturas. Si la factura supera los $5,000, necesita aprobación del gerente en el departamento de Finanzas. De lo contrario, solo requiere la aprobación del analista financiero. El proceso lo inicia cualquiera."'
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


export default function NewTemplatePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  
  const [steps, setSteps] = useState<WorkflowStepDefinition[]>([]);
  const [newStepName, setNewStepName] = useState("");
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);
  const [currentStepType, setCurrentStepType] = useState<WorkflowStepType>('task');


  const [fields, setFields] = useState<FormField[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FormField['type']>('text');
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);

  // New state for pools and lanes
  const [pools, setPools] = useState<Pool[]>([]);


  const handleAddStep = () => {
    if (newStepName.trim() !== "") {
      const newStep: WorkflowStepDefinition = {
        id: `step-${Date.now()}`,
        name: newStepName.trim(),
        type: currentStepType,
      };
      // Instead of adding to a flat list, we need a target lane. For simplicity, let's not use this directly.
      // This function will be called from within a lane context.
      setNewStepName("");
      setIsStepDialogOpen(false);
      return newStep;
    }
    return null;
  };

  const openStepDialog = (type: WorkflowStepType) => {
    setCurrentStepType(type);
    setIsStepDialogOpen(true);
  }

  const handleAddStepToLane = (poolId: string, laneId: string, stepName: string, stepType: WorkflowStepType) => {
    if (stepName.trim() === "") return;
    
    const newStep: WorkflowStepDefinition = {
        id: `step-${Date.now()}`,
        name: stepName.trim(),
        type: stepType,
    };

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
    setSteps(prev => [...prev, newStep]); // Keep flat list in sync
    setNewStepName("");
    setIsStepDialogOpen(false);
  }

  const handleAddField = () => {
    if (newFieldName.trim() !== "") {
        const newField: FormField = {
            id: `field-${Date.now()}`,
            label: newFieldName.trim(),
            type: newFieldType,
        };
        setFields([...fields, newField]);
        setNewFieldName("");
        setNewFieldType("text");
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

  const onDragEnd = (result: DropResult) => {
    const { source, destination, type } = result;
    if (!destination) return;
    
    if (type === 'pool') {
        setPools(reorder(pools, source.index, destination.index));
        return;
    }
    
    if (type === 'lane') {
        const sourcePoolId = source.droppableId;
        const destPoolId = destination.droppableId;
        
        const sourcePool = pools.find(p => p.id === sourcePoolId);
        const destPool = pools.find(p => p.id === destPoolId);

        if (!sourcePool || !destPool) return;

        if (sourcePoolId === destPoolId) {
            const reorderedLanes = reorder(sourcePool.lanes, source.index, destination.index);
            setPools(pools.map(p => p.id === sourcePoolId ? { ...p, lanes: reorderedLanes } : p));
        } else {
            const [removed] = sourcePool.lanes.splice(source.index, 1);
            destPool.lanes.splice(destination.index, 0, removed);
            setPools([...pools]);
        }
        return;
    }

    if (type === 'step') {
        const sourceLaneId = source.droppableId;
        const destLaneId = destination.droppableId;
        
        let sourceLane: Lane | undefined;
        let sourcePoolId: string | undefined;
        let destLane: Lane | undefined;

        pools.forEach(pool => {
            const lane = pool.lanes.find(l => l.id === sourceLaneId);
            if (lane) {
                sourceLane = lane;
                sourcePoolId = pool.id;
            }
            const dLane = pool.lanes.find(l => l.id === destLaneId);
            if (dLane) {
                destLane = dLane;
            }
        });

        if (!sourceLane || !destLane) return;

        if (sourceLaneId === destLaneId) {
            const reorderedSteps = reorder(sourceLane.steps, source.index, destination.index);
            sourceLane.steps = reorderedSteps;
        } else {
            const [removed] = sourceLane.steps.splice(source.index, 1);
            destLane.steps.splice(destination.index, 0, removed);
        }
        setPools([...pools]);
    }

  };

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
        steps: allSteps.map(s => ({id: s.id, name: s.name, type: s.type})),
        rules,
    };

    try {
      if (!firestore) return;
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

  const fieldTypeLabels: Record<FormField['type'], string> = {
    text: 'Texto',
    textarea: 'Área de texto',
    date: 'Fecha',
    number: 'Número',
  };

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
      setFields(data.fields);
      setPools(data.pools);
      setRules(data.rules);

      // Keep the flat `steps` list in sync for the rule builder
      const allSteps = data.pools.flatMap(pool => pool.lanes.flatMap(lane => lane.steps));
      setSteps(allSteps);
  };
  
  return (
    <SiteLayout>
        <DragDropContext onDragEnd={onDragEnd}>
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
                    <Droppable droppableId="fields-droppable">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 rounded-md border p-4 min-h-[120px]">
                            {fields.length === 0 && (
                                <p className="text-center text-sm text-muted-foreground py-4">Añada campos a su formulario.</p>
                            )}
                            {fields.map((field, index) => (
                                <Draggable key={field.id} draggableId={field.id} index={index}>
                                {(provided, snapshot) => (
                                    <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`group flex items-center gap-2 rounded-md p-3 ${snapshot.isDragging ? 'bg-primary/10' : 'bg-muted'}`}
                                    >
                                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                    <div className="flex-1 font-medium">{field.label}</div>
                                    <div className="text-sm text-muted-foreground">({fieldTypeLabels[field.type]})</div>

                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        onClick={() => handleRemoveField(field.id)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                        <span className="sr-only">Eliminar campo</span>
                                    </Button>
                                    </div>
                                )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                            </div>
                        )}
                        </Droppable>

                    <Dialog open={isFieldDialogOpen} onOpenChange={setIsFieldDialogOpen}>
                        <DialogTrigger asChild>
                            <Button variant="outline" className="w-full">
                                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Campo
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>Añadir Nuevo Campo de Formulario</DialogTitle>
                            </DialogHeader>
                            <div className="py-4 space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="field-name">Etiqueta del Campo</Label>
                                    <Input
                                        id="field-name"
                                        value={newFieldName}
                                        onChange={(e) => setNewFieldName(e.target.value)}
                                        placeholder="p.ej., Nombre del Solicitante"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="field-type">Tipo de Campo</Label>
                                    <Select value={newFieldType} onValueChange={(value) => setNewFieldType(value as FormField['type'])}>
                                        <SelectTrigger id="field-type">
                                            <SelectValue placeholder="Seleccione un tipo..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="text">Texto</SelectItem>
                                            <SelectItem value="textarea">Área de texto</SelectItem>
                                            <SelectItem value="date">Fecha</SelectItem>
                                            <SelectItem value="number">Número</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <DialogFooter>
                                <DialogClose asChild>
                                    <Button variant="ghost">Cancelar</Button>
                                </DialogClose>
                                <Button onClick={handleAddField}>Añadir Campo</Button>
                            </DialogFooter>
                        </DialogContent>
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
                            <p className="text-center text-sm text-muted-foreground py-4">No hay reglas definidas.</p>
                        )}
                        {rules.map((rule, index) => {
                            const field = fields.find(f => f.id === rule.condition.fieldId);
                            const allSteps = pools.flatMap(p => p.lanes.flatMap(l => l.steps));
                            const actionStep = allSteps.find(s => s.id === rule.action.stepId);
                            return (
                                <div key={index} className="group relative flex items-center gap-4 rounded-md bg-muted p-4">
                                     <div className="absolute left-[-9px] top-[calc(50%-8px)] h-4 w-4 rounded-full bg-primary/20 flex items-center justify-center">
                                        <GitBranch className="h-3 w-3 text-primary" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold">SI</span>
                                        <span className="font-mono text-sm bg-background p-1 rounded-sm">
                                            {field?.label || '??'} {rule.condition.operator} {rule.condition.value}
                                        </span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-bold">ENTONCES</span>
                                        <span className="font-mono text-sm bg-background p-1 rounded-sm">
                                            Añadir paso: {actionStep?.name || '??'}
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
                        Diseñe las etapas de su proceso usando Piscinas (Pools) y Carriles (Lanes).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                     <Droppable droppableId="board" type="pool">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-4 rounded-md bg-muted/50 p-4 min-h-[300px]">
                                {pools.map((pool, index) => (
                                    <Draggable key={pool.id} draggableId={pool.id} index={index}>
                                        {(provided) => (
                                            <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-lg border bg-card p-4 space-y-4">
                                                <div className="flex items-center" {...provided.dragHandleProps}>
                                                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                                    <h3 className="font-semibold flex-1">{pool.name}</h3>
                                                    <Button variant="ghost" size="sm" onClick={() => handleAddLaneToPool(pool.id)}>
                                                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Carril
                                                    </Button>
                                                </div>
                                                <Droppable droppableId={pool.id} type="lane">
                                                    {(provided) => (
                                                        <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2 pl-6">
                                                            {pool.lanes.map((lane, index) => (
                                                                 <Draggable key={lane.id} draggableId={lane.id} index={index}>
                                                                    {(provided) => (
                                                                        <div ref={provided.innerRef} {...provided.draggableProps} className="rounded-md border bg-background">
                                                                             <div className="flex items-center p-2 border-b" {...provided.dragHandleProps}>
                                                                                <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                                                                <h4 className="text-sm font-medium flex-1">{lane.name}</h4>
                                                                                
                                                                                 <DropdownMenu>
                                                                                    <DropdownMenuTrigger asChild>
                                                                                        <Button variant="ghost" size="sm"><PlusCircle className="mr-2 h-4 w-4" />Añadir</Button>
                                                                                    </DropdownMenuTrigger>
                                                                                    <DropdownMenuContent>
                                                                                        <DropdownMenuLabel>Elementos de BPMN</DropdownMenuLabel>
                                                                                        <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Nueva Tarea", 'task')}>
                                                                                            <BpmnIcon type="task" className="mr-2"/> Tarea
                                                                                        </DropdownMenuItem>
                                                                                         <DropdownMenuItem onSelect={() => handleAddStepToLane(pool.id, lane.id, "Nuevo Gateway", 'gateway-exclusive')}>
                                                                                            <BpmnIcon type="gateway-exclusive" className="mr-2"/> Gateway Exclusivo
                                                                                        </DropdownMenuItem>
                                                                                    </DropdownMenuContent>
                                                                                </DropdownMenu>

                                                                            </div>
                                                                            <Droppable droppableId={lane.id} type="step">
                                                                                {(provided) => (
                                                                                    <div ref={provided.innerRef} {...provided.droppableProps} className="p-2 min-h-[50px] space-y-2">
                                                                                        {lane.steps.map((step, index) => (
                                                                                            <Draggable key={step.id} draggableId={step.id} index={index}>
                                                                                                {(provided, snapshot) => (
                                                                                                    <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}
                                                                                                        className={cn("group flex items-center gap-3 rounded-md p-2 border text-sm", snapshot.isDragging ? 'bg-primary/10 border-primary' : 'bg-muted border-muted')}>
                                                                                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                                                                                        <BpmnIcon type={step.type} className="h-4 w-4" />
                                                                                                        <div className="flex-1">{step.name}</div>
                                                                                                    </div>
                                                                                                )}
                                                                                            </Draggable>
                                                                                        ))}
                                                                                        {provided.placeholder}
                                                                                    </div>
                                                                                )}
                                                                            </Droppable>
                                                                        </div>
                                                                    )}
                                                                 </Draggable>
                                                            ))}
                                                            {provided.placeholder}
                                                        </div>
                                                    )}
                                                </Droppable>
                                            </div>
                                        )}
                                    </Draggable>
                                ))}
                                {provided.placeholder}
                            </div>
                        )}
                    </Droppable>
                    <Button variant="outline" className="w-full mt-4" onClick={handleAddPool}>
                        <Library className="mr-2 h-4 w-4" /> Añadir Piscina
                    </Button>
                </CardContent>
            </Card>
        </main>
        </div>
        </DragDropContext>
    </SiteLayout>
  );
}


function RuleBuilderDialog({ fields, steps, onAddRule, onClose }: { fields: FormField[], steps: WorkflowStepDefinition[], onAddRule: (rule: Rule) => void, onClose: () => void }) {
    const [conditionField, setConditionField] = useState<string>('');
    const [conditionOperator, setConditionOperator] = useState<RuleCondition['operator'] | ''>('');
    const [conditionValue, setConditionValue] = useState<string>('');
    const [actionStep, setActionStep] = useState<string>('');
    
    const numericFields = fields.filter(f => f.type === 'number');

    const handleSubmit = () => {
        if (!conditionField || !conditionOperator || !conditionValue || !actionStep) {
            alert("Por favor, rellene todos los campos de la regla.");
            return;
        }

        const newRule: Rule = {
            condition: {
                fieldId: conditionField,
                operator: conditionOperator as RuleCondition['operator'],
                value: conditionValue,
            },
            action: {
                type: 'REQUIRE_ADDITIONAL_STEP',
                stepId: actionStep,
            }
        };
        onAddRule(newRule);
        onClose();
    };

    return (
        <DialogContent className="sm:max-w-[625px]">
            <DialogHeader>
                <DialogTitle>Constructor de Reglas de Negocio</DialogTitle>
                <DialogDescription>
                    Cree una regla "SI-ENTONCES" para su flujo de trabajo.
                </DialogDescription>
            </DialogHeader>
            <div className="grid gap-6 py-4">
                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><ShieldCheck className="mr-2 h-5 w-5 text-primary"/> Condición (SI)</h3>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <Label>Campo</Label>
                            <Select value={conditionField} onValueChange={setConditionField}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione un campo..."/>
                                </SelectTrigger>
                                <SelectContent>
                                    {numericFields.map(field => (
                                        <SelectItem key={field.id} value={field.id}>{field.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Operador</Label>
                             <Select value={conditionOperator} onValueChange={(v) => setConditionOperator(v as RuleCondition['operator'])}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccione..."/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value=">">{'>'} (Mayor que)</SelectItem>
                                    <SelectItem value="<">{'<'} (Menor que)</SelectItem>
                                    <SelectItem value="==">{'=='} (Igual a)</SelectItem>
                                    <SelectItem value="!=">{'!='} (No es igual a)</SelectItem>
                                    <SelectItem value=">=">{'>='} (Mayor o igual que)</SelectItem>
                                    <SelectItem value="<=">{'<='} (Menor o igual que)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Valor</Label>
                            <Input 
                                type="number" 
                                placeholder="p.ej., 5000"
                                value={conditionValue}
                                onChange={(e) => setConditionValue(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                <div className="p-4 rounded-md border">
                    <h3 className="mb-4 text-lg font-medium flex items-center"><GitBranch className="mr-2 h-5 w-5 text-primary"/> Acción (ENTONCES)</h3>
                    <div className="grid grid-cols-2 gap-4">
                         <div className="space-y-2">
                            <Label>Tipo de Acción</Label>
                            <Select value="REQUIRE_ADDITIONAL_STEP" >
                                <SelectTrigger>
                                    <SelectValue/>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="REQUIRE_ADDITIONAL_STEP">Requerir un paso adicional</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Paso de Aprobación</Label>
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
