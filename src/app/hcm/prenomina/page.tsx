
'use client';

import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, CheckCircle2, Clock, Users } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { usePrenomina } from './hooks/use-prenomina';
import { PeriodSelector } from './components/PeriodSelector';
import { PendingCountsCard } from './components/PendingCountsCard';
import { PrenominaRecordsTable } from './components/PrenominaRecordsTable';
import { EmployeeDetailDialog } from './components/EmployeeDetailDialog';
import { ConsolidateDialog } from './components/ConsolidateDialog';
import { formatDate } from './utils/prenomina-utils';

/**
 * Consolidación de Asistencia — Orquestador
 * Toda la lógica vive en usePrenomina(). Este componente solo conecta
 * el hook con los componentes de presentación.
 */
export default function ConsolidacionAsistenciaPage() {
    const prenomina = usePrenomina();

    const {
        // Period
        selectedPeriod, selectedMonth, setSelectedMonth,
        periodType, setPeriodType,
        customStart, setCustomStart, customEnd, setCustomEnd,
        selectedLegalEntity, setSelectedLegalEntity,
        // UI
        searchTerm, setSearchTerm,
        isExporting, isDownloadingReports, isConsolidating,
        isConsolidateDialogOpen, setIsConsolidateDialogOpen,
        validationErrors, consolidationStep,
        selectedDetailRecord, setSelectedDetailRecord,
        // Data
        filteredRecords, isLoading,
        pendingCounts, managerReviews, periodClosures,
        loadingPending,
        // Derived
        isPeriodClosed, totalPending, totalOvertimeHours,
        // Handlers
        handleExport, handleOfficialReport, handleClosePeriod,
    } = prenomina;

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">

                {/* ── Header ────────────────────────────────────────────────── */}
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-start md:justify-between border-b">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                            asChild
                            title="Volver al Dashboard"
                        >
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                                Consolidación de Asistencia
                            </h1>
                            <p className="text-sm text-muted-foreground">
                                Revisa y cierra el período para procesar la nómina
                            </p>
                        </div>
                    </div>

                    <PeriodSelector
                        selectedMonth={selectedMonth}
                        setSelectedMonth={setSelectedMonth}
                        periodType={periodType}
                        setPeriodType={setPeriodType}
                        customStart={customStart}
                        setCustomStart={setCustomStart}
                        customEnd={customEnd}
                        setCustomEnd={setCustomEnd}
                        selectedLegalEntity={selectedLegalEntity}
                        setSelectedLegalEntity={setSelectedLegalEntity}
                        searchTerm={searchTerm}
                        setSearchTerm={setSearchTerm}
                        isPeriodClosed={isPeriodClosed}
                        isExporting={isExporting}
                        isDownloadingReports={isDownloadingReports}
                        filteredRecords={filteredRecords}
                        onExport={handleExport}
                        onOfficialReport={handleOfficialReport}
                        onOpenConsolidateDialog={() => setIsConsolidateDialogOpen(true)}
                    />
                </header>

                {/* ── Main ──────────────────────────────────────────────────── */}
                <main className="flex flex-1 flex-col gap-4 p-4 pt-4 sm:gap-6 sm:p-6 sm:pt-6">

                    {/* Period info */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div>
                                    <Label className="text-xs text-muted-foreground">Período seleccionado</Label>
                                    <p className="text-lg font-semibold">
                                        {formatDate(selectedPeriod.start)} — {formatDate(selectedPeriod.end)}
                                    </p>
                                </div>
                                {isPeriodClosed && (
                                    <div className="flex flex-col items-end gap-1">
                                        <Badge className="bg-green-100 text-green-800 h-fit">
                                            <CheckCircle2 className="w-3 h-3 mr-1" />
                                            Período Cerrado
                                        </Badge>
                                        {periodClosures.map((closure: any) => (
                                            <span key={closure.id} className="text-xs text-muted-foreground">
                                                Bloqueado: {formatDate(closure.periodStart)} - {formatDate(closure.periodEnd)}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Stats cards */}
                    <div className="grid gap-4 md:grid-cols-2">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Colaboradores</CardTitle>
                                <Users className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">{filteredRecords.length}</div>
                                <p className="text-xs text-muted-foreground">Colaboradores en el período</p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Horas Extra</CardTitle>
                                <Clock className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">
                                    {totalOvertimeHours.toFixed(1)} hrs
                                </div>
                                <p className="text-xs text-muted-foreground">Dobles + Triples</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Pending counts */}
                    <PendingCountsCard
                        pendingCounts={pendingCounts}
                        managerReviews={managerReviews}
                        totalPending={totalPending}
                        isPeriodClosed={isPeriodClosed}
                        loadingPending={loadingPending}
                    />

                    {/* Records table */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">
                                Registros de prenómina
                                {filteredRecords.length > 0 && (
                                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                                        ({filteredRecords.length})
                                    </span>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <PrenominaRecordsTable
                                records={filteredRecords}
                                isLoading={isLoading}
                                onViewDetail={setSelectedDetailRecord}
                            />
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* ── Modals ────────────────────────────────────────────────────── */}
            <EmployeeDetailDialog
                record={selectedDetailRecord}
                onClose={() => setSelectedDetailRecord(null)}
            />
            <ConsolidateDialog
                isOpen={isConsolidateDialogOpen}
                onOpenChange={setIsConsolidateDialogOpen}
                isConsolidating={isConsolidating}
                consolidationStep={consolidationStep}
                validationErrors={validationErrors}
                onConfirm={handleClosePeriod}
            />
        </SiteLayout>
    );
}
