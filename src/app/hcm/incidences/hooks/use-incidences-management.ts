import { useState, useMemo, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Query } from 'firebase/firestore';
import { getDirectReports, getHierarchicalReports } from '@/firebase/actions/team-actions';
import { callApproveIncidence } from '@/firebase/callable-functions';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/hooks/use-toast';
import type { Incidence, IncidenceType, IncidenceStatus, Employee } from "@/types/hcm.types";
import { startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

export function useIncidencesManagement() {
    const { firestore, user, isUserLoading } = useFirebase();
    const { toast } = useToast();
    
    // View state
    const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
    const [currentMonth, setCurrentMonth] = useState(new Date());

    // Filters state
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Dialog state
    const [selectedIncidence, setSelectedIncidence] = useState<Incidence | null>(null);
    const [isReviewDialogOpen, setIsReviewDialogOpen] = useState(false);
    const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
    const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
    
    // Form state
    const [rejectionReason, setRejectionReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [createForEmployee, setCreateForEmployee] = useState<string>('');

    // Team state
    const [teamEmployees, setTeamEmployees] = useState<Employee[]>([]);
    const [teamIds, setTeamIds] = useState<string[]>([]);
    const [teamReloadKey, setTeamReloadKey] = useState(0);

    const searchParams = useSearchParams();
    const lastUrlSync = useRef<string | null>(null);
    const { hierarchyDepth, isLoading: isLoadingPermissions } = usePermissions();

    const hasHRPermissions = useMemo(() => ['Admin', 'HRManager'].includes(user?.role || ''), [user]);
    const isManagerOnly = useMemo(() => user?.role === 'Manager', [user]);

    // Load team members
    useEffect(() => {
        if (!user?.uid || isLoadingPermissions) return;

        if (isManagerOnly) {
            getHierarchicalReports(user.uid, hierarchyDepth).then(res => {
                if (res.success && res.employees) {
                    const active = res.employees.filter(e => e.status === 'active');
                    setTeamIds(active.map(e => e.id));
                    setTeamEmployees(active);
                }
            });
        } else if (hasHRPermissions) {
            getDirectReports('all').then(res => {
                if (res.success && res.employees) {
                    const active = res.employees.filter(e => e.status === 'active');
                    setTeamEmployees(active);
                }
            });
        }
    }, [isManagerOnly, hasHRPermissions, user?.uid, teamReloadKey, hierarchyDepth, isLoadingPermissions]);

    // Firestore Query
    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user) return null;

        let q = collection(firestore, 'incidences') as Query;

        if (hasHRPermissions) {
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        } else if (isManagerOnly) {
            const allowedIds = [user.uid, ...teamIds].slice(0, 30);
            if (allowedIds.length > 0) {
                q = query(q, where('employeeId', 'in', allowedIds));
            } else {
                q = query(q, where('employeeId', '==', user.uid));
            }
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        } else {
            q = query(q, where('employeeId', '==', user.uid));
            if (statusFilter !== 'all') {
                q = query(q, where('status', '==', statusFilter));
            }
        }

        return query(q, orderBy('createdAt', 'desc'));
    }, [firestore, isUserLoading, user, hasHRPermissions, isManagerOnly, statusFilter, teamIds]);

    const { data: incidences, isLoading } = useCollection<Incidence>(incidencesQuery);

    // Auto-select from URL
    useEffect(() => {
        const incidentId = searchParams.get('incidentId');
        if (incidentId === lastUrlSync.current) return;
        lastUrlSync.current = incidentId;

        if (!incidentId || !incidences || incidences.length === 0) return;

        const target = incidences.find(inc => inc.id === incidentId);
        if (target) {
            setSelectedIncidence(target);
            setIsReviewDialogOpen(true);
            if (target.status === 'pending') {
                setStatusFilter('pending');
            }
        }
    }, [searchParams, incidences]);

    // Client-side filtering
    const filteredIncidences = useMemo(() => {
        return incidences?.filter(inc => {
            const matchesType = typeFilter === 'all' || inc.type === typeFilter;
            const matchesSearch = searchTerm === '' ||
                inc.employeeName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                inc.employeeId.toLowerCase().includes(searchTerm.toLowerCase());

            return matchesType && matchesSearch;
        }) ?? [];
    }, [incidences, typeFilter, searchTerm, user]);

    // Calendar logic
    const calendarDays = useMemo(() => {
        const start = startOfWeek(startOfMonth(currentMonth));
        const end = endOfWeek(endOfMonth(currentMonth));
        return eachDayOfInterval({ start, end });
    }, [currentMonth]);

    const getIncidencesForDay = (day: Date) => {
        return filteredIncidences.filter(inc =>
            isWithinInterval(day, {
                start: new Date(inc.startDate),
                end: new Date(inc.endDate)
            })
        );
    };

    // KPIs
    const pendingCount = incidences?.filter(i => i.status === 'pending').length ?? 0;
    const approvedCount = incidences?.filter(i => i.status === 'approved').length ?? 0;
    const rejectedCount = incidences?.filter(i => i.status === 'rejected').length ?? 0;

    // Helpers
    const isCancellable = selectedIncidence?.status === 'approved' && 
                          (hasHRPermissions || isManagerOnly) && 
                          selectedIncidence?.type !== 'unjustified_absence';

    // Handlers
    const handleApprove = async () => {
        if (!selectedIncidence || !user) return;
        setIsSubmitting(true);
        try {
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'approve',
            });
            if (result.success) {
                toast({ title: 'Incidencia aprobada', description: 'La solicitud ha sido aprobada exitosamente.' });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
                setTeamReloadKey(prev => prev + 1);
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo aprobar la incidencia.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleReject = async () => {
        if (!selectedIncidence || !user) return;
        if (!rejectionReason.trim()) {
            toast({ title: 'Motivo requerido', description: 'Por favor ingresa un motivo para el rechazo.', variant: 'destructive' });
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'reject',
                rejectionReason: rejectionReason.trim(),
            });

            if (result.success) {
                toast({ title: 'Incidencia rechazada', description: 'La solicitud ha sido rechazada.' });
                setIsReviewDialogOpen(false);
                setSelectedIncidence(null);
                setRejectionReason('');
                setTeamReloadKey(prev => prev + 1);
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo rechazar la incidencia.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = () => {
        setIsCancelDialogOpen(true);
    };

    const confirmCancel = async () => {
        if (!selectedIncidence) return;
        setIsSubmitting(true);
        try {
            const result = await callApproveIncidence({
                incidenceId: selectedIncidence.id,
                action: 'cancel',
            });

            if (result.success) {
                toast({ title: 'Incidencia cancelada', description: 'La incidencia ha sido cancelada exitosamente.' });
                setIsReviewDialogOpen(false);
                setIsCancelDialogOpen(false);
                setSelectedIncidence(null);
                setTeamReloadKey(prev => prev + 1);
            }
        } catch (error: any) {
            toast({ title: 'Error', description: error.message || 'No se pudo cancelar la incidencia.', variant: 'destructive' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return {
        user,
        hasHRPermissions,
        isManagerOnly,
        // State
        viewMode, setViewMode,
        currentMonth, setCurrentMonth,
        statusFilter, setStatusFilter,
        typeFilter, setTypeFilter,
        searchTerm, setSearchTerm,
        selectedIncidence, setSelectedIncidence,
        isReviewDialogOpen, setIsReviewDialogOpen,
        isCreateDialogOpen, setIsCreateDialogOpen,
        isCancelDialogOpen, setIsCancelDialogOpen,
        rejectionReason, setRejectionReason,
        isSubmitting,
        createForEmployee, setCreateForEmployee,
        teamEmployees,
        // Data
        incidences,
        filteredIncidences,
        isLoading,
        pendingCount,
        approvedCount,
        rejectedCount,
        calendarDays,
        getIncidencesForDay,
        isCancellable,
        // Handlers
        handleApprove,
        handleReject,
        handleCancel,
        confirmCancel
    };
}
