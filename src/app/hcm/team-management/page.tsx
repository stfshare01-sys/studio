'use client';

import { Suspense } from 'react';
import SiteLayout from '@/components/site-layout';
import { useFirebase } from '@/firebase/provider';
import { TeamOverviewTab } from './components/tabs/TeamOverviewTab';
import { TeamTardinessTab } from './components/tabs/TeamTardinessTab';
import { TeamEarlyDeparturesTab } from './components/tabs/TeamEarlyDeparturesTab';
import { TeamMissingPunchesTab } from './components/tabs/TeamMissingPunchesTab';
import { TeamOvertimeTab } from './components/tabs/TeamOvertimeTab';
import { TeamShiftsTab } from './components/tabs/TeamShiftsTab';
import { TeamHourBankTab } from './components/tabs/TeamHourBankTab';
import { JustifyTardinessDialog } from './components/modals/JustifyTardinessDialog';
import { JustifyDepartureDialog } from './components/modals/JustifyDepartureDialog';
import { OvertimeApprovalDialog } from './components/modals/OvertimeApprovalDialog';
import { ShiftAssignmentDialog } from './components/modals/ShiftAssignmentDialog';
import { CancelShiftDialog } from './components/modals/CancelShiftDialog';
import { ShiftHistoryDialog } from './components/modals/ShiftHistoryDialog';
import { HourBankHistoryDialog } from './components/modals/HourBankHistoryDialog';
import { JustifyMissingPunchDialog } from './components/modals/JustifyMissingPunchDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Users2,
    Clock,
    AlertTriangle,
    Timer,
    Loader2,
    RefreshCw,
    Lock,
    Check,
    ArrowLeft,
} from 'lucide-react';
import Link from 'next/link';
import { migrateManagerIdField } from '@/firebase/actions/employee-actions';
import { formatHourBankBalance } from '@/firebase/actions/hour-bank-actions';
import { usePermissions } from '@/hooks/use-permissions';
import { hasPermission } from '@/firebase/role-actions';
import { useTeamManagement } from './hooks/use-team-management';
import { formatDateDDMMYYYY } from './utils';
import type { ShiftType } from "@/types/hcm.types";

export default function TeamManagementPage() {
    return (
        <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
            <TeamManagementContent />
        </Suspense>
    );
}

