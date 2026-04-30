'use client';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { ShiftAssignment } from "@/types/hcm.types";

interface CancelShiftDialogState {
    open: boolean;
    assignment?: ShiftAssignment;
}

interface CancelShiftDialogProps {
    cancelShiftDialog: CancelShiftDialogState;
    submitting: boolean;
    onConfirm: () => void;
    onClose: () => void;
}

export function CancelShiftDialog({
    cancelShiftDialog, submitting, onConfirm, onClose,
}: CancelShiftDialogProps) {
    return (
        <Dialog open={cancelShiftDialog.open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Cancelar Asignación de Turno</DialogTitle>
                    <DialogDescription>
                        ¿Estás seguro de cancelar esta asignación para {cancelShiftDialog.assignment?.employeeName}?
                    </DialogDescription>
                </DialogHeader>
                <div className="py-4">
                    <p className="text-sm text-muted-foreground">
                        Esta acción revertirá al empleado a su turno anterior si existe, o al turno predeterminado.
                    </p>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>
                        No, mantener
                    </Button>
                    <Button variant="destructive" onClick={onConfirm} disabled={submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Sí, cancelar asignación
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

