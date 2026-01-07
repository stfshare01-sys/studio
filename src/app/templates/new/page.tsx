
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { GripVertical, PlusCircle, Trash2, X } from "lucide-react";
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

type WorkflowStep = {
  id: string;
  name: string;
};

export default function NewTemplatePage() {
  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: 'step-1', name: 'Aprobación del Gerente' },
    { id: 'step-2', name: 'Confirmación de RRHH' },
  ]);
  const [newStepName, setNewStepName] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const handleAddStep = () => {
    if (newStepName.trim() !== "") {
      const newStep: WorkflowStep = {
        id: `step-${Date.now()}`,
        name: newStepName.trim(),
      };
      setSteps([...steps, newStep]);
      setNewStepName("");
      setIsDialogOpen(false);
    }
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter(step => step.id !== id));
  };
  
  return (
    <div className="flex flex-1 flex-col">
       <header className="flex items-center justify-between p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">Crear Nueva Plantilla</h1>
        <div className="flex gap-2">
            <Button variant="outline" asChild><Link href="/templates">Cancelar</Link></Button>
            <Button>Guardar Plantilla</Button>
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
                Defina los datos que se recopilarán. (Esta es una maqueta estática de una interfaz de arrastrar y soltar).
              </p>
              <div className="space-y-2 rounded-md border p-4">
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Fecha de Inicio (Fecha)</div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Motivo (Área de Texto)</div>
                </div>
              </div>
              <Button variant="outline" className="w-full" disabled>
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Campo
              </Button>
            </CardContent>
          </Card>

          {/* Steps Designer */}
          <Card>
            <CardHeader>
              <CardTitle>Pasos del Flujo de Trabajo</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Defina las etapas de aprobación o acción para este flujo de trabajo.
              </p>
              <div className="space-y-2 rounded-md border p-4">
                {steps.length === 0 && (
                  <p className="text-center text-sm text-muted-foreground py-4">No hay pasos definidos.</p>
                )}
                {steps.map((step, index) => (
                  <div key={step.id} className="group flex items-center gap-2 rounded-md bg-muted p-3">
                    <GripVertical className="h-5 w-5 text-muted-foreground" />
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
                ))}
              </div>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
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
      </main>
    </div>
  );
}
