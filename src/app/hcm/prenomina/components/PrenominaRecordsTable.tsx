'use client';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, getStatusBadge } from '../utils/prenomina-utils';
import type { PrenominaRecord } from "@/types/hcm.types";

interface PrenominaRecordsTableProps {
    records: PrenominaRecord[];
    isLoading: boolean;
    onViewDetail: (record: PrenominaRecord) => void;
}

export function PrenominaRecordsTable({ records, isLoading, onViewDetail }: PrenominaRecordsTableProps) {
    if (isLoading) {
        return (
            <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
            </div>
        );
    }

    if (records.length === 0) {
        return (
            <div className="py-12 text-center text-muted-foreground text-sm">
                No hay registros de prenómina para este período.
            </div>
        );
    }

    return (
        <Table>
            <TableHeader>
                <TableRow>
                    <TableHead>Empleado</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Días trabajados</TableHead>
                    <TableHead className="text-right">H.E. Dobles</TableHead>
                    <TableHead className="text-right">H.E. Triples</TableHead>
                    <TableHead className="text-right">Ausencias</TableHead>
                    <TableHead className="text-right">Vacaciones</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="w-12" />
                </TableRow>
            </TableHeader>
            <TableBody>
                {records.map(record => (
                    <TableRow key={record.id}>
                        <TableCell>
                            <div>
                                <p className="font-medium">{record.employeeName || record.employeeId}</p>
                                {record.employeeRfc && (
                                    <p className="text-xs text-muted-foreground">{record.employeeRfc}</p>
                                )}
                            </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatDate(record.periodStart)} – {formatDate(record.periodEnd)}
                        </TableCell>
                        <TableCell className="text-right">{record.daysWorked ?? '—'}</TableCell>
                        <TableCell className="text-right">{record.overtimeDoubleHours || 0}</TableCell>
                        <TableCell className="text-right">{record.overtimeTripleHours || 0}</TableCell>
                        <TableCell className="text-right">{record.absenceDays || 0}</TableCell>
                        <TableCell className="text-right">{record.vacationDaysTaken || 0}</TableCell>
                        <TableCell>{getStatusBadge(record.status)}</TableCell>
                        <TableCell>
                            <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => onViewDetail(record)}
                                aria-label="Ver detalle"
                            >
                                <Eye className="h-4 w-4" />
                            </Button>
                        </TableCell>
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
