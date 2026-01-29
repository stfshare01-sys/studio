
'use client';

import { useState, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, orderBy, addDoc } from 'firebase/firestore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    ArrowLeft,
    Plus,
    DollarSign,
    Calendar,
    Loader2,
    History,
    Info,
} from 'lucide-react';

import type { Employee, Compensation } from '@/lib/types';
import { formatCurrency, calculateVacationDays, calculateYearsOfService } from '@/lib/hcm-utils';

export default function EmployeeCompensationPage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { toast } = useToast();
    const { id: employeeId } = use(params);
    const { firestore, user, isUserLoading } = useFirebase();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [newCompensation, setNewCompensation] = useState({
        salaryDaily: '',
        vacationPremium: '25',
        aguinaldoDays: '15',
        savingsFundPercentage: '',
        foodVouchersDaily: '',
        effectiveDate: format(new Date(), 'yyyy-MM-dd'),
    });

    // Fetch Employee Details
    const employeeRef = useMemoFirebase(() => {
        return firestore && !isUserLoading ? doc(firestore, 'employees', employeeId) : null;
    }, [firestore, isUserLoading, employeeId]);

    const { data: employee, isLoading: isLoadingEmployee } = useDoc<Employee>(employeeRef);

    // Fetch Compensation History
    const compensationQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(
            collection(firestore, 'compensation'),
            where('employeeId', '==', employeeId),
            orderBy('effectiveDate', 'desc')
        );
    }, [firestore, isUserLoading, employeeId]);

    const { data: compensations, isLoading: isLoadingComp } = useCollection<Compensation>(compensationQuery);

    // Calculate preview values (only informational, no SDI calculations)
    const calculatePreview = () => {
        const salaryDaily = parseFloat(newCompensation.salaryDaily) || 0;
        if (salaryDaily === 0) {
            return { salaryMonthly: 0 };
        }
        const salaryMonthly = Math.round(salaryDaily * 30.4 * 100) / 100;
        return { salaryMonthly };
    };

    const preview = calculatePreview();

    const handleCreateCompensation = async () => {
        if (!firestore || !user || !employee) return;

        const salaryDaily = parseFloat(newCompensation.salaryDaily);
        if (!salaryDaily || salaryDaily <= 0) {
            toast({
                title: 'Error',
                description: 'El salario diario es requerido y debe ser mayor a 0.',
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const yearsOfService = calculateYearsOfService(employee.hireDate);
            const vacationDays = calculateVacationDays(yearsOfService);
            const vacationPremium = parseFloat(newCompensation.vacationPremium) / 100 || 0.25;
            const aguinaldoDays = parseInt(newCompensation.aguinaldoDays) || 15;

            const now = new Date().toISOString();

            const compensationData: Omit<Compensation, 'id'> = {
                employeeId,
                salaryDaily,
                salaryMonthly: Math.round(salaryDaily * 30.4 * 100) / 100,
                vacationDays,
                vacationPremium,
                aguinaldoDays,
                savingsFundPercentage: newCompensation.savingsFundPercentage
                    ? parseFloat(newCompensation.savingsFundPercentage)
                    : undefined,
                foodVouchersDaily: newCompensation.foodVouchersDaily
                    ? parseFloat(newCompensation.foodVouchersDaily)
                    : undefined,
                effectiveDate: new Date(newCompensation.effectiveDate).toISOString(),
                createdAt: now,
                updatedAt: now,
                createdById: user.uid,
            };

            await addDoc(collection(firestore, 'compensation'), compensationData);

            toast({
                title: 'Compensacion creada',
                description: 'El nuevo registro de compensacion ha sido guardado.',
            });

            setIsDialogOpen(false);
            setNewCompensation({
                salaryDaily: '',
                vacationPremium: '25',
                aguinaldoDays: '15',
                savingsFundPercentage: '',
                foodVouchersDaily: '',
                effectiveDate: format(new Date(), 'yyyy-MM-dd'),
            });
        } catch (error) {
            console.error('Error creating compensation:', error);
            toast({
                title: 'Error',
                description: 'No se pudo crear el registro de compensacion.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoadingEmployee) {
        return (
            <SiteLayout>
                <div className="flex-1 flex-col p-4 sm:p-6">
                    <div className="space-y-6">
                        <Skeleton className="h-10 w-64" />
                        <Skeleton className="h-[400px] w-full" />
                    </div>
                </div>
            </SiteLayout>
        );
    }

    if (!employee) {
        return (
            <SiteLayout>
                <div className="flex-1 flex-col p-4 sm:p-6">
                    <div className="container mx-auto py-12 text-center">
                        <h2 className="text-2xl font-bold">Empleado no encontrado</h2>
                        <p className="text-muted-foreground mb-4">El empleado que buscas no existe.</p>
                        <Button onClick={() => router.push('/hcm/employees')}>Volver al directorio</Button>
                    </div>
                </div>
            </SiteLayout>
        );
    }

    const currentComp = compensations?.[0];
    const yearsOfService = calculateYearsOfService(employee.hireDate);
    const vacationDays = calculateVacationDays(yearsOfService);

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50" asChild>
                            <Link href={`/hcm/employees/${employeeId}`}>
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Compensacion</h1>
                            <p className="text-muted-foreground">{employee.fullName}</p>
                        </div>
                    </div>
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogTrigger asChild>
                            <Button>
                                <Plus className="mr-2 h-4 w-4" />
                                Nuevo Ajuste Salarial
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>Nuevo Registro de Compensacion</DialogTitle>
                                <DialogDescription>
                                    Crear un nuevo ajuste salarial para {employee.fullName}
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <Alert>
                                    <Info className="h-4 w-4" />
                                    <AlertDescription>
                                        Este modulo solo registra informacion salarial. Los calculos de nomina, SDI e impuestos se realizan en el sistema de nomina externo.
                                    </AlertDescription>
                                </Alert>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="salaryDaily">Salario Diario *</Label>
                                        <Input
                                            id="salaryDaily"
                                            type="number"
                                            step="0.01"
                                            value={newCompensation.salaryDaily}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, salaryDaily: e.target.value }))}
                                            placeholder="0.00"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="effectiveDate">Fecha Efectiva *</Label>
                                        <Input
                                            id="effectiveDate"
                                            type="date"
                                            value={newCompensation.effectiveDate}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, effectiveDate: e.target.value }))}
                                        />
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="vacationPremium">Prima Vacacional (%)</Label>
                                        <Input
                                            id="vacationPremium"
                                            type="number"
                                            min="25"
                                            value={newCompensation.vacationPremium}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, vacationPremium: e.target.value }))}
                                            placeholder="25"
                                        />
                                        <p className="text-xs text-muted-foreground">Minimo 25% segun LFT</p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="aguinaldoDays">Dias de Aguinaldo</Label>
                                        <Input
                                            id="aguinaldoDays"
                                            type="number"
                                            min="15"
                                            value={newCompensation.aguinaldoDays}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, aguinaldoDays: e.target.value }))}
                                            placeholder="15"
                                        />
                                        <p className="text-xs text-muted-foreground">Minimo 15 dias segun LFT</p>
                                    </div>
                                </div>

                                <Separator />

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="savingsFund">Fondo de Ahorro (%)</Label>
                                        <Input
                                            id="savingsFund"
                                            type="number"
                                            step="0.1"
                                            value={newCompensation.savingsFundPercentage}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, savingsFundPercentage: e.target.value }))}
                                            placeholder="Opcional"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="foodVouchers">Vales de Despensa (Diario)</Label>
                                        <Input
                                            id="foodVouchers"
                                            type="number"
                                            step="0.01"
                                            value={newCompensation.foodVouchersDaily}
                                            onChange={(e) => setNewCompensation(prev => ({ ...prev, foodVouchersDaily: e.target.value }))}
                                            placeholder="Opcional"
                                        />
                                    </div>
                                </div>

                                {/* Preview informativo */}
                                {parseFloat(newCompensation.salaryDaily) > 0 && (
                                    <>
                                        <Separator />
                                        <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                                            <h4 className="font-medium">Vista Previa</h4>
                                            <div className="grid grid-cols-2 gap-4 text-sm">
                                                <div>
                                                    <span className="text-muted-foreground">Salario Mensual (aprox):</span>
                                                    <span className="ml-2 font-medium">{formatCurrency(preview.salaryMonthly)}</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Dias Vacaciones:</span>
                                                    <span className="ml-2 font-medium">{vacationDays} dias</span>
                                                </div>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleCreateCompensation} disabled={isSaving}>
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : (
                                        'Crear Registro'
                                    )}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
                    {/* Aviso informativo */}
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                            Este modulo registra la informacion salarial para referencia. Los calculos de nomina (SDI, impuestos, deducciones) se realizan en el sistema de nomina al exportar la prenomina.
                        </AlertDescription>
                    </Alert>

                    {/* Resumen Actual */}
                    <div className="grid gap-4 md:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Salario Diario</CardTitle>
                                <DollarSign className="h-4 w-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {currentComp ? formatCurrency(currentComp.salaryDaily) : '-'}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Mensual: {currentComp ? formatCurrency(currentComp.salaryMonthly || currentComp.salaryDaily * 30.4) : '-'}
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Vacaciones</CardTitle>
                                <Calendar className="h-4 w-4 text-blue-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-blue-600">
                                    {vacationDays} dias
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {yearsOfService} año{yearsOfService !== 1 ? 's' : ''} de antiguedad
                                </p>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                                <CardTitle className="text-sm font-medium">Aguinaldo</CardTitle>
                                <History className="h-4 w-4 text-orange-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold text-orange-600">
                                    {currentComp?.aguinaldoDays || '15'} dias
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    Prima: {currentComp ? (currentComp.vacationPremium * 100).toFixed(0) : '25'}%
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Historial */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <History className="h-5 w-5" />
                                Historial de Compensacion
                            </CardTitle>
                            <CardDescription>
                                Registro historico de ajustes salariales
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Fecha Efectiva</TableHead>
                                        <TableHead className="text-right">Salario Diario</TableHead>
                                        <TableHead className="text-right">Salario Mensual</TableHead>
                                        <TableHead className="text-right">Vacaciones</TableHead>
                                        <TableHead className="text-right">Aguinaldo</TableHead>
                                        <TableHead>Estado</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoadingComp ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8">
                                                Cargando historial...
                                            </TableCell>
                                        </TableRow>
                                    ) : compensations && compensations.length > 0 ? (
                                        compensations.map((comp, index) => (
                                            <TableRow key={comp.id}>
                                                <TableCell>
                                                    {format(new Date(comp.effectiveDate), 'PPP', { locale: es })}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(comp.salaryDaily)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {formatCurrency(comp.salaryMonthly || comp.salaryDaily * 30.4)}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {comp.vacationDays} dias
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {comp.aguinaldoDays} dias
                                                </TableCell>
                                                <TableCell>
                                                    {index === 0 ? (
                                                        <Badge className="bg-green-100 text-green-800">Vigente</Badge>
                                                    ) : (
                                                        <Badge variant="secondary">Historico</Badge>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                No hay registros de compensacion
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
