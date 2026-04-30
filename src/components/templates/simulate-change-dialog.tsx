
'use client';

import { useState } from 'react';
import { processSimulation, ProcessSimulationOutput } from '@/ai/flows/process-simulation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Label } from '../ui/label';
import { Loader2, Sparkles, AlertTriangle, Lightbulb, TrendingUp } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import type { Template } from "@/types/workflow.types";

interface SimulateChangeDialogProps {
  template: Template | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SimulateChangeDialog({ template, isOpen, onOpenChange }: SimulateChangeDialogProps) {
  const { toast } = useToast();
  const [proposedChange, setProposedChange] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [simulationResult, setSimulationResult] = useState<ProcessSimulationOutput | null>(null);

  const handleSimulate = async () => {
    if (!template || !proposedChange) {
      toast({ variant: 'destructive', title: 'Entrada no válida', description: 'Por favor, describa el cambio que desea simular.' });
      return;
    }

    setIsLoading(true);
    setSimulationResult(null);

    try {
        const result = await processSimulation({
            template: {
                name: template.name,
                description: template.description,
                steps: template.steps,
                rules: template.rules?.map(r => ({
                    condition: `field ${r.condition.fieldId} ${r.condition.operator} ${r.condition.value}`,
                    action: `require step ${(r.action as any).stepId}`
                })) || []
            },
            proposedChange,
            // NOTE: This historical data is mocked. A real implementation would fetch this from analytics.
            historicalData: {
                avgCycleTimeHours: 48,
                avgStepCompletionTime: template.steps.reduce((acc, step) => {
                    acc[step.name] = Math.floor(Math.random() * 8) + 4; // Random time between 4-12 hours
                    return acc;
                }, {} as Record<string, number>)
            }
        });
        setSimulationResult(result);
    } catch (error) {
        console.error("Simulation failed:", error);
        toast({ variant: 'destructive', title: 'Error de Simulación', description: 'No se pudo completar la simulación. Inténtelo de nuevo.' });
    } finally {
        setIsLoading(false);
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    // Reset state after a short delay to allow the dialog to close
    setTimeout(() => {
        setProposedChange('');
        setSimulationResult(null);
        setIsLoading(false);
    }, 300);
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg md:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Simulación de Procesos "What-If"</DialogTitle>
          <DialogDescription>
            Analice el impacto de un cambio en la plantilla <span className="font-semibold">{template?.name}</span>.
          </DialogDescription>
        </DialogHeader>

        {!simulationResult && (
             <div className="py-4 space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="proposed-change">Describa el cambio a simular</Label>
                    <Textarea
                        id="proposed-change"
                        placeholder='Ej: "Añadir un paso de aprobación legal si el importe supera los $10,000" o "Asignar todas las revisiones de TI a usuarios con la habilidad DevOps".'
                        value={proposedChange}
                        onChange={(e) => setProposedChange(e.target.value)}
                        rows={4}
                    />
                </div>
            </div>
        )}

        {isLoading && (
            <div className="flex flex-col items-center justify-center p-8 space-y-4">
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="text-muted-foreground">El agente de IA está analizando el impacto...</p>
            </div>
        )}

        {simulationResult && (
            <div className="py-4 grid gap-4 md:gap-6">
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Resumen del Análisis de Impacto</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                         <div className="flex items-start gap-4">
                            <TrendingUp className="h-5 w-5 mt-1 text-primary flex-shrink-0" />
                            <div>
                                <h4 className="font-semibold">Tiempo de Ciclo</h4>
                                <p className="text-muted-foreground">{simulationResult.predictedImpact.cycleTimeChange}</p>
                            </div>
                         </div>
                         <div className="flex items-start gap-4">
                            <AlertTriangle className="h-5 w-5 mt-1 text-amber-500 flex-shrink-0" />
                            <div>
                                <h4 className="font-semibold">Análisis de Cuellos de Botella</h4>
                                <p className="text-muted-foreground">{simulationResult.predictedImpact.bottleneckAnalysis}</p>
                            </div>
                         </div>
                    </CardContent>
                </Card>
                 <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2"><Lightbulb className="text-amber-400" /> Recomendaciones de la IA</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">{simulationResult.recommendations}</p>
                    </CardContent>
                </Card>
                <div className="text-xs text-center text-muted-foreground pt-2">
                    Confianza de la predicción: {Math.round(simulationResult.confidenceScore * 100)}%
                </div>
            </div>
        )}


        <DialogFooter className="flex-col-reverse sm:flex-row gap-2 sm:gap-0">
          <Button variant="ghost" onClick={handleClose} className="w-full sm:w-auto">Cerrar</Button>
          {!simulationResult && (
            <Button onClick={handleSimulate} disabled={isLoading || !proposedChange} className="w-full sm:w-auto">
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Ejecutar Simulación
            </Button>
          )}
           {simulationResult && (
            <Button onClick={() => setSimulationResult(null)} className="w-full sm:w-auto">
                Nueva Simulación
            </Button>
           )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
