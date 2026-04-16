
'use client';

import { useState } from 'react';
import SiteLayout from '@/components/site-layout';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, ArrowLeft, Save, Clock } from 'lucide-react';
import Link from 'next/link';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { AvatarUpload } from '@/components/ui/avatar-upload';

import { Button } from '@/components/ui/button';
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { createEmployee } from '@/firebase/actions/employee-actions';
import { createNewUser } from '@/firebase/admin-actions';
import { useFirebase, useMemoFirebase, initializeFirebase } from '@/firebase';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where } from 'firebase/firestore';
import type { Department, Position, CustomShift, Employee, Location } from '@/lib/types';

// Schema Validation - departmentId es opcional porque se auto-llena desde el puesto
const employeeSchema = z.object({
    fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Correo electrónico inválido'),
    positionId: z.string().min(1, 'El puesto es requerido'),
    employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
    shiftId: z.string().min(1, 'El turno es requerido'),
    locationId: z.string().min(1, 'La ubicación es requerida'), // Added locationId
    hireDate: z.date({ required_error: 'La fecha de ingreso es requerida' }),
    managerId: z.string().optional(),
    rfc: z.string().min(12, 'RFC inválido').max(13, 'RFC inválido').optional().or(z.literal('')),
    curp: z.string().length(18, 'CURP debe tener 18 caracteres').optional().or(z.literal('')),
    nss: z.string().length(11, 'NSS debe tener 11 dígitos').optional().or(z.literal('')),
    allowTimeForTime: z.boolean().optional(),
    employeeId: z.string().optional().or(z.literal('')), // Attendance System ID
    legalEntity: z.string().optional(),
    avatarFile: z.any().optional(), // Archivo para la foto de perfil
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export default function NewEmployeePage() {
    const router = useRouter();
    const { toast } = useToast();
    const { firestore, isUserLoading } = useFirebase();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch Departments
    const departmentsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'departments'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: departments, isLoading: isLoadingDepts } = useCollection<Department>(departmentsQuery);

    // Fetch Positions
    const positionsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'positions'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: positions, isLoading: isLoadingPositions } = useCollection<Position>(positionsQuery);

    // Fetch Shifts
    const shiftsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'shifts'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: shifts, isLoading: isLoadingShifts } = useCollection<CustomShift>(shiftsQuery);

    // Fetch Locations (Added)
    const locationsQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'locations'), where('isActive', '==', true));
    }, [firestore, isUserLoading]);

    const { data: locations, isLoading: isLoadingLocations } = useCollection<Location>(locationsQuery);

    // Fetch Managers (employees who can be assigned as managers)
    const managersQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        return query(collection(firestore, 'employees'), where('status', '==', 'active'));
    }, [firestore, isUserLoading]);

    const { data: managers, isLoading: isLoadingManagers } = useCollection<Employee>(managersQuery);

    const form = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema),
        defaultValues: {
            fullName: '',
            email: '',
            positionId: '',
            employmentType: 'full_time',
            shiftId: '',
            locationId: '', // Added default value
            managerId: '',
            rfc: '',
            curp: '',
            nss: '',
            allowTimeForTime: false,
            employeeId: '',
            legalEntity: '',
        },
    });

    // Watch positionId to auto-fill department
    const selectedPositionId = form.watch('positionId');
    const selectedPosition = positions?.find(p => p.id === selectedPositionId);
    const autoDepartment = selectedPosition?.departmentId
        ? departments?.find(d => d.id === selectedPosition.departmentId)
        : null;

    async function onSubmit(data: EmployeeFormValues) {
        setIsSubmitting(true);
        try {
            // Find the selected position and get department from it
            const selectedPos = positions?.find(p => p.id === data.positionId);
            const selectedDept = selectedPos?.departmentId
                ? departments?.find(d => d.id === selectedPos.departmentId)
                : null;
            const selectedShift = shifts?.find(s => s.id === data.shiftId);

            // 1. Create System User First (Sync: Employee -> User)
            // We use the email and name provided. Department name is derived.
            // Role defaults to 'Member' as specific permissions are handled via Roles later.
            let userId = '';
            try {
                const userResult = await createNewUser({
                    fullName: data.fullName,
                    email: data.email,
                    department: selectedDept?.name || selectedPos?.department || '',
                    role: 'Member'
                });

                if (userResult.success && userResult.uid) {
                    userId = userResult.uid;
                } else {
                    // Fallback if user creation fails (e.g. email exists)? 
                    // For now we assume success or throw. 
                    // If backend simulation fails, we might want to throw to prevent orphan employee?
                    // Or we proceed with a generated ID if it's acceptable (but user asked for sync).
                    throw new Error("No se pudo crear el usuario del sistema.");
                }
            } catch (userError) {
                console.error("Error creating system user:", userError);
                throw new Error("Error al crear la cuenta de usuario: " + (userError as Error).message);
            }

            // 2. Subir avatar si existe
            let avatarUrl: string | undefined = undefined;
            if (data.avatarFile) {
                try {
                    const { storage } = initializeFirebase();
                    // Usamos el ID del usuario como nombre de archivo para estructurarlo
                    const avatarRef = ref(storage, `employees/${userId}/avatar`);
                    await uploadBytes(avatarRef, data.avatarFile);
                    avatarUrl = await getDownloadURL(avatarRef);
                } catch (uploadError) {
                    console.error("Error subiendo foto de perfil:", uploadError);
                    toast({
                        title: "Aviso",
                        description: "El empleado se creó en sistema, pero no se pudo subir la foto.",
                    });
                }
            }

            // 3. Create Employee Record using the User ID
            const result = await createEmployee(userId, {
                fullName: data.fullName,
                email: data.email,
                department: selectedDept?.name || selectedPos?.department || '',
                departmentId: selectedPos?.departmentId || '',
                positionId: data.positionId,
                positionTitle: selectedPos?.name || data.positionId,
                employmentType: data.employmentType,
                shiftType: selectedShift?.type || 'diurnal',
                shiftId: data.shiftId,
                locationId: data.locationId,
                hireDate: data.hireDate instanceof Date
                    ? data.hireDate.toISOString().split('T')[0]
                    : String(data.hireDate).split('T')[0],
                managerId: data.managerId || undefined,
                rfc_curp: `${data.rfc || ''} ${data.curp || ''}`.trim() || undefined,
                nss: data.nss || undefined,
                allowTimeForTime: data.allowTimeForTime || false,
                employeeId: data.employeeId || undefined,
                legalEntity: data.legalEntity || undefined,
                avatarUrl: avatarUrl,
            });

            if (result.success) {
                toast({
                    title: "Empleado creado",
                    description: "El empleado ha sido registrado exitosamente.",
                });
                router.push('/hcm/employees');
            } else {
                toast({
                    title: "Error",
                    description: result.error || "No se pudo crear el empleado.",
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error(error);
            toast({
                title: "Error",
                description: "Ocurrió un error inesperado.",
                variant: "destructive",
            });
        } finally {
            setIsSubmitting(false);
        }
    }

    const isLoadingCatalogs = isLoadingDepts || isLoadingPositions || isLoadingShifts || isLoadingManagers;

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center gap-4 p-4 sm:p-6">
                    <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                        <Link href="/hcm/employees">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">Nuevo Empleado</h1>
                        <p className="text-muted-foreground">Registrar un nuevo colaborador en el sistema</p>
                    </div>
                </header>
                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    {isLoadingCatalogs ? (
                        <div className="space-y-6">
                            <Card>
                                <CardHeader>
                                    <Skeleton className="h-6 w-48" />
                                    <Skeleton className="h-4 w-64" />
                                </CardHeader>
                                <CardContent className="grid gap-6 md:grid-cols-2">
                                    {[...Array(8)].map((_, i) => (
                                        <div key={i} className="space-y-2">
                                            <Skeleton className="h-4 w-24" />
                                            <Skeleton className="h-10 w-full" />
                                        </div>
                                    ))}
                                </CardContent>
                            </Card>
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
                                <div className="grid gap-6 md:grid-cols-2">

                                    {/* Personal Information */}
                                    <Card className="md:col-span-2">
                                        <CardHeader>
                                            <CardTitle>Información Personal y Laboral</CardTitle>
                                            <CardDescription>Datos básicos del empleado y su posición</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-6 md:grid-cols-2">
                                            <div className="md:col-span-2 flex justify-center py-4">
                                                <FormField
                                                    control={form.control}
                                                    name="avatarFile"
                                                    render={({ field }) => (
                                                        <FormItem>
                                                            <FormControl>
                                                                <AvatarUpload 
                                                                    value={field.value} 
                                                                    onChange={field.onChange} 
                                                                />
                                                            </FormControl>
                                                            <FormMessage />
                                                        </FormItem>
                                                    )}
                                                />
                                            </div>

                                            <FormField
                                                control={form.control}
                                                name="fullName"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Nombre Completo</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Juan Pérez" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="email"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Correo Electrónico</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="juan.perez@empresa.com" type="email" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="positionId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Puesto / Cargo</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar puesto" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {positions && positions.length > 0 ? (
                                                                    positions.map((pos) => (
                                                                        <SelectItem key={pos.id} value={pos.id}>
                                                                            {pos.name}
                                                                        </SelectItem>
                                                                    ))
                                                                ) : (
                                                                    <SelectItem value="_empty" disabled>
                                                                        No hay puestos disponibles
                                                                    </SelectItem>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            <Link href="/hcm/admin/positions" className="text-primary hover:underline text-xs">
                                                                Administrar puestos
                                                            </Link>
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            {/* Departamento - Auto-llenado desde el puesto seleccionado */}
                                            <FormItem>
                                                <FormLabel>Departamento</FormLabel>
                                                <FormControl>
                                                    <Input
                                                        value={autoDepartment?.name || selectedPosition?.department || 'Selecciona un puesto primero'}
                                                        disabled
                                                        className="bg-muted"
                                                    />
                                                </FormControl>
                                                <FormDescription>
                                                    Se asigna automáticamente según el puesto seleccionado
                                                </FormDescription>
                                            </FormItem>

                                            <FormField
                                                control={form.control}
                                                name="employmentType"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Tipo de Contrato</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar tipo" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="full_time">Tiempo Completo</SelectItem>
                                                                <SelectItem value="part_time">Medio Tiempo</SelectItem>
                                                                <SelectItem value="contractor">Contratista</SelectItem>
                                                                <SelectItem value="intern">Practicante</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="shiftId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Turno</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar turno" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {shifts && shifts.length > 0 ? (
                                                                    shifts.map((shift) => (
                                                                        <SelectItem key={shift.id} value={shift.id}>
                                                                            {shift.name} ({shift.startTime} - {shift.endTime})
                                                                        </SelectItem>
                                                                    ))
                                                                ) : (
                                                                    <SelectItem value="_empty" disabled>
                                                                        No hay turnos disponibles
                                                                    </SelectItem>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            <Link href="/hcm/admin/shifts" className="text-primary hover:underline text-xs">
                                                                Administrar turnos
                                                            </Link>
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="locationId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Ubicación</FormLabel>
                                                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar ubicación" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                {locations && locations.length > 0 ? (
                                                                    locations.map((loc) => (
                                                                        <SelectItem key={loc.id} value={loc.id}>
                                                                            {loc.name}
                                                                        </SelectItem>
                                                                    ))
                                                                ) : (
                                                                    <SelectItem value="_empty" disabled>
                                                                        No hay ubicaciones disponibles
                                                                    </SelectItem>
                                                                )}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            Determina los días festivos y reglas locales
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="employeeId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Numero Empleado (NomiPaQ)</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="Ej. 1004" {...field} />
                                                        </FormControl>
                                                        <FormDescription>
                                                            ID numérico utilizado en el NomiPaQ (opcional)
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="managerId"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Jefe Directo</FormLabel>
                                                        <Select
                                                            onValueChange={(value) => field.onChange(value === '_none' ? '' : value)}
                                                            defaultValue={field.value || '_none'}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar jefe (opcional)" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="_none">Sin jefe asignado</SelectItem>
                                                                {managers && managers.length > 0 ? (
                                                                    managers.map((manager) => (
                                                                        <SelectItem key={manager.id} value={manager.id}>
                                                                            {manager.fullName} - {manager.positionTitle}
                                                                        </SelectItem>
                                                                    ))
                                                                ) : null}
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            El jefe directo aparecerá en el organigrama
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="legalEntity"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Razón Social (Opcional)</FormLabel>
                                                        <Select 
                                                            onValueChange={(value) => field.onChange(value === '_none' ? '' : value)} 
                                                            defaultValue={field.value || '_none'}
                                                        >
                                                            <FormControl>
                                                                <SelectTrigger>
                                                                    <SelectValue placeholder="Seleccionar empresa" />
                                                                </SelectTrigger>
                                                            </FormControl>
                                                            <SelectContent>
                                                                <SelectItem value="_none">Sin especificar</SelectItem>
                                                                <SelectItem value="STF Latin America">STF Latin America</SelectItem>
                                                                <SelectItem value="Stuffactory">Stuffactory</SelectItem>
                                                                <SelectItem value="Derechos de Autor">Derechos de Autor</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                        <FormDescription>
                                                            Útil para filtros de reportes y exportación
                                                        </FormDescription>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />

                                            <FormField
                                                control={form.control}
                                                name="hireDate"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>Fecha de Ingreso</FormLabel>
                                                        <FormControl>
                                                            <Input
                                                                type="date"
                                                                value={field.value instanceof Date
                                                                    ? field.value.toISOString().split('T')[0]
                                                                    : field.value || ''}
                                                                onChange={(e) => {
                                                                    const dateValue = e.target.value
                                                                        ? new Date(e.target.value + 'T12:00:00')
                                                                        : undefined;
                                                                    field.onChange(dateValue);
                                                                }}
                                                            />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                        </CardContent>
                                    </Card>

                                    {/* Legal & Fiscal */}
                                    <Card>
                                        <CardHeader>
                                            <CardTitle>Información Legal y Fiscal</CardTitle>
                                            <CardDescription>Datos requeridos por el SAT e IMSS</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <FormField
                                                control={form.control}
                                                name="rfc"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>RFC</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="XAXX010101000" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="curp"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>CURP</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="18 Caracteres" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="nss"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>NSS (IMSS)</FormLabel>
                                                        <FormControl>
                                                            <Input placeholder="11 Dígitos" {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                    </FormItem>
                                                )}
                                            />
                                            <FormField
                                                control={form.control}
                                                name="allowTimeForTime"
                                                render={({ field }) => (
                                                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                                                        <FormControl>
                                                            <Checkbox
                                                                checked={field.value}
                                                                onCheckedChange={field.onChange}
                                                            />
                                                        </FormControl>
                                                        <div className="space-y-1 leading-none">
                                                            <FormLabel className="flex items-center gap-2">
                                                                <Clock className="h-4 w-4" />
                                                                Permitir Tiempo por Tiempo
                                                            </FormLabel>
                                                            <FormDescription>
                                                                Permite compensar tiempo extra trabajado en la bolsa de horas (solo RH puede modificar)
                                                            </FormDescription>
                                                        </div>
                                                    </FormItem>
                                                )}
                                            />
                                        </CardContent>
                                    </Card>

                                </div>

                                <div className="flex justify-end gap-4">
                                    <Button variant="outline" type="button" onClick={() => router.back()}>
                                        Cancelar
                                    </Button>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        <Save className="mr-2 h-4 w-4" />
                                        Guardar Empleado
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    )}
                </main>
            </div>
        </SiteLayout>
    );
}
