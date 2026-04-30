'use client';

import SiteLayout from '@/components/site-layout';
import { ArrowLeft, Plus } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useIncidencesManagement } from './hooks/use-incidences-management';
import { IncidenceControls } from './components/incidence-controls';
import { IncidencesTable } from './components/incidences-table';
import { IncidenceDialogs } from './components/incidence-dialogs';
import { TeamCalendar } from '@/components/hcm/team-calendar';

export default function IncidencesPage() {
    const state = useIncidencesManagement();

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Gestión de Permisos</h1>
                            <p className="text-muted-foreground">
                                Permisos, vacaciones, incapacidades y ausencias
                            </p>
                        </div>
                    </div>
                    <Button variant="default" className="button-aura" onClick={() => state.setIsCreateDialogOpen(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Solicitud
                    </Button>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    <IncidenceControls
                        viewMode={state.viewMode}
                        setViewMode={state.setViewMode}
                        pendingCount={state.pendingCount}
                        approvedCount={state.approvedCount}
                        rejectedCount={state.rejectedCount}
                        searchTerm={state.searchTerm}
                        setSearchTerm={state.setSearchTerm}
                        typeFilter={state.typeFilter}
                        setTypeFilter={state.setTypeFilter}
                        statusFilter={state.statusFilter}
                        setStatusFilter={state.setStatusFilter}
                        hasHRPermissions={state.hasHRPermissions}
                        isManagerOnly={state.isManagerOnly}
                    />

                    {state.viewMode === 'list' ? (
                        <IncidencesTable
                            filteredIncidences={state.filteredIncidences}
                            isLoading={state.isLoading}
                            teamEmployees={state.teamEmployees}
                            hasHRPermissions={state.hasHRPermissions}
                            isManagerOnly={state.isManagerOnly}
                            setSelectedIncidence={state.setSelectedIncidence}
                            setIsReviewDialogOpen={state.setIsReviewDialogOpen}
                        />
                    ) : (
                        <div className="mt-4">
                            <TeamCalendar
                                employees={state.teamEmployees}
                                incidences={state.filteredIncidences}
                            />
                        </div>
                    )}

                    <IncidenceDialogs
                        user={state.user}
                        hasHRPermissions={state.hasHRPermissions}
                        isManagerOnly={state.isManagerOnly}
                        selectedIncidence={state.selectedIncidence}
                        isReviewDialogOpen={state.isReviewDialogOpen}
                        setIsReviewDialogOpen={state.setIsReviewDialogOpen}
                        isCreateDialogOpen={state.isCreateDialogOpen}
                        setIsCreateDialogOpen={state.setIsCreateDialogOpen}
                        isCancelDialogOpen={state.isCancelDialogOpen}
                        setIsCancelDialogOpen={state.setIsCancelDialogOpen}
                        rejectionReason={state.rejectionReason}
                        setRejectionReason={state.setRejectionReason}
                        isSubmitting={state.isSubmitting}
                        createForEmployee={state.createForEmployee}
                        setCreateForEmployee={state.setCreateForEmployee}
                        teamEmployees={state.teamEmployees}
                        isCancellable={state.isCancellable}
                        handleApprove={state.handleApprove}
                        handleReject={state.handleReject}
                        handleCancel={state.handleCancel}
                        confirmCancel={state.confirmCancel}
                    />
                </main>
            </div>
        </SiteLayout>
    );
}
