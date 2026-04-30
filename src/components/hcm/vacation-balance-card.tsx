'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase/provider';
import { usePermissions } from '@/hooks/use-permissions';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { adjustVacationBalance } from '@/firebase/actions/incidence-actions';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Calendar, AlertCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import type { VacationBalance } from "@/types/hcm.types";

interface VacationBalanceCardProps {
    employeeId: string;
    employeeName: string;
}

export function VacationBalanceCard({ employeeId, employeeName }: VacationBalanceCardProps) {
    const { firestore, user } = useFirebase();
    const { hasPermission } = usePermissions();
    const { toast } = useToast();
    const [balance, setBalance] = useState<VacationBalance | null>(null);
    const [loading, setLoading] = useState(true);
    const [showAdjustDialog, setShowAdjustDialog] = useState(false);
    const [adjustmentDays, setAdjustmentDays] = useState<string>('0');
    const [adjustmentReason, setAdjustmentReason] = useState('');
    const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
    const [adjusting, setAdjusting] = useState(false);

    const canEdit = hasPermission('hcm_employees', 'write') || hasPermission('admin_users', 'write') || hasPermission('hcm_admin_vacation', 'write');

    useEffect(() => {
        loadBalance();
    }, [employeeId]);

    const loadBalance = async () => {
        try {
            if (!firestore) return;
            const balancesRef = collection(firestore, 'vacation_balances');
            const q = query(
                balancesRef,
                where('employeeId', '==', employeeId)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const balanceData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VacationBalance;
                setBalance(balanceData);
            } else {
                setBalance(null);
            }
        } catch (error) {
            console.error('Error loading vacation balance:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAdjustBalance = async () => {
        if (!user) return;

        if (!adjustmentReason.trim() || adjustmentReason.trim().length < 10) {
            toast({ title: 'El motivo debe tener al menos 10 caracteres', variant: 'destructive' });
            return;
        }

        if (!adjustmentDays || parseInt(adjustmentDays) === 0) {
            toast({ title: 'El ajuste debe ser diferente de cero', variant: 'destructive' });
            return;
        }

        setAdjusting(true);
        try {
            const numericDays = parseInt(adjustmentDays) || 0;
            const finalDays = adjustmentType === 'add' ? numericDays : -numericDays;
            const result = await adjustVacationBalance(
                employeeId,
                finalDays,
                adjustmentReason.trim(),
                user.uid,
                user.displayName || user.email || 'Usuario'
            );

            if (result.success) {
                toast({ title: `Saldo ajustado exitosamente: ${finalDays > 0 ? '+' : ''}${finalDays} días` });
                setShowAdjustDialog(false);
                setAdjustmentDays('0');
                setAdjustmentReason('');
                await loadBalance();
            } else {
                toast({ title: result.error || 'Error al ajustar saldo', variant: 'destructive' });
            }
        } catch (error) {
            console.error('Error adjusting balance:', error);
            toast({ title: 'Error al ajustar saldo', variant: 'destructive' });
        } finally {
            setAdjusting(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Saldo de Vacaciones
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <p className="text-muted-foreground">Cargando...</p>
                </CardContent>
            </Card>
        );
    }

    // Render the Adjust Dialog (always available, regardless of balance state)
    const adjustDialog = (
        <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{balance ? 'Ajustar Saldo de Vacaciones' : 'Crear Saldo Inicial de Vacaciones'}</DialogTitle>
                    <DialogDescription>
                        {employeeName} {balance ? `• Saldo actual: ${balance.daysAvailable} días` : '• Sin saldo registrado'}
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="space-y-2">
                        <Label>Tipo de Ajuste</Label>
                        <div className="flex gap-2">
                            <Button
                                variant={adjustmentType === 'add' ? 'default' : 'outline'}
                                onClick={() => setAdjustmentType('add')}
                                className="flex-1"
                            >
                                <TrendingUp className="h-4 w-4 mr-2" />
                                Agregar días
                            </Button>
                            <Button
                                variant={adjustmentType === 'subtract' ? 'default' : 'outline'}
                                onClick={() => setAdjustmentType('subtract')}
                                className="flex-1"
                            >
                                <TrendingDown className="h-4 w-4 mr-2" />
                                Quitar días
                            </Button>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label>Cantidad de días</Label>
                        <Input
                            type="number"
                            min="0"
                            max="365"
                            value={adjustmentDays}
                            onChange={(e) => setAdjustmentDays(e.target.value)}
                            onFocus={(e) => e.target.select()}
                        />
                    </div>

                    <div className="space-y-2">
                        <Label>Motivo (obligatorio, mínimo 10 caracteres)</Label>
                        <Textarea
                            placeholder="Describe el motivo del ajuste..."
                            value={adjustmentReason}
                            onChange={(e) => setAdjustmentReason(e.target.value)}
                            rows={3}
                        />
                        <p className="text-xs text-muted-foreground">
                            {adjustmentReason.length}/10 caracteres
                        </p>
                    </div>

                    <Alert>
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>
                            {balance ? (
                                <>Nuevo saldo: {
                                    balance.daysAvailable +
                                    (adjustmentType === 'add' ? (parseInt(adjustmentDays) || 0) : -(parseInt(adjustmentDays) || 0))
                                } días</>
                            ) : (
                                <>Saldo inicial: {
                                    adjustmentType === 'add' ? (parseInt(adjustmentDays) || 0) : 0
                                } días (se creará el registro automáticamente)</>
                            )}
                        </AlertDescription>
                    </Alert>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                        Cancelar
                    </Button>
                    <Button onClick={handleAdjustBalance} disabled={adjusting}>
                        {adjusting ? 'Procesando...' : balance ? 'Confirmar Ajuste' : 'Crear Saldo'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );

    // No balance state
    if (!balance) {
        return (
            <>
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5" />
                            Saldo de Vacaciones
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Alert>
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                No hay saldo de vacaciones registrado para este empleado.
                                {canEdit && ' Se creará automáticamente al realizar el primer ajuste.'}
                            </AlertDescription>
                        </Alert>
                        {canEdit && (
                            <div className="mt-4 flex gap-2">
                                <Button onClick={() => setShowAdjustDialog(true)}>
                                    Crear Saldo Inicial
                                </Button>
                                <Button variant="outline" asChild>
                                    <Link href="/hcm/admin/vacation-management">
                                        Gestión de Vacaciones
                                    </Link>
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
                {adjustDialog}
            </>
        );
    }

    // Balance exists state
    return (
        <>
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Calendar className="h-5 w-5" />
                        Saldo de Vacaciones
                    </CardTitle>
                    <CardDescription>
                        Período {balance.yearsOfService} años de servicio
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Días Otorgados</p>
                            <p className="text-2xl font-bold">{balance.daysEntitled}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Días Tomados</p>
                            <p className="text-2xl font-bold text-red-600">{balance.daysTaken}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Días Programados</p>
                            <p className="text-2xl font-bold text-orange-600">{balance.daysScheduled}</p>
                        </div>
                        <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">Días Disponibles</p>
                            <p className="text-2xl font-bold text-green-600">{balance.daysAvailable}</p>
                        </div>
                    </div>

                    {balance.daysCarriedOver > 0 && (
                        <Alert>
                            <TrendingUp className="h-4 w-4" />
                            <AlertDescription>
                                {balance.daysCarriedOver} días arrastrados del período anterior
                            </AlertDescription>
                        </Alert>
                    )}

                    {balance.movements && balance.movements.length > 0 && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold">Últimos Movimientos</p>
                            <div className="space-y-1">
                                {balance.movements.slice(-3).reverse().map((movement) => (
                                    <div key={movement.id} className="flex items-center justify-between text-sm p-2 bg-muted rounded">
                                        <span className="text-muted-foreground">{movement.description}</span>
                                        <Badge variant={movement.days > 0 ? 'default' : 'destructive'}>
                                            {movement.days > 0 ? '+' : ''}{movement.days}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {canEdit && (
                        <div className="flex gap-2 pt-2">
                            <Button onClick={() => setShowAdjustDialog(true)} size="sm">
                                Ajustar Saldo
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/hcm/admin/vacation-management">
                                    Ver Historial Completo
                                </Link>
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>
            {adjustDialog}
        </>
    );
}
