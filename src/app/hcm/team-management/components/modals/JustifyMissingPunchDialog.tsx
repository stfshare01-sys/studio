'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { MissingPunchRecord } from "@/types/hcm.types";

interface JustifyMissingPunchDialogState {
    open: boolean;
    punch?: MissingPunchRecord;
    employeeName?: string;
}

interface JustifyMissingPunchDialogProps {
    dialogState: JustifyMissingPunchDialogState;
    providedEntryTime: string;
    setProvidedEntryTime: (v: string) => void;
    providedExitTime: string;
    setProvidedExitTime: (v: string) => void;
    justificationReason: string;
    setJustificationReason: (v: string) => void;
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function JustifyMissingPunchDialog({
    dialogState, providedEntryTime, setProvidedEntryTime,
    providedExitTime, setProvidedExitTime,
    justificationReason, setJustificationReason,
    submitting, onConfirm, onClose,
}: JustifyMissingPunchDialogProps) {
    const { punch, employeeName } = dialogState;

    return (
        <Dialog open={dialogState.open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Justificar Marcaje Faltante</DialogTitle>
                    <DialogDescription>
                        Proporciona la hora de entrada/salida para {employeeName}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    {punch && (
                        <div className="bg-muted p-3 rounded-lg space-y-2">
                            <div className="flex justify-between">
                                <span className="font-medium">Fecha:</span>
                                <span>{punch.date}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="font-medium">Tipo Faltante:</span>
                                <span>
                                    {punch.missingType === 'entry' && 'Entrada'}
                                    {punch.missingType === 'exit' && 'Salida'}
                                    {punch.missingType === 'both' && 'Ambos (Entrada y Salida)'}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Entrada */}
                    {punch?.missingType !== 'exit' && (
                        <div className="space-y-2">
                            <Label htmlFor="provided-entry-time">Hora de Entrada</Label>
                            <Input
                                id="provided-entry-time"
                                type="time"
                                value={providedEntryTime}
                                onChange={(e) => setProvidedEntryTime(e.target.value)}
                                placeholder="HH:mm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Si la hora genera retardo, se creará automáticamente un registro de retardo
                            </p>
                        </div>
                    )}

                    {/* Salida */}
                    {punch?.missingType !== 'entry' && (
                        <div className="space-y-2">
                            <Label htmlFor="provided-exit-time">Hora de Salida</Label>
                            <Input
                                id="provided-exit-time"
                                type="time"
                                value={providedExitTime}
                                onChange={(e) => setProvidedExitTime(e.target.value)}
                                placeholder="HH:mm"
                            />
                            <p className="text-xs text-muted-foreground">
                                Si la hora genera salida temprana, se creará automáticamente un registro
                            </p>
                        </div>
                    )}

                    {/* Razón */}
                    <div className="space-y-2">
                        <Label htmlFor="missing-punch-reason">Razón de la Justificación</Label>
                        <Textarea
                            id="missing-punch-reason"
                            value={justificationReason}
                            onChange={(e) => setJustificationReason(e.target.value)}
                            placeholder="Explica por qué se justifica este marcaje faltante..."
                            rows={3}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={submitting || (!providedEntryTime && !providedExitTime) || !justificationReason.trim()}
                    >
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
