'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ConsolidateDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
    isConsolidating: boolean;
    consolidationStep: string;
    validationErrors: string[];
    onConfirm: () => void;
}

export function ConsolidateDialog({
    isOpen,
    onOpenChange,
    isConsolidating,
    consolidationStep,
    validationErrors,
    onConfirm,
}: ConsolidateDialogProps) {
    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Cerrar período de prenómina</DialogTitle>
                    <DialogDescription>
                        Este proceso consolidará los registros del período, ejecutará el SLA para incidencias
                        no justificadas y bloqueará el período para evitar modificaciones futuras.
                    </DialogDescription>
                </DialogHeader>

                {validationErrors.length > 0 && (
                    <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>
                            <ul className="list-disc list-inside space-y-1">
                                {validationErrors.map((err, i) => (
                                    <li key={i} className="text-sm">{err}</li>
                                ))}
                            </ul>
                        </AlertDescription>
                    </Alert>
                )}

                {isConsolidating && consolidationStep && (
                    <div className="flex items-center gap-3 rounded-md bg-muted px-4 py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                        <p className="text-sm text-muted-foreground">{consolidationStep}</p>
                    </div>
                )}

                {!isConsolidating && validationErrors.length === 0 && (
                    <Alert>
                        <CheckCircle className="h-4 w-4" />
                        <AlertDescription className="text-sm">
                            Se ejecutarán los siguientes pasos:
                            <ol className="mt-2 list-decimal list-inside space-y-1 text-muted-foreground">
                                <li>Verificar bloqueo previo del período</li>
                                <li>Validar que no haya permisos pendientes</li>
                                <li>Ejecutar SLA para infracciones no justificadas</li>
                                <li>Consolidar registros de prenómina</li>
                                <li>Bloquear el período</li>
                            </ol>
                        </AlertDescription>
                    </Alert>
                )}

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isConsolidating}>
                        Cancelar
                    </Button>
                    <Button onClick={onConfirm} disabled={isConsolidating}>
                        {isConsolidating ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Procesando...</>
                        ) : (
                            'Confirmar cierre'
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
