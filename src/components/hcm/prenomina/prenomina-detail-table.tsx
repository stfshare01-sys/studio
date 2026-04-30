
'use client';

import { useMemo } from 'react';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import { normalizeTextForPayroll, formatNameForPayroll, formatCurrency } from '@/lib/payroll-format-utils';
import { getDayShortName } from '@/lib/workday-utils';
import type { DetailedPrenominaRecord, DailyPrenominaEntry, IncidenceCode } from "@/types/hcm.types";

interface PrenominaDetailTableProps {
    records: DetailedPrenominaRecord[];
    periodStart: string;
    periodEnd: string;
}

/**
 * Componente de tabla detallada de Pre-Nomina
 * Muestra el desglose diario con la nomenclatura requerida
 */
export function PrenominaDetailTable({ records, periodStart, periodEnd }: PrenominaDetailTableProps) {
    // Generar array de fechas del período
    const periodDates = useMemo(() => {
        const dates: { date: string; dayOfWeek: number; dayShort: string; dayNum: number }[] = [];
        const start = new Date(periodStart);
        const end = new Date(periodEnd);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push({
                date: d.toISOString().split('T')[0],
                dayOfWeek: d.getDay(),
                dayShort: getDayShortName(d.getDay()),
                dayNum: d.getDate(),
            });
        }
        return dates;
    }, [periodStart, periodEnd]);

    // Obtener el color de fondo según el código de incidencia
    const getCellStyle = (code: IncidenceCode | string): string => {
        const styles: Record<string, string> = {
            'ASI': 'bg-green-50 text-green-800',
            'DD': 'bg-gray-100 text-gray-600',
            'DL': 'bg-blue-100 text-blue-800 font-medium',
            'PD': 'bg-purple-100 text-purple-800 font-medium',
            'FINJ': 'bg-red-100 text-red-800 font-medium',
            'INC': 'bg-yellow-100 text-yellow-800',
            'VAC': 'bg-cyan-100 text-cyan-800',
            'PSS': 'bg-orange-100 text-orange-800',
            'PCS': 'bg-teal-100 text-teal-800',
            'DFT': 'bg-pink-100 text-pink-800 font-medium',
            'BJ': 'bg-gray-300 text-gray-800 font-bold',
            'RET': 'bg-amber-100 text-amber-800',
        };
        return styles[code] || 'bg-white';
    };

    // Semáforo de bono
    const BonusIndicator = ({ eligible, reason }: { eligible: boolean; reason?: string }) => {
        if (eligible) {
            return (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <CheckCircle2 className="h-5 w-5 text-green-500" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Elegible para bono de puntualidad y asistencia</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            );
        }
        return (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger>
                        <XCircle className="h-5 w-5 text-red-500" />
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>No elegible: {reason || 'Tiene permisos'}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        );
    };

    return (
        <div className="overflow-x-auto">
            <Table className="min-w-max text-xs">
                <TableHeader>
                    {/* Fila de días de la semana */}
                    <TableRow className="bg-muted/50">
                        <TableHead className="sticky left-0 bg-muted/50 z-10 min-w-[60px]">UBIC.</TableHead>
                        <TableHead className="sticky left-[60px] bg-muted/50 z-10 min-w-[80px]">DEPTO</TableHead>
                        <TableHead className="sticky left-[140px] bg-muted/50 z-10 min-w-[100px]">PUESTO</TableHead>
                        <TableHead className="sticky left-[240px] bg-muted/50 z-10 min-w-[200px]">NOMBRE</TableHead>
                        {periodDates.map((d) => (
                            <TableHead
                                key={d.date}
                                className={`text-center min-w-[50px] ${d.dayOfWeek === 0 ? 'bg-purple-50' : d.dayOfWeek === 6 ? 'bg-blue-50' : ''}`}
                            >
                                <div>{d.dayShort}</div>
                                <div className="font-bold">{d.dayNum}</div>
                            </TableHead>
                        ))}
                        {/* Columnas de acumulación */}
                        <TableHead className="text-center bg-yellow-50 min-w-[40px]">PV</TableHead>
                        <TableHead className="text-center bg-orange-50 min-w-[50px]">HE2</TableHead>
                        <TableHead className="text-center bg-red-50 min-w-[50px]">HE3</TableHead>
                        <TableHead className="text-center bg-pink-50 min-w-[40px]">DFT</TableHead>
                        <TableHead className="text-center bg-blue-50 min-w-[40px]">DL</TableHead>
                        <TableHead className="text-center bg-purple-50 min-w-[40px]">PD</TableHead>
                        <TableHead className="text-center bg-red-50 min-w-[40px]">FINJ</TableHead>
                        <TableHead className="text-center bg-amber-50 min-w-[40px]">RET</TableHead>
                        <TableHead className="text-center bg-green-50 min-w-[40px]">BONO</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {records.map((record) => {
                        // Crear mapa de entradas diarias por fecha
                        const entriesMap = new Map<string, DailyPrenominaEntry>();
                        record.dailyEntries?.forEach(entry => {
                            entriesMap.set(entry.date, entry);
                        });

                        return (
                            <TableRow key={record.id}>
                                <TableCell className="sticky left-0 bg-white z-10 font-mono text-[10px]">
                                    {normalizeTextForPayroll(record.locationCode || record.locationName || '-')}
                                </TableCell>
                                <TableCell className="sticky left-[60px] bg-white z-10 font-mono text-[10px]">
                                    {normalizeTextForPayroll(record.departmentName || '-')}
                                </TableCell>
                                <TableCell className="sticky left-[140px] bg-white z-10 font-mono text-[10px]">
                                    {normalizeTextForPayroll(record.positionName || '-')}
                                </TableCell>
                                <TableCell className="sticky left-[240px] bg-white z-10 font-mono text-[10px] font-medium">
                                    {formatNameForPayroll(record.employeeName || '')}
                                </TableCell>

                                {/* Celdas de días */}
                                {periodDates.map((d) => {
                                    const entry = entriesMap.get(d.date);
                                    const cellContent = entry?.cellDisplay || '-';
                                    const primaryCode = entry?.primaryCode || '';

                                    return (
                                        <TableCell
                                            key={d.date}
                                            className={`text-center text-[10px] ${getCellStyle(primaryCode)}`}
                                        >
                                            {cellContent}
                                        </TableCell>
                                    );
                                })}

                                {/* Columnas de acumulación */}
                                <TableCell className="text-center bg-yellow-50 font-medium">
                                    {record.vacationPremiumAnniversary ? record.vacationPremiumDays : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-orange-50 font-medium">
                                    {record.totalOvertimeDoubleHours > 0 ? record.totalOvertimeDoubleHours.toFixed(1) : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-red-50 font-medium">
                                    {record.totalOvertimeTripleHours > 0 ? record.totalOvertimeTripleHours.toFixed(1) : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-pink-50 font-medium">
                                    {record.totalHolidaysWorked > 0 ? record.totalHolidaysWorked : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-blue-50 font-medium">
                                    {record.totalRestDaysWorked > 0 ? record.totalRestDaysWorked : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-purple-50 font-medium">
                                    {record.totalSundayPremiumDays > 0 ? record.totalSundayPremiumDays : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-red-50 font-medium">
                                    {record.totalAbsences > 0 ? record.totalAbsences : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-amber-50 font-medium">
                                    {record.totalTardiness > 0 ? record.totalTardiness : '-'}
                                </TableCell>
                                <TableCell className="text-center bg-green-50">
                                    <BonusIndicator
                                        eligible={record.bonusEligible}
                                        reason={record.bonusIneligibleReason}
                                    />
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}

/**
 * Leyenda de códigos de permisos
 */
export function IncidenceCodeLegend() {
    const codes = [
        { code: 'ASI', name: 'Asistencia', color: 'bg-green-100 text-green-800' },
        { code: 'DD', name: 'Dia de Descanso', color: 'bg-gray-100 text-gray-600' },
        { code: 'DL', name: 'Descanso Laborado', color: 'bg-blue-100 text-blue-800' },
        { code: 'PD', name: 'Prima Dominical', color: 'bg-purple-100 text-purple-800' },
        { code: 'FINJ', name: 'Falta Injustificada', color: 'bg-red-100 text-red-800' },
        { code: 'INC', name: 'Incapacidad', color: 'bg-yellow-100 text-yellow-800' },
        { code: 'VAC', name: 'Vacaciones', color: 'bg-cyan-100 text-cyan-800' },
        { code: 'PSS', name: 'Permiso Sin Sueldo', color: 'bg-orange-100 text-orange-800' },
        { code: 'PCS', name: 'Permiso Con Sueldo', color: 'bg-teal-100 text-teal-800' },
        { code: 'DFT', name: 'Dia Festivo Trabajado', color: 'bg-pink-100 text-pink-800' },
        { code: 'HE2', name: 'Hrs Extras Dobles', color: 'bg-orange-50 text-orange-700' },
        { code: 'HE3', name: 'Hrs Extras Triples', color: 'bg-red-50 text-red-700' },
        { code: 'RET', name: 'Retardo', color: 'bg-amber-100 text-amber-800' },
        { code: 'PV', name: 'Prima Vacacional', color: 'bg-yellow-100 text-yellow-800' },
        { code: 'BJ', name: 'Baja', color: 'bg-gray-300 text-gray-800' },
    ];

    return (
        <div className="flex flex-wrap gap-2 p-4 bg-muted/30 rounded-lg">
            <span className="text-sm font-medium text-muted-foreground mr-2">Leyenda:</span>
            {codes.map((c) => (
                <Badge key={c.code} variant="outline" className={`${c.color} text-[10px]`}>
                    {c.code} - {c.name}
                </Badge>
            ))}
        </div>
    );
}
