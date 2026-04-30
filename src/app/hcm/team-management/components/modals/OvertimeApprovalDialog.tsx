'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Check, Loader2, X } from 'lucide-react';
import type { OvertimeRequest, HourBank } from "@/types/hcm.types";

interface OvertimeDialogState {
    open: boolean;
    request?: OvertimeRequest;
}

interface OvertimeApprovalDialogProps {
    overtimeDialog: OvertimeDialogState;
    hoursToApprove: string;
    setHoursToApprove: (v: string) => void;
    rejectionReason: string;
    setRejectionReason: (v: string) => void;
    submitting: boolean;
    hourBanks: HourBank[];
    onApprove: (partial: boolean) => void;
    onReject: () => void;
    onClose: () => void;
}

export function OvertimeApprovalDialog({
    overtimeDialog, hoursToApprove, setHoursToApprove,
    rejectionReason, setRejectionReason, submitting,
    hourBanks, onApprove, onReject, onClose,
}: OvertimeApprovalDialogProps) {
    const { open, request } = overtimeDialog;
    const formatMins = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return `${h}h ${m}m`;
    };

    const hb = hourBanks.find(h => h.employeeId === request?.employeeId);
    const currentDebt = hb?.balanceMinutes && hb.balanceMinutes > 0 ? hb.balanceMinutes : 0;
    const requestedMinutes = (parseFloat(hoursToApprove || '0')) * 60;
    const amortizedMinutes = Math.min(currentDebt, requestedMinutes);
    const paidMinutes = Math.max(0, requestedMinutes - amortizedMinutes);

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Revisar Solicitud de Horas Extras</DialogTitle>
                    <DialogDescription>
                        {request && <>{request.employeeName} solicita {request.hoursRequested} horas extras</>}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-6 py-4">
                    <div className="bg-muted p-3 rounded-lg">
                        <p className="text-sm font-medium">Razón:</p>
                        <p className="text-sm text-muted-foreground">{request?.reason}</p>
                    </div>
                    <div className="grid gap-4">
                        {currentDebt > 0 && (
                            <div className="bg-red-50 p-3 rounded-lg border border-red-100 space-y-2">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-red-700 font-medium">Deuda Actual:</span>
                                    <span className="font-bold text-red-700">{formatMins(currentDebt)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-green-700 font-medium">Se abonará a deuda:</span>
                                    <span className="font-bold text-green-700">-{formatMins(amortizedMinutes)}</span>
                                </div>
                                <div className="border-t border-red-200 pt-1 mt-1 flex justify-between items-center text-sm">
                                    <span className="text-muted-foreground">Restante a Pagar:</span>
                                    <span className="font-bold text-slate-900">{formatMins(paidMinutes)}</span>
                                </div>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Horas a Aprobar (para aprobación parcial)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    step="0.5"
                                    min="0"
                                    max={request?.hoursRequested}
                                    value={hoursToApprove}
                                    onChange={(e) => setHoursToApprove(e.target.value)}
                                    className={parseFloat(hoursToApprove) > (request?.hoursRequested || 0) ? 'w-32 border-red-500' : 'w-32'}
                                />
                                <span className="text-sm text-muted-foreground">horas</span>
                            </div>
                            {parseFloat(hoursToApprove) > (request?.hoursRequested || 0) && (
                                <p className="text-xs text-red-500 font-medium">
                                    No puedes aprobar más de las horas solicitadas ({request?.hoursRequested}h)
                                </p>
                            )}
                        </div>
                    </div>
                    <div>
                        <Label>Razón de Rechazo (solo si rechaza)</Label>
                        <Textarea
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Solo requerido si rechaza la solicitud..."
                            rows={4}
                        />
                    </div>
                </div>
                <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                    <Button variant="outline" onClick={onClose} className="mt-2 sm:mt-0">Cancelar</Button>
                    <Button variant="destructive" onClick={onReject} disabled={submitting || !rejectionReason.trim()}>
                        <X className="h-4 w-4 mr-1" />Rechazar
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={() => onApprove(true)}
                        disabled={submitting || !hoursToApprove || parseFloat(hoursToApprove) > (request?.hoursRequested || 0) || parseFloat(hoursToApprove) <= 0}
                    >
                        Aprobar Parcial
                    </Button>
                    <Button onClick={() => onApprove(false)} disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                        Aprobar Total
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
