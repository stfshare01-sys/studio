'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatDate, getStatusBadge } from '../utils/prenomina-utils';
import type { PrenominaRecord } from "@/types/hcm.types";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface EmployeeDetailDialogProps {
    record: PrenominaRecord | null;
    onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-center py-1.5">
            <span className="text-sm text-muted-foreground">{label}</span>
            <span className="text-sm font-medium">{value ?? '—'}</span>
        </div>
    );
}

export function EmployeeDetailDialog({ record, onClose }: EmployeeDetailDialogProps) {
    if (!record) return null;

    return (
        <Dialog open={!!record} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Detalle de Prenómina</DialogTitle>
                </DialogHeader>

                <div className="space-y-1">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-semibold">{record.employeeName || record.employeeId}</p>
                            {record.employeeRfc && (
                                <p className="text-xs text-muted-foreground">{record.employeeRfc}</p>
                            )}
                        </div>
                        {getStatusBadge(record.status)}
                    </div>

                    <p className="text-xs text-muted-foreground">
                        Período: {formatDate(record.periodStart)} – {formatDate(record.periodEnd)}
                    </p>
                </div>

                <Separator />

                <div className="divide-y divide-border/50">
                    <DetailRow label="Días trabajados" value={record.daysWorked} />
                    <DetailRow label="H.E. Dobles" value={`${record.overtimeDoubleHours || 0} h`} />
                    <DetailRow label="H.E. Triples" value={`${record.overtimeTripleHours || 0} h`} />
                    <DetailRow label="Días de ausencia" value={record.absenceDays} />
                    <DetailRow label="Días de vacaciones" value={record.vacationDaysTaken} />
                    <DetailRow label="Incapacidades" value={record.sickLeaveDays} />
                    <DetailRow label="Permisos pagados" value={record.paidLeaveDays} />
                    <DetailRow label="Permisos sin pago" value={record.unpaidLeaveDays} />
                    <DetailRow label="Prima dominical" value={record.sundayPremiumDays} />
                </div>

                <Separator />

                <div className="space-y-1 text-xs text-muted-foreground">
                    {record.createdAt && <p>Creado: {typeof record.createdAt === 'string' ? formatDate(record.createdAt.substring(0, 10)) : typeof (record.createdAt as any)?.toDate === 'function' ? format((record.createdAt as any).toDate(), 'dd MMM yyyy', { locale: es }) : 'Procesando...'}</p>}
                    {record.reviewedAt && <p>Revisado: {typeof record.reviewedAt === 'string' ? formatDate(record.reviewedAt.substring(0, 10)) : typeof (record.reviewedAt as any)?.toDate === 'function' ? format((record.reviewedAt as any).toDate(), 'dd MMM yyyy', { locale: es }) : 'Procesando...'}</p>}
                    {record.exportedAt && <p>Exportado: {typeof record.exportedAt === 'string' ? formatDate(record.exportedAt.substring(0, 10)) : typeof (record.exportedAt as any)?.toDate === 'function' ? format((record.exportedAt as any).toDate(), 'dd MMM yyyy', { locale: es }) : 'Procesando...'}</p>}
                    {record.exportFormat && <p>Formato: {record.exportFormat}</p>}
                </div>
            </DialogContent>
        </Dialog>
    );
}
