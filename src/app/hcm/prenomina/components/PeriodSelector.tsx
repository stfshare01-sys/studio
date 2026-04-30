'use client';

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, Lock, Search } from 'lucide-react';
import type { PeriodType } from '../hooks/use-prenomina';
import type { PrenominaRecord } from "@/types/hcm.types";

interface PeriodSelectorProps {
    // Period state
    selectedMonth: string;
    setSelectedMonth: (v: string) => void;
    periodType: PeriodType;
    setPeriodType: (v: PeriodType) => void;
    customStart: string;
    setCustomStart: (v: string) => void;
    customEnd: string;
    setCustomEnd: (v: string) => void;
    selectedLegalEntity: string;
    setSelectedLegalEntity: (v: string) => void;
    // Search
    searchTerm: string;
    setSearchTerm: (v: string) => void;
    // Action state
    isPeriodClosed: boolean;
    isExporting: boolean;
    isDownloadingReports: boolean;
    filteredRecords: PrenominaRecord[];
    // Handlers
    onExport: () => void;
    onOfficialReport: () => void;
    onOpenConsolidateDialog: () => void;
}

export function PeriodSelector({
    selectedMonth, setSelectedMonth,
    periodType, setPeriodType,
    customStart, setCustomStart,
    customEnd, setCustomEnd,
    selectedLegalEntity, setSelectedLegalEntity,
    searchTerm, setSearchTerm,
    isPeriodClosed, isExporting, isDownloadingReports,
    filteredRecords,
    onExport, onOfficialReport, onOpenConsolidateDialog,
}: PeriodSelectorProps) {
    return (
        <div className="space-y-4">
            {/* Controls row */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-muted-foreground whitespace-nowrap">Período:</label>
                    <Select value={periodType} onValueChange={(v) => setPeriodType(v as PeriodType)}>
                        <SelectTrigger className="w-44">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="monthly">Mensual</SelectItem>
                            <SelectItem value="biweekly_1">Quincenal 1 (1–15)</SelectItem>
                            <SelectItem value="biweekly_2">Quincenal 2 (16–fin)</SelectItem>
                            <SelectItem value="custom">Personalizado</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {periodType !== 'custom' ? (
                    <Input
                        type="month"
                        value={selectedMonth}
                        onChange={(e) => setSelectedMonth(e.target.value)}
                        className="w-40"
                    />
                ) : (
                    <div className="flex items-center gap-2">
                        <Input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="w-36" />
                        <span className="text-muted-foreground">—</span>
                        <Input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="w-36" />
                    </div>
                )}

                <Select value={selectedLegalEntity} onValueChange={setSelectedLegalEntity}>
                    <SelectTrigger className="w-52">
                        <SelectValue placeholder="Razón social" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">Todas las entidades</SelectItem>
                        <SelectItem value="STUFFACTORY">STUFFACTORY</SelectItem>
                        <SelectItem value="STUFFACTORY_SERVICIOS">STUFFACTORY SERVICIOS</SelectItem>
                    </SelectContent>
                </Select>

                {isPeriodClosed && (
                    <Badge className="bg-red-100 text-red-800 gap-1">
                        <Lock className="h-3 w-3" />
                        Período cerrado
                    </Badge>
                )}
            </div>

            {/* Search + actions row */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Buscar empleado..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                    />
                </div>

                <div className="flex items-center gap-2 ml-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onOfficialReport}
                        disabled={isDownloadingReports || filteredRecords.length === 0}
                        className="gap-2"
                    >
                        <FileText className="h-4 w-4" />
                        {isDownloadingReports ? 'Generando...' : 'Reporte Oficial'}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={onExport}
                        disabled={isExporting || filteredRecords.length === 0}
                        className="gap-2"
                    >
                        <Download className="h-4 w-4" />
                        {isExporting ? 'Exportando...' : 'NomiPAQ'}
                    </Button>
                    <Button
                        size="sm"
                        onClick={onOpenConsolidateDialog}
                        disabled={isPeriodClosed}
                        className="gap-2"
                    >
                        <Lock className="h-4 w-4" />
                        Cerrar Período
                    </Button>
                </div>
            </div>
        </div>
    );
}
