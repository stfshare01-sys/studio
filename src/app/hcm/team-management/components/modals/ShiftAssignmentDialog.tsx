'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import type { Employee, CustomShift } from "@/types/hcm.types";

interface ShiftDialogState {
    open: boolean;
    employee?: Employee;
}

interface ShiftFormState {
    shiftId: string;
    type: 'temporary' | 'permanent';
    startDate: string;
    endDate: string;
    reason: string;
}

interface ShiftAssignmentDialogProps {
    shiftDialog: ShiftDialogState;
    shiftForm: ShiftFormState;
    shifts: CustomShift[];
    submitting: boolean;
    setShiftForm: (fn: (prev: ShiftFormState) => ShiftFormState) => void;
    onConfirm: () => void;
    onClose: () => void;
}

export function ShiftAssignmentDialog({
    shiftDialog, shiftForm, shifts, submitting,
    setShiftForm, onConfirm, onClose,
}: ShiftAssignmentDialogProps) {
    return (
        <Dialog open={shiftDialog.open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Asignar Turno</DialogTitle>
                    <DialogDescription>
                        Asignar nuevo turno a {shiftDialog.employee?.fullName}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                    <div>
                        <Label>Turno</Label>
                        <Select value={shiftForm.shiftId} onValueChange={(v) => setShiftForm(prev => ({ ...prev, shiftId: v }))}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar turno" />
                            </SelectTrigger>
                            <SelectContent>
                                {shifts.map((shift) => (
                                    <SelectItem key={shift.id} value={shift.id}>
                                        {shift.name} ({shift.startTime} - {shift.endTime})
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div>
                        <Label>Tipo de Asignación</Label>
                        <Select value={shiftForm.type} onValueChange={(v: 'temporary' | 'permanent') => setShiftForm(prev => ({ ...prev, type: v }))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="temporary">Temporal</SelectItem>
                                <SelectItem value="permanent">Permanente</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Fecha Inicio</Label>
                            <Input
                                type="date"
                                value={shiftForm.startDate}
                                onChange={(e) => setShiftForm(prev => ({ ...prev, startDate: e.target.value }))}
                            />
                        </div>
                        {shiftForm.type === 'temporary' && (
                            <div>
                                <Label>Fecha Fin</Label>
                                <Input
                                    type="date"
                                    value={shiftForm.endDate}
                                    onChange={(e) => setShiftForm(prev => ({ ...prev, endDate: e.target.value }))}
                                />
                            </div>
                        )}
                    </div>
                    <div>
                        <Label>Razón del Cambio</Label>
                        <Textarea
                            value={shiftForm.reason}
                            onChange={(e) => setShiftForm(prev => ({ ...prev, reason: e.target.value }))}
                            placeholder="Describe la razón del cambio de turno..."
                            rows={2}
                        />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancelar</Button>
                    <Button
                        onClick={onConfirm}
                        disabled={submitting || !shiftForm.shiftId || !shiftForm.reason.trim() || (shiftForm.type === 'temporary' && !shiftForm.endDate)}
                    >
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Asignar Turno
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
