'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { formatDateDDMMYYYY } from '../../utils';
import type { JustificationType, EarlyDeparture } from "@/types/hcm.types";
import { JUSTIFICATION_TYPE_LABELS } from "@/types/hcm.types";

interface JustifyDepartureDialogProps {
    open: boolean;
    record?: EarlyDeparture;
    justificationType: string;
    setJustificationType: (v: JustificationType) => void;
    justificationReason: string;
    setJustificationReason: (v: string) => void;
    useHourBank: boolean;
    setUseHourBank: (v: boolean) => void;
    submitting: boolean;
    canEmployeeUseTimeBank: (employeeId?: string) => boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function JustifyDepartureDialog({
    open, record, justificationType, setJustificationType,
    justificationReason, setJustificationReason,
    useHourBank, setUseHourBank, submitting,
    canEmployeeUseTimeBank, onConfirm, onClose,
}: JustifyDepartureDialogProps) {
    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Justificar Salida Temprana</DialogTitle>
                    <DialogDescription>
                        Ingresa el motivo de la justificación para la salida temprana del {record && formatDateDDMMYYYY(record.date)}.
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
                            placeholder="Ej. Permiso personal, trabajo remoto..."
                        />
                    </div>
                    {canEmployeeUseTimeBank(record?.employeeId) && (
                        <div className="flex items-center space-x-2">
                            <Switch id="departure-hourbank" checked={useHourBank} onCheckedChange={setUseHourBank} />
                            <Label htmlFor="departure-hourbank">Compensar con Bolsa de Horas</Label>
                        </div>
                    )}
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