function TeamManagementContent() {
    const {
        permissions,
        activeBatchRange, activeLocks, activeTab, availableManagers, calculatedOvertimeStats,
        canEmployeeUseTimeBank, cancelShiftDialog, changeDate, dailyStats, dateFilter,
        earlyDepartures, employeeShiftMap, employees, filterByShift, filteredAssignments,
        filteredDepartures, filteredEmployees, filteredMissingPunches, filteredMonthlyStats, filteredOvertime,
        filteredTardiness, formatMins, getCurrentShift, handleApproveOvertime, handleAssignShift,
        handleCancelShiftAssignment, handleJustifyDeparture, handleJustifyMissingPunch, handleJustifyTardiness, handleMarkDepartureUnjustified,
        handleMarkMissingPunchAsFault, handleMarkTardinessUnjustified, handleRejectOvertime, handleViewHourBankHistory, handleViewShiftHistory,
        hasSubordinates, hourBankAdjustment, hourBankDialog, hourBankMovements, hourBanks,
        hoursToApprove, importBatches, initialLoadDone, isDateLocked, isPeriodClosed,
        justificationReason, justificationType, justifyDepartureDialog, justifyMissingPunchDialog, justifyTardinessDialog,
        lastUrlSync, loadImportBatches, loadTabData, loadingData, loadingPeriodStatus,
        missingPunches, monthlyStats, overtimeDialog, overtimeRequests, overtimeStats,
        pendingDepartures, pendingMissingPunches, pendingOvertime, pendingTardiness, positionsQuery,
        prevManagerRef, prevSelectedMonthRef, providedEntryTime, providedExitTime, refreshing,
        rejectionReason, searchTerm, selectedBatchId, selectedDate, selectedEmployeeFilter,
        selectedManagerId, selectedMonth, selectedShiftFilter, setActiveLocks, setActiveTab,
        setAvailableManagers, setCancelShiftDialog, setDailyStats, setDateFilter, setEarlyDepartures,
        setEmployees, setHasSubordinates, setHourBankAdjustment, setHourBankDialog, setHourBankMovements,
        setHourBanks, setHoursToApprove, setImportBatches, setInitialLoadDone, setIsPeriodClosed,
        setJustificationReason, setJustificationType, setJustifyDepartureDialog, setJustifyMissingPunchDialog, setJustifyTardinessDialog,
        setLoadingData, setLoadingPeriodStatus, setMissingPunches, setMonthlyStats, setOvertimeDialog,
        setOvertimeRequests, setOvertimeStats, setProvidedEntryTime, setProvidedExitTime, setRefreshing,
        setRejectionReason, setSearchTerm, setSelectedBatchId, setSelectedDate, setSelectedEmployeeFilter,
        setSelectedManagerId, setSelectedMonth, setSelectedShiftFilter, setShiftAssignments, setShiftDialog,
        setShiftForm, setShiftHistory, setShiftHistoryDialog, setShifts, setStatusFilter,
        setSubmitting, setTardiness, setUseHourBank, shiftAssignments, shiftDialog,
        shiftForm, shiftHistory, shiftHistoryDialog, shifts, statusFilter,
        submitting, tardiness, useHourBank,
    } = useTeamManagement();

    const { user, isUserLoading } = useFirebase();
    const { isLoading: loadingPermissions } = usePermissions();

    // Adaptadores de firma: traducen tipos estrictos del hook a la interfaz (val: string) => void
    // que esperan los tabs, sin modificar ni el hook ni los componentes.
    const setStatusFilterAdapter = (val: string) =>
        setStatusFilter(val as 'all' | 'pending' | 'justified');
    const hasPermissionAdapter = (perms: any, resource: string, action: string): boolean =>
        hasPermission(perms, resource as any, action as any);

    if (isUserLoading || loadingPermissions || loadingData) {
        return (
            <SiteLayout>
                <div className="flex items-center justify-center h-96">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </SiteLayout>
        );
    }

    if (!hasSubordinates && selectedManagerId === user?.uid) {
        const handleMigration = async () => {
            setRefreshing(true);
            try {
                const result = await migrateManagerIdField();
                if (result.success && result.migratedCount > 0) {
                    // Reload data after migration
                    await loadTabData(activeTab);
                }
            } finally {
                setRefreshing(false);
            }
        };

        return (
            <SiteLayout>
                <div className="flex flex-col items-center justify-center h-96 text-center">
                    <Users2 className="h-16 w-16 text-muted-foreground mb-4" />
                    <h2 className="text-xl font-semibold mb-2">Sin Subordinados</h2>
                    <p className="text-muted-foreground mb-4">
                        No tienes empleados a tu cargo en este momento.
                    </p>
                    <p className="text-sm text-muted-foreground max-w-md mb-4">
                        Si recientemente asignaste jefes directos a empleados y no aparecen aquí,
                        es posible que los datos necesiten ser migrados.
                    </p>
                    <Button variant="default" className="button-aura" onClick={handleMigration} disabled={refreshing}>
                        {refreshing ? (
                            <>
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                Migrando...
                            </>
                        ) : (
                            <>
                                <RefreshCw className="h-4 w-4 mr-2" />
                                Migrar datos de jefes directos
                            </>
                        )}
                    </Button>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout>
            <div className="space-y-6">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0"
                            asChild
                        >
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-3xl font-bold">Gestión de Equipo</h1>
                            <p className="text-muted-foreground">
                                Administra retardos, horas extras y turnos de tu equipo
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Manager Selector for Global Access */}
                        {hasPermission(permissions, 'hcm_team_management_global', 'read') && (
                            <div className="w-[300px]">
                                <Select value={selectedManagerId} onValueChange={(val) => { setSelectedManagerId(val); }}>
                                    <SelectTrigger className="bg-slate-900 border-slate-800 text-slate-50 focus:ring-slate-400 font-medium shadow-md">
                                        <div className="flex items-center gap-2">
                                            <Users2 className="h-4 w-4 text-indigo-400" />
                                            <SelectValue placeholder="Seleccionar vista..." />
                                        </div>
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all" className="font-semibold text-indigo-600">-- Toda la Empresa --</SelectItem>
                                        <SelectItem value={user?.uid || 'self'}>Mi Equipo Directo</SelectItem>
                                        <SelectGroup>
                                            <SelectLabel className="text-slate-500 font-semibold px-2 py-1.5 text-xs uppercase tracking-wider">Equipos por Manager:</SelectLabel>
                                            {availableManagers.filter(m => m.id !== user?.uid).map(mgr => (
                                                <SelectItem key={mgr.id} value={mgr.id}>Equipo de {mgr.name}</SelectItem>
                                            ))}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Badge variant="outline" className="text-base py-1.5 px-4 bg-indigo-600 text-white border-indigo-500 shadow-lg ring-1 ring-indigo-400/30">
                            <Users2 className="h-4 w-4 mr-2" />
                            {employees.length} <span className="ml-1 opacity-80">empleados</span>
                        </Badge>

                        <Button variant="default" className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => loadTabData(activeTab)} disabled={refreshing}>
                            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                            Actualizar
                        </Button>
                    </div>
                </div>

                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Retardos Pendientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-bold">{pendingTardiness.length}</span>
                                <AlertTriangle className={`h-5 w-5 ${pendingTardiness.length > 0 ? 'text-yellow-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">Salidas Tempranas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <span className="text-2xl font-bold">{pendingDepartures.length}</span>
                                <Clock className={`h-5 w-5 ${pendingDepartures.length > 0 ? 'text-orange-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">HE Pendientes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold">{calculatedOvertimeStats.pending}</span>
                                    <span className="text-sm text-muted-foreground ml-2">({calculatedOvertimeStats.totalHoursPending}h)</span>
                                </div>
                                <Timer className={`h-5 w-5 ${calculatedOvertimeStats.pending > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm font-medium text-muted-foreground">HE Aprobadas</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="flex items-center justify-between">
                                <div>
                                    <span className="text-2xl font-bold text-green-600">{calculatedOvertimeStats.totalHoursApproved}</span>
                                    <span className="text-sm text-muted-foreground ml-1">horas</span>
                                </div>
                                <Check className="h-5 w-5 text-green-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList className="bg-slate-100 p-1 border border-slate-200 shadow-inner">
                        <TabsTrigger value="overview" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">Vista General</TabsTrigger>
                        <TabsTrigger value="tardiness" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            Retardos
                            {pendingTardiness.length > 0 && (
                                <Badge variant="destructive" className="ml-2 bg-rose-600 animate-pulse">{pendingTardiness.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="early-departures" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            Salidas Tempranas
                            {pendingDepartures.length > 0 && (
                                <Badge variant="destructive" className="ml-2 bg-rose-600 animate-pulse">{pendingDepartures.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="missing-punches" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                            Sin Registro
                            {missingPunches.filter(p => !p.isJustified && !p.resultedInAbsence).length > 0 && (
                                <Badge variant="destructive" className="ml-2 bg-rose-600 animate-pulse">{missingPunches.filter(p => !p.isJustified && !p.resultedInAbsence).length}</Badge>
                            )}
                        </TabsTrigger>
                        {hasPermission(permissions, 'hcm_team_overtime', 'read') && (
                            <TabsTrigger value="overtime" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                                Horas Extras
                                {pendingOvertime.length > 0 && (
                                    <Badge variant="destructive" className="ml-2 bg-rose-600 animate-pulse">{pendingOvertime.length}</Badge>
                                )}
                            </TabsTrigger>
                        )}
                        {hasPermission(permissions, 'hcm_team_shifts', 'read') && (
                            <TabsTrigger value="shifts" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                                Turnos y Horarios
                            </TabsTrigger>
                        )}
                        {hasPermission(permissions, 'hcm_team_hour_bank', 'read') && (
                            <TabsTrigger value="hour-bank" className="data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm">
                                Bolsa de Horas
                            </TabsTrigger>
                        )}
                    </TabsList>

                    {/* Filters for all tabs except daily overview */}
                    {activeTab !== 'overview' && (
                        <div className="flex justify-end mb-4">
                            <div className="flex flex-col md:flex-row gap-4 items-center bg-slate-900 p-2 px-4 rounded-xl border border-slate-800 shadow-lg ring-1 ring-white/5">
                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Periodo Reporte</Label>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            type="month"
                                            value={dateFilter.length === 7 ? dateFilter : dateFilter.substring(0, 7)}
                                            onChange={(e) => setDateFilter(e.target.value)}
                                            className="h-9 w-full md:w-[160px] bg-slate-800 border-slate-700 text-slate-50 focus-visible:ring-indigo-500/30"
                                        />
                                        {isPeriodClosed && (
                                            <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 h-7 whitespace-nowrap font-bold">
                                                <Lock className="w-3 h-3 mr-1" />
                                                Cerrado
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                <div className="hidden md:block w-px h-6 bg-border/60" />

                                <div className="flex items-center gap-2">
                                    <Label className="text-xs font-bold text-muted-foreground uppercase">Turno</Label>
                                    <Select value={selectedShiftFilter} onValueChange={(val) => setSelectedShiftFilter(val as ShiftType | 'all')}>
                                        <SelectTrigger className="h-9 w-full md:w-[150px] bg-background border-muted-foreground/20 focus-visible:ring-primary/30">
                                            <SelectValue placeholder="Todos" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos</SelectItem>
                                            <SelectItem value="diurnal">Diurno</SelectItem>
                                            <SelectItem value="mixed">Mixto</SelectItem>
                                            <SelectItem value="nocturnal">Nocturno</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4">
                        <TeamOverviewTab
                            dailyStats={dailyStats}
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            changeDate={changeDate}
                            selectedDate={selectedDate}
                            setSelectedDate={setSelectedDate}
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            selectedMonth={selectedMonth}
                            setSelectedMonth={setSelectedMonth}
                            filteredMonthlyStats={filteredMonthlyStats}
                        />
                    </TabsContent>

                    {/* Tardiness Tab */}
                    <TabsContent value="tardiness">
                        <TeamTardinessTab
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            statusFilter={statusFilter}
                            setStatusFilter={setStatusFilterAdapter}
                            filteredTardiness={filteredTardiness}
                            permissions={permissions}
                            hasPermission={hasPermissionAdapter}
                            isPeriodClosed={isPeriodClosed}
                            submitting={submitting}
                            handleMarkTardinessUnjustified={handleMarkTardinessUnjustified}
                            setJustifyTardinessDialog={setJustifyTardinessDialog}
                            setJustificationReason={setJustificationReason}
                            setJustificationType={setJustificationType}
                            setUseHourBank={setUseHourBank}
                        />
                    </TabsContent>

                    {/* Early Departures Tab */}
                    <TabsContent value="early-departures">
                        <TeamEarlyDeparturesTab
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            statusFilter={statusFilter}
                            setStatusFilter={setStatusFilterAdapter}
                            filteredDepartures={filteredDepartures}
                            permissions={permissions}
                            hasPermission={hasPermissionAdapter}
                            isPeriodClosed={isPeriodClosed}
                            submitting={submitting}
                            handleMarkDepartureUnjustified={handleMarkDepartureUnjustified}
                            setJustifyDepartureDialog={setJustifyDepartureDialog}
                            setJustificationReason={setJustificationReason}
                            setJustificationType={setJustificationType}
                            setUseHourBank={setUseHourBank}
                        />
                    </TabsContent>

                    {/* Missing Punches Tab */}
                    <TabsContent value="missing-punches">
                        <TeamMissingPunchesTab
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            filteredMissingPunches={filteredMissingPunches}
                            permissions={permissions}
                            hasPermission={hasPermissionAdapter}
                            isPeriodClosed={isPeriodClosed}
                            submitting={submitting}
                            handleMarkMissingPunchAsFault={handleMarkMissingPunchAsFault}
                            setJustifyMissingPunchDialog={setJustifyMissingPunchDialog}
                            setJustificationReason={setJustificationReason}
                            setProvidedEntryTime={setProvidedEntryTime}
                            setProvidedExitTime={setProvidedExitTime}
                        />
                    </TabsContent>

                    {/* Overtime Tab */}

                    <TabsContent value="overtime">
                        <TeamOvertimeTab
                            overtimeStats={overtimeStats}
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            filteredOvertime={filteredOvertime}
                            hourBanks={hourBanks}
                            permissions={permissions}
                            hasPermission={hasPermissionAdapter}
                            isPeriodClosed={isPeriodClosed}
                            setOvertimeDialog={setOvertimeDialog}
                            setHoursToApprove={setHoursToApprove}
                            setRejectionReason={setRejectionReason}
                        />
                    </TabsContent>

                    {/* Shifts Tab */}
                    <TabsContent value="shifts">
                        <TeamShiftsTab
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            filteredEmployees={filteredEmployees}
                            permissions={permissions}
                            hasPermission={hasPermissionAdapter}
                            getCurrentShift={getCurrentShift}
                            handleViewShiftHistory={handleViewShiftHistory}
                            setShiftDialog={setShiftDialog}
                            setShiftForm={setShiftForm}
                        />
                    </TabsContent>



                    {/* Hour Bank Tab */}
                    {hasPermission(permissions, 'hcm_team_hour_bank', 'read') && (
                        <TabsContent value="hour-bank">
                        <TeamHourBankTab
                            selectedEmployeeFilter={selectedEmployeeFilter}
                            setSelectedEmployeeFilter={setSelectedEmployeeFilter}
                            employees={employees}
                            hourBanks={hourBanks}
                            formatHourBankBalance={formatHourBankBalance}
                            handleViewHourBankHistory={handleViewHourBankHistory}
                        />
                    </TabsContent>
                    )}
                </Tabs>

                {/* Notificación de Cierre de Período */}
                <div className="mt-8 border-t pt-6">
                    <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground text-center">
                            El cierre formal del período lo realizará Capital Humano desde la Consolidación de Asistencia. Las infracciones que no justifiques se procesarán automáticamente al momento del cierre.
                        </p>
                    </div>
                </div>
            </div>

            <JustifyTardinessDialog
                open={justifyTardinessDialog.open}
                record={justifyTardinessDialog.record}
                justificationType={justificationType ?? ''}
                setJustificationType={setJustificationType}
                justificationReason={justificationReason}
                setJustificationReason={setJustificationReason}
                useHourBank={useHourBank}
                setUseHourBank={setUseHourBank}
                submitting={submitting}
                onConfirm={handleJustifyTardiness}
                onClose={() => setJustifyTardinessDialog({ open: false })}
            />

            <JustifyDepartureDialog
                open={justifyDepartureDialog.open}
                record={justifyDepartureDialog.record}
                justificationType={justificationType ?? ''}
                setJustificationType={setJustificationType}
                justificationReason={justificationReason}
                setJustificationReason={setJustificationReason}
                useHourBank={useHourBank}
                setUseHourBank={setUseHourBank}
                submitting={submitting}
                canEmployeeUseTimeBank={canEmployeeUseTimeBank}
                onConfirm={handleJustifyDeparture}
                onClose={() => setJustifyDepartureDialog({ open: false })}
            />

            <OvertimeApprovalDialog
                overtimeDialog={overtimeDialog}
                hoursToApprove={hoursToApprove}
                setHoursToApprove={setHoursToApprove}
                rejectionReason={rejectionReason}
                setRejectionReason={setRejectionReason}
                submitting={submitting}
                hourBanks={hourBanks}
                onApprove={handleApproveOvertime}
                onReject={handleRejectOvertime}
                onClose={() => setOvertimeDialog({ open: false })}
            />


            <ShiftAssignmentDialog
                shiftDialog={shiftDialog}
                shiftForm={shiftForm}
                setShiftForm={setShiftForm}
                shifts={shifts}
                submitting={submitting}
                onConfirm={handleAssignShift}
                onClose={() => setShiftDialog({ open: false })}
            />


            <CancelShiftDialog
                cancelShiftDialog={cancelShiftDialog}
                submitting={submitting}
                onConfirm={handleCancelShiftAssignment}
                onClose={() => setCancelShiftDialog({ open: false })}
            />


            <ShiftHistoryDialog
                shiftHistoryDialog={shiftHistoryDialog}
                shiftHistory={shiftHistory}
                setShiftHistoryDialog={setShiftHistoryDialog}
                setCancelShiftDialog={setCancelShiftDialog}
            />

            <HourBankHistoryDialog
                hourBankDialog={hourBankDialog}
                hourBankMovements={hourBankMovements}
                setHourBankDialog={setHourBankDialog}
            />


            <JustifyMissingPunchDialog
                dialogState={justifyMissingPunchDialog}
                providedEntryTime={providedEntryTime}
                setProvidedEntryTime={setProvidedEntryTime}
                providedExitTime={providedExitTime}
                setProvidedExitTime={setProvidedExitTime}
                justificationReason={justificationReason}
                setJustificationReason={setJustificationReason}
                submitting={submitting}
                onConfirm={handleJustifyMissingPunch}
                onClose={() => setJustifyMissingPunchDialog({ open: false })}
            />

        </SiteLayout>
    );
}
