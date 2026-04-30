import Link from 'next/link';
import { UseFormReturn } from 'react-hook-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AvatarUpload } from '@/components/ui/avatar-upload';
import type { EmployeeFormValues } from '../employee-schema';
import type { Department, Position, CustomShift, Employee, Location } from "@/types/hcm.types";
import type { WithId } from '@/firebase/firestore/use-collection';

interface PersonalInfoCardProps {
    form: UseFormReturn<EmployeeFormValues>;
    catalogs: {
        positions?: WithId<Position>[] | null;
        shifts?: WithId<CustomShift>[] | null;
        locations?: WithId<Location>[] | null;
        managers?: WithId<Employee>[] | null;
    };
    autoDepartmentName: string;
}

export function PersonalInfoCard({ form, catalogs, autoDepartmentName }: PersonalInfoCardProps) {
    const { positions, shifts, locations, managers } = catalogs;

    return (
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
                            value={autoDepartmentName || 'Selecciona un puesto primero'}
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
    );
}
