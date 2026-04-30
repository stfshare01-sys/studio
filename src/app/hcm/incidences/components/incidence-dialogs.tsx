import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { NewIncidenceForm } from '@/components/hcm/new-incidence-form';
import type { Incidence, Employee } from "@/types/hcm.types";
import { getTypeLabel, getStatusBadge, formatDate } from '../utils/incidence-helpers';

interface IncidenceDialogsProps {
    user: any;
    hasHRPermissions: boolean;
    isManagerOnly: boolean;
    // States
    isReviewDialogOpen: boolean;
    setIsReviewDialogOpen: (v: boolean) => void;
    isCreateDialogOpen: boolean;
    setIsCreateDialogOpen: (v: boolean) => void;
    isCancelDialogOpen: boolean;
    setIsCancelDialogOpen: (v: boolean) => void;
    selectedIncidence: Incidence | null;
    rejectionReason: string;
    setRejectionReason: (v: string) => void;
    isSubmitting: boolean;
    createForEmployee: string;
    setCreateForEmployee: (v: string) => void;
    teamEmployees: Employee[];
    isCancellable: boolean;
    // Handlers
    handleApprove: () => void;
    handleReject: () => void;
    handleCancel: () => void;
    confirmCancel: () => void;
}

export function IncidenceDialogs({
    user, hasHRPermissions, isManagerOnly,
    isReviewDialogOpen, setIsReviewDialogOpen,
    isCreateDialogOpen, setIsCreateDialogOpen,
    isCancelDialogOpen, setIsCancelDialogOpen,
    selectedIncidence,
    rejectionReason, setRejectionReason,
    isSubmitting,
    createForEmployee, setCreateForEmployee,
    teamEmployees,
    isCancellable,
    handleApprove, handleReject, handleCancel, confirmCancel
}: IncidenceDialogsProps) {
    if (!user) return null;

    return (
        <>
            {/* Review Dialog */}
            <Dialog open={isReviewDialogOpen} onOpenChange={setIsReviewDialogOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Detalle de Incidencia</DialogTitle>
                        <DialogDescription>
                            Revisa la información antes de aprobar o rechazar.
                        </DialogDescription>
                    </DialogHeader>

                    {selectedIncidence && (
                        <div className="space-y-4 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Empleado</p>
                                    <p className="font-medium">
                                        {selectedIncidence.employeeName || teamEmployees.find(e => e.id === selectedIncidence.employeeId)?.fullName || 'Falta Automática (Sistema)'}
                                    </p>
                                </div>
                                <div>{getStatusBadge(selectedIncidence.status)}</div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Tipo</p>
                                    <p>{getTypeLabel(selectedIncidence.type)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Goce de sueldo</p>
                                    <p>{selectedIncidence.isPaid ? 'Sí' : 'No'}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Fecha Inicio</p>
                                    <p>{formatDate(selectedIncidence.startDate)}</p>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Fecha Fin</p>
                                    <p>{formatDate(selectedIncidence.endDate)}</p>
                                </div>
                            </div>

                            {selectedIncidence.reason && (
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">Motivo/Descripción</p>
                                    <p className="text-sm bg-muted p-3 rounded-md mt-1">{selectedIncidence.reason}</p>
                                </div>
                            )}

                            {selectedIncidence.status === 'rejected' && selectedIncidence.rejectionReason && (
                                <div>
                                    <p className="text-sm font-medium text-red-600">Motivo de Rechazo</p>
                                    <p className="text-sm bg-red-50 text-red-900 p-3 rounded-md mt-1 border border-red-200">
                                        {selectedIncidence.rejectionReason}
                                    </p>
                                </div>
                            )}

                            {selectedIncidence.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                <div className="space-y-2 mt-4 pt-4 border-t">
                                    <Label htmlFor="rejectReason">Motivo (solo si rechazas)</Label>
                                    <Textarea
                                        id="rejectReason"
                                        placeholder="Ingresa el motivo del rechazo..."
                                        value={rejectionReason}
                                        onChange={(e) => setRejectionReason(e.target.value)}
                                        rows={2}
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter className="flex-col sm:flex-row gap-2">
                        <div className="flex-1 flex gap-2">
                            {isCancellable && (
                                <Button
                                    type="button"
                                    variant="destructive"
                                    onClick={handleCancel}
                                    disabled={isSubmitting}
                                >
                                    Cancelar Incidencia
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="outline"
                                onClick={() => setIsReviewDialogOpen(false)}
                                disabled={isSubmitting}
                            >
                                Cerrar
                            </Button>
                            {selectedIncidence?.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                <>
                                    <Button
                                        variant="destructive"
                                        onClick={handleReject}
                                        disabled={isSubmitting}
                                    >
                                        Rechazar
                                    </Button>
                                    <Button
                                        onClick={handleApprove}
                                        disabled={isSubmitting}
                                        className="bg-green-600 hover:bg-green-700 text-white"
                                    >
                                        {isSubmitting ? 'Procesando...' : 'Aprobar'}
                                    </Button>
                                </>
                            )}
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create Dialog */}
            <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Nueva Incidencia/Permiso</DialogTitle>
                        <DialogDescription>
                            Registra una nueva solicitud de permiso o incidencia.
                        </DialogDescription>
                    </DialogHeader>

                    {(hasHRPermissions || isManagerOnly) && (
                        <div className="mb-4 space-y-2">
                            <Label>Registrar para:</Label>
                            <Select value={createForEmployee} onValueChange={setCreateForEmployee}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un empleado..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value={user.uid}>Para mí ({user.displayName})</SelectItem>
                                    {teamEmployees.map(emp => (
                                        <SelectItem key={emp.id} value={emp.id}>
                                            {emp.fullName}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">
                                Si seleccionas a alguien más, la incidencia se creará a su nombre.
                            </p>
                        </div>
                    )}

                    <NewIncidenceForm
                        userId={user.uid}
                        onSuccess={() => setIsCreateDialogOpen(false)}
                        onCancel={() => setIsCreateDialogOpen(false)}
                        targetUserId={createForEmployee !== user.uid ? createForEmployee : undefined}
                    />
                </DialogContent>
            </Dialog>

            {/* Cancel Alert Dialog */}
            <AlertDialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Estás completamente seguro?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esta acción cancelará una incidencia que <strong>ya estaba aprobada</strong>.
                            Los saldos de vacaciones se regresarán, el descuento de prenómina se eliminará,
                            y el tiempo regresará al Banco de Horas si aplicaba.
                            <br /><br />
                            <strong>Esta acción es irreversible y queda registrada en auditoría.</strong>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isSubmitting}>Atrás</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                confirmCancel();
                            }}
                            disabled={isSubmitting}
                            className="bg-red-600 hover:bg-red-700 text-white"
                        >
                            {isSubmitting ? 'Cancelando...' : 'Sí, Cancelar Incidencia'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
