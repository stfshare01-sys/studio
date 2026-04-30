'use client';

import { useState, useMemo, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getFirestore, doc, getDoc, setDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy, limit as firestoreLimit, limit, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
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
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
    Users2,
    Clock,
    AlertTriangle,
    Timer,
    CalendarDays,
    Check,
    X,
    Loader2,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Gavel,
    CheckCircle2,
    Calculator,
    Lock,
    History,
    Moon,
    LogIn,
    LogOut,
    ArrowLeftRight,
    XCircle,
    AlertCircle,
    Filter,
    Sun,
    SunMoon,
    MapPin
} from 'lucide-react';

import {
    getDirectReports,
    getHierarchicalReports,
    hasDirectReports,
    getTeamTardiness,
    getTeamEarlyDepartures,
    getTeamOvertimeRequests,
    getTeamMonthlyStats,
    getTeamDailyStats,
    justifyEarlyDeparture,
    approveOvertimeRequest,
    rejectOvertimeRequest,
    assignShift,
    getTeamShiftAssignments,
    getEmployeeShiftHistory,
    cancelShiftAssignment,
    getAttendanceImportBatches,
    getAvailableShifts,
    markEarlyDepartureUnjustified,
    getTeamMissingPunches
} from '@/firebase/actions/team-actions';
import { justifyTardiness, markTardinessUnjustified, justifyMissingPunch } from '@/firebase/actions/incidence-actions';
import { migrateManagerIdField } from '@/firebase/actions/employee-actions';
import { getTeamHourBanks, getHourBankMovements, formatHourBankBalance, manualHourBankAdjustment, formatMinutesToReadable } from '@/firebase/actions/hour-bank-actions';
import { usePermissions } from '@/hooks/use-permissions';
import { hasPermission } from '@/firebase/role-actions';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { cn } from '@/lib/utils';
import type { Employee, TardinessRecord, EarlyDeparture, OvertimeRequest, EmployeeMonthlyStats, TeamDailyStats, CustomShift, HourBank, HourBankMovement, JustificationType, ShiftAssignment, ShiftType, AttendanceImportBatch, Position, PayrollPeriodLock } from "@/types/hcm.types";
import { JUSTIFICATION_TYPE_LABELS } from "@/types/hcm.types";

