'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar as CalendarIcon, Loader2, ArrowLeft, Save } from 'lucide-react';

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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { useToast } from '@/hooks/use-toast';
import { createEmployee } from '@/firebase/hcm-actions';

// Schema Validation
const employeeSchema = z.object({
    fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Correo electrónico inválido'),
    department: z.string().min(1, 'El departamento es requerido'),
    positionTitle: z.string().min(1, 'El puesto es requerido'),
    employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
    shiftType: z.enum(['diurnal', 'nocturnal', 'mixed']),
    hireDate: z.date({ required_error: 'La fecha de ingreso es requerida' }),
    rfc: z.string().min(12, 'RFC inválido').max(13, 'RFC inválido').optional(),
    curp: z.string().length(18, 'CURP debe tener 18 caracteres').optional(),
    nss: z.string().length(11, 'NSS debe tener 11 dígitos').optional(),
    // Initial Compensation
    salaryDaily: z.string().transform((val) => parseFloat(val)).refine((val) => !isNaN(val) && val > 0, {
        message: 'El salario diario debe ser mayor a 0',
    }),
});

type EmployeeFormValues = z.infer<typeof employeeSchema>;

export default function NewEmployeePage() {
    const router = useRouter();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    const form = useForm<EmployeeFormValues>({
        resolver: zodResolver(employeeSchema),
        defaultValues: {
            fullName: '',
            email: '',
            department: '',
            positionTitle: '',
            employmentType: 'full_time',
            shiftType: 'diurnal',
            salaryDaily: 0,
        },
    });

    async function onSubmit(data: EmployeeFormValues) {
        setIsSubmitting(true);
        try {
            // Create a temporary ID based on email (in production this would be handled differently, likely by Auth)
            const userId = data.email.replace(/[@.]/g, '_');

            const result = await createEmployee(userId, {
                fullName: data.fullName,
                email: data.email,
                department: data.department,
                positionTitle: data.positionTitle,
                employmentType: data.employmentType,
                shiftType: data.shiftType,
                hireDate: data.hireDate.toISOString(),
                rfc_curp: `${data.rfc || ''} ${data.curp || ''}`.trim(),
                nss: data.nss,
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

    return (
        <div className="container mx-auto py-6 space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="icon" onClick={() => router.back()}>
                    <ArrowLeft className="h-4 w-4" />
                </Button>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Nuevo Empleado</h1>
                    <p className="text-muted-foreground">Registrar un nuevo colaborador en el sistema</p>
                </div>
            </div>

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
                                    name="department"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Departamento</FormLabel>
                                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                <FormControl>
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Seleccionar departamento" />
                                                    </SelectTrigger>
                                                </FormControl>
                                                <SelectContent>
                                                    <SelectItem value="IT">Tecnología (IT)</SelectItem>
                                                    <SelectItem value="HR">Recursos Humanos</SelectItem>
                                                    <SelectItem value="Finance">Finanzas</SelectItem>
                                                    <SelectItem value="Operations">Operaciones</SelectItem>
                                                    <SelectItem value="Sales">Ventas</SelectItem>
                                                    <SelectItem value="Marketing">Marketing</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="positionTitle"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Puesto / Cargo</FormLabel>
                                            <FormControl>
                                                <Input placeholder="Desarrollador Senior" {...field} />
                                            </FormControl>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

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
                                    name="shiftType"
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
                                                    <SelectItem value="diurnal">Diurno (6:00 - 20:00)</SelectItem>
                                                    <SelectItem value="nocturnal">Nocturno (20:00 - 6:00)</SelectItem>
                                                    <SelectItem value="mixed">Mixto</SelectItem>
                                                </SelectContent>
                                            </Select>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />

                                <FormField
                                    control={form.control}
                                    name="hireDate"
                                    render={({ field }) => (
                                        <FormItem className="flex flex-col">
                                            <FormLabel>Fecha de Ingreso</FormLabel>
                                            <Popover>
                                                <PopoverTrigger asChild>
                                                    <FormControl>
                                                        <Button
                                                            variant={"outline"}
                                                            className={`w-full pl-3 text-left font-normal ${!field.value ? "text-muted-foreground" : ""}`}
                                                        >
                                                            {field.value ? (
                                                                format(field.value, "PPP", { locale: es })
                                                            ) : (
                                                                <span>Seleccionar fecha</span>
                                                            )}
                                                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                                                        </Button>
                                                    </FormControl>
                                                </PopoverTrigger>
                                                <PopoverContent className="w-auto p-0" align="start">
                                                    <Calendar
                                                        mode="single"
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        disabled={(date) =>
                                                            date > new Date() || date < new Date("1900-01-01")
                                                        }
                                                        initialFocus
                                                    />
                                                </PopoverContent>
                                            </Popover>
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
                            </CardContent>
                        </Card>

                        {/* Initial Compensation */}
                        <Card>
                            <CardHeader>
                                <CardTitle>Compensación Inicial</CardTitle>
                                <CardDescription>Salario base para cálculos de nómina</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <FormField
                                    control={form.control}
                                    name="salaryDaily"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Salario Diario (MXN)</FormLabel>
                                            <FormControl>
                                                <Input
                                                    type="number"
                                                    step="0.01"
                                                    placeholder="0.00"
                                                    {...field}
                                                    onChange={(e) => field.onChange(e.target.value)}
                                                />
                                            </FormControl>
                                            <FormDescription>
                                                Se calculará automáticamente el Salario Diario Integrado (SDI)
                                            </FormDescription>
                                            <FormMessage />
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
                            {isSubmitting && <Loader2 className="nr-2 h-4 w-4 animate-spin" />}
                            <Save className="mr-2 h-4 w-4" />
                            Guardar Empleado
                        </Button>
                    </div>
                </form>
            </Form>
        </div>
    );
}
