import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Draggabledots, GripVertical, Move, PlusCircle } from "lucide-react";
import Link from "next/link";

export default function NewTemplatePage() {
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
                <Input id="template-name" placeholder="p.ej., Orden de Compra" />
              </div>
              <div>
                <Label htmlFor="template-description">Descripción</Label>
                <Textarea id="template-description" placeholder="Una breve descripción de para qué sirve este flujo de trabajo." />
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
              <Button variant="outline" className="w-full">
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
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Aprobación del Gerente</div>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-muted p-3">
                  <GripVertical className="h-5 w-5 text-muted-foreground" />
                  <div className="flex-1 font-medium">Confirmación de RRHH</div>
                </div>
              </div>
              <Button variant="outline" className="w-full">
                <PlusCircle className="mr-2 h-4 w-4" /> Añadir Paso
              </Button>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
