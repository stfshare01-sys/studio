'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDateDDMMYYYY } from '../../utils';
import type { Employee, HourBankMovement } from "@/types/hcm.types";

interface HourBankDialogState {
    open: boolean;
    employee?: Employee;
}

interface HourBankHistoryDialogProps {
    hourBankDialog: HourBankDialogState;
    hourBankMovements: HourBankMovement[];
    setHourBankDialog: (state: HourBankDialogState) => void;
}

export function HourBankHistoryDialog({
    hourBankDialog, hourBankMovements, setHourBankDialog,
}: HourBankHistoryDialogProps) {
    return (
        <Dialog open={hourBankDialog.open} onOpenChange={(open) => setHourBankDialog({ open })}>
            <DialogContent className="max-w-3xl">
                <DialogHeader>
                    <DialogTitle>Historial de Bolsa de Horas</DialogTitle>
                    <DialogDescription>
                        Movimientos registrados para {hourBankDialog.employee?.fullName}
                    </DialogDescription>
                </DialogHeader>
                <div className="max-h-[60vh] overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Fecha</TableHead>
                                <TableHead>Tipo</TableHead>
                                <TableHead>Minutos</TableHead>
                                <TableHead>Motivo</TableHead>
                                <TableHead>Registrado Por</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {hourBankMovements.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                                        No hay movimientos registrados
                                    </TableCell>
                                </TableRow>
                            ) : (
                                hourBankMovements.map((move) => (
                                    <TableRow key={move.id}>
                                        <TableCell>{formatDateDDMMYYYY(move.date)}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {move.type === 'tardiness' ? 'Retardo' :
                                                    move.type === 'early_departure' ? 'Salida Temprana' :
                                                        move.type === 'overtime_compensation' ? 'Compensación' :
                                                            move.type === 'manual_adjustment' ? 'Ajuste Manual' : move.type}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            <span className={move.minutes > 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>
                                                {move.minutes > 0 ? '+' : ''}{move.minutes} min
                                            </span>
                                        </TableCell>
                                        <TableCell className="max-w-[200px] truncate" title={move.reason}>
                                            {move.reason}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                            {move.createdByName || 'Sistema'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </div>
                <DialogFooter>
                    <Button onClick={() => setHourBankDialog({ open: false })}>Cerrar</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
