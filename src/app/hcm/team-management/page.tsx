'use client';

import { useState, useMemo, useEffect, useCallback, Suspense, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { getFirestore, doc, getDoc, setDoc, updateDoc, Timestamp, collection, query, where, getDocs, orderBy, limit as firestoreLimit, limit } from 'firebase/firestore';
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
    SelectItem,
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
    History
} from 'lucide-react';

import {
    getDirectReports,
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

import type {
    Employee,
    TardinessRecord,
    EarlyDeparture,
    OvertimeRequest,
    EmployeeMonthlyStats,
    TeamDailyStats,
    CustomShift,
    HourBank,
    HourBankMovement,
    JustificationType,
    ShiftAssignment,
    ShiftType,
    AttendanceImportBatch,
    Position
} from '@/lib/types';
import { JUSTIFICATION_TYPE_LABELS } from '@/lib/types';

export default function TeamManagementPage() {
    return (
        <Suspense fallback={<Loader2 className="h-8 w-8 animate-spin" />}>
            <TeamManagementContent />
        </Suspense>
    );
}

// Helper: Formato homologado DD/MM/AAAA
const formatDateDDMMYYYY = (dateStr: string): string => {
    if (!dateStr) return '';
    // Soporta YYYY-MM-DD y ISO timestamps
    const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`);
    if (isNaN(d.getTime())) return dateStr;
    const dd = d.getDate().toString().padStart(2, '0');
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
};

function TeamManagementContent() {
    const searchParams = useSearchParams();
    const lastUrlSync = useRef<{ batchId: string | null; tab: string | null }>({ batchId: null, tab: null });
    const { user, isUserLoading, firestore } = useFirebase();
    const { permissions, isLoading: loadingPermissions } = usePermissions();
    const { toast } = useToast();
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
    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'justified'>('all');
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
    const [periodClosed, setPeriodClosed] = useState(false);
    const [isPeriodClosed, setIsPeriodClosed] = useState(false);
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

                if (lockResult.isLocked) {
                    setIsPeriodClosed(true);
                    console.log('🔒 Period is locked:', periodStart, '-', periodEnd);
                } else {
                    setIsPeriodClosed(false);
                    console.log('✅ Period is open:', periodStart, '-', periodEnd);
                }
            } catch (error) {
                console.error('Error checking period lock:', error);
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
                    const statsResult = await getTeamMonthlyStats(managerToUse, year, month);
                    if (statsResult.success && statsResult.stats) {
                        setMonthlyStats(statsResult.stats);
                    }
                    const dailyResult = await getTeamDailyStats(managerToUse, selectedDate);
                    if (dailyResult.success && dailyResult.stats) {
                        setDailyStats(dailyResult.stats);
                    }
                    break;

                case 'tardiness':
                    const tardinessResult = await getTeamTardiness(managerToUse, dateFilter);
                    if (tardinessResult.success && tardinessResult.records) {
                        setTardiness(tardinessResult.records);
                    }
                    break;

                case 'early-departures':
                    const departuresResult = await getTeamEarlyDepartures(managerToUse, dateFilter);
                    if (departuresResult.success && departuresResult.records) {
                        setEarlyDepartures(departuresResult.records);
                    }
                    break;

                case 'overtime':
                    const otResult = await getTeamOvertimeRequests(managerToUse, 'all'); // 'all' to get all for stats
                    if (otResult.success) {
                        setOvertimeRequests(otResult.requests || []);
                        if (otResult.stats) setOvertimeStats(otResult.stats);
                    }
                    // Also fetch hour banks for debt display (may fail if no permission)
                    try {
                        const empsResult = await getDirectReports(managerToUse);
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
                    const assignmentsResult = await getTeamShiftAssignments(managerToUse);
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
                        const empResult = await getDirectReports(managerToUse);
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
                    const punchesResult = await getTeamMissingPunches(managerToUse, dateFilter);
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
    }, [user?.id, selectedManagerId, dateFilter, selectedDate]);

    // Flag to track if initial load has been done
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    // Initial data load and manager setup - runs ONCE when user is available
    useEffect(() => {
        // Skip if already loaded or no user
        if (initialLoadDone || !user) {
            return;
        }

        console.log('🚀 Initial useEffect triggered (first time only)', { user: user?.uid });

        const loadInitial = async () => {
            setLoadingData(true);

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
                const empResult = await getDirectReports(managerIdToUse);
                if (empResult.success && empResult.employees) {
                    setEmployees(empResult.employees);
                    setHasSubordinates(empResult.employees.length > 0);
                } else {
                    setEmployees([]);
                    setHasSubordinates(false);
                }

                await loadImportBatches();

                // Load ALL data needed for header counters in parallel
                // This ensures the header badges show correct values immediately
                const [
                    tardinessResult,
                    departuresResult,
                    overtimeResult,
                    monthlyStatsResult,
                    dailyStatsResult,
                    missingPunchesResult
                ] = await Promise.all([
                    getTeamTardiness(managerIdToUse, dateFilter),
                    getTeamEarlyDepartures(managerIdToUse, dateFilter),
                    getTeamOvertimeRequests(managerIdToUse, 'all'),
                    getTeamMonthlyStats(managerIdToUse, ...dateFilter.split('-').map(Number) as [number, number]),
                    getTeamDailyStats(managerIdToUse, selectedDate),
                    getTeamMissingPunches(managerIdToUse, dateFilter)
                ]);

                // Set all data states
                if (tardinessResult.success && tardinessResult.records) {
                    setTardiness(tardinessResult.records);
                }
                if (departuresResult.success && departuresResult.records) {
                    setEarlyDepartures(departuresResult.records);
                }
                if (missingPunchesResult.success && missingPunchesResult.records) {
                    setMissingPunches(missingPunchesResult.records);
                }
                if (overtimeResult.success) {
                    setOvertimeRequests(overtimeResult.requests || []);
                    if (overtimeResult.stats) setOvertimeStats(overtimeResult.stats);
                }
                if (monthlyStatsResult.success && monthlyStatsResult.stats) {
                    setMonthlyStats(monthlyStatsResult.stats);
                }
                if (dailyStatsResult.success && dailyStatsResult.stats) {
                    setDailyStats(dailyStatsResult.stats);
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
    }, [user, permissions]); // Only depend on user and permissions, NOT selectedManagerId

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
            lastUrlSync.current = { batchId, tab };
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
                try {
                    // Reload employees for the new manager
                    const empResult = await getDirectReports(selectedManagerId);
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
                        tardinessResult,
                        departuresResult,
                        overtimeResult,
                        monthlyStatsResult,
                        dailyStatsResult,
                        missingPunchesResult
                    ] = await Promise.all([
                        getTeamTardiness(selectedManagerId, dateFilter),
                        getTeamEarlyDepartures(selectedManagerId, dateFilter),
                        getTeamOvertimeRequests(selectedManagerId, 'all'),
                        getTeamMonthlyStats(selectedManagerId, parsedYear, parsedMonth),
                        getTeamDailyStats(selectedManagerId, selectedDate),
                        getTeamMissingPunches(selectedManagerId, dateFilter)
                    ]);

                    if (tardinessResult.success && tardinessResult.records) {
                        setTardiness(tardinessResult.records);
                    }
                    if (departuresResult.success && departuresResult.records) {
                        setEarlyDepartures(departuresResult.records);
                    }
                    if (overtimeResult.success) {
                        setOvertimeRequests(overtimeResult.requests || []);
                        if (overtimeResult.stats) setOvertimeStats(overtimeResult.stats);
                    }
                    if (monthlyStatsResult.success && monthlyStatsResult.stats) {
                        setMonthlyStats(monthlyStatsResult.stats);
                    }
                    if (dailyStatsResult.success && dailyStatsResult.stats) {
                        setDailyStats(dailyStatsResult.stats);
                    }
                    if (missingPunchesResult.success && missingPunchesResult.records) {
                        setMissingPunches(missingPunchesResult.records);
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
    }, [activeTab, selectedDate, dateFilter, selectedManagerId, initialLoadDone]); // Removed loadingData and loadTabData from deps

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





    // Notificación de revisión completada (sin cerrar período - eso lo hace CH desde Consolidación)
    const handleMarkReviewComplete = async () => {
        if (!user || !firestore) return;

        try {
            const periodStart = format(startOfMonth(new Date(`${selectedMonth}-01`)), 'yyyy-MM-dd');
            const periodEnd = format(endOfMonth(new Date(`${selectedMonth}-01`)), 'yyyy-MM-dd');

            await setDoc(doc(firestore, 'manager_review_status', `${user.uid}_${selectedMonth}`), {
                managerId: user.uid,
                managerName: user.fullName || user.email,
                period: selectedMonth,
                periodStart,
                periodEnd,
                reviewCompletedAt: new Date().toISOString(),
                pendingAtCompletion: {
                    tardiness: pendingTardiness.length,
                    departures: pendingDepartures.length,
                    overtime: pendingOvertime.length,
                    missingPunches: pendingMissingPunches.length
                }
            });

            setPeriodClosed(true);

            toast({
                title: "Revisión marcada como completa",
                description: "Capital Humano ha sido notificado de que terminaste tu revisión de infracciones.",
                variant: "default",
            });

        } catch (error) {
            console.error('Error marking review complete:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "No se pudo completar la acción.",
                variant: "destructive"
            });
        }
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
            // 2. Fallback: turno base del empleado (customShiftId)
            // 3. Fallback: horario por defecto 09:00-18:00
            let scheduledStart = '09:00';
            let scheduledEnd = '18:00';

            const employeeAssignment = shiftAssignments.find(sa =>
                sa.employeeId === punch.employeeId &&
                sa.status === 'active'
            );

            if (employeeAssignment) {
                const shift = shifts.find(s => s.id === employeeAssignment.newShiftId);
                if (shift) {
                    scheduledStart = shift.startTime;
                    scheduledEnd = shift.endTime;
                }
            } else {
                // Fallback: turno base del empleado
                const baseShiftId = (employee as any).customShiftId;
                if (baseShiftId) {
                    const baseShift = shifts.find(s => s.id === baseShiftId);
                    if (baseShift) {
                        scheduledStart = baseShift.startTime;
                        scheduledEnd = baseShift.endTime;
                    }
                }
                console.warn(`[HCM] No se encontró asignación de turno activa para ${employee.fullName}, usando horario: ${scheduledStart}-${scheduledEnd}`);
            }

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

                // Recargar datos
                loadTabData('missing-punches');
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
            const punchRef = doc(firestore, 'missing_punches', punch.id);

            await updateDoc(punchRef, {
                resultedInAbsence: true,
                processedAt: new Date().toISOString(),
                processedBy: user.id,
                updatedAt: new Date().toISOString(),
            });

            // Si existe attendanceRecordId, marcar como falta
            if (punch.attendanceRecordId) {
                const attendanceRef = doc(firestore, 'attendance', punch.attendanceRecordId);
                await updateDoc(attendanceRef, {
                    status: 'absence_unjustified',
                    nomipaqCode: '1FINJ',
                    updatedAt: new Date().toISOString(),
                });
            }

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
        // Date Filter
        const matchesDate = !activeBatchRange || (record.date >= activeBatchRange.start && record.date <= activeBatchRange.end);

        return matchesSearch && matchesStatus && filterByShift(record.employeeId) && matchesEmployee && matchesDate;
    });

    const filteredDepartures = earlyDepartures.filter(record => {
        const matchesSearch = !searchTerm ||
            (record.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'pending'
                ? (!record.isJustified && record.justificationStatus !== 'unjustified')
                : (record.isJustified || record.justificationStatus === 'unjustified'));
        const matchesEmployee = selectedEmployeeFilter === 'all' || record.employeeId === selectedEmployeeFilter;
        // Date Filter
        const matchesDate = !activeBatchRange || (record.date >= activeBatchRange.start && record.date <= activeBatchRange.end);

        return matchesSearch && matchesStatus && filterByShift(record.employeeId) && matchesEmployee && matchesDate;
    });

    const filteredOvertime = overtimeRequests.filter(r => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || r.employeeId === selectedEmployeeFilter;
        // Date Filter (assuming r.date exists on OvertimeRequest)
        const matchesDate = !activeBatchRange || (r.date >= activeBatchRange.start && r.date <= activeBatchRange.end);
        return filterByShift(r.employeeId) && matchesEmployee && matchesDate;
    });

    const filteredAssignments = shiftAssignments.filter(r => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || r.employeeId === selectedEmployeeFilter;
        // Date Filter for assignments (overlap check)
        const assignmentEnd = r.endDate || '9999-12-31';
        const matchesDate = !activeBatchRange || (r.startDate <= activeBatchRange.end && assignmentEnd >= activeBatchRange.start);

        return filterByShift(r.employeeId) && matchesEmployee && matchesDate;
    });

    const filteredMissingPunches = missingPunches.filter(p => {
        const matchesEmployee = selectedEmployeeFilter === 'all' || p.employeeId === selectedEmployeeFilter;
        // Date Filter
        const matchesDate = !activeBatchRange || (p.date >= activeBatchRange.start && p.date <= activeBatchRange.end);
        return matchesEmployee && matchesDate;
    });


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
                    <Button variant="outline" onClick={handleMigration} disabled={refreshing}>
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
                    <div>
                        <h1 className="text-3xl font-bold">Gestión de Equipo</h1>
                        <p className="text-muted-foreground">
                            Administra retardos, horas extras y turnos de tu equipo
                        </p>
                    </div>
                    <div className="flex items-center gap-4">
                        {/* Manager Selector for Global Access */}
                        {hasPermission(permissions, 'hcm_team_management_global', 'read') && (
                            <div className="w-[250px]">
                                <Select value={selectedManagerId} onValueChange={(val) => { setSelectedManagerId(val); }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar vista..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">-- Ver Todos (Global) --</SelectItem>
                                        <SelectItem value={user?.uid || 'self'}>Mi Equipo (Yo)</SelectItem>
                                        {availableManagers.filter(m => m.id !== user?.uid).map(mgr => (
                                            <SelectItem key={mgr.id} value={mgr.id}>{mgr.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Badge variant="outline" className="text-base py-1 px-3">
                            <Users2 className="h-4 w-4 mr-2" />
                            {employees.length} empleados
                        </Badge>

                        <Button variant="outline" onClick={() => loadTabData(activeTab)} disabled={refreshing}>
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
                                    <span className="text-2xl font-bold">{overtimeStats.pending}</span>
                                    <span className="text-sm text-muted-foreground ml-2">({overtimeStats.totalHoursPending}h)</span>
                                </div>
                                <Timer className={`h-5 w-5 ${overtimeStats.pending > 0 ? 'text-blue-500' : 'text-muted-foreground'}`} />
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
                                    <span className="text-2xl font-bold text-green-600">{overtimeStats.totalHoursApproved}</span>
                                    <span className="text-sm text-muted-foreground ml-1">horas</span>
                                </div>
                                <Check className="h-5 w-5 text-green-500" />
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Main Content Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                    <TabsList>
                        <TabsTrigger value="overview">Vista General</TabsTrigger>
                        <TabsTrigger value="tardiness">
                            Retardos
                            {pendingTardiness.length > 0 && (
                                <Badge variant="destructive" className="ml-2">{pendingTardiness.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="early-departures">
                            Salidas Tempranas
                            {pendingDepartures.length > 0 && (
                                <Badge variant="secondary" className="ml-2">{pendingDepartures.length}</Badge>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="missing-punches">
                            Sin Registro
                            {missingPunches.filter(p => !p.isJustified && !p.resultedInAbsence).length > 0 && (
                                <Badge variant="destructive" className="ml-2">{missingPunches.filter(p => !p.isJustified && !p.resultedInAbsence).length}</Badge>
                            )}
                        </TabsTrigger>
                        {hasPermission(permissions, 'hcm_team_overtime', 'read') && (
                            <TabsTrigger value="overtime">
                                Horas Extras
                                {pendingOvertime.length > 0 && (
                                    <Badge className="ml-2">{pendingOvertime.length}</Badge>
                                )}
                            </TabsTrigger>
                        )}
                        {hasPermission(permissions, 'hcm_team_shifts', 'read') && (
                            <TabsTrigger value="shifts">Turnos y Horarios</TabsTrigger>
                        )}
                        {hasPermission(permissions, 'hcm_team_hour_bank', 'read') && (
                            <TabsTrigger value="hour-bank">Bolsa de Horas</TabsTrigger>
                        )}
                    </TabsList>

                    {/* Filters for all tabs except daily overview */}
                    {activeTab !== 'overview' && (
                        <div className="flex flex-col md:flex-row gap-4 items-end md:items-center">
                            <div className="flex-1">
                                <Label>Periodo / Mes</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="month"
                                        value={dateFilter.length === 7 ? dateFilter : dateFilter.substring(0, 7)}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                        className="w-full md:w-[200px]"
                                    />
                                    {isPeriodClosed && (
                                        <Badge className="bg-red-100 text-red-800 border-red-300 whitespace-nowrap">
                                            <Lock className="w-3 h-3 mr-1" />
                                            Período Cerrado
                                        </Badge>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1">
                                <Label>Cargar Periodo (Batch)</Label>
                                <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                                    <SelectTrigger className="w-full md:w-[250px]">
                                        <SelectValue placeholder="Seleccionar carga..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        {importBatches.map(batch => (
                                            <SelectItem key={batch.id} value={batch.id}>
                                                {formatDateDDMMYYYY(batch.uploadedAt)} - {batch.filename}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex-1">
                                <Label>Turno</Label>
                                <Select value={selectedShiftFilter} onValueChange={(val) => setSelectedShiftFilter(val as ShiftType | 'all')}>
                                    <SelectTrigger className="w-full md:w-[200px]">
                                        <SelectValue placeholder="Todos los turnos" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="diurnal">Diurno</SelectItem>
                                        <SelectItem value="mixed">Mixto</SelectItem>
                                        <SelectItem value="nocturnal">Nocturno</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="flex gap-2">
                                <Button variant="outline" onClick={() => loadTabData(activeTab)}>
                                    <RefreshCw className="mr-2 h-4 w-4" />
                                    Actualizar
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Overview Tab */}
                    <TabsContent value="overview" className="space-y-4">
                        {/* Date Navigation */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Vista Diaria</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
                                            <ChevronLeft className="h-4 w-4" />
                                        </Button>
                                        <Input
                                            type="date"
                                            value={selectedDate}
                                            onChange={(e) => setSelectedDate(e.target.value)}
                                            className="w-40"
                                        />
                                        <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
                                            <ChevronRight className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Retardo</TableHead>
                                            <TableHead>Salida Temprana</TableHead>
                                            <TableHead>Horas Extras</TableHead>
                                            <TableHead>Sin Registro</TableHead>
                                            <TableHead>Incidencia</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {dailyStats.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={6} className="text-center text-muted-foreground">
                                                    Sin registros para este día
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            dailyStats.map((stat) => (
                                                <TableRow key={stat.employeeId}>
                                                    <TableCell className="font-medium">{stat.employeeName}</TableCell>
                                                    <TableCell>
                                                        {stat.tardinessMinutes ? (
                                                            <Badge variant={stat.tardinessJustified ? 'secondary' : 'destructive'}>
                                                                {stat.tardinessMinutes} min
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.earlyDepartureMinutes ? (
                                                            <Badge variant={stat.earlyDepartureJustified ? 'secondary' : 'outline'}>
                                                                {stat.earlyDepartureMinutes} min
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.overtimeHoursRequested ? (
                                                            <Badge variant={
                                                                stat.overtimeStatus === 'approved' ? 'default' :
                                                                    stat.overtimeStatus === 'rejected' ? 'destructive' :
                                                                        stat.overtimeStatus === 'partial' ? 'secondary' : 'outline'
                                                            }>
                                                                {stat.overtimeHoursApproved || stat.overtimeHoursRequested}h
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.hasMissingPunch ? (
                                                            <Badge variant={stat.missingPunchJustified ? 'secondary' : 'destructive'}>
                                                                {stat.missingPunchType === 'both' ? 'Entrada + Salida' :
                                                                    stat.missingPunchType === 'entry' ? 'Entrada' : 'Salida'}
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {stat.hasIncidence ? (
                                                            <Badge variant={stat.incidenceStatus === 'approved' ? 'default' : 'outline'}>
                                                                {stat.incidenceType}
                                                            </Badge>
                                                        ) : '-'}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>

                        {/* Monthly Stats */}
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <CardTitle>Estadísticas Mensuales</CardTitle>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder="Buscar empleado..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-48"
                                        />
                                        <Input
                                            type="month"
                                            value={selectedMonth}
                                            onChange={(e) => setSelectedMonth(e.target.value)}
                                            className="w-40"
                                        />
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredMonthlyStats.map((stat) => (
                                        <Card key={stat.employeeId} className="border">
                                            <CardHeader className="pb-2">
                                                <div className="flex items-center gap-3">
                                                    <Avatar>
                                                        <AvatarImage src={stat.avatarUrl} />
                                                        <AvatarFallback>{stat.employeeName.charAt(0)}</AvatarFallback>
                                                    </Avatar>
                                                    <div>
                                                        <CardTitle className="text-base">{stat.employeeName}</CardTitle>
                                                        <CardDescription>{stat.positionTitle}</CardDescription>
                                                    </div>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="space-y-2">
                                                <div className="flex justify-between text-sm">
                                                    <span>Retardos</span>
                                                    <span className={stat.unjustifiedTardiness > 0 ? 'text-red-500 font-medium' : ''}>
                                                        {stat.justifiedTardiness}/{stat.totalTardiness}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span>Salidas Tempranas</span>
                                                    <span>
                                                        {stat.justifiedEarlyDepartures}/{stat.totalEarlyDepartures}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-sm">
                                                    <span>HE Aprobadas</span>
                                                    <span className="text-green-600 font-medium">
                                                        {stat.overtimeHoursApproved}h
                                                    </span>
                                                </div>
                                                {stat.overtimeRequestsPending > 0 && (
                                                    <Badge variant="outline" className="w-full justify-center">
                                                        {stat.overtimeRequestsPending} solicitudes pendientes
                                                    </Badge>
                                                )}
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Tardiness Tab */}
                    <TabsContent value="tardiness">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Retardos del Equipo</CardTitle>
                                        <CardDescription>Justifica los retardos pendientes de tu equipo</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder="Buscar empleado..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-48"
                                        />
                                        <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Filtrar por empleado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los empleados</SelectItem>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.fullName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                            <SelectTrigger className="w-32">
                                                <SelectValue placeholder="Estado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="pending">Pendientes</SelectItem>
                                                <SelectItem value="justified">Justificados</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Hora Prog.</TableHead>
                                            <TableHead>Hora Real</TableHead>
                                            <TableHead>Minutos</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredTardiness.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    Sin registros para los filtros seleccionados
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredTardiness.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell>{formatDateDDMMYYYY(record.date)}</TableCell>
                                                    <TableCell className="font-medium">
                                                        {(record as any).employeeName || employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId}
                                                    </TableCell>
                                                    <TableCell>{record.scheduledTime}</TableCell>
                                                    <TableCell>{record.actualTime}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{record.minutesLate} min</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {record.justificationStatus === 'unjustified' ? (
                                                            <Badge variant="destructive">Injustificado</Badge>
                                                        ) : record.isJustified ? (
                                                            <Badge variant="secondary">Justificado</Badge>
                                                        ) : (
                                                            <Badge variant="outline">Pendiente</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!record.isJustified && record.justificationStatus !== 'unjustified' && hasPermission(permissions, 'hcm_team_tardiness', 'write') && (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                                    disabled={isPeriodClosed || submitting}
                                                                    onClick={() => handleMarkTardinessUnjustified(record)}
                                                                >
                                                                    Injustificado
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    disabled={isPeriodClosed}
                                                                    onClick={() => {
                                                                        setJustifyTardinessDialog({ open: true, record, employeeName: employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId });
                                                                        setJustificationReason('');
                                                                        setJustificationType(undefined);
                                                                        setUseHourBank(false);
                                                                    }}
                                                                >
                                                                    Justificar
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Early Departures Tab */}
                    <TabsContent value="early-departures">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Salidas Tempranas</CardTitle>
                                        <CardDescription>Justifica las salidas tempranas de tu equipo</CardDescription>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Input
                                            placeholder="Buscar empleado..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-48"
                                        />
                                        <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Filtrar por empleado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los empleados</SelectItem>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.fullName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                                            <SelectTrigger className="w-32">
                                                <SelectValue placeholder="Estado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos</SelectItem>
                                                <SelectItem value="pending">Pendientes</SelectItem>
                                                <SelectItem value="justified">Justificados</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Salida Prog.</TableHead>
                                            <TableHead>Salida Real</TableHead>
                                            <TableHead>Minutos</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredDepartures.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                                    Sin registros para los filtros seleccionados
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredDepartures.map((record) => (
                                                <TableRow key={record.id}>
                                                    <TableCell>{formatDateDDMMYYYY(record.date)}</TableCell>
                                                    <TableCell className="font-medium">{record.employeeName}</TableCell>
                                                    <TableCell>{record.scheduledTime || record.scheduledEndTime}</TableCell>
                                                    <TableCell>{record.actualTime || record.actualEndTime}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{record.minutesEarly} min</Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {record.justificationStatus === 'unjustified' ? (
                                                            <Badge variant="destructive">Injustificado</Badge>
                                                        ) : record.isJustified ? (
                                                            <Badge variant="secondary">Justificado</Badge>
                                                        ) : (
                                                            <Badge variant="outline">Pendiente</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {!record.isJustified && record.justificationStatus !== 'unjustified' && hasPermission(permissions, 'hcm_team_departures', 'write') && (
                                                            <div className="flex justify-end gap-2">
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                                    disabled={isPeriodClosed || submitting}
                                                                    onClick={() => handleMarkDepartureUnjustified(record)}
                                                                >
                                                                    Injustificado
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    disabled={isPeriodClosed}
                                                                    onClick={() => {
                                                                        setJustifyDepartureDialog({ open: true, record, employeeName: employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId });
                                                                        setJustificationReason('');
                                                                        setJustificationType(undefined);
                                                                        setUseHourBank(false);
                                                                    }}
                                                                >
                                                                    Justificar
                                                                </Button>
                                                            </div>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Missing Punches Tab */}
                    <TabsContent value="missing-punches">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Marcajes Faltantes</CardTitle>
                                        <CardDescription>Justifica o marca como falta los registros incompletos de entrada/salida</CardDescription>
                                    </div>
                                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="Filtrar por empleado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los empleados</SelectItem>
                                            {employees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>
                                                    {emp.fullName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Tipo Faltante</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredMissingPunches.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                    Sin marcajes faltantes para los filtros seleccionados
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredMissingPunches
                                                .map((punch) => {
                                                    const employee = employees.find(e => e.id === punch.employeeId);
                                                    const missingTypeLabels = {
                                                        entry: 'Entrada',
                                                        exit: 'Salida',
                                                        both: 'Ambos'
                                                    };

                                                    return (
                                                        <TableRow key={punch.id}>
                                                            <TableCell>{punch.date}</TableCell>
                                                            <TableCell>
                                                                <div className="flex items-center gap-3">
                                                                    <Avatar className="h-8 w-8">
                                                                        <AvatarImage src={employee?.avatarUrl} />
                                                                        <AvatarFallback>{employee?.fullName?.charAt(0)}</AvatarFallback>
                                                                    </Avatar>
                                                                    <div>
                                                                        <div className="font-medium">{employee?.fullName || punch.employeeName}</div>
                                                                        <div className="text-xs text-muted-foreground">{employee?.email}</div>
                                                                    </div>
                                                                </div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline">
                                                                    {missingTypeLabels[punch.missingType as keyof typeof missingTypeLabels]}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                {punch.isJustified ? (
                                                                    <Badge variant="default">Justificado</Badge>
                                                                ) : punch.resultedInAbsence ? (
                                                                    <Badge variant="destructive">Falta</Badge>
                                                                ) : (
                                                                    <Badge variant="secondary">Pendiente</Badge>
                                                                )}
                                                            </TableCell>
                                                            <TableCell className="text-right">
                                                                {!punch.isJustified && !punch.resultedInAbsence && hasPermission(permissions, 'hcm_team_tardiness', 'write') && (
                                                                    <div className="flex justify-end gap-2">
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                                            disabled={isPeriodClosed || submitting}
                                                                            onClick={() => handleMarkMissingPunchAsFault(punch)}
                                                                        >
                                                                            Marcar Falta
                                                                        </Button>
                                                                        <Button
                                                                            size="sm"
                                                                            disabled={isPeriodClosed || submitting}
                                                                            onClick={() => {
                                                                                setJustifyMissingPunchDialog({
                                                                                    open: true,
                                                                                    punch,
                                                                                    employeeName: employee?.fullName || punch.employeeName
                                                                                });
                                                                                setJustificationReason('');
                                                                                setProvidedEntryTime('');
                                                                                setProvidedExitTime('');
                                                                            }}
                                                                        >
                                                                            Justificar
                                                                        </Button>
                                                                    </div>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Overtime Tab */}

                    <TabsContent value="overtime">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Solicitudes de Horas Extras</CardTitle>
                                        <CardDescription>
                                            Aprobadas: {overtimeStats.totalHoursApproved}h |
                                            Pendientes: {overtimeStats.totalHoursPending}h
                                        </CardDescription>
                                    </div>
                                    <div className="flex gap-2">
                                        <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Filtrar por empleado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los empleados</SelectItem>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.fullName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                        <Badge variant="default">{overtimeStats.approved} aprobadas</Badge>
                                        <Badge variant="outline">{overtimeStats.pending} pendientes</Badge>
                                        <Badge variant="destructive">{overtimeStats.rejected} rechazadas</Badge>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Fecha</TableHead>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Deuda B. Horas</TableHead>
                                            <TableHead>Horas Solicitadas</TableHead>
                                            <TableHead>Razón</TableHead>
                                            <TableHead>Estado</TableHead>
                                            <TableHead>Aprobadas</TableHead>
                                            <TableHead>Dobles</TableHead>
                                            <TableHead>Triples</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredOvertime.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={9} className="text-center text-muted-foreground">
                                                    Sin solicitudes de horas extras
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredOvertime.map((request) => (
                                                <TableRow key={request.id}>
                                                    <TableCell>{formatDateDDMMYYYY(request.date)}</TableCell>
                                                    <TableCell className="font-medium">{request.employeeName}</TableCell>
                                                    <TableCell>
                                                        {(() => {
                                                            const hb = hourBanks.find(h => h.employeeId === request.employeeId);
                                                            const balance = hb?.balanceMinutes || 0;
                                                            if (balance > 0) {
                                                                const debt = Math.abs(balance);
                                                                const hours = Math.floor(debt / 60);
                                                                const mins = debt % 60;
                                                                return (
                                                                    <span className="font-bold text-red-600">
                                                                        -{hours}h {mins}m
                                                                    </span>
                                                                );
                                                            }
                                                            return <span className="text-muted-foreground">-</span>;
                                                        })()}
                                                    </TableCell>
                                                    <TableCell>{request.hoursRequested}h</TableCell>
                                                    <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                                                    <TableCell>
                                                        <Badge variant={
                                                            request.status === 'approved' ? 'default' :
                                                                request.status === 'rejected' ? 'destructive' :
                                                                    request.status === 'partial' ? 'secondary' : 'outline'
                                                        }>
                                                            {request.status === 'approved' ? 'Aprobada' :
                                                                request.status === 'rejected' ? 'Rechazada' :
                                                                    request.status === 'partial' ? 'Parcial' : 'Pendiente'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {request.hoursApproved !== undefined ? `${request.hoursApproved}h` : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {request.doubleHours !== undefined ? `${request.doubleHours}h` : '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        {request.tripleHours !== undefined ? `${request.tripleHours}h` : '-'}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {request.status === 'pending' && hasPermission(permissions, 'hcm_team_overtime', 'write') && (
                                                            <Button
                                                                size="sm"
                                                                disabled={isPeriodClosed}
                                                                onClick={() => {
                                                                    setOvertimeDialog({ open: true, request });
                                                                    setHoursToApprove(request.hoursRequested.toString());
                                                                    setRejectionReason('');
                                                                }}
                                                            >
                                                                Revisar
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* Shifts Tab */}
                    <TabsContent value="shifts">
                        <Card>
                            <CardHeader>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <CardTitle>Turnos y Horarios del Equipo</CardTitle>
                                        <CardDescription>Asigna turnos o modifica horarios de tus subordinados</CardDescription>
                                    </div>
                                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="Filtrar por empleado" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">Todos los empleados</SelectItem>
                                            {employees.map(emp => (
                                                <SelectItem key={emp.id} value={emp.id}>
                                                    {emp.fullName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Empleado</TableHead>
                                            <TableHead>Puesto</TableHead>
                                            <TableHead>Turno Actual</TableHead>
                                            <TableHead className="text-right">Acciones</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredEmployees.map((employee) => {
                                            const currentShift = getCurrentShift(employee);
                                            return (
                                                <TableRow key={employee.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <Avatar className="h-8 w-8">
                                                                <AvatarImage src={employee.avatarUrl} />
                                                                <AvatarFallback>{employee.fullName?.charAt(0)}</AvatarFallback>
                                                            </Avatar>
                                                            <span className="font-medium">{employee.fullName}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{employee.positionTitle}</TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <Badge variant={currentShift.isOverride ? (currentShift.isTemp ? "secondary" : "default") : "outline"} className="w-fit">
                                                                {currentShift.name}
                                                            </Badge>
                                                            {currentShift.isTemp && <span className="text-xs text-muted-foreground mt-1">Temporal</span>}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex gap-2 justify-end">
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                onClick={() => handleViewShiftHistory(employee)}
                                                            >
                                                                <History className="h-4 w-4 mr-1" />
                                                            </Button>
                                                            {hasPermission(permissions, 'hcm_team_shifts', 'write') && (
                                                                <Button
                                                                    size="sm"
                                                                    variant="outline"
                                                                    onClick={() => {
                                                                        setShiftDialog({ open: true, employee });
                                                                        setShiftForm({ shiftId: '', type: 'temporary', startDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
                                                                    }}
                                                                >
                                                                    <CalendarDays className="h-4 w-4 mr-1" />
                                                                    Asignar Turno
                                                                </Button>
                                                            )}
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    </TabsContent>



                    {/* Hour Bank Tab */}
                    {hasPermission(permissions, 'hcm_team_hour_bank', 'read') && (
                        <TabsContent value="hour-bank">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <CardTitle>Bolsa de Horas del Equipo</CardTitle>
                                        <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="Filtrar por empleado" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">Todos los empleados</SelectItem>
                                                {employees.map(emp => (
                                                    <SelectItem key={emp.id} value={emp.id}>
                                                        {emp.fullName}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <CardDescription>Gestiona el saldo de horas de tu equipo</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Empleado</TableHead>
                                                <TableHead>Puesto</TableHead>
                                                <TableHead>Saldo Actual</TableHead>
                                                <TableHead>Acumulado Histórico</TableHead>
                                                <TableHead>Compensado Histórico</TableHead>
                                                <TableHead className="text-right">Acciones</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {employees.filter(e => selectedEmployeeFilter === 'all' || e.id === selectedEmployeeFilter).map((employee) => {
                                                const hb = hourBanks.find(h => h.employeeId === employee.id);
                                                const balance = hb?.balanceMinutes || 0;
                                                const formatted = formatHourBankBalance(balance);

                                                return (
                                                    <TableRow key={employee.id}>
                                                        <TableCell>
                                                            <div className="flex items-center gap-3">
                                                                <Avatar className="h-8 w-8">
                                                                    <AvatarImage src={employee.avatarUrl} />
                                                                    <AvatarFallback>{employee.fullName?.charAt(0)}</AvatarFallback>
                                                                </Avatar>
                                                                <div>
                                                                    <div className="font-medium">{employee.fullName}</div>
                                                                    <div className="text-xs text-muted-foreground">{employee.email}</div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell>{employee.positionTitle}</TableCell>
                                                        <TableCell>
                                                            <span className={`font-bold ${formatted.colorClass}`}>
                                                                {formatted.text}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell className="text-red-500">
                                                            {hb?.totalDebtAccumulated ? `${Math.floor(hb.totalDebtAccumulated / 60)}h ${hb.totalDebtAccumulated % 60}min` : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-green-600">
                                                            {hb?.totalCompensated ? `${Math.floor(hb.totalCompensated / 60)}h ${hb.totalCompensated % 60}min` : '-'}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => handleViewHourBankHistory(employee)}
                                                            >
                                                                Ver Historial
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            })}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    )}
                </Tabs>

                {/* Notificación de Revisión Completa */}
                <div className="mt-8 border-t pt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Revisión de Infracciones</CardTitle>
                            <CardDescription>
                                Notifica a Capital Humano que has completado la revisión de infracciones del período {selectedMonth}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                <div>
                                    <p className="text-sm text-muted-foreground mb-2">
                                        Al marcar como completa, notificas a Capital Humano que has terminado de revisar las infracciones de tu equipo.
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        El cierre formal del período lo realizará Capital Humano desde la Consolidación de Asistencia. Las infracciones que no justifiques se procesarán automáticamente al momento del cierre.
                                    </p>
                                </div>
                                <div className="flex justify-center pt-2">
                                    <Button
                                        onClick={handleMarkReviewComplete}
                                        disabled={periodClosed || isPeriodClosed}
                                        variant={periodClosed ? "outline" : "default"}
                                        size="lg"
                                        className="min-w-[280px]"
                                    >
                                        {periodClosed ? (
                                            <>
                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                                Revisión Completa
                                            </>
                                        ) : (
                                            <>
                                                <Check className="mr-2 h-4 w-4" />
                                                Marcar Revisión como Completa
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                            {(pendingTardiness.length + pendingDepartures.length + pendingOvertime.length + pendingMissingPunches.length) > 0 && (
                                <div className="mt-4 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                                    <p className="text-sm text-orange-800">
                                        Tienes {pendingTardiness.length + pendingDepartures.length + pendingOvertime.length + pendingMissingPunches.length} infracciones pendientes. Si no las justificas, se procesarán automáticamente cuando Capital Humano cierre el período.
                                    </p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>

            {/* Justify Tardiness Dialog */}
            <Dialog open={justifyTardinessDialog.open} onOpenChange={(open) => setJustifyTardinessDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Justificar Retardo</DialogTitle>
                        <DialogDescription>
                            Ingresa el motivo de la justificación para el retardo del {justifyTardinessDialog.record && formatDateDDMMYYYY(justifyTardinessDialog.record.date)}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Tipo de Justificación</Label>
                            <Select
                                value={justificationType}
                                onValueChange={(v) => setJustificationType(v as JustificationType)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar motivo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(JUSTIFICATION_TYPE_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Comentario / Detalle</Label>
                            <Textarea
                                value={justificationReason}
                                onChange={(e) => setJustificationReason(e.target.value)}
                                placeholder="Ej. Tráfico pesado, cita médica..."
                            />
                        </div>
                        {canEmployeeUseTimeBank(justifyTardinessDialog.record?.employeeId) && (() => {
                            const record = justifyTardinessDialog.record;
                            const minutesLate = record?.minutesLate || 0;
                            // Si ≥30 min de retardo Y el empleado genera HE → bolsa obligatoria
                            const employeeHasOvertime = overtimeRequests.some(
                                ot => ot.employeeId === record?.employeeId
                            );
                            const isForced = minutesLate >= 30 && employeeHasOvertime;

                            // Forzar useHourBank si aplica
                            if (isForced && !useHourBank) {
                                // Side-effect seguro: solo se llama si aún no está forzado
                                setTimeout(() => setUseHourBank(true), 0);
                            }

                            return (
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        id="tardiness-hourbank"
                                        checked={isForced ? true : useHourBank}
                                        onCheckedChange={isForced ? undefined : setUseHourBank}
                                        disabled={isForced}
                                    />
                                    <Label htmlFor="tardiness-hourbank">
                                        Compensar con Bolsa de Horas
                                        {isForced && (
                                            <span className="text-xs text-amber-600 ml-1">
                                                (obligatorio: retardo ≥30 min con horas extras)
                                            </span>
                                        )}
                                    </Label>
                                </div>
                            );
                        })()}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustifyTardinessDialog({ open: false })}>Cancelar</Button>
                        <Button onClick={handleJustifyTardiness} disabled={submitting || !justificationType || !justificationReason.trim()}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Justify Early Departure Dialog */}
            <Dialog open={justifyDepartureDialog.open} onOpenChange={(open) => setJustifyDepartureDialog({ ...justifyDepartureDialog, open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Justificar Salida Temprana</DialogTitle>
                        <DialogDescription>
                            Ingresa el motivo de la justificación para la salida temprana del {justifyDepartureDialog.record && formatDateDDMMYYYY(justifyDepartureDialog.record.date)}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Tipo de Justificación</Label>
                            <Select
                                value={justificationType}
                                onValueChange={(v) => setJustificationType(v as JustificationType)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar motivo..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {Object.entries(JUSTIFICATION_TYPE_LABELS).map(([key, label]) => (
                                        <SelectItem key={key} value={key}>
                                            {label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Comentario / Detalle</Label>
                            <Textarea
                                value={justificationReason}
                                onChange={(e) => setJustificationReason(e.target.value)}
                                placeholder="Ej. Permiso personal, trabajo remoto..."
                            />
                        </div>
                        {canEmployeeUseTimeBank(justifyDepartureDialog.record?.employeeId) && (
                            <div className="flex items-center space-x-2">
                                <Switch id="departure-hourbank" checked={useHourBank} onCheckedChange={setUseHourBank} />
                                <Label htmlFor="departure-hourbank">Compensar con Bolsa de Horas</Label>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustifyDepartureDialog({ open: false })}>Cancelar</Button>
                        <Button onClick={handleJustifyDeparture} disabled={submitting || !justificationType || !justificationReason.trim()}>
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Overtime Approval Dialog */}
            <Dialog open={overtimeDialog.open} onOpenChange={(open) => setOvertimeDialog({ open })}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Revisar Solicitud de Horas Extras</DialogTitle>
                        <DialogDescription>
                            {overtimeDialog.request && (
                                <>
                                    {overtimeDialog.request.employeeName} solicita {overtimeDialog.request.hoursRequested} horas extras
                                </>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-6 py-4">
                        <div className="bg-muted p-3 rounded-lg">
                            <p className="text-sm font-medium">Razón:</p>
                            <p className="text-sm text-muted-foreground">{overtimeDialog.request?.reason}</p>
                        </div>
                        <div className="grid gap-4">
                            {(() => {
                                const hb = hourBanks.find(h => h.employeeId === overtimeDialog.request?.employeeId);
                                const currentDebt = hb?.balanceMinutes && hb.balanceMinutes > 0 ? hb.balanceMinutes : 0;
                                const requestedMinutes = (parseFloat(hoursToApprove || '0')) * 60;

                                const amortizedMinutes = Math.min(currentDebt, requestedMinutes);
                                const paidMinutes = Math.max(0, requestedMinutes - amortizedMinutes);

                                const formatMins = (mins: number) => {
                                    const h = Math.floor(mins / 60);
                                    const m = Math.round(mins % 60);
                                    return `${h}h ${m}m`;
                                };

                                return (
                                    <>
                                        {currentDebt > 0 && (
                                            <div className="bg-red-50 p-3 rounded-lg border border-red-100 space-y-2">
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-red-700 font-medium">Deuda Actual:</span>
                                                    <span className="font-bold text-red-700">{formatMins(currentDebt)}</span>
                                                </div>
                                                <div className="flex justify-between items-center text-sm">
                                                    <span className="text-green-700 font-medium">Se abonará a deuda:</span>
                                                    <span className="font-bold text-green-700">-{formatMins(amortizedMinutes)}</span>
                                                </div>
                                                <div className="border-t border-red-200 pt-1 mt-1 flex justify-between items-center text-sm">
                                                    <span className="text-muted-foreground">Restante a Pagar:</span>
                                                    <span className="font-bold text-slate-900">{formatMins(paidMinutes)}</span>
                                                </div>
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            <Label>Horas a Aprobar (para aprobación parcial)</Label>
                                            <div className="flex items-center gap-2">
                                                <Input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    max={overtimeDialog.request?.hoursRequested}
                                                    value={hoursToApprove}
                                                    onChange={(e) => setHoursToApprove(e.target.value)}
                                                    className={parseFloat(hoursToApprove) > (overtimeDialog.request?.hoursRequested || 0) ? "w-32 border-red-500" : "w-32"}
                                                />
                                                <span className="text-sm text-muted-foreground">horas</span>
                                            </div>
                                            {parseFloat(hoursToApprove) > (overtimeDialog.request?.hoursRequested || 0) && (
                                                <p className="text-xs text-red-500 font-medium">
                                                    No puedes aprobar más de las horas solicitadas ({overtimeDialog.request?.hoursRequested}h)
                                                </p>
                                            )}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                        <div>
                            <Label>Razón de Rechazo (solo si rechaza)</Label>
                            <Textarea
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Solo requerido si rechaza la solicitud..."
                                rows={4}
                            />
                        </div>
                    </div>
                    <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                        <Button variant="outline" onClick={() => setOvertimeDialog({ open: false })} className="mt-2 sm:mt-0">
                            Cancelar
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleRejectOvertime}
                            disabled={submitting || !rejectionReason.trim()}
                        >
                            <X className="h-4 w-4 mr-1" />
                            Rechazar
                        </Button>
                        <Button
                            variant="secondary"
                            onClick={() => handleApproveOvertime(true)}
                            disabled={
                                submitting ||
                                !hoursToApprove ||
                                parseFloat(hoursToApprove) > (overtimeDialog.request?.hoursRequested || 0) ||
                                parseFloat(hoursToApprove) <= 0
                            }
                        >
                            Aprobar Parcial
                        </Button>
                        <Button onClick={() => handleApproveOvertime(false)} disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />}
                            Aprobar Total
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Shift Assignment Dialog */}
            <Dialog open={shiftDialog.open} onOpenChange={(open) => setShiftDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Asignar Turno</DialogTitle>
                        <DialogDescription>
                            Asignar nuevo turno a {shiftDialog.employee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label>Turno</Label>
                            <Select value={shiftForm.shiftId} onValueChange={(v) => setShiftForm(prev => ({ ...prev, shiftId: v }))}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Seleccionar turno" />
                                </SelectTrigger>
                                <SelectContent>
                                    {shifts.map((shift) => (
                                        <SelectItem key={shift.id} value={shift.id}>
                                            {shift.name} ({shift.startTime} - {shift.endTime})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Tipo de Asignación</Label>
                            <Select value={shiftForm.type} onValueChange={(v: 'temporary' | 'permanent') => setShiftForm(prev => ({ ...prev, type: v }))}>
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="temporary">Temporal</SelectItem>
                                    <SelectItem value="permanent">Permanente</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <Label>Fecha Inicio</Label>
                                <Input
                                    type="date"
                                    value={shiftForm.startDate}
                                    onChange={(e) => setShiftForm(prev => ({ ...prev, startDate: e.target.value }))}
                                />
                            </div>
                            {shiftForm.type === 'temporary' && (
                                <div>
                                    <Label>Fecha Fin</Label>
                                    <Input
                                        type="date"
                                        value={shiftForm.endDate}
                                        onChange={(e) => setShiftForm(prev => ({ ...prev, endDate: e.target.value }))}
                                    />
                                </div>
                            )}
                        </div>
                        <div>
                            <Label>Razón del Cambio</Label>
                            <Textarea
                                value={shiftForm.reason}
                                onChange={(e) => setShiftForm(prev => ({ ...prev, reason: e.target.value }))}
                                placeholder="Describe la razón del cambio de turno..."
                                rows={2}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShiftDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleAssignShift}
                            disabled={submitting || !shiftForm.shiftId || !shiftForm.reason.trim() || (shiftForm.type === 'temporary' && !shiftForm.endDate)}
                        >
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Asignar Turno
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Shift Dialog */}
            <Dialog open={cancelShiftDialog.open} onOpenChange={(open) => setCancelShiftDialog({ open })}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Cancelar Asignación de Turno</DialogTitle>
                        <DialogDescription>
                            ¿Estás seguro de cancelar esta asignación para {cancelShiftDialog.assignment?.employeeName}?
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-sm text-muted-foreground">
                            Esta acción revertirá al empleado a su turno anterior si existe, o al turno predeterminado.
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCancelShiftDialog({ open: false })}>
                            No, mantener
                        </Button>
                        <Button variant="destructive" onClick={handleCancelShiftAssignment} disabled={submitting}>
                            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Sí, cancelar asignación
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Shift History Dialog */}
            <Dialog open={shiftHistoryDialog.open} onOpenChange={(open) => setShiftHistoryDialog({ open })}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Historial de Turnos</DialogTitle>
                        <DialogDescription>
                            Historial de asignaciones de turno para {shiftHistoryDialog.employee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Turno</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Fecha Inicio</TableHead>
                                    <TableHead>Fecha Fin</TableHead>
                                    <TableHead>Razón</TableHead>
                                    <TableHead>Asignado Por</TableHead>
                                    <TableHead>Estado</TableHead>
                                    <TableHead className="text-right">Acciones</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {shiftHistory.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} className="text-center text-muted-foreground">
                                            No hay historial de turnos
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    shiftHistory.map((assign) => (
                                        <TableRow key={assign.id}>
                                            <TableCell className="font-medium">{assign.newShiftName}</TableCell>
                                            <TableCell>
                                                <Badge variant={assign.assignmentType === 'permanent' ? 'default' : 'secondary'}>
                                                    {assign.assignmentType === 'permanent' ? 'Permanente' : 'Temporal'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{assign.startDate}</TableCell>
                                            <TableCell>{assign.endDate || '-'}</TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={assign.reason}>
                                                {assign.reason}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {assign.assignedByName}
                                                <div className="text-[10px]">{formatDateDDMMYYYY(assign.createdAt)}</div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant={assign.status === 'active' ? 'outline' : 'destructive'} className="text-[10px]">
                                                    {assign.status === 'active' ? 'Activo' : 'Cancelado'}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {assign.status === 'active' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-8 px-2 text-destructive hover:text-destructive"
                                                        onClick={() => setCancelShiftDialog({ open: true, assignment: assign })}
                                                    >
                                                        Cancelar
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setShiftHistoryDialog({ open: false })}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* Hour Bank History Dialog */}
            {/* Hour Bank History Dialog */}
            <Dialog open={hourBankDialog.open} onOpenChange={(open) => setHourBankDialog({ open })}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Historial de Bolsa de Horas</DialogTitle>
                        <DialogDescription>
                            Movimientos registrados para {hourBankDialog.employee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] overflow-y-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Fecha</TableHead>
                                    <TableHead>Tipo</TableHead>
                                    <TableHead>Minutos</TableHead>
                                    <TableHead>Motivo</TableHead>
                                    <TableHead>Registrado Por</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {hourBankMovements.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                                            No hay movimientos registrados
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    hourBankMovements.map((move) => (
                                        <TableRow key={move.id}>
                                            <TableCell>{formatDateDDMMYYYY(move.date)}</TableCell>
                                            <TableCell>
                                                <Badge variant="outline">
                                                    {move.type === 'tardiness' ? 'Retardo' :
                                                        move.type === 'early_departure' ? 'Salida Temprana' :
                                                            move.type === 'overtime_compensation' ? 'Compensación' :
                                                                move.type === 'manual_adjustment' ? 'Ajuste Manual' : move.type}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className={move.minutes > 0 ? 'text-red-500 font-bold' : 'text-green-600 font-bold'}>
                                                    {move.minutes > 0 ? '+' : ''}{move.minutes} min
                                                </span>
                                            </TableCell>
                                            <TableCell className="max-w-[200px] truncate" title={move.reason}>
                                                {move.reason}
                                            </TableCell>
                                            <TableCell className="text-xs text-muted-foreground">
                                                {move.createdByName || 'Sistema'}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                    <DialogFooter>
                        <Button onClick={() => setHourBankDialog({ open: false })}>Cerrar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Justify Missing Punch Dialog */}
            <Dialog open={justifyMissingPunchDialog.open} onOpenChange={(open) => setJustifyMissingPunchDialog({ open })}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Justificar Marcaje Faltante</DialogTitle>
                        <DialogDescription>
                            Proporciona la hora de entrada/salida para {justifyMissingPunchDialog.employeeName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        {justifyMissingPunchDialog.punch && (
                            <div className="bg-muted p-3 rounded-lg space-y-2">
                                <div className="flex justify-between">
                                    <span className="font-medium">Fecha:</span>
                                    <span>{justifyMissingPunchDialog.punch.date}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="font-medium">Tipo Faltante:</span>
                                    <span>
                                        {justifyMissingPunchDialog.punch.missingType === 'entry' && 'Entrada'}
                                        {justifyMissingPunchDialog.punch.missingType === 'exit' && 'Salida'}
                                        {justifyMissingPunchDialog.punch.missingType === 'both' && 'Ambos (Entrada y Salida)'}
                                    </span>
                                </div>
                            </div>
                        )}

                        {/* Entrada */}
                        {justifyMissingPunchDialog.punch?.missingType !== 'exit' && (
                            <div className="space-y-2">
                                <Label htmlFor="provided-entry-time">Hora de Entrada</Label>
                                <Input
                                    id="provided-entry-time"
                                    type="time"
                                    value={providedEntryTime}
                                    onChange={(e) => setProvidedEntryTime(e.target.value)}
                                    placeholder="HH:mm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Si la hora genera retardo, se creará automáticamente un registro de retardo
                                </p>
                            </div>
                        )}

                        {/* Salida */}
                        {justifyMissingPunchDialog.punch?.missingType !== 'entry' && (
                            <div className="space-y-2">
                                <Label htmlFor="provided-exit-time">Hora de Salida</Label>
                                <Input
                                    id="provided-exit-time"
                                    type="time"
                                    value={providedExitTime}
                                    onChange={(e) => setProvidedExitTime(e.target.value)}
                                    placeholder="HH:mm"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Si la hora genera salida temprana, se creará automáticamente un registro
                                </p>
                            </div>
                        )}

                        {/* Razón */}
                        <div className="space-y-2">
                            <Label htmlFor="missing-punch-reason">Razón de la Justificación</Label>
                            <Textarea
                                id="missing-punch-reason"
                                value={justificationReason}
                                onChange={(e) => setJustificationReason(e.target.value)}
                                placeholder="Explica por qué se justifica este marcaje faltante..."
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setJustifyMissingPunchDialog({ open: false })}>
                            Cancelar
                        </Button>
                        <Button
                            onClick={handleJustifyMissingPunch}
                            disabled={submitting || (!providedEntryTime && !providedExitTime) || !justificationReason.trim()}
                        >
                            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Confirmar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

        </SiteLayout>
    );
}