export function useTeamManagement() {
    const searchParams = useSearchParams();
    const { user, isUserLoading, firestore } = useFirebase();
    const { permissions, hierarchyDepth, isLoading: loadingPermissions } = usePermissions();
    const { toast } = useToast();
    const lastUrlSync = useRef({ batchId: '', tab: '' });
    const [activeTab, setActiveTab] = useState('overview');

    // Date filters
    const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMonth, setSelectedMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    });
    const [dateFilter, setDateFilter] = useState(selectedMonth); // Used for month/period filtering

    // Advanced Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'justified'>('pending');
    const [selectedEmployeeFilter, setSelectedEmployeeFilter] = useState<string>('all'); // Filtro por empleado

    // Data states
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [tardiness, setTardiness] = useState<TardinessRecord[]>([]);
    const [earlyDepartures, setEarlyDepartures] = useState<EarlyDeparture[]>([]);
    const [overtimeRequests, setOvertimeRequests] = useState<OvertimeRequest[]>([]);
    const [monthlyStats, setMonthlyStats] = useState<EmployeeMonthlyStats[]>([]);
    const [dailyStats, setDailyStats] = useState<TeamDailyStats[]>([]);
    const [shifts, setShifts] = useState<CustomShift[]>([]);
    const [shiftAssignments, setShiftAssignments] = useState<ShiftAssignment[]>([]);
    const [overtimeStats, setOvertimeStats] = useState({ pending: 0, approved: 0, rejected: 0, partial: 0, totalHoursApproved: 0, totalHoursPending: 0 });
    const [hourBanks, setHourBanks] = useState<HourBank[]>([]);
    const [hourBankMovements, setHourBankMovements] = useState<HourBankMovement[]>([]);
    const [hourBankAdjustment, setHourBankAdjustment] = useState({ hours: 0, reason: '' });
    const [providedEntryTime, setProvidedEntryTime] = useState('');
    const [providedExitTime, setProvidedExitTime] = useState('');
    const [missingPunches, setMissingPunches] = useState<any[]>([]); // MissingPunchRecord[]


    // Global Access State
    const [selectedManagerId, setSelectedManagerId] = useState<string>('');
    const [availableManagers, setAvailableManagers] = useState<{ id: string, name: string }[]>([]);
    const [hasSubordinates, setHasSubordinates] = useState(true); // To control UI when no subordinates

    // Loading states
    const [loadingData, setLoadingData] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isPeriodClosed, setIsPeriodClosed] = useState(false);
    const [activeLocks, setActiveLocks] = useState<PayrollPeriodLock[]>([]);
    const [loadingPeriodStatus, setLoadingPeriodStatus] = useState(false);

    // State for filters
    const [importBatches, setImportBatches] = useState<AttendanceImportBatch[]>([]);
    const [selectedBatchId, setSelectedBatchId] = useState<string>('all');
    const [selectedShiftFilter, setSelectedShiftFilter] = useState<ShiftType | 'all'>('all');

    const [shiftHistoryDialog, setShiftHistoryDialog] = useState<{ open: boolean; employee?: Employee }>({ open: false });
    const [shiftHistory, setShiftHistory] = useState<ShiftAssignment[]>([]);

    // Fetch positions for configuration checks
    const positionsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'positions'));
    }, [firestore]);
    const { data: positions } = useCollection<Position>(positionsQuery);

    // Helper to check if employee allows time bank
    const canEmployeeUseTimeBank = useCallback((employeeId?: string) => {
        if (!employeeId || !employees.length || !positions?.length) return false;
        const employee = employees.find(e => e.id === employeeId);
        if (!employee) return false;

        // Check for specific employee override first
        if (typeof employee.allowTimeForTime === 'boolean') {
            return employee.allowTimeForTime;
        }

        // Match by ID (preferred) or Name (legacy/fallback)
        const position = positions.find(p =>
            (employee.positionId && p.id === employee.positionId) ||
            p.name === employee.positionTitle
        );

        return position?.allowTimeBank || false;
    }, [employees, positions]);

    // Dialog states
    const [justifyTardinessDialog, setJustifyTardinessDialog] = useState<{ open: boolean; record?: TardinessRecord; employeeName?: string }>({ open: false });
    const [justifyDepartureDialog, setJustifyDepartureDialog] = useState<{ open: boolean; record?: EarlyDeparture; employeeName?: string }>({ open: false });
    const [overtimeDialog, setOvertimeDialog] = useState<{ open: boolean; request?: OvertimeRequest }>({ open: false });
    const [shiftDialog, setShiftDialog] = useState<{ open: boolean; employee?: Employee }>({ open: false });
    const [cancelShiftDialog, setCancelShiftDialog] = useState<{ open: boolean; assignment?: ShiftAssignment }>({ open: false });
    const [hourBankDialog, setHourBankDialog] = useState<{ open: boolean; employee?: Employee }>({ open: false });
    const [justifyMissingPunchDialog, setJustifyMissingPunchDialog] = useState<{
        open: boolean;
        punch?: any; // MissingPunchRecord
        employeeName?: string;
    }>({ open: false });

    // Form states
    const [justificationReason, setJustificationReason] = useState('');
    const [justificationType, setJustificationType] = useState<JustificationType | undefined>(undefined);
    const [useHourBank, setUseHourBank] = useState(false);
    const [hoursToApprove, setHoursToApprove] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [shiftForm, setShiftForm] = useState({
        shiftId: '',
        type: 'temporary' as 'temporary' | 'permanent',
        startDate: new Date().toISOString().split('T')[0],
        endDate: '',
        reason: ''
    });
    const [submitting, setSubmitting] = useState(false);

    const loadImportBatches = useCallback(async () => {
        const batchesResult = await getAttendanceImportBatches();
        if (batchesResult.success && batchesResult.batches) {
            setImportBatches(batchesResult.batches);
        }
    }, []);

    // Helper: Verify if a specific date is within any of the active locks
    const isDateLocked = useCallback((dateStr: string, locks: PayrollPeriodLock[]): boolean => {
        return locks.some(lock => dateStr >= lock.periodStart && dateStr <= lock.periodEnd);
    }, []);

    // Check if current period is closed using granular date-range locks
    useEffect(() => {
        const checkPeriodClosure = async () => {
            if (!dateFilter) return;

            setLoadingPeriodStatus(true);
            try {
                // Import checkPeriodLock from report-actions
                const { checkPeriodLock } = await import('@/firebase/actions/report-actions');

                // Calculate period start/end based on dateFilter
                // dateFilter can be "YYYY-MM" (month) or "YYYY-MM-DD" (specific date)
                let periodStart: string;
                let periodEnd: string;

                if (dateFilter === 'all') {
                    setIsPeriodClosed(false);
                    return;
                }

                if (/^\d{4}-\d{2}$/.test(dateFilter)) {
                    // Month format: "2026-02"
                    const [year, month] = dateFilter.split('-').map(Number);
                    const startDate = new Date(year, month - 1, 1);
                    const endDate = new Date(year, month, 0); // Last day of month
                    periodStart = format(startDate, 'yyyy-MM-dd');
                    periodEnd = format(endDate, 'yyyy-MM-dd');
                } else if (/^\d{4}-\d{2}-\d{2}$/.test(dateFilter)) {
                    // Specific date format
                    periodStart = dateFilter;
                    periodEnd = dateFilter;
                } else {
                    // Invalid or unknown format, default to today
                    const today = new Date();
                    const formattedToday = format(today, 'yyyy-MM-dd');
                    periodStart = formattedToday;
                    periodEnd = formattedToday;
                }

                // Check if this specific date range is locked
                const lockResult = await checkPeriodLock(periodStart, periodEnd);

                if (lockResult.overlappingLocks && lockResult.overlappingLocks.length > 0) {
                    setActiveLocks(lockResult.overlappingLocks);
                    setIsPeriodClosed(true); // Retain for overall visual indicators if needed
                    console.log('🔒 Period has overlapping locks:', periodStart, '-', periodEnd);
                } else {
                    setActiveLocks([]);
                    setIsPeriodClosed(false);
                    console.log('✅ Period is completely open:', periodStart, '-', periodEnd);
                }
            } catch (error) {
                console.error('Error checking period lock:', error);
                setActiveLocks([]);
                setIsPeriodClosed(false);
            } finally {
                setLoadingPeriodStatus(false);
            }
        };

        checkPeriodClosure();
    }, [dateFilter]);

    const loadTabData = useCallback(async (tab: string, managerId?: string) => {
        const managerToUse = managerId || selectedManagerId;
        if (!user?.id || !managerToUse) {
            return;
        }

        setRefreshing(true);
        try {
            switch (tab) {
                case 'overview':
                    const [year, month] = dateFilter.split('-').map(Number);
                    const statsResult = await getTeamMonthlyStats(managerToUse, year, month, hierarchyDepth);
                    if (statsResult.success && statsResult.stats) {
                        setMonthlyStats(statsResult.stats);
                    }
                    const dailyResult = await getTeamDailyStats(managerToUse, selectedDate, hierarchyDepth);
                    if (dailyResult.success && dailyResult.stats) {
                        setDailyStats(dailyResult.stats);
                    }
                    break;

                case 'tardiness':
                    const tardinessResult = await getTeamTardiness(managerToUse, dateFilter, hierarchyDepth);
                    if (tardinessResult.success && tardinessResult.records) {
                        setTardiness(tardinessResult.records);
                    }
                    break;

                case 'early-departures':
                    const departuresResult = await getTeamEarlyDepartures(managerToUse, dateFilter, hierarchyDepth);
                    if (departuresResult.success && departuresResult.records) {
                        setEarlyDepartures(departuresResult.records);
                    }
                    break;

                case 'overtime':
                    const otResult = await getTeamOvertimeRequests(managerToUse, 'all', hierarchyDepth, dateFilter); // dateFilter activa dual-query de pendientes
                    if (otResult.success) {
                        setOvertimeRequests(otResult.requests || []);
                        if (otResult.stats) setOvertimeStats(otResult.stats);
                    }
                    try {
                        const fnEmployees = hierarchyDepth === undefined || hierarchyDepth > 1 
                            ? (mId: string) => getHierarchicalReports(mId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
                            : getDirectReports;
                        const empsResult = await fnEmployees(managerToUse);
                        if (empsResult.success && empsResult.employees) {
                            const employeeIds = empsResult.employees.map(e => e.id).filter(Boolean);
                            if (employeeIds.length > 0) {
                                const hbResult = await getTeamHourBanks(employeeIds);
                                if (hbResult.success && hbResult.hourBanks) {
                                    setHourBanks(hbResult.hourBanks);
                                }
                            } else {
                                setHourBanks([]);
                            }
                        }
                    } catch (hbError) {
                        // Hour bank read may fail for users without time_bank permissions
                        console.warn('Hour bank data unavailable for overtime tab:', hbError);
                        setHourBanks([]);
                    }
                    break;

                case 'shifts':
                    if (!hasPermission(permissions, 'hcm_team_shifts', 'read')) break;
                    // We use getTeamShiftAssignments for the team view
                    const assignmentsResult = await getTeamShiftAssignments(managerToUse, hierarchyDepth);
                    if (assignmentsResult.success && assignmentsResult.assignments) {
                        setShiftAssignments(assignmentsResult.assignments);
                    }
                    // Also get available shifts definitions just in case we need them for dropdowns
                    const shiftsResult = await getAvailableShifts();
                    if (shiftsResult.success && shiftsResult.shifts) {
                        setShifts(shiftsResult.shifts);
                    }
                    break;

                case 'hour-bank':
                    // Seguridad delegada a Firestore rules (isManagerOrHR)
                    // No usamos hasPermission aquí porque bloquea a usuarios con permisos válidos en Firestore
                    try {
                        const fnEmployees = hierarchyDepth === undefined || hierarchyDepth > 1 
                            ? (mId: string) => getHierarchicalReports(mId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
                            : getDirectReports;
                        const empResult = await fnEmployees(managerToUse);
                        if (empResult.success && empResult.employees) {
                            setEmployees(empResult.employees);
                            if (empResult.employees.length > 0) {
                                const empIds = empResult.employees.map(e => e.id);
                                const hbResult = await getTeamHourBanks(empIds);
                                if (hbResult.success && hbResult.hourBanks) {
                                    setHourBanks(hbResult.hourBanks);
                                } else {
                                    console.warn('[loadTabData] hour-bank: query failed or empty', hbResult.error);
                                    setHourBanks([]);
                                }
                            } else {
                                setHourBanks([]);
                            }
                        }
                    } catch (hbError) {
                        console.warn('[loadTabData] hour-bank: error loading data', hbError);
                        setHourBanks([]);
                    }
                    break;

                case 'missing-punches':
                    const punchesResult = await getTeamMissingPunches(managerToUse, dateFilter, hierarchyDepth);
                    if (punchesResult.success && punchesResult.records) {
                        setMissingPunches(punchesResult.records);
                    }
                    break;
            }
        } catch (error) {
            console.error('Error loading tab data:', error);
        } finally {
            setRefreshing(false);
        }
    }, [user?.id, selectedManagerId, dateFilter, selectedDate, hierarchyDepth, permissions]);

    // Flag to track if initial load has been done
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    // Initial data load and manager setup - runs ONCE when user is available
    useEffect(() => {
        // Skip if already loaded, no user, or STILL loading permissions
        if (initialLoadDone || !user || loadingPermissions) {
            return;
        }

        console.log('🚀 Initial useEffect triggered (first time only)', { user: user?.uid, hierarchyDepth });

        const loadInitial = async () => {
            setLoadingData(true);

            // Limpiar datos stale para evitar mostrar estadísticas viejas mientras carga
            setMonthlyStats([]);
            setDailyStats([]);
            setTardiness([]);
            setEarlyDepartures([]);
            setOvertimeRequests([]);
            setMissingPunches([]);
            setHourBanks([]);

            // Set manager ID immediately to user's ID
            const managerIdToUse = user.uid;
            setSelectedManagerId(managerIdToUse);

            try {
                // Load available managers if global permission exists
                if (hasPermission(permissions, 'hcm_team_management_global', 'read')) {
                    const allEmployeesRes = await getDirectReports('all');
                    if (allEmployeesRes.success && allEmployeesRes.employees) {
                        setAvailableManagers(allEmployeesRes.employees.map(e => ({ id: e.id, name: e.fullName })));
                    }
                }

                // Load initial employees
                const fnEmployees = hierarchyDepth === undefined || hierarchyDepth > 1 
                    ? (mId: string) => getHierarchicalReports(mId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
                    : getDirectReports;
                const empResult = await fnEmployees(managerIdToUse);
                if (empResult.success && empResult.employees) {
                    setEmployees(empResult.employees);
                    setHasSubordinates(empResult.employees.length > 0);
                } else {
                    setEmployees([]);
                    setHasSubordinates(false);
                }

                await loadImportBatches();

                // Load all tab data in parallel so header counters update correctly
                const [
                    monthlyStatsResult,
                    dailyStatsResult,
                    shiftsResult,
                    tardinessResult,
                    departuresResult,
                    punchesResult,
                    otResult
                ] = await Promise.all([
                    getTeamMonthlyStats(managerIdToUse, ...(dateFilter !== 'all' ? dateFilter.split('-').map(Number) as [number, number] : [new Date().getFullYear(), new Date().getMonth() + 1]), hierarchyDepth),
                    getTeamDailyStats(managerIdToUse, selectedDate, hierarchyDepth),
                    getAvailableShifts(), // Load globally for the Dialog dropdowns
                    getTeamTardiness(managerIdToUse, dateFilter, hierarchyDepth),
                    getTeamEarlyDepartures(managerIdToUse, dateFilter, hierarchyDepth),
                    getTeamMissingPunches(managerIdToUse, dateFilter, hierarchyDepth),
                    hasPermission(permissions, 'hcm_team_overtime', 'read') ? getTeamOvertimeRequests(managerIdToUse, 'all', hierarchyDepth) : Promise.resolve({ success: true, requests: [] })
                ]);

                // Set initial overview data states
                if (monthlyStatsResult.success && monthlyStatsResult.stats) {
                    setMonthlyStats(monthlyStatsResult.stats);
                }
                if (dailyStatsResult.success && dailyStatsResult.stats) {
                    setDailyStats(dailyStatsResult.stats);
                }
                if (shiftsResult.success && shiftsResult.shifts) {
                    setShifts(shiftsResult.shifts);
                }
                if (tardinessResult.success && tardinessResult.records) {
                    setTardiness(tardinessResult.records);
                }
                if (departuresResult.success && departuresResult.records) {
                    setEarlyDepartures(departuresResult.records);
                }
                if (punchesResult.success && punchesResult.records) {
                    setMissingPunches(punchesResult.records);
                }
                if (otResult.success && otResult.requests) {
                    setOvertimeRequests(otResult.requests);
                }

                // If activeTab is not overview, load it
                if (activeTab !== 'overview') {
                    await loadTabData(activeTab, managerIdToUse);
                }

            } catch (error) {
                console.error('Error loading initial data:', error);
            } finally {
                setLoadingData(false);
                setInitialLoadDone(true);
            }
        };

        loadInitial();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLoadDone, user, loadingPermissions]);

    // Handle batch selection
    useEffect(() => {
        if (selectedBatchId === 'all') {
            // If 'all' is selected, skip date filtering
            setDateFilter('all');
            return;
        }

        const batch = importBatches.find(b => b.id === selectedBatchId);
        if (batch && batch.dateRangeStart) {
            // Use the month of the batch's start date for filtering
            const monthStr = batch.dateRangeStart.substring(0, 7); // YYYY-MM
            setDateFilter(monthStr);
        }
    }, [selectedBatchId, importBatches]);

    // Handle batchId from URL - respect URL changes but allow manual overrides
    useEffect(() => {
        const batchId = searchParams.get('batchId');
        const tab = searchParams.get('tab');

        // Only apply if the URL parameters have changed since we last synced them
        if (batchId !== lastUrlSync.current.batchId || tab !== lastUrlSync.current.tab) {
            if (batchId) setSelectedBatchId(batchId);
            if (tab) setActiveTab(tab);

            // Record what we just synced to prevent fighting manual changes
            lastUrlSync.current = { batchId: batchId || '', tab: tab || '' };
        }
    }, [searchParams]);

    // Track the previous manager to detect manager switches
    const prevManagerRef = useRef<string>('');

    // Effect to reload data when tab, date, or manager changes (AFTER initial load)
    useEffect(() => {
        // Only run after initial load is complete
        if (!initialLoadDone || !user?.id || !selectedManagerId) {
            console.log('⏸️ Reload useEffect skipped (waiting for initial load)', { initialLoadDone, userId: user?.id, selectedManagerId });
            return;
        }

        const managerChanged = prevManagerRef.current !== '' && prevManagerRef.current !== selectedManagerId;
        prevManagerRef.current = selectedManagerId;

        console.log('🔁 Reload useEffect triggered', {
            activeTab,
            selectedDate,
            dateFilter,
            selectedManagerId,
            managerChanged
        });

        // When manager changes, reload the employees list + all tab data for counters
        if (managerChanged) {
            const reloadAll = async () => {
                setLoadingData(true);

                // Limpiar datos stale para evitar mostrar estadísticas de otro manager/rol
                setMonthlyStats([]);
                setDailyStats([]);
                setTardiness([]);
                setEarlyDepartures([]);
                setOvertimeRequests([]);
                setMissingPunches([]);
                setHourBanks([]);

                try {
                    // Reload employees for the new manager
                    const fnEmployees = hierarchyDepth === undefined || hierarchyDepth > 1 
                        ? (mId: string) => getHierarchicalReports(mId, hierarchyDepth === undefined ? 10 : hierarchyDepth)
                        : getDirectReports;
                    const empResult = await fnEmployees(selectedManagerId);
                    if (empResult.success && empResult.employees) {
                        setEmployees(empResult.employees);
                        setHasSubordinates(empResult.employees.length > 0);
                    } else {
                        setEmployees([]);
                        setHasSubordinates(false);
                    }

                    // Reload ALL tab data in parallel so header counters update correctly
                    // Parse dateFilter safely (it can be 'all' or unsupported values)
                    const now = new Date();
                    let parsedYear = now.getFullYear();
                    let parsedMonth = now.getMonth() + 1;

                    if (dateFilter !== 'all' && /^\d{4}-\d{2}/.test(dateFilter)) {
                        const parts = dateFilter.split('-').map(Number);
                        parsedYear = parts[0];
                        parsedMonth = parts[1];
                    }

                    const [
                        monthlyStatsResult,
                        dailyStatsResult,
                        tardinessResult,
                        departuresResult,
                        punchesResult,
                        otResult
                    ] = await Promise.all([
                        getTeamMonthlyStats(selectedManagerId, parsedYear, parsedMonth, hierarchyDepth),
                        getTeamDailyStats(selectedManagerId, selectedDate, hierarchyDepth),
                        getTeamTardiness(selectedManagerId, dateFilter, hierarchyDepth),
                        getTeamEarlyDepartures(selectedManagerId, dateFilter, hierarchyDepth),
                        getTeamMissingPunches(selectedManagerId, dateFilter, hierarchyDepth),
                        hasPermission(permissions, 'hcm_team_overtime', 'read') ? getTeamOvertimeRequests(selectedManagerId, 'all', hierarchyDepth) : Promise.resolve({ success: true, requests: [] })
                    ]);

                    if (monthlyStatsResult.success && monthlyStatsResult.stats) {
                        setMonthlyStats(monthlyStatsResult.stats);
                    }
                    if (dailyStatsResult.success && dailyStatsResult.stats) {
                        setDailyStats(dailyStatsResult.stats);
                    }
                    if (tardinessResult.success && tardinessResult.records) {
                        setTardiness(tardinessResult.records);
                    }
                    if (departuresResult.success && departuresResult.records) {
                        setEarlyDepartures(departuresResult.records);
                    }
                    if (punchesResult.success && punchesResult.records) {
                        setMissingPunches(punchesResult.records);
                    }
                    if (otResult.success && otResult.requests) {
                        setOvertimeRequests(otResult.requests);
                    }

                    // If activeTab is not overview, load it
                    if (activeTab !== 'overview') {
                        await loadTabData(activeTab, selectedManagerId);
                    }
                } catch (error) {
                    console.error('Error reloading data for manager switch:', error);
                } finally {
                    setLoadingData(false);
                }
            };
            reloadAll();
        } else {
            // Normal reload: just reload current tab data
            loadTabData(activeTab);
        }
    }, [activeTab, selectedDate, dateFilter, selectedManagerId, initialLoadDone, hierarchyDepth]); // Removed loadingData and loadTabData from deps

    // Recargar estadísticas mensuales cuando se cambia el mes (independiente de dateFilter)
    const prevSelectedMonthRef = useRef(selectedMonth);
    useEffect(() => {
        // Solo recargar si el mes realmente cambió (no en la carga inicial)
        if (prevSelectedMonthRef.current === selectedMonth) return;
        prevSelectedMonthRef.current = selectedMonth;
        if (!initialLoadDone || !user?.id || !selectedManagerId) return;

        const [year, month] = selectedMonth.split('-').map(Number);
        if (!year || !month) return;

        (async () => {
            const result = await getTeamMonthlyStats(selectedManagerId, year, month, hierarchyDepth);
            if (result.success && result.stats) {
                setMonthlyStats(result.stats);
            }
        })();
    }, [selectedMonth, initialLoadDone, selectedManagerId, hierarchyDepth, user?.id]);

    // Handlers
    const handleViewHourBankHistory = async (employee: Employee) => {
        setHourBankDialog({ open: true, employee });
        setHourBankMovements([]);
        const result = await getHourBankMovements(employee.id);
        if (result.success && result.movements) {
            setHourBankMovements(result.movements);
        }
    };

    const handleJustifyTardiness = async () => {
        if (!justifyTardinessDialog.record || !justificationReason.trim() || !user || !justificationType) return;

        setSubmitting(true);
        try {
            const result = await justifyTardiness(
                justifyTardinessDialog.record.id,
                justificationReason,
                user.uid || user.id || '',
                user.fullName || user.displayName || user.email || 'Admin',
                useHourBank,
                justificationType
            );

            if (result.success) {
                setJustifyTardinessDialog({ open: false });
                setJustificationReason('');
                setJustificationType(undefined);
                const wasHourBank = useHourBank;
                setUseHourBank(false);
                loadTabData('tardiness');
                // Refrescar bolsa de horas si se usó
                if (wasHourBank) {
                    loadTabData('hour-bank');
                }
                toast({ title: 'Retardo justificado', description: wasHourBank ? 'El retardo ha sido justificado y registrado en la bolsa de horas.' : 'El retardo ha sido justificado correctamente.' });
            } else {
                toast({ title: 'Error', description: result.error || 'No se pudo justificar el retardo.', variant: 'destructive' });
            }
        } catch (err) {
            console.error('[Team] Error justifying tardiness:', err);
            toast({ title: 'Error', description: 'Error inesperado al justificar retardo.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleJustifyDeparture = async () => {
        if (!justifyDepartureDialog.record || !justificationReason.trim() || !user || !justificationType) return;

        setSubmitting(true);
        try {
            const result = await justifyEarlyDeparture(
                justifyDepartureDialog.record.id,
                justificationReason,
                user.uid || user.id || '',
                user.fullName || user.displayName || user.email || 'Admin',
                useHourBank,
                justificationType
            );

            if (result.success) {
                setJustifyDepartureDialog({ open: false });
                setJustificationReason('');
                setJustificationType(undefined);
                const wasHourBank = useHourBank;
                setUseHourBank(false);
                loadTabData('early-departures');
                // Refrescar bolsa de horas si se usó
                if (wasHourBank) {
                    loadTabData('hour-bank');
                }
                toast({ title: 'Salida temprana justificada', description: wasHourBank ? 'La salida ha sido justificada y registrada en la bolsa de horas.' : 'La salida temprana ha sido justificada correctamente.' });
            } else {
                toast({ title: 'Error', description: result.error || 'No se pudo justificar la salida temprana.', variant: 'destructive' });
            }
        } catch (err) {
            console.error('[Team] Error justifying early departure:', err);
            toast({ title: 'Error', description: 'Error inesperado al justificar salida temprana.', variant: 'destructive' });
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkTardinessUnjustified = async (record: TardinessRecord) => {
        if (!user) return;
        setSubmitting(true);
        try {
            const result = await markTardinessUnjustified(
                record.id,
                user.id || '',
                user.fullName || 'Admin'
            );

            if (result.success) {
                loadTabData('tardiness');
                toast({
                    title: "Marcado como injustificado",
                    description: "El retardo ha sido marcado como injustificado.",
                    variant: "default"
                });
            } else {
                toast({
                    title: "Error",
                    description: "No se pudo marcar como injustificado.",
                    variant: "destructive"
                });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkDepartureUnjustified = async (record: EarlyDeparture) => {
        if (!user) return;
        setSubmitting(true);
        try {
            const result = await markEarlyDepartureUnjustified(
                record.id,
                user.id || '',
                user.fullName || 'Admin'
            );

            if (result.success) {
                loadTabData('early-departures');
                toast({
                    title: "Marcado como injustificado",
                    description: "La salida temprana ha sido marcada como injustificada.",
                    variant: "default"
                });
            } else {
                toast({
                    title: "Error",
                    description: "No se pudo marcar como injustificada.",
                    variant: "destructive"
                });
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveOvertime = async (partial: boolean) => {
        if (!overtimeDialog.request || !user?.id) return;

        setSubmitting(true);
        try {
            const requestedHours = overtimeDialog.request.hoursRequested;
            let approvedHours = partial ? parseFloat(hoursToApprove) : requestedHours;

            // --- DEBT DEDUCTION LOGIC ---
            // 1. Get current debt
            const hb = hourBanks.find(h => h.employeeId === overtimeDialog.request?.employeeId);
            const currentDebt = hb?.balanceMinutes && hb.balanceMinutes > 0 ? hb.balanceMinutes : 0;
            const approvedMinutes = approvedHours * 60;

            // 2. Calculate amortization
            const amortizedMinutes = Math.min(currentDebt, approvedMinutes);
            const paidMinutes = Math.max(0, approvedMinutes - amortizedMinutes);
            const paidHours = paidMinutes / 60;

            // 3. Register movement if paying debt
            if (amortizedMinutes > 0) {
                const moveResult = await manualHourBankAdjustment({
                    employeeId: overtimeDialog.request.employeeId,
                    date: new Date().toISOString(),
                    minutes: -amortizedMinutes, // Negative to reduce positive debt (Debe 60 -> -10 -> Debe 50)
                    reason: `Compensación automática por Horas Extras (${formatMinutesToReadable(amortizedMinutes)})`,
                    createdById: user.id,
                    createdByName: user.displayName || 'Manager'
                });

                if (!moveResult.success) {
                    console.error('Error registering debt payment:', moveResult.error);
                    // Continue anyway? Optional: throw error
                }
            }

            // 4. Approve only the PAID hours (net)
            // If all went to debt (paidHours === 0), it's still "approved" but with 0 paid hours
            const result = await approveOvertimeRequest(
                overtimeDialog.request.id,
                user.id,
                user.displayName || 'Manager',
                paidHours // Use NET hours
            );

            if (result.success) {
                setOvertimeDialog({ open: false });
                loadTabData('overtime');
                // Refresh hour banks too to show updated debt
                loadTabData('hour-bank');
            }
        } catch (error) {
            console.error('Error approving overtime:', error);
        } finally {
            setSubmitting(false);
        }
    };

    // Helper needed inside the scope
    const formatMins = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = Math.round(mins % 60);
        return `${h}h ${m}m`;
    };

    const handleRejectOvertime = async () => {
        if (!overtimeDialog.request || !rejectionReason.trim() || !user) return;

        setSubmitting(true);
        try {
            const result = await rejectOvertimeRequest(
                overtimeDialog.request.id,
                user.id || '',
                user.fullName || user.email || '',
                rejectionReason
            );

            if (result.success) {
                setOvertimeDialog({ open: false });
                setRejectionReason('');
                loadTabData('overtime');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignShift = async () => {
        if (!shiftDialog.employee || !shiftForm.shiftId || !user) return;

        setSubmitting(true);
        try {
            const selectedShift = shifts.find(s => s.id === shiftForm.shiftId);
            const result = await assignShift(
                shiftDialog.employee.id,
                shiftDialog.employee.fullName,
                shiftForm.shiftId,
                selectedShift?.name || '',
                shiftForm.type,
                shiftForm.startDate,
                shiftForm.reason,
                user.id || '',
                user.fullName || user.email || '',
                shiftForm.type === 'temporary' ? shiftForm.endDate : undefined
            );

            if (result.success) {
                setShiftDialog({ open: false });
                setShiftForm({ shiftId: '', type: 'temporary', startDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
                loadTabData('shifts');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleCancelShiftAssignment = async () => {
        if (!cancelShiftDialog.assignment || !user) return;

        setSubmitting(true);
        try {
            const result = await cancelShiftAssignment(
                cancelShiftDialog.assignment.id,
                user.id || '',
                user.fullName || user.email || ''
            );

            if (result.success) {
                setCancelShiftDialog({ open: false });
                loadTabData('shifts');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleViewShiftHistory = async (employee: Employee) => {
        setShiftHistoryDialog({ open: true, employee });
        setShiftHistory([]);
        const result = await getEmployeeShiftHistory(employee.id);
        if (result.success && result.history) {
            setShiftHistory(result.history);
        }
    };

    const getCurrentShift = (employee: Employee) => {
        // 1. Check for active temporary assignments covering today
        const today = new Date().toISOString().split('T')[0];
        // Sort by start date desc to get latest
        const activeAssignment = shiftAssignments
            .filter(a =>
                a.employeeId === employee.id &&
                a.status === 'active' &&
                a.startDate <= today &&
                (!a.endDate || a.endDate >= today)
            )
            .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];

        if (activeAssignment) {
            return {
        permissions,
                name: activeAssignment.newShiftName,
                isTemp: activeAssignment.assignmentType === 'temporary', // It could be permanent too if permanent assignment is stored as 'active'
                isOverride: true
            };
        }

        // 2. Fallback to employee's permanent shift (customShiftId)
        if (employee.customShiftId) {
            const customShift = shifts.find(s => s.id === employee.customShiftId);
            if (customShift) return { name: customShift.name, isTemp: false, isOverride: false };
        }

        // 3. Fallback to legacy shiftType
        const legacyName = employee.shiftType === 'diurnal' ? 'Diurno' :
            employee.shiftType === 'nocturnal' ? 'Nocturno' : 'Mixto';
        return { name: legacyName, isTemp: false, isOverride: false };
    };






    // Missing Punches Handlers
    const handleJustifyMissingPunch = async () => {
        if (!justifyMissingPunchDialog.punch || !user) return;

        const punch = justifyMissingPunchDialog.punch;
        const employee = employees.find(e => e.id === punch.employeeId);

        if (!employee) {
            toast({
                title: "Error",
                description: "No se encontró el empleado",
                variant: "destructive"
            });
            return;
        }

        // Validar que se haya proporcionado al menos una hora
        if (!providedEntryTime && !providedExitTime) {
            toast({
                title: "Error",
                description: "Debes proporcionar al menos una hora (entrada o salida)",
                variant: "destructive"
            });
            return;
        }

        setSubmitting(true);
        try {
            // Obtener horarios del shift del empleado
            // 1. Buscar asignación activa en shiftAssignments
            // 2. Fallback: turno base del empleado (customShiftId o shiftId)
            // 3. Fallback: leer del registro de asistencia (attendance record)
            // 4. Fallback: horario por defecto 09:00-18:00
            let scheduledStart = '09:00';
            let scheduledEnd = '18:00';
            let shiftResolved = false;

            const employeeAssignment = shiftAssignments.find(sa =>
                sa.employeeId === punch.employeeId &&
                sa.status === 'active'
            );

            if (employeeAssignment) {
                const shift = shifts.find(s => s.id === employeeAssignment.newShiftId);
                if (shift) {
                    scheduledStart = shift.startTime;
                    scheduledEnd = shift.endTime;
                    shiftResolved = true;
                }
            }

            if (!shiftResolved) {
                // Fallback: turno base del empleado (customShiftId o shiftId)
                const baseShiftId = (employee as any).customShiftId || (employee as any).shiftId;
                if (baseShiftId) {
                    const baseShift = shifts.find(s => s.id === baseShiftId);
                    if (baseShift) {
                        scheduledStart = baseShift.startTime;
                        scheduledEnd = baseShift.endTime;
                        shiftResolved = true;
                    }
                }
            }

            if (!shiftResolved && punch.attendanceRecordId && firestore) {
                // Fallback: leer horario del registro de asistencia importado
                try {
                    const { doc, getDoc } = await import('firebase/firestore');
                    const attRef = doc(firestore, 'attendance', punch.attendanceRecordId);
                    const attSnap = await getDoc(attRef);
                    if (attSnap.exists()) {
                        const attData = attSnap.data();
                        if (attData.scheduledStart) scheduledStart = attData.scheduledStart;
                        if (attData.scheduledEnd) scheduledEnd = attData.scheduledEnd;
                        shiftResolved = true;
                        console.log(`[HCM] Shift resolved from attendance record: ${scheduledStart}-${scheduledEnd}`);
                    }
                } catch (attErr) {
                    console.warn('[HCM] Could not read attendance record for shift:', attErr);
                }
            }

            if (!shiftResolved) {
                console.warn(`[HCM] No se encontró turno para ${employee.fullName}, usando horario por defecto: ${scheduledStart}-${scheduledEnd}`);
            }

            console.log(`[HCM] justifyMissingPunch handler: employee=${employee.fullName}, scheduledStart=${scheduledStart}, scheduledEnd=${scheduledEnd}, providedEntry=${providedEntryTime}, providedExit=${providedExitTime}`);

            const result = await justifyMissingPunch(
                punch.id,
                justificationReason || 'Justificado por manager',
                providedEntryTime || undefined,
                providedExitTime || undefined,
                scheduledStart,
                scheduledEnd,
                user.id || '',
                user.fullName || user.email || '',
                10 // toleranceMinutes - TODO: obtener de location
            );

            if (result.success) {
                toast({
                    title: "Marcaje justificado",
                    description: result.generatedTardinessId || result.generatedEarlyDepartureId
                        ? "Se generó un registro de retardo/salida temprana automáticamente"
                        : "El marcaje fue justificado exitosamente",
                });

                setJustifyMissingPunchDialog({ open: false });
                setJustificationReason('');
                setProvidedEntryTime('');
                setProvidedExitTime('');

                // ⚠️ REGLA CRÍTICA (team-management-module):
                // justifyMissingPunch puede generar registros en tardiness_records
                // y/o early_departures además de actualizar missing_punches.
                // Siempre recargar los tres tabs para que los nuevos registros
                // aparezcan en sus pestañas correspondientes.
                // NO reducir estas llamadas a solo 'missing-punches'.
                loadTabData('missing-punches');
                if (result.generatedTardinessId) loadTabData('tardiness');
                if (result.generatedEarlyDepartureId) loadTabData('early-departures');
            } else {
                throw new Error(result.error || 'Error al justificar marcaje');
            }
        } catch (error) {
            console.error('Error justifying missing punch:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo justificar el marcaje",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleMarkMissingPunchAsFault = async (punch: any) => {
        if (!user || !firestore) return;

        const confirmed = window.confirm(
            '¿Estás seguro de marcar este marcaje faltante como FALTA?\n\n' +
            'Esta acción generará una falta injustificada para el empleado.'
        );

        if (!confirmed) return;

        setSubmitting(true);
        try {
            await runTransaction(firestore, async (transaction) => {
                const punchRef = doc(firestore, 'missing_punches', punch.id);
                // MUST READ BEFORE WRITE in Firestore transactions
                const punchDoc = await transaction.get(punchRef);
                
                if (!punchDoc.exists()) {
                    throw new Error("El marcaje faltante ya no existe o fue eliminado.");
                }

                // Si existe attendanceRecordId, lo actualizamos en la misma transacción
                if (punch.attendanceRecordId && punch.attendanceRecordId !== '__pending__') {
                    const attendanceRef = doc(firestore, 'attendance', punch.attendanceRecordId);
                    const attendanceDoc = await transaction.get(attendanceRef);
                    
                    if (attendanceDoc.exists()) {
                        transaction.update(attendanceRef, {
                            status: 'absence_unjustified',
                            nomipaqCode: '1FINJ',
                            updatedAt: serverTimestamp(),
                            // Agregar el evento al array podría requerir manipulación adicional, 
                            // por ahora solo actualizamos el status principal.
                        });
                    }
                }

                transaction.update(punchRef, {
                    status: 'absence_unjustified',
                    resultedInAbsence: true,
                    processed: true,
                    processedAt: serverTimestamp(),
                    processedBy: user.uid || user.id || 'system',
                    updatedAt: serverTimestamp(),
                });
            });

            toast({
                title: "Marcaje marcado como falta",
                description: "El marcaje faltante se marcó como falta injustificada",
            });

            // Recargar datos
            loadTabData('missing-punches');

        } catch (error) {
            console.error('Error marking missing punch as fault:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo marcar como falta",
                variant: "destructive"
            });
        } finally {
            setSubmitting(false);
        }
    };


    // Computed values
    const pendingTardiness = tardiness.filter(t => !t.isJustified && t.justificationStatus !== 'unjustified');
    const pendingDepartures = earlyDepartures.filter(d => !d.isJustified && d.justificationStatus !== 'unjustified');
    const pendingOvertime = overtimeRequests.filter(o => o.status === 'pending');
    const pendingMissingPunches = missingPunches.filter(p => !p.isJustified && !p.resultedInAbsence);

    // Filter employees by shift in the list
    const filteredEmployees = employees.filter(emp =>
        (selectedShiftFilter === 'all' || emp.shiftType === selectedShiftFilter) &&
        (selectedEmployeeFilter === 'all' || emp.id === selectedEmployeeFilter)
    ).filter(emp =>
        !searchTerm || emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // We can build a quick map from the 'employees' list
    const employeeShiftMap = useMemo(() => {
        const map = new Map<string, ShiftType>();
        employees.forEach(e => map.set(e.id, e.shiftType || 'diurnal'));
        return map;
    }, [employees]);

    const filterByShift = (employeeId: string) => {
        if (selectedShiftFilter === 'all') return true;
        return employeeShiftMap.get(employeeId) === selectedShiftFilter;
    };

    // Calculate active date range from batch
    const activeBatchRange = useMemo(() => {
        if (selectedBatchId === 'all') return null;
        const batch = importBatches.find(b => b.id === selectedBatchId);
        if (batch && batch.dateRangeStart && batch.dateRangeEnd) {
            return { start: batch.dateRangeStart, end: batch.dateRangeEnd };
        }
        return null;
    }, [selectedBatchId, importBatches]);


    const filteredTardiness = tardiness.filter(record => {
        const matchesSearch = !searchTerm ||
            ((record as any).employeeName || employees.find(e => e.id === record.employeeId)?.fullName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'pending'
                ? (!record.isJustified && record.justificationStatus !== 'unjustified')
                : (record.isJustified || record.justificationStatus === 'unjustified'));
        const matchesEmployee = selectedEmployeeFilter === 'all' || record.employeeId === selectedEmployeeFilter;
        // Los pendientes siempre son visibles. Solo los procesados se filtran por rango de fecha.
        const isPending = !record.isJustified && record.justificationStatus !== 'unjustified';
        const matchesDate = isPending || !activeBatchRange || (record.date >= activeBatchRange.start && record.date <= activeBatchRange.end);

        return matchesSearch && matchesStatus && filterByShift(record.employeeId) && matchesEmployee && matchesDate;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const filteredDepartures = earlyDepartures.filter(record => {
        const matchesSearch = !searchTerm ||
            (record.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'pending'
                ? (!record.isJustified && record.justificationStatus !== 'unjustified')
                : (record.isJustified || record.justificationStatus === 'unjustified'));
        const matchesEmployee = selectedEmployeeFilter === 'all' || record.employeeId === selectedEmployeeFilter;
        // Los pendientes siempre son visibles. Solo los procesados se filtran por rango de fecha.
        const isPending = !record.isJustified && record.justificationStatus !== 'unjustified';
        const matchesDate = isPending || !activeBatchRange || (record.date >= activeBatchRange.start && record.date <= activeBatchRange.end);

        return matchesSearch && matchesStatus && filterByShift(record.employeeId) && matchesEmployee && matchesDate;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const filteredOvertime = overtimeRequests.filter(r => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || r.employeeId === selectedEmployeeFilter;
        // Las solicitudes pendientes SIEMPRE son visibles sin importar el rango de fecha
        // El backend ya inyectó los pendientes vía dual-query; aquí solo garantizamos que
        // el filtro de fecha en el cliente tampoco los excluya.
        const isPending = r.status === 'pending';
        const matchesDate = isPending || !activeBatchRange || (r.date >= activeBatchRange.start && r.date <= activeBatchRange.end);
        return filterByShift(r.employeeId) && matchesEmployee && matchesDate;
    }).sort((a, b) => a.date.localeCompare(b.date));

    const calculatedOvertimeStats = useMemo(() => {
        let pending = 0;
        let approved = 0;
        let rejected = 0;
        let partial = 0;
        let totalHoursApproved = 0;
        let totalHoursPending = 0;

        filteredOvertime.forEach(req => {
            switch (req.status) {
                case 'pending':
                    pending++;
                    totalHoursPending += req.hoursRequested || 0;
                    break;
                case 'approved':
                    approved++;
                    totalHoursApproved += req.hoursApproved ?? req.hoursRequested ?? 0;
                    break;
                case 'rejected':
                    rejected++;
                    break;
                case 'partial':
                    partial++;
                    totalHoursApproved += req.hoursApproved ?? 0;
                    break;
            }
        });

        return { pending, approved, rejected, partial, totalHoursApproved, totalHoursPending };
    }, [filteredOvertime]);

    const filteredAssignments = shiftAssignments.filter(r => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || r.employeeId === selectedEmployeeFilter;
        // Date Filter for assignments (overlap check)
        const assignmentEnd = r.endDate || '9999-12-31';
        const matchesDate = !activeBatchRange || (r.startDate <= activeBatchRange.end && assignmentEnd >= activeBatchRange.start);

        return filterByShift(r.employeeId) && matchesEmployee && matchesDate;
    });

    const filteredMissingPunches = missingPunches.filter(p => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || p.employeeId === selectedEmployeeFilter;
        // Los marcajes sin procesar siempre son visibles. Solo los procesados se filtran por rango.
        const isPending = !p.isJustified && !p.resultedInAbsence && !p.processed;
        const matchesDate = isPending || !activeBatchRange || (p.date >= activeBatchRange.start && p.date <= activeBatchRange.end);
        return matchesEmployee && matchesDate;
    }).sort((a, b) => a.date.localeCompare(b.date));


    const filteredMonthlyStats = monthlyStats.filter(stat => {
        const matchesSearch = !searchTerm || stat.employeeName.toLowerCase().includes(searchTerm.toLowerCase());
        const matchesEmployee = selectedEmployeeFilter === 'all' || stat.employeeId === selectedEmployeeFilter;
        return matchesSearch && filterByShift(stat.employeeId) && matchesEmployee;
    });

    // Helper to change date
    const changeDate = (days: number) => {
        const date = new Date(selectedDate);
        date.setDate(date.getDate() + days);
        setSelectedDate(date.toISOString().split('T')[0]);
    };

    return {
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
        pendingDepartures, pendingMissingPunches, pendingOvertime, pendingTardiness, permissions, positionsQuery,
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
    };
}
