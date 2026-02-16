'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getEmployeeByUserId } from '@/firebase/actions/employee-actions';
import { getVacationBalance, createIncidence } from '@/firebase/actions/incidence-actions';
import { checkDateConflict } from '@/lib/hcm-utils';
import { calculateEffectiveLeaveDays, EffectiveDaysResult } from '@/lib/hcm-calculations';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, Query } from 'firebase/firestore';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import type { Incidence, IncidenceType, Employee, VacationBalance } from '@/lib/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface NewIncidenceFormProps {
    userId: string;          // The user currently logged in
    targetUserId?: string;   // The user for whom the incidence is created (defaults to userId)
    onSuccess?: () => void;
    onCancel?: () => void;
    className?: string;
}

export function NewIncidenceForm({ userId, targetUserId, onSuccess, onCancel, className }: NewIncidenceFormProps) {
    const { firestore } = useFirebase();
    const { toast } = useToast();
    const effectiveTargetUserId = targetUserId || userId;

    const [isSubmitting, setIsSubmitting] = useState(false);

    // New incidence form state
    const [newIncidence, setNewIncidence] = useState({
        type: 'vacation' as IncidenceType,
        startDate: '',
        endDate: '',
        notes: '',
        isPaid: true
    });

    // Date conflict validation state
    const [dateConflictError, setDateConflictError] = useState<string | null>(null);
    const [isValidatingDates, setIsValidatingDates] = useState(false);

    // Effective days calculation state
    const [calculationResult, setCalculationResult] = useState<EffectiveDaysResult | null>(null);
    const [isCalculatingDays, setIsCalculatingDays] = useState(false);

    // Employee data for autocompletion
    const [currentEmployee, setCurrentEmployee] = useState<Employee | null>(null);
    const [vacationBalance, setVacationBalance] = useState<VacationBalance | null>(null);
    const [isLoadingEmployeeData, setIsLoadingEmployeeData] = useState(false);

    // Load employee data and vacation balance
    useEffect(() => {
        if (!effectiveTargetUserId) return;

        const loadEmployeeData = async () => {
            setIsLoadingEmployeeData(true);
            try {
                // Load employee data
                const empResult = await getEmployeeByUserId(effectiveTargetUserId);
                if (empResult.success && empResult.employee) {
                    setCurrentEmployee(empResult.employee);

                    // Load vacation balance for this employee
                    const balanceResult = await getVacationBalance(empResult.employee.id);
                    if (balanceResult.success && balanceResult.balance) {
                        setVacationBalance(balanceResult.balance);
                    }
                }
            } catch (error) {
                console.error('Error loading employee data:', error);
            } finally {
                setIsLoadingEmployeeData(false);
            }
        };

        loadEmployeeData();
    }, [effectiveTargetUserId]);

    // Query existing incidences for conflict checking
    // Note: We need to fetch this to check for overlaps
    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || !effectiveTargetUserId) return null;

        return query(
            collection(firestore, 'incidences'),
            where('employeeId', '==', effectiveTargetUserId),
            orderBy('createdAt', 'desc')
        );
    }, [firestore, effectiveTargetUserId]);

    const { data: userIncidences } = useCollection<Incidence>(incidencesQuery);

    // Real-time date conflict validation
    useEffect(() => {
        // Only validate when both dates are set
        if (!newIncidence.startDate || !newIncidence.endDate || !userIncidences) {
            setDateConflictError(null);
            setCalculationResult(null);
            return;
        }

        // Validate that end date is not before start date
        if (new Date(newIncidence.endDate) < new Date(newIncidence.startDate)) {
            setDateConflictError('La fecha de fin no puede ser anterior a la fecha de inicio.');
            setCalculationResult(null);
            return;
        }

        const runValidations = async () => {
            setIsValidatingDates(true);
            setIsCalculatingDays(true);

            // 1. Check for date conflicts
            const conflictResult = checkDateConflict(
                effectiveTargetUserId,
                newIncidence.startDate,
                newIncidence.endDate,
                userIncidences.map(inc => ({
                    id: inc.id,
                    employeeId: inc.employeeId,
                    type: inc.type,
                    startDate: inc.startDate,
                    endDate: inc.endDate,
                    status: inc.status
                }))
            );

            if (conflictResult.hasConflict) {
                setDateConflictError(conflictResult.message || 'Las fechas seleccionadas se solapan con otra incidencia.');
            } else {
                setDateConflictError(null);
            }

            // 2. Calculate Effective Days (Backend Logic)
            if (firestore && effectiveTargetUserId && !conflictResult.hasConflict) {
                try {
                    const result = await calculateEffectiveLeaveDays(
                        firestore,
                        effectiveTargetUserId,
                        newIncidence.startDate,
                        newIncidence.endDate
                    );
                    setCalculationResult(result);
                } catch (error) {
                    console.error("Error calculating effective days:", error);
                }
            }

            setIsValidatingDates(false);
            setIsCalculatingDays(false);
        };

        runValidations();
    }, [newIncidence.startDate, newIncidence.endDate, userIncidences, effectiveTargetUserId, firestore]);

    // Handle create new incidence
    const handleSubmit = async () => {
        if (!effectiveTargetUserId || !newIncidence.startDate || !newIncidence.endDate) return;

        if (dateConflictError) {
            toast({
                title: 'Error de validación',
                description: dateConflictError,
                variant: 'destructive',
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // If we have employee data loaded, use it. Otherwise fallback to basic info if available.
            const employeeName = currentEmployee?.fullName || 'Unknown';

            const result = await createIncidence({
                employeeId: effectiveTargetUserId,
                employeeName: employeeName,
                type: newIncidence.type,
                startDate: newIncidence.startDate,
                endDate: newIncidence.endDate,
                isPaid: newIncidence.isPaid,
                notes: (newIncidence.notes || '') + (calculationResult ? `\n\n[Cálculo Automático]\nDías Efectivos: ${calculationResult.effectiveDays}\nDescansos: ${calculationResult.weekendDays}\nFestivos: ${calculationResult.holidays}` : '')
            });

            if (result.success) {
                toast({
                    title: 'Solicitud creada',
                    description: 'Tu solicitud ha sido enviada para aprobación.',
                });

                // Reset form
                setNewIncidence({
                    type: 'vacation',
                    startDate: '',
                    endDate: '',
                    notes: '',
                    isPaid: true
                });

                if (onSuccess) onSuccess();
            } else {
                throw new Error(result.error);
            }
        } catch (error: any) {
            toast({
                title: 'Error',
                description: error.message || 'No se pudo crear la solicitud.',
                variant: 'destructive',
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className={`space-y-4 ${className || ''}`}>
            {/* Employee Info - Autocompletado */}
            {isLoadingEmployeeData ? (
                <div className="bg-muted/50 p-4 rounded-lg text-center text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Cargando datos del empleado...
                </div>
            ) : currentEmployee && (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 p-4 rounded-lg border border-blue-100 dark:border-blue-800/50">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                            <span className="text-muted-foreground block text-xs">Empleado</span>
                            <span className="font-medium">{currentEmployee.fullName}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-xs">Puesto</span>
                            <span className="font-medium">{currentEmployee.positionTitle || 'N/A'}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-xs">Departamento</span>
                            <span className="font-medium">{currentEmployee.department || 'N/A'}</span>
                        </div>
                        <div>
                            <span className="text-muted-foreground block text-xs">Saldo vacaciones</span>
                            <span className={`font-bold ${vacationBalance && vacationBalance.daysAvailable > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                                {vacationBalance ? `${vacationBalance.daysAvailable} días` : 'N/A'}
                            </span>
                            {vacationBalance && newIncidence.type === 'vacation' && (
                                <span className="text-xs text-muted-foreground ml-1">
                                    de {vacationBalance.daysEntitled}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div>
                <Label htmlFor="incidence-type">Tipo de Permiso</Label>
                <Select
                    value={newIncidence.type}
                    onValueChange={(v) => setNewIncidence({ ...newIncidence, type: v as IncidenceType })}
                >
                    <SelectTrigger id="incidence-type" className="mt-1">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="vacation">Vacaciones</SelectItem>
                        <SelectItem value="sick_leave">Incapacidad</SelectItem>
                        <SelectItem value="personal_leave">Permiso Personal</SelectItem>
                        <SelectItem value="bereavement">Duelo</SelectItem>
                        <SelectItem value="maternity">Maternidad</SelectItem>
                        <SelectItem value="paternity">Paternidad</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="start-date">Fecha inicio</Label>
                    <Input
                        id="start-date"
                        type="date"
                        value={newIncidence.startDate}
                        onChange={(e) => setNewIncidence({ ...newIncidence, startDate: e.target.value })}
                        className={`mt-1 ${dateConflictError ? 'border-red-500' : ''}`}
                    />
                </div>
                <div>
                    <Label htmlFor="end-date">Fecha fin</Label>
                    <Input
                        id="end-date"
                        type="date"
                        value={newIncidence.endDate}
                        onChange={(e) => setNewIncidence({ ...newIncidence, endDate: e.target.value })}
                        className={`mt-1 ${dateConflictError ? 'border-red-500' : ''}`}
                    />
                </div>
            </div>

            {/* Calculation Result Display */}
            {isCalculatingDays ? (
                <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" /> Calculando días efectivos...
                </div>
            ) : calculationResult && !dateConflictError && (
                <div className="bg-muted/30 p-3 rounded-md text-sm space-y-1 border">
                    <div className="flex justify-between items-center font-medium">
                        <span>Días a descontar/pagar:</span>
                        <span className="text-primary text-lg">{calculationResult.effectiveDays} días</span>
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-col gap-1 pt-1 border-t mt-1">
                        <div className="flex justify-between">
                            <span>Duración calendario:</span>
                            <span>{calculationResult.totalDays} días</span>
                        </div>
                        {calculationResult.weekendDays > 0 && (
                            <div className="flex justify-between text-orange-600/80">
                                <span>Días descanso (no cuentan):</span>
                                <span>-{calculationResult.weekendDays}</span>
                            </div>
                        )}
                        {calculationResult.holidays > 0 && (
                            <div className="flex justify-between text-green-600/80">
                                <span>Días festivos (se pagan):</span>
                                <span>-{calculationResult.holidays}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Date conflict warning */}
            {dateConflictError && (
                <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                        {dateConflictError}
                    </AlertDescription>
                </Alert>
            )}

            <div>
                <Label htmlFor="notes">Notas (opcional)</Label>
                <textarea
                    id="notes"
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 mt-1"
                    placeholder="Información adicional..."
                    value={newIncidence.notes}
                    onChange={(e) => setNewIncidence({ ...newIncidence, notes: e.target.value })}
                />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4">
                {onCancel && (
                    <Button variant="outline" onClick={onCancel} disabled={isSubmitting}>
                        Cancelar
                    </Button>
                )}
                <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting || !!dateConflictError || !newIncidence.startDate || !newIncidence.endDate}
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Enviar Solicitud
                </Button>
            </div>
        </div>
    );
}
