

"use client";

import { useState } from "react";
import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, PlusCircle, Trash2, GitBranch, ShieldCheck } from "lucide-react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useFirestore } from "@/firebase";
import { addDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { collection } from "firebase/firestore";
import { useRouter } from "next/navigation";
import type { FormField, WorkflowStep, Rule, RuleCondition, RuleAction } from "@/lib/types";
import { Separator } from "@/components/ui/separator";


const reorder = (list: any[], startIndex: number, endIndex: number) => {
  const result = Array.from(list);
  const [removed] = result.splice(startIndex, 1);
  result.splice(endIndex, 0, removed);

  return result;
};


export default function NewTemplatePage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const router = useRouter();

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [newStepName, setNewStepName] = useState("");
  const [isStepDialogOpen, setIsStepDialogOpen] = useState(false);

  const [fields, setFields] = useState<FormField[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<FormField['type']>('text');
  const [isFieldDialogOpen, setIsFieldDialogOpen] = useState(false);
  
  const [rules, setRules] = useState<Rule[]>([]);
  const [isRuleDialogOpen, setIsRuleDialogOpen] = useState(false);

  const handleAddStep = () => {
    if (newStepName.trim() !== "") {
      const newStep: WorkflowStep = {
        id: `step-${Date.now()}`,
        name: newStepName.trim(),
      };
      setSteps([...steps, newStep]);
      setNewStepName("");
      setIsStepDialogOpen(false);
    }
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter(step => step.id !== id));
  };

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

  const onDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }

    const { source, destination } = result;

    if (source.droppableId === 'fields-droppable') {
        const items = reorder(
            fields,
            source.index,
            destination.index
        );
        setFields(items as FormField[]);
    } else if (source.droppableId === 'steps-droppable') {
        const items = reorder(
            steps,
            source.index,
            destination.index
        );
        setSteps(items as WorkflowStep[]);
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
    const newTemplate = {
        name: templateName,
        description: templateDescription,
        fields,
        steps: steps.map(s => ({id: s.id, name: s.name})),
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
  
  return (
    <SiteLayout>
        <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
            <h1 className="text-2xl font-bold tracking-tight">Crear Nueva Plantilla</h1>
            <div className="flex gap-2">
                <Button variant="outline" asChild><Link href="/templates">Cancelar</Link></Button>
                <Button onClick={handleSaveTemplate}>Guardar Plantilla</Button>
            </div>
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
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

            <div className="grid gap-8 md:grid-cols-2">
            {/* Fields Designer */}
            <Card>
                <CardHeader>
                <CardTitle>Campos del Formulario</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Defina los datos que se recopilarán para esta plantilla.
                </p>
                <Droppable droppableId="fields-droppable">
                    {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 rounded-md border p-4 min-h-[120px]">
                        {fields.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-4">No hay campos definidos.</p>
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
                                <div className="flex-1 font-medium">{field.label} ({fieldTypeLabels[field.type]})</div>
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

            {/* Steps Designer */}
            <Card>
                <CardHeader>
                <CardTitle>Pasos del Flujo de Trabajo</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                    Defina las etapas de aprobación para este flujo de trabajo.
                </p>
                    <Droppable droppableId="steps-droppable">
                        {(provided) => (
                            <div {...provided.droppableProps} ref={provided.innerRef} className="space-y-2 rounded-md border p-4 min-h-[120px]">
                            {steps.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-4">No hay pasos definidos.</p>
                            )}
                            {steps.map((step, index) => (
                                <Draggable key={step.id} draggableId={step.id} index={index}>
                                {(provided, snapshot) => (
                                    <div
                                    ref={provided.innerRef}
                                    {...provided.draggableProps}
                                    {...provided.dragHandleProps}
                                    className={`group flex items-center gap-2 rounded-md p-3 ${snapshot.isDragging ? 'bg-primary/10' : 'bg-muted'}`}
                                    >
                                    <GripVertical className="h-5 w-5 text-muted-foreground cursor-grab" />
                                    <div className="flex-1 font-medium">{step.name}</div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                        onClick={() => handleRemoveStep(step.id)}
                                    >
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                        <span className="sr-only">Eliminar paso</span>
                                    </Button>
                                    </div>
                                )}
                                </Draggable>
                            ))}
                            {provided.placeholder}
                            </div>
                        )}
                    </Droppable>

                <Dialog open={isStepDialogOpen} onOpenChange={setIsStepDialogOpen}>
                    <DialogTrigger asChild>
                    <Button variant="outline" className="w-full">
                        <PlusCircle className="mr-2 h-4 w-4" /> Añadir Paso
                    </Button>
                    </DialogTrigger>
                    <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Añadir Nuevo Paso</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <Label htmlFor="step-name">Nombre del Paso</Label>
                        <Input
                        id="step-name"
                        value={newStepName}
                        onChange={(e) => setNewStepName(e.target.value)}
                        placeholder="p.ej., Revisión Legal"
                        />
                    </div>
                    <DialogFooter>
                        <DialogClose asChild>
                        <Button variant="ghost">Cancelar</Button>
                        </DialogClose>
                        <Button onClick={handleAddStep}>Añadir Paso</Button>
                    </DialogFooter>
                    </DialogContent>
                </Dialog>
                </CardContent>
            </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Motor de Reglas de Negocio (DMN)</CardTitle>
                    <CardDescription>Defina la lógica condicional para automatizar las decisiones en su flujo de trabajo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2 rounded-md border p-4">
                        {rules.length === 0 && (
                            <p className="text-center text-sm text-muted-foreground py-4">No hay reglas definidas.</p>
                        )}
                        {rules.map((rule, index) => {
                            const field = fields.find(f => f.id === rule.condition.fieldId);
                            const actionStep = steps.find(s => s.id === rule.action.stepId);
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
                            steps={steps} 
                            onAddRule={handleAddRule} 
                            onClose={() => setIsRuleDialogOpen(false)} 
                        />
                    </Dialog>
                </CardContent>
            </Card>
        </main>
        </div>
        </DragDropContext>
    </SiteLayout>
  );
}


function RuleBuilderDialog({ fields, steps, onAddRule, onClose }: { fields: FormField[], steps: WorkflowStep[], onAddRule: (rule: Rule) => void, onClose: () => void }) {
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
                            <Select value="REQUIRE_ADDITIONAL_STEP" disabled>
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
