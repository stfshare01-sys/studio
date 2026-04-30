'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateDDMMYYYY } from '../../utils';
import type { Employee, ShiftAssignment } from "@/types/hcm.types";

interface ShiftHistoryDialogState {
    open: boolean;
    employee?: Employee;
}

interface ShiftHistoryDialogProps {
    shiftHistoryDialog: ShiftHistoryDialogState;
    shiftHistory: ShiftAssignment[];
    setShiftHistoryDialog: (state: ShiftHistoryDialogState) => void;
    setCancelShiftDialog: (state: { open: boolean; assignment?: ShiftAssignment }) => void;
}

export function ShiftHistoryDialog({
    shiftHistoryDialog, shiftHistory, setShiftHistoryDialog, setCancelShiftDialog,
}: ShiftHistoryDialogProps) {
    return (
        <Dialog open={shiftHistoryDialog.open} onOpenChange={(open) => setShiftHistoryDialog({ open })}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Historial de Turnos</DialogTitle>
                    <DialogDescription>
                        Historial de asignaciones de turno para {shiftHistoryDialog.employee?.fullName}
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Turno</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Fecha Inicio</TableHead>
                                <TableHead>Fecha Fin</TableHead>
                                <TableHead>Razón</TableHead>
                                <TableHead>Asignado Por</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead className="text-right">Acciones</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {shiftHistory.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                                        No hay historial de turnos
                                    </TableCell>
                                </TableRow>
                            ) : (
                                shiftHistory.map((assign) => (
                                    <TableRow key={assign.id}>
                                        <TableCell className="font-medium">{assign.newShiftName}</TableCell>
                                        <TableCell>
                                            <Badge variant={assign.assignmentType === 'permanent' ? 'default' : 'secondary'}>
                                                {assign.assignmentType === 'permanent' ? 'Permanente' : 'Temporal'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{assign.startDate}</TableCell>
                                        <TableCell>{assign.endDate || '-'}</TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={assign.reason}>
                                            {assign.reason}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {assign.assignedByName}
                                            <div className="text-[10px]">{formatDateDDMMYYYY(assign.createdAt)}</div>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={assign.status === 'active' ? 'outline' : 'destructive'} className="text-[10px]">
                                                {assign.status === 'active' ? 'Activo' : 'Cancelado'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {assign.status === 'active' && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 px-2 text-destructive hover:text-destructive"
                                                    onClick={() => setCancelShiftDialog({ open: true, assignment: assign })}
                                                >
                                                    Cancelar
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter>
                    <Button onClick={() => setShiftHistoryDialog({ open: false })}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
