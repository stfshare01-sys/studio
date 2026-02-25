
'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, query, where, updateDoc, deleteField } from 'firebase/firestore';
import { format } from 'date-fns';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
    ArrowLeft,
    Save,
    Loader2,
    Building2,
    User,
    Briefcase,
    CreditCard,
    Calendar,
    MapPin,
    Clock,
} from 'lucide-react';

import type { Employee, Location, Position, CustomShift, User as UserType, Department } from '@/lib/types';

export default function EditEmployeePage({ params }: { params: Promise<{ id: string }> }) {
    const router = useRouter();
    const { toast } = useToast();
    const { id: employeeId } = use(params);
    const { firestore, user, isUserLoading } = useFirebase();

    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState<Partial<Employee>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // Fetch Employee Details
    const employeeRef = useMemoFirebase(() => {
        return firestore && !isUserLoading ? doc(firestore, 'employees', employeeId) : null;
    }, [firestore, isUserLoading, employeeId]);

    const { data: employee, isLoading: isLoadingEmployee } = useDoc<Employee>(employeeRef);

    // Fetch Locations
    const locationsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'locations'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: locations } = useCollection<Location>(locationsQuery);

    // Fetch Positions
    const positionsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'positions'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: positions } = useCollection<Position>(positionsQuery);

    // Fetch Departments
    const departmentsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'departments'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: departments } = useCollection<Department>(departmentsQuery);

    // Fetch Shifts
    const shiftsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'shifts'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: shifts } = useCollection<CustomShift>(shiftsQuery);

    // Fetch Managers (for assigning direct manager)
    const managersQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'employees'), where('status', '==', 'active'));
    }, [firestore, isUserLoading]);

    const { data: managers } = useCollection<Employee>(managersQuery);

    // Initialize form data when employee loads
    useEffect(() => {
        if (employee) {
            setFormData({
                fullName: employee.fullName,
                email: employee.email,
                department: employee.department,
                positionId: (employee as any).positionId,
                positionTitle: employee.positionTitle,
                employmentType: employee.employmentType,
                shiftType: employee.shiftType,
                customShiftId: employee.customShiftId,
                hireDate: employee.hireDate?.split('T')[0] || '',
                directManagerId: employee.directManagerId,
                rfc_curp: employee.rfc_curp,
                nss: employee.nss,
                clabe: employee.clabe,
                costCenter: employee.costCenter,
                locationId: employee.locationId,
                allowTimeForTime: employee.allowTimeForTime || false,
                employeeId: employee.employeeId,
            });
        }
    }, [employee]);

    const handleInputChange = (field: keyof Employee, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        setHasChanges(true);
    };

    const handleSave = async () => {
        if (!firestore || !employeeId) return;

        setIsSaving(true);
        try {
            const employeeDocRef = doc(firestore, 'employees', employeeId);

            // Build update object, handling undefined values properly for Firestore
            const updateData: Record<string, any> = {
                updatedAt: new Date().toISOString()
            };

            // Add all form fields, converting undefined to deleteField()
            Object.entries(formData).forEach(([key, value]) => {
                if (value === undefined) {
                    // Use deleteField() to remove the field from Firestore
                    updateData[key] = deleteField();
                } else {
                    updateData[key] = value;
                }
            });

            await updateDoc(employeeDocRef, updateData);

            // Sync key fields to the users collection (for workflows, requests, etc.)
            // The employee's uid links to their users document
            const employeeUid = employee?.userId;
            if (employeeUid) {
                const userDocRef = doc(firestore, 'users', employeeUid);
                const userSyncData: Record<string, any> = {
                    updatedAt: new Date().toISOString(),
                };
                if (formData.fullName !== undefined) userSyncData.fullName = formData.fullName;
                if (formData.email !== undefined) userSyncData.email = formData.email;
                if (formData.department !== undefined) userSyncData.department = formData.department;
                // Sync directManagerId → managerId in users collection
                if (formData.directManagerId !== undefined) {
                    userSyncData.managerId = formData.directManagerId || deleteField();
                }
                try {
                    await updateDoc(userDocRef, userSyncData);
                } catch (syncError) {
                    console.warn('Could not sync to users collection:', syncError);
                }
            }

            toast({
                title: 'Empleado actualizado',
                description: 'Los cambios han sido guardados correctamente.',
            });

            setHasChanges(false);
            router.push(`/hcm/employees/${employeeId}`);
        } catch (error) {
            console.error('Error updating employee:', error);
            toast({
                title: 'Error',
                description: 'No se pudieron guardar los cambios.',
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
                            <h1 className="text-2xl font-bold tracking-tight">Editar Empleado</h1>
                            <p className="text-muted-foreground">{employee.fullName}</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => router.back()}>
                            Cancelar
                        </Button>
                        <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                            {isSaving ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Guardando...
                                </>
                            ) : (
                                <>
                                    <Save className="mr-2 h-4 w-4" />
                                    Guardar Cambios
                                </>
                            )}
                        </Button>
                    </div>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">
                    {/* Información Personal */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5" />
                                Informacion Personal
                            </CardTitle>
                            <CardDescription>Datos basicos del empleado</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="fullName">Nombre Completo</Label>
                                    <Input
                                        id="fullName"
                                        value={formData.fullName || ''}
                                        onChange={(e) => handleInputChange('fullName', e.target.value)}
                                        placeholder="Nombre completo"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Correo Electronico</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={formData.email || ''}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="correo@empresa.com"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Información Laboral */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Briefcase className="h-5 w-5" />
                                Informacion Laboral
                            </CardTitle>
                            <CardDescription>Puesto, departamento y tipo de contrato</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Puesto / Cargo</Label>
                                    <Select
                                        value={(formData as any).positionId || 'none'}
                                        onValueChange={(v) => {
                                            const selectedPos = positions?.find(p => p.id === v);
                                            handleInputChange('positionId' as any, v === 'none' ? undefined : v);
                                            handleInputChange('positionTitle', selectedPos?.name || '');
                                            // Auto-fill department from position
                                            if (selectedPos?.departmentId) {
                                                const dept = departments?.find(d => d.id === selectedPos.departmentId);
                                                if (dept) {
                                                    handleInputChange('department', dept.name);
                                                }
                                            }
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar puesto" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin puesto asignado</SelectItem>
                                            {positions?.map((pos) => (
                                                <SelectItem key={pos.id} value={pos.id}>
                                                    {pos.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Departamento</Label>
                                    <Input
                                        value={formData.department || 'Selecciona un puesto'}
                                        disabled
                                        className="bg-muted"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Se asigna automáticamente según el puesto seleccionado
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Tipo de Contrato</Label>
                                    <Select
                                        value={formData.employmentType}
                                        onValueChange={(v) => handleInputChange('employmentType', v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar tipo" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="full_time">Tiempo Completo</SelectItem>
                                            <SelectItem value="part_time">Medio Tiempo</SelectItem>
                                            <SelectItem value="contractor">Contratista</SelectItem>
                                            <SelectItem value="intern">Practicante</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Turno Asignado</Label>
                                    <Select
                                        value={formData.customShiftId || 'none'}
                                        onValueChange={(v) => handleInputChange('customShiftId', v === 'none' ? undefined : v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar turno..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin turno asignado</SelectItem>
                                            {shifts?.map((shift) => (
                                                <SelectItem key={shift.id} value={shift.id}>
                                                    {shift.code} - {shift.name} ({shift.startTime}-{shift.endTime})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Define los días laborales y de descanso para cálculo de vacaciones
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="hireDate">Fecha de Ingreso</Label>
                                    <Input
                                        id="hireDate"
                                        type="date"
                                        value={formData.hireDate || ''}
                                        onChange={(e) => handleInputChange('hireDate', e.target.value)}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="employeeId">ID Reloj Checador (Opcional)</Label>
                                    <Input
                                        id="employeeId"
                                        value={formData.employeeId || ''}
                                        onChange={(e) => handleInputChange('employeeId', e.target.value)}
                                        placeholder="Ej. 1004"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        ID númérico utilizado en el reloj biométrico ZKTeco
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Jefe Directo</Label>
                                    <Select
                                        value={formData.directManagerId || 'none'}
                                        onValueChange={(v) => handleInputChange('directManagerId', v === 'none' ? undefined : v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar jefe" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin jefe asignado</SelectItem>
                                            {managers?.filter(m => m.id !== employeeId).map((manager) => (
                                                <SelectItem key={manager.id} value={manager.id}>
                                                    {manager.fullName} - {manager.positionTitle}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                            </div>
                        </CardContent>
                    </Card>

                    {/* Ubicación */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5" />
                                Ubicacion y Centro de Costos
                            </CardTitle>
                            <CardDescription>Asignacion de ubicacion y centro de costos contable</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Ubicación</Label>
                                    <Select
                                        value={formData.locationId || 'none'}
                                        onValueChange={(v) => handleInputChange('locationId', v === 'none' ? undefined : v)}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Seleccionar ubicación" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="none">Sin ubicación asignada</SelectItem>
                                            {locations?.map((location) => (
                                                <SelectItem key={location.id} value={location.id}>
                                                    {location.name} ({location.code})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="costCenter">Centro de Costos</Label>
                                    <Input
                                        id="costCenter"
                                        value={formData.costCenter || ''}
                                        onChange={(e) => handleInputChange('costCenter', e.target.value)}
                                        placeholder="Ej: CC-001"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Información Fiscal */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <CreditCard className="h-5 w-5" />
                                Informacion Fiscal y Bancaria
                            </CardTitle>
                            <CardDescription>Datos fiscales y de pago (sensibles)</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="rfc_curp">RFC / CURP</Label>
                                    <Input
                                        id="rfc_curp"
                                        value={formData.rfc_curp || ''}
                                        onChange={(e) => handleInputChange('rfc_curp', e.target.value.toUpperCase())}
                                        placeholder="RFC con homoclave"
                                        className="font-mono uppercase"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="nss">Numero de Seguridad Social (NSS)</Label>
                                    <Input
                                        id="nss"
                                        value={formData.nss || ''}
                                        onChange={(e) => handleInputChange('nss', e.target.value)}
                                        placeholder="11 digitos"
                                        maxLength={11}
                                        className="font-mono"
                                    />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                    <Label htmlFor="clabe">CLABE Interbancaria</Label>
                                    <Input
                                        id="clabe"
                                        value={formData.clabe || ''}
                                        onChange={(e) => handleInputChange('clabe', e.target.value)}
                                        placeholder="18 digitos"
                                        maxLength={18}
                                        className="font-mono"
                                    />
                                </div>
                                <div className="space-y-4 md:col-span-2">
                                    <Separator />
                                    <div className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                        <Checkbox
                                            id="allowTimeForTime"
                                            checked={formData.allowTimeForTime || false}
                                            onCheckedChange={(checked) => handleInputChange('allowTimeForTime', checked)}
                                        />
                                        <div className="space-y-1 leading-none">
                                            <Label htmlFor="allowTimeForTime" className="flex items-center gap-2 cursor-pointer">
                                                <Clock className="h-4 w-4" />
                                                Permitir Tiempo por Tiempo
                                            </Label>
                                            <p className="text-sm text-muted-foreground">
                                                Permite compensar tiempo extra trabajado en la bolsa de horas (solo RH puede modificar)
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </div >
        </SiteLayout >
    );
}
