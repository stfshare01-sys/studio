'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase/provider';
import { usePermissions } from '@/hooks/use-permissions';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import {
    adjustVacationBalance,
    bulkLoadVacationBalances,
    type VacationBalanceLoad
} from '@/firebase/actions/incidence-actions';
import type { Employee, VacationBalance } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Search, Upload, Download, Calendar, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

export default function VacationManagementPage() {
    const { firestore, user } = useFirebase();
    const { hasPermission } = usePermissions();
    const { toast } = useToast();
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
    const [employeeBalance, setEmployeeBalance] = useState<VacationBalance | null>(null);
    const [showAdjustDialog, setShowAdjustDialog] = useState(false);
    const [showHistoryDialog, setShowHistoryDialog] = useState(false);
    const [adjustmentDays, setAdjustmentDays] = useState<number>(0);
    const [adjustmentReason, setAdjustmentReason] = useState('');
    const [adjustmentType, setAdjustmentType] = useState<'add' | 'subtract'>('add');
    const [bulkData, setBulkData] = useState<VacationBalanceLoad[]>([]);
    const [bulkErrors, setBulkErrors] = useState<Array<{ employeeId: string; error: string }>>([]);
    const [showBulkPreview, setShowBulkPreview] = useState(false);

    // Check permissions
    const canManageVacations = hasPermission('hcm_employees', 'write') || hasPermission('admin_users', 'write');

    useEffect(() => {
        if (!canManageVacations) {
            toast({ title: 'No tienes permisos para gestionar vacaciones', variant: 'destructive' });
        }
    }, [canManageVacations, toast]);

    // Search employee
    const handleSearchEmployee = async () => {
        if (!searchTerm.trim()) {
            toast({ title: 'Ingresa un nombre o ID de empleado', variant: 'destructive' });
            return;
        }

        setLoading(true);
        try {
            if (!firestore) return;
            const employeesRef = collection(firestore, 'employees');
            const q = query(
                employeesRef,
                where('status', '==', 'active')
            );
            const snapshot = await getDocs(q);

            const employees = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee));
            const found = employees.find(emp =>
                emp.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                emp.id === searchTerm
            );

            if (found) {
                setSelectedEmployee(found);
                await loadEmployeeBalance(found.id);
            } else {
                toast({ title: 'Empleado no encontrado', variant: 'destructive' });
                setSelectedEmployee(null);
                setEmployeeBalance(null);
            }
        } catch (error) {
            console.error('Error searching employee:', error);
            toast({ title: 'Error al buscar empleado', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    // Load employee vacation balance
    const loadEmployeeBalance = async (employeeId: string) => {
        try {
            if (!firestore) return;
            const balancesRef = collection(firestore, 'vacation_balances');
            const q = query(
                balancesRef,
                where('employeeId', '==', employeeId)
            );
            const snapshot = await getDocs(q);

            if (!snapshot.empty) {
                const balance = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as VacationBalance;
                setEmployeeBalance(balance);
            } else {
                setEmployeeBalance(null);
                toast({ title: 'Este empleado no tiene saldo de vacaciones registrado' });
            }
        } catch (error) {
            console.error('Error loading balance:', error);
            toast({ title: 'Error al cargar saldo de vacaciones', variant: 'destructive' });
        }
    };

    // Handle individual adjustment
    const handleAdjustBalance = async () => {
        if (!selectedEmployee || !user) return;

        if (!adjustmentReason.trim() || adjustmentReason.trim().length < 10) {
            toast({ title: 'El motivo debe tener al menos 10 caracteres', variant: 'destructive' });
            return;
        }

        if (adjustmentDays === 0) {
            toast({ title: 'El ajuste debe ser diferente de cero', variant: 'destructive' });
            return;
        }

        setLoading(true);
        try {
            const finalDays = adjustmentType === 'add' ? adjustmentDays : -adjustmentDays;
            const result = await adjustVacationBalance(
                selectedEmployee.id,
                finalDays,
                adjustmentReason.trim(),
                user.uid,
                user.displayName || user.email || 'Usuario'
            );

            if (result.success) {
                toast({ title: `Saldo ajustado exitosamente: ${finalDays > 0 ? '+' : ''}${finalDays} días` });
                setShowAdjustDialog(false);
                setAdjustmentDays(0);
                setAdjustmentReason('');
                await loadEmployeeBalance(selectedEmployee.id);
            } else {
                toast({ title: result.error || 'Error al ajustar saldo', variant: 'destructive' });
            }
        } catch (error) {
            console.error('Error adjusting balance:', error);
            toast({ title: 'Error al ajustar saldo', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    // Download Excel template
    const handleDownloadTemplate = () => {
        const template = [
            {
                'ID del Empleado': 'EMP-001',
                'Días Otorgados': 12,
                'Días Tomados': 0,
                'Días Programados': 0,
                'Motivo': 'Carga inicial de saldo de vacaciones'
            }
        ];

        const ws = XLSX.utils.json_to_sheet(template);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Vacaciones');
        XLSX.writeFile(wb, 'plantilla_vacaciones.xlsx');
        toast({ title: 'Plantilla descargada' });
    };

    // Handle file upload
    const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                const workbook = XLSX.read(data, { type: 'array' });
                const sheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[sheetName];
                const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

                // Map Spanish column names to internal field names
                const jsonData = rawData.map(row => ({
                    employeeId: row['ID del Empleado'] || row.employeeId,
                    daysEntitled: row['Días Otorgados'] || row.daysEntitled,
                    daysTaken: row['Días Tomados'] || row.daysTaken || 0,
                    daysScheduled: row['Días Programados'] || row.daysScheduled || 0,
                    reason: row['Motivo'] || row.reason
                })) as VacationBalanceLoad[];

                // Validate data
                const errors: Array<{ employeeId: string; error: string }> = [];
                const validData: VacationBalanceLoad[] = [];

                jsonData.forEach((row, index) => {
                    if (!row.employeeId) {
                        errors.push({ employeeId: `Fila ${index + 2}`, error: 'ID de empleado faltante' });
                        return;
                    }
                    if (row.daysEntitled === undefined || row.daysEntitled < 0) {
                        errors.push({ employeeId: row.employeeId, error: 'Días otorgados inválidos' });
                        return;
                    }
                    if (!row.reason || row.reason.trim().length < 10) {
                        errors.push({ employeeId: row.employeeId, error: 'Motivo muy corto (mínimo 10 caracteres)' });
                        return;
                    }
                    validData.push(row);
                });

                setBulkData(validData);
                setBulkErrors(errors);
                setShowBulkPreview(true);

                if (errors.length > 0) {
                    toast({ title: `${errors.length} registros con errores detectados`, variant: 'default' });
                } else {
                    toast({ title: `${validData.length} registros válidos cargados` });
                }
            } catch (error) {
                console.error('Error reading file:', error);
                toast({ title: 'Error al leer el archivo', variant: 'destructive' });
            }
        };
        reader.readAsArrayBuffer(file);
    };

    // Process bulk load
    const handleBulkLoad = async () => {
        if (!user || bulkData.length === 0) return;

        setLoading(true);
        try {
            const result = await bulkLoadVacationBalances(
                bulkData,
                user.uid,
                user.displayName || user.email || 'Usuario'
            );

            if (result.success) {
                toast({ title: `Carga completada: ${result.successCount} exitosos, ${result.errorCount} errores` });
                setBulkData([]);
                setBulkErrors(result.errors);
                setShowBulkPreview(false);
            } else {
                toast({ title: 'Error en la carga masiva', variant: 'destructive' });
                setBulkErrors(result.errors);
            }
        } catch (error) {
            console.error('Error in bulk load:', error);
            toast({ title: 'Error al procesar carga masiva', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    };

    if (!canManageVacations) {
        return (
            <div className="container mx-auto p-6">
                <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>
                        No tienes permisos para acceder a esta página.
                    </AlertDescription>
                </Alert>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Gestión de Saldos de Vacaciones</h1>
                    <p className="text-muted-foreground">Ajusta saldos individuales o carga masiva de vacaciones</p>
                </div>
            </div>

            <Tabs defaultValue="individual" className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="individual">Ajuste Individual</TabsTrigger>
                    <TabsTrigger value="bulk">Carga Masiva</TabsTrigger>
                    <TabsTrigger value="history">Historial</TabsTrigger>
                </TabsList>

                {/* Individual Adjustment Tab */}
                <TabsContent value="individual" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Buscar Empleado</CardTitle>
                            <CardDescription>Busca por nombre, número de empleado o ID</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-2">
                                <Input
                                    placeholder="Nombre o ID del empleado..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSearchEmployee()}
                                />
                                <Button onClick={handleSearchEmployee} disabled={loading}>
                                    <Search className="h-4 w-4 mr-2" />
                                    Buscar
                                </Button>
                            </div>

                            {selectedEmployee && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">{selectedEmployee.fullName}</CardTitle>
                                        <CardDescription>
                                            {selectedEmployee.id} • {selectedEmployee.positionTitle || 'Sin posición'}
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        {employeeBalance ? (
                                            <>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Días Otorgados</p>
                                                        <p className="text-2xl font-bold">{employeeBalance.daysEntitled}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Días Tomados</p>
                                                        <p className="text-2xl font-bold text-red-600">{employeeBalance.daysTaken}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Días Programados</p>
                                                        <p className="text-2xl font-bold text-orange-600">{employeeBalance.daysScheduled}</p>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm text-muted-foreground">Días Disponibles</p>
                                                        <p className="text-2xl font-bold text-green-600">{employeeBalance.daysAvailable}</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <Button onClick={() => setShowAdjustDialog(true)}>
                                                        <Calendar className="h-4 w-4 mr-2" />
                                                        Ajustar Saldo
                                                    </Button>
                                                    <Button variant="outline" onClick={() => setShowHistoryDialog(true)}>
                                                        Ver Historial
                                                    </Button>
                                                </div>
                                            </>
                                        ) : (
                                            <Alert>
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription>
                                                    Este empleado no tiene saldo de vacaciones registrado. Se creará automáticamente al realizar el primer ajuste.
                                                </AlertDescription>
                                            </Alert>
                                        )}
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Bulk Load Tab */}
                <TabsContent value="bulk" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Carga Masiva de Saldos</CardTitle>
                            <CardDescription>Carga múltiples saldos desde un archivo Excel</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>1. Descarga la plantilla Excel</Label>
                                <Button variant="outline" onClick={handleDownloadTemplate}>
                                    <Download className="h-4 w-4 mr-2" />
                                    Descargar Plantilla
                                </Button>
                            </div>

                            <div className="space-y-2">
                                <Label>2. Llena los datos requeridos</Label>
                                <ul className="text-sm text-muted-foreground list-disc list-inside">
                                    <li><strong>ID del Empleado</strong> (obligatorio) - Identificador único del empleado</li>
                                    <li><strong>Días Otorgados</strong> (obligatorio) - Total de días de vacaciones que le corresponden</li>
                                    <li><strong>Días Tomados</strong> (opcional, default: 0) - Días ya disfrutados</li>
                                    <li><strong>Días Programados</strong> (opcional, default: 0) - Días ya solicitados/aprobados</li>
                                    <li><strong>Motivo</strong> (obligatorio, mínimo 10 caracteres) - Razón del ajuste o carga inicial</li>
                                </ul>
                            </div>

                            <div className="space-y-2">
                                <Label>3. Sube el archivo completado</Label>
                                <Input
                                    type="file"
                                    accept=".xlsx,.xls"
                                    onChange={handleFileUpload}
                                />
                            </div>

                            {showBulkPreview && (
                                <Card>
                                    <CardHeader>
                                        <CardTitle className="text-lg">Vista Previa</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex gap-4">
                                            <Badge variant="default" className="flex items-center gap-1">
                                                <CheckCircle className="h-3 w-3" />
                                                {bulkData.length} registros válidos
                                            </Badge>
                                            {bulkErrors.length > 0 && (
                                                <Badge variant="destructive" className="flex items-center gap-1">
                                                    <XCircle className="h-3 w-3" />
                                                    {bulkErrors.length} errores
                                                </Badge>
                                            )}
                                        </div>

                                        {bulkErrors.length > 0 && (
                                            <Alert variant="destructive">
                                                <AlertCircle className="h-4 w-4" />
                                                <AlertDescription>
                                                    <p className="font-semibold mb-2">Errores detectados:</p>
                                                    <ul className="text-sm space-y-1">
                                                        {bulkErrors.slice(0, 5).map((err, idx) => (
                                                            <li key={idx}>• {err.employeeId}: {err.error}</li>
                                                        ))}
                                                        {bulkErrors.length > 5 && (
                                                            <li>... y {bulkErrors.length - 5} más</li>
                                                        )}
                                                    </ul>
                                                </AlertDescription>
                                            </Alert>
                                        )}

                                        <Button
                                            onClick={handleBulkLoad}
                                            disabled={loading || bulkData.length === 0}
                                            className="w-full"
                                        >
                                            <Upload className="h-4 w-4 mr-2" />
                                            Procesar Carga ({bulkData.length} registros)
                                        </Button>
                                    </CardContent>
                                </Card>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Historial de Ajustes</CardTitle>
                            <CardDescription>Próximamente: Ver todos los ajustes realizados</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Esta funcionalidad estará disponible próximamente.</p>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Adjust Balance Dialog */}
            <Dialog open={showAdjustDialog} onOpenChange={setShowAdjustDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Ajustar Saldo de Vacaciones</DialogTitle>
                        <DialogDescription>
                            {selectedEmployee?.fullName} • Saldo actual: {employeeBalance?.daysAvailable || 0} días
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
                                    Agregar días
                                </Button>
                                <Button
                                    variant={adjustmentType === 'subtract' ? 'default' : 'outline'}
                                    onClick={() => setAdjustmentType('subtract')}
                                    className="flex-1"
                                >
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
                                onChange={(e) => setAdjustmentDays(parseInt(e.target.value) || 0)}
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

                        {employeeBalance && (
                            <Alert>
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>
                                    Nuevo saldo: {
                                        employeeBalance.daysAvailable +
                                        (adjustmentType === 'add' ? adjustmentDays : -adjustmentDays)
                                    } días
                                </AlertDescription>
                            </Alert>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAdjustDialog(false)}>
                            Cancelar
                        </Button>
                        <Button onClick={handleAdjustBalance} disabled={loading}>
                            Confirmar Ajuste
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* History Dialog */}
            <Dialog open={showHistoryDialog} onOpenChange={setShowHistoryDialog}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle>Historial de Movimientos</DialogTitle>
                        <DialogDescription>
                            {selectedEmployee?.fullName}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {employeeBalance?.movements && employeeBalance.movements.length > 0 ? (
                            <div className="space-y-2">
                                {employeeBalance.movements.slice().reverse().map((movement) => (
                                    <Card key={movement.id}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <p className="font-semibold">
                                                        {movement.type === 'adjustment' && 'Ajuste Manual'}
                                                        {movement.type === 'taken' && 'Días Tomados'}
                                                        {movement.type === 'scheduled' && 'Días Programados'}
                                                        {movement.type === 'cancelled' && 'Cancelación'}
                                                        {movement.type === 'reset' && 'Renovación Anual'}
                                                    </p>
                                                    <p className="text-sm text-muted-foreground">{movement.description}</p>
                                                    <p className="text-xs text-muted-foreground mt-1">
                                                        {new Date(movement.date).toLocaleDateString('es-MX', {
                                                            year: 'numeric',
                                                            month: 'long',
                                                            day: 'numeric'
                                                        })}
                                                    </p>
                                                </div>
                                                <Badge variant={movement.days > 0 ? 'default' : 'destructive'}>
                                                    {movement.days > 0 ? '+' : ''}{movement.days} días
                                                </Badge>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-center py-8">No hay movimientos registrados</p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
