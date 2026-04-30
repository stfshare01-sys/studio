'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils';
import type { JustificationType, TardinessRecord } from "@/types/hcm.types";
import { JUSTIFICATION_TYPE_LABELS } from "@/types/hcm.types";

interface JustifyTardinessDialogProps {
    open: boolean;
    record?: TardinessRecord;
    justificationType: string;
    setJustificationType: (v: JustificationType) => void;
    justificationReason: string;
    setJustificationReason: (v: string) => void;
    useHourBank: boolean;
    setUseHourBank: (v: boolean) => void;
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function JustifyTardinessDialog({
    open, record, justificationType, setJustificationType,
    justificationReason, setJustificationReason,
    useHourBank, setUseHourBank,
    submitting, onConfirm, onClose,
}: JustifyTardinessDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Justificar Retardo</DialogTitle>
                    <DialogDescription>
                        Ingresa el motivo de la justificación para el retardo del {record && formatDateDDMMYYYY(record.date)}.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Tipo de Justificación</Label>
                        <Select value={justificationType} onValueChange={(v) => setJustificationType(v as JustificationType)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar motivo..." />
                            </SelectTrigger>
                            <SelectContent>
                                {Object.entries(JUSTIFICATION_TYPE_LABELS).map(([key, label]) => (
                                    <SelectItem key={key} value={key}>{label}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Comentario / Detalle</Label>
                        <Textarea
                            value={justificationReason}
                            onChange={(e) => setJustificationReason(e.target.value)}
                            placeholder="Ej. Tráfico pesado, cita médica..."
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <Label htmlFor="compensate-tardiness" className="flex flex-col space-y-1">
                            <span>Compensar con Bolsa de Horas</span>
                        </Label>
                        <Switch id="compensate-tardiness" checked={useHourBank} onCheckedChange={setUseHourBank} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button onClick={onConfirm} disabled={submitting || !justificationType || !justificationReason.trim()}>
                        {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Confirmar
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
