import { UseFormReturn } from 'react-hook-form';
import { Clock, Building2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import type { EmployeeFormValues } from '../employee-schema';

const DAYS_OF_WEEK = [
    { label: 'Domingo', value: 0 },
    { label: 'Lunes', value: 1 },
    { label: 'Martes', value: 2 },
    { label: 'Miércoles', value: 3 },
    { label: 'Jueves', value: 4 },
    { label: 'Viernes', value: 5 },
    { label: 'Sábado', value: 6 },
];

interface AttendanceConfigCardProps {
    form: UseFormReturn<EmployeeFormValues>;
}

export function AttendanceConfigCard({ form }: AttendanceConfigCardProps) {
    const workMode = form.watch('workMode');

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Configuración de Asistencia
                </CardTitle>
                <CardDescription>Configuración de horario y tiempo extra</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
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
                                <FormDescription className="mt-2">
                                    Permite compensar tiempo extra trabajado en la bolsa de horas (solo RH puede modificar)
                                </FormDescription>
                            </div>
                        </FormItem>
                    )}
                />

                {/* Modalidad de trabajo */}
                <FormField
                    control={form.control}
                    name="workMode"
                    render={({ field }) => (
                        <FormItem>
                            <FormLabel>Modalidad de Trabajo</FormLabel>
                            <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Seleccionar modalidad" />
                                    </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                    <SelectItem value="office">🏢 Oficina — checan en checador físico</SelectItem>
                                    <SelectItem value="hybrid">🏠 Híbrido — mezcla de oficina y Home Office</SelectItem>
                                    <SelectItem value="remote">💻 Trabajo Remoto — 100% desde casa</SelectItem>
                                    <SelectItem value="field">🚗 En Campo — vendedor o visitas externas</SelectItem>
                                </SelectContent>
                            </Select>
                            <FormDescription>
                                Determina si el empleado usa el widget de marcaje digital en la app
                            </FormDescription>
                            <FormMessage />
                        </FormItem>
                    )}
                />

                {/* Días de HO — solo para modalidad híbrida */}
                {(workMode === 'hybrid' || !workMode) && (
                <FormField
                    control={form.control}
                    name="homeOfficeDays"
                    render={() => (
                        <FormItem className="rounded-md border p-4">
                            <div className="mb-4">
                                <FormLabel className="text-base flex items-center gap-2">
                                    <Building2 className="h-4 w-4" />
                                    Días de Home Office Fijos
                                </FormLabel>
                                <FormDescription className="mt-1">
                                    Selecciona los días regulares de home office. El sistema registrará la asistencia automáticamente.
                                </FormDescription>
                            </div>
                            <div className="flex flex-wrap gap-4">
                                {DAYS_OF_WEEK.map((day) => (
                                    <FormField
                                        key={day.value}
                                        control={form.control}
                                        name="homeOfficeDays"
                                        render={({ field }) => {
                                            return (
                                                <FormItem
                                                    key={day.value}
                                                    className="flex flex-row items-center space-x-2 space-y-0"
                                                >
                                                    <FormControl>
                                                        <Checkbox
                                                            checked={field.value?.includes(day.value)}
                                                            onCheckedChange={(checked) => {
                                                                return checked
                                                                    ? field.onChange([...(field.value || []), day.value])
                                                                    : field.onChange(
                                                                        field.value?.filter(
                                                                            (value) => value !== day.value
                                                                        )
                                                                    )
                                                            }}
                                                        />
                                                    </FormControl>
                                                    <FormLabel className="font-normal cursor-pointer">
                                                        {day.label}
                                                    </FormLabel>
                                                </FormItem>
                                            )
                                        }}
                                    />
                                ))}
                            </div>
                            <FormMessage />
                        </FormItem>
                    )}
                />
                )}
            </CardContent>
        </Card>
    );
}
