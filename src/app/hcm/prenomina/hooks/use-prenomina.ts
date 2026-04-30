import { useState, useEffect, useMemo } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, getDocs, doc, writeBatch } from 'firebase/firestore';
import { format, endOfMonth } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/use-permissions';
import { getPendingIncidences } from '@/firebase/actions/prenomina-actions';
import { runGlobalSLAProcessing } from '@/firebase/actions/sla-actions';
import { checkPeriodLock, lockPayrollPeriod } from '@/firebase/actions/report-actions';
import { callConsolidatePrenomina, callGeneratePayrollReports } from '@/firebase/callable-functions';
import { generateNomipaqLines, downloadTextFile } from '../utils/nomipaq-export';
import type { PrenominaRecord } from "@/types/hcm.types";

export type PeriodType = 'monthly' | 'biweekly_1' | 'biweekly_2' | 'custom';

export function usePrenomina() {
    const { firestore, user } = useFirebase();
    const { permissions } = usePermissions();
    const { toast } = useToast();

    // ── Period state ──────────────────────────────────────────────────────────
    const [selectedMonth, setSelectedMonth] = useState(() => format(new Date(), 'yyyy-MM'));
    const [periodType, setPeriodType] = useState<PeriodType>('monthly');
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [selectedLegalEntity, setSelectedLegalEntity] = useState('all');

    // ── UI state ──────────────────────────────────────────────────────────────
    const [searchTerm, setSearchTerm] = useState('');
    const [isConsolidating, setIsConsolidating] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const [isDownloadingReports, setIsDownloadingReports] = useState(false);
    const [isConsolidateDialogOpen, setIsConsolidateDialogOpen] = useState(false);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [consolidationStep, setConsolidationStep] = useState('');
    const [selectedDetailRecord, setSelectedDetailRecord] = useState<PrenominaRecord | null>(null);

    // ── Data state ────────────────────────────────────────────────────────────
    const [periodClosures, setPeriodClosures] = useState<any[]>([]);
    const [loadingClosures, setLoadingClosures] = useState(false);
    const [pendingCounts, setPendingCounts] = useState({ tardiness: 0, departures: 0, overtime: 0, missingPunches: 0 });
    const [managerReviews, setManagerReviews] = useState<any[]>([]);
    const [loadingPending, setLoadingPending] = useState(false);

    // ── Derived: selectedPeriod ───────────────────────────────────────────────
    const selectedPeriod = useMemo(() => {
        if (periodType === 'custom' && customStart && customEnd) {
            return { start: customStart, end: customEnd };
        }
        const [year, month] = selectedMonth.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        if (periodType === 'biweekly_1') {
            return { start: format(start, 'yyyy-MM-dd'), end: format(new Date(year, month - 1, 15), 'yyyy-MM-dd') };
        } else if (periodType === 'biweekly_2') {
            return { start: format(new Date(year, month - 1, 16), 'yyyy-MM-dd'), end: format(new Date(year, month, 0), 'yyyy-MM-dd') };
        }
        return { start: format(start, 'yyyy-MM-dd'), end: format(endOfMonth(start), 'yyyy-MM-dd') };
    }, [selectedMonth, periodType, customStart, customEnd]);

    // ── Firestore query ───────────────────────────────────────────────────────
    const prenominaQuery = useMemoFirebase(() => {
        if (!firestore || !selectedPeriod.start) return null;
        return query(
            collection(firestore, 'prenomina'),
            where('periodStart', '<=', selectedPeriod.end),
            orderBy('periodStart', 'desc')
        );
    }, [firestore, selectedPeriod.start, selectedPeriod.end]);

    const { data: prenominaRecords, isLoading } = useCollection<PrenominaRecord>(prenominaQuery);

    // ── Load period locks ─────────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            if (!selectedPeriod.start) return;
            setLoadingClosures(true);
            try {
                const result = await checkPeriodLock(selectedPeriod.start, selectedPeriod.end);
                if (result.isLocked && result.overlappingLocks) {
                    setPeriodClosures(result.overlappingLocks.map(lock => ({
                        id: lock.id,
                        period: `${lock.periodStart}_${lock.periodEnd}`,
                        periodStart: lock.periodStart,
                        periodEnd: lock.periodEnd,
                        closedAt: lock.lockedAt,
                        managerName: lock.lockedByName,
                    })));
                } else {
                    setPeriodClosures([]);
                }
            } catch (error) {
                console.error('Error loading period locks:', error);
                setPeriodClosures([]);
            } finally {
                setLoadingClosures(false);
            }
        };
        load();
    }, [selectedPeriod.start, selectedPeriod.end]);

    // ── Load pending counts ───────────────────────────────────────────────────
    useEffect(() => {
        const load = async () => {
            if (!firestore || !selectedPeriod.start) return;
            setLoadingPending(true);
            try {
                const [tardinessSnap, departuresSnap, overtimeSnap, missingSnap, reviewsSnap, employeesSnap] =
                    await Promise.all([
                        getDocs(query(collection(firestore, 'tardiness_records'), where('justificationStatus', '==', 'pending'), where('date', '>=', selectedPeriod.start), where('date', '<=', selectedPeriod.end))),
                        getDocs(query(collection(firestore, 'early_departures'), where('justificationStatus', '==', 'pending'), where('date', '>=', selectedPeriod.start), where('date', '<=', selectedPeriod.end))),
                        getDocs(query(collection(firestore, 'overtime_requests'), where('status', '==', 'pending'), where('date', '>=', selectedPeriod.start), where('date', '<=', selectedPeriod.end))),
                        getDocs(query(collection(firestore, 'missing_punches'), where('isJustified', '==', false), where('resultedInAbsence', '==', false), where('date', '>=', selectedPeriod.start), where('date', '<=', selectedPeriod.end))),
                        getDocs(query(collection(firestore, 'manager_review_status'), where('periodStart', '>=', selectedPeriod.start), where('periodEnd', '<=', selectedPeriod.end))),
                        getDocs(collection(firestore, 'employees')),
                    ]);

                const activeEmpIds = new Set<string>();
                employeesSnap.docs.forEach(d => {
                    const s = d.data().status;
                    if (s !== 'terminated' && s !== 'disabled') activeEmpIds.add(d.id);
                });

                const countValid = (snap: any) =>
                    snap.docs.filter((d: any) => activeEmpIds.has(d.data().employeeId)).length;

                setPendingCounts({
                    tardiness: countValid(tardinessSnap),
                    departures: countValid(departuresSnap),
                    overtime: countValid(overtimeSnap),
                    missingPunches: countValid(missingSnap),
                });
                setManagerReviews(reviewsSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (error) {
                console.error('Error loading pending counts:', error);
            } finally {
                setLoadingPending(false);
            }
        };
        load();
    }, [firestore, selectedPeriod.start, selectedPeriod.end]);

    // ── Derived: filtered records ─────────────────────────────────────────────
    const matchedRecords = useMemo(() => {
        if (!prenominaRecords) return [];
        return (prenominaRecords as PrenominaRecord[]).filter(r =>
            r.periodStart <= selectedPeriod.end && r.periodEnd >= selectedPeriod.start
        );
    }, [prenominaRecords, selectedPeriod.start, selectedPeriod.end]);

    const filteredRecords = useMemo(() => {
        if (!searchTerm) return matchedRecords;
        return matchedRecords.filter(r =>
            (r.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.employeeId || '').toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [matchedRecords, searchTerm]);

    // ── Derived: metrics ──────────────────────────────────────────────────────
    const totalOvertimeHours = filteredRecords.reduce(
        (sum, r) => sum + (r.overtimeDoubleHours || 0) + (r.overtimeTripleHours || 0), 0
    );
    const isPeriodClosed = periodClosures.length > 0;
    const totalPending = pendingCounts.tardiness + pendingCounts.departures + pendingCounts.overtime + pendingCounts.missingPunches;
    const currentPeriodKey = `${selectedPeriod.start}_${selectedPeriod.end}`;

    // ── Handler: cerrar período ───────────────────────────────────────────────
    const handleClosePeriod = async () => {
        if (!user || !firestore) return;
        if (isPeriodClosed) {
            setValidationErrors(['Este período ya ha sido consolidado. No se puede volver a cerrar.']);
            return;
        }

        setIsConsolidating(true);
        setValidationErrors([]);
        setConsolidationStep('Verificando bloqueo del período...');

        try {
            const freshLock = await checkPeriodLock(selectedPeriod.start, selectedPeriod.end);
            if (freshLock.isLocked) {
                setValidationErrors(['Este período ya ha sido consolidado y bloqueado.']);
                return;
            }

            setConsolidationStep('Validando permisos pendientes...');
            const pending = await getPendingIncidences(selectedPeriod.start, selectedPeriod.end);
            if (pending.length > 0) {
                setValidationErrors([`Existen ${pending.length} permisos pendientes de aprobar/rechazar en este período.`]);
                return;
            }

            setConsolidationStep('Ejecutando SLA para infracciones no justificadas...');
            const slaResult = await runGlobalSLAProcessing(user.uid, user.role as string, user.customRoleId, selectedPeriod.start, selectedPeriod.end);
            if (!slaResult.success) throw new Error(slaResult.error || 'Error al ejecutar SLA');

            setConsolidationStep('Consolidando prenómina...');
            const effectivePeriodType = periodType === 'biweekly_1' || periodType === 'biweekly_2' ? 'biweekly' : 'monthly';
            const consolidateResult = await callConsolidatePrenomina({ periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, periodType: effectivePeriodType });
            if (!consolidateResult.success) throw new Error(consolidateResult.errors?.[0]?.message || 'Error al consolidar');

            setConsolidationStep('Bloqueando período...');
            const lockResult = await lockPayrollPeriod(selectedPeriod.start, selectedPeriod.end, effectivePeriodType, user.uid, user.fullName || user.email || 'Sistema', undefined, undefined);
            if (!lockResult.success) throw new Error(lockResult.error || 'No se pudo bloquear el período.');

            setConsolidationStep('Actualizando estado de registros...');
            const prenominaSnap = await getDocs(query(collection(firestore, 'prenomina'), where('periodStart', '>=', selectedPeriod.start), where('periodStart', '<=', selectedPeriod.end)));
            if (!prenominaSnap.empty) {
                // TODO: Migrar a serverTimestamp() — actualmente usa new Date().toISOString() por limitación de writeBatch
                const nowISO = new Date().toISOString();
                const docs = prenominaSnap.docs.filter(d => {
                    const data = d.data();
                    return data.periodEnd >= selectedPeriod.start && data.status !== 'locked';
                });
                for (let i = 0; i < docs.length; i += 500) {
                    const batch = writeBatch(firestore);
                    docs.slice(i, i + 500).forEach(d => batch.update(doc(firestore, 'prenomina', d.id), { status: 'locked', updatedAt: nowISO }));
                    await batch.commit();
                }
            }

            setPeriodClosures([{ id: lockResult.lockId, period: currentPeriodKey, closedAt: new Date().toISOString(), managerName: user.fullName || user.email || 'Sistema' }]);
            toast({ title: 'Período cerrado exitosamente', description: `Se procesaron ${slaResult.stats?.processedTardiness || 0} retardos y ${slaResult.stats?.processedDepartures || 0} salidas. ${consolidateResult.recordIds?.length || 0} registros de prenómina generados.` });
            setIsConsolidateDialogOpen(false);
            setConsolidationStep('');
        } catch (error) {
            setValidationErrors([error instanceof Error ? error.message : 'No se pudo completar el proceso.']);
            setConsolidationStep('');
        } finally {
            setIsConsolidating(false);
        }
    };

    // ── Handler: exportar NomiPAQ ─────────────────────────────────────────────
    const handleExport = async () => {
        if (!firestore) return;
        setIsExporting(true);
        toast({ title: 'Generando archivo NomiPAQ', description: 'Obteniendo detalles completos del período...' });
        try {
            const content = await generateNomipaqLines(firestore, selectedPeriod, selectedLegalEntity);
            downloadTextFile(content, `nomipaq_formato1_${selectedPeriod.start}_${selectedPeriod.end}.txt`);
            toast({ title: 'Exportación completada', description: 'El archivo NomiPAQ (Formato 1) ha sido descargado.' });
        } catch (error) {
            console.error('Error exporting to NomiPAQ:', error);
            toast({ title: 'Error en exportación', description: 'No se pudieron obtener los detalles de asistencia.', variant: 'destructive' });
        } finally {
            setIsExporting(false);
        }
    };

    // ── Handler: reporte oficial ──────────────────────────────────────────────
    const handleOfficialReport = async () => {
        setIsDownloadingReports(true);
        toast({ title: 'Generando reportes oficiales', description: 'Esto puede tardar unos segundos...' });
        try {
            const result = await callGeneratePayrollReports({ periodStart: selectedPeriod.start, periodEnd: selectedPeriod.end, legalEntity: selectedLegalEntity !== 'all' ? selectedLegalEntity : undefined });
            if (result.success && result.downloadUrl) {
                window.open(result.downloadUrl, '_blank');
                toast({ title: 'Reportes generados', description: 'La descarga del archivo ZIP comenzará automáticamente.' });
            } else {
                throw new Error('No se recibió la URL de descarga.');
            }
        } catch (error: any) {
            const isCloudFunctionError = ['functions/not-found', 'functions/unavailable', 'functions/internal'].includes(error?.code) || error?.message?.includes('INTERNAL') || error?.message?.includes('not found');
            toast({ title: 'Error al generar reportes', description: isCloudFunctionError ? 'Las Cloud Functions no están disponibles. Contacte al administrador.' : (error instanceof Error ? error.message : 'Error desconocido'), variant: 'destructive' });
        } finally {
            setIsDownloadingReports(false);
        }
    };

    return {
        // Period
        selectedPeriod, selectedMonth, setSelectedMonth,
        periodType, setPeriodType,
        customStart, setCustomStart,
        customEnd, setCustomEnd,
        selectedLegalEntity, setSelectedLegalEntity,
        // UI
        searchTerm, setSearchTerm,
        isConsolidating, isExporting, isDownloadingReports,
        isConsolidateDialogOpen, setIsConsolidateDialogOpen,
        validationErrors, consolidationStep,
        selectedDetailRecord, setSelectedDetailRecord,
        // Data
        filteredRecords, isLoading,
        pendingCounts, managerReviews, periodClosures,
        loadingPending, loadingClosures,
        // Derived
        isPeriodClosed, totalPending, totalOvertimeHours,
        permissions,
        // Handlers
        handleClosePeriod, handleExport, handleOfficialReport,
    };
}
