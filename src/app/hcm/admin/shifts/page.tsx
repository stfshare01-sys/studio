
'use client';

import { useState } from 'react';
import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, addDoc, updateDoc, doc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
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
    ArrowLeft,
    Plus,
    Edit,
    Clock,
    Sun,
    Moon,
    Loader2,
} from 'lucide-react';
import type { CustomShift, ShiftType } from "@/types/hcm.types";

const DAYS_OF_WEEK = [
    { value: 0, label: 'Domingo', short: 'Dom' },
    { value: 1, label: 'Lunes', short: 'Lun' },
    { value: 2, label: 'Martes', short: 'Mar' },
    { value: 3, label: 'Miercoles', short: 'Mie' },
    { value: 4, label: 'Jueves', short: 'Jue' },
    { value: 5, label: 'Viernes', short: 'Vie' },
    { value: 6, label: 'Sabado', short: 'Sab' },
];

const initialFormState = {
    name: '',
    code: '',
    type: 'diurnal' as ShiftType,
    startTime: '09:00',
    endTime: '18:00',
    breakMinutes: 60,
    workDays: [1, 2, 3, 4, 5] as number[],
    restDays: [0, 6] as number[],
};

export default function ShiftsAdminPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        ...initialFormState,
        useDaySchedules: false,
        daySchedules: {} as Record<number, { startTime: string; endTime: string; breakMinutes: number }>
    });

    // Fetch shifts
    const shiftsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'shifts'));
    }, [firestore]);

    const { data: shifts, isLoading } = useCollection<CustomShift>(shiftsQuery);

    // Calculate daily hours from start/end time
    const calculateDailyHours = (start: string, end: string, breakMins: number): number => {
        const [startH, startM] = start.split(':').map(Number);
        const [endH, endM] = end.split(':').map(Number);

        let totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
        if (totalMinutes < 0) totalMinutes += 24 * 60; // Overnight shift

        return Math.max(0, (totalMinutes - breakMins) / 60);
    };

    const handleOpenDialog = (shift?: CustomShift) => {
        if (shift) {
            setIsEditing(true);
            setEditingId(shift.id);
            setFormData({
                name: shift.name,
                code: shift.code,
                type: shift.type,
                startTime: shift.startTime,
                endTime: shift.endTime,
                breakMinutes: shift.breakMinutes,
                workDays: shift.workDays,
                restDays: shift.restDays,
                useDaySchedules: !!shift.daySchedules && Object.keys(shift.daySchedules).length > 0,
                daySchedules: shift.daySchedules || {}
            });
        } else {
            setIsEditing(false);
            setEditingId(null);
            setFormData({ ...initialFormState, useDaySchedules: false, daySchedules: {} });
        }
        setIsDialogOpen(true);
    };

    const handleDayScheduleChange = (day: number, field: 'startTime' | 'endTime' | 'breakMinutes', value: string | number) => {
        setFormData(prev => {
            const currentSchedule = prev.daySchedules[day] || {
                startTime: prev.startTime,
                endTime: prev.endTime,
                breakMinutes: prev.breakMinutes
            };

            return {
                ...prev,
                daySchedules: {
                    ...prev.daySchedules,
                    [day]: {
                        ...currentSchedule,
                        [field]: value
                    }
                }
            };
        });
    };

    const handleSave = async () => {
        if (!firestore || !user) return;

        if (!formData.name || !formData.code) {
            toast({
                title: 'Error',
                description: 'El nombre y codigo son requeridos.',
                variant: 'destructive',
            });
            return;
        }

        if (formData.workDays.length === 0) {
            toast({
                title: 'Error',
                description: 'Debe seleccionar al menos un dia laboral.',
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const now = new Date().toISOString();

            // Calculate hours
            let weeklyHours = 0;
            let dailyHoursAvg = 0;

            if (formData.useDaySchedules) {
                // Sum individually
                formData.workDays.forEach(day => {
                    const schedule = formData.daySchedules[day] || {
                        startTime: formData.startTime,
                        endTime: formData.endTime,
                        breakMinutes: formData.breakMinutes
                    };
                    weeklyHours += calculateDailyHours(schedule.startTime, schedule.endTime, schedule.breakMinutes);
                });
                dailyHoursAvg = weeklyHours / formData.workDays.length;
            } else {
                const daily = calculateDailyHours(formData.startTime, formData.endTime, formData.breakMinutes);
                dailyHoursAvg = daily;
                weeklyHours = daily * formData.workDays.length;
            }

            const shiftData = {
                name: formData.name,
                code: formData.code.toUpperCase(),
                type: formData.type,
                startTime: formData.startTime,
                endTime: formData.endTime,
                breakMinutes: formData.breakMinutes,
                workDays: formData.workDays,
                restDays: DAYS_OF_WEEK.map(d => d.value).filter(d => !formData.workDays.includes(d)),
                daySchedules: formData.useDaySchedules ? formData.daySchedules : {}, // Save specific schedules if enabled
                dailyHours: Math.round(dailyHoursAvg * 100) / 100,
                weeklyHours: Math.round(weeklyHours * 100) / 100,
                isActive: true,
                updatedAt: now,
            };

            if (isEditing && editingId) {
                await updateDoc(doc(firestore, 'shifts', editingId), shiftData);
                toast({ title: 'Turno actualizado' });
            } else {
                await addDoc(collection(firestore, 'shifts'), {
                    ...shiftData,
                    createdAt: now,
                });
                toast({ title: 'Turno creado' });
            }

            setIsDialogOpen(false);
            setFormData({ ...initialFormState, useDaySchedules: false, daySchedules: {} });
        } catch (error) {
            console.error('Error saving shift:', error);
            toast({
                title: 'Error',
                description: 'No se pudo guardar el turno.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (shift: CustomShift) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'shifts', shift.id), {
                isActive: !shift.isActive,
                updatedAt: new Date().toISOString(),
            });
            toast({
                title: shift.isActive ? 'Turno desactivado' : 'Turno activado',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado.',
                variant: 'destructive',
            });
        }
    };

    const getShiftTypeIcon = (type: ShiftType) => {
        switch (type) {
            case 'diurnal':
                return <Sun className="h-4 w-4 text-yellow-500" />;
            case 'nocturnal':
                return <Moon className="h-4 w-4 text-blue-500" />;
            default:
                return <Clock className="h-4 w-4 text-purple-500" />;
        }
    };

    const formatWorkDays = (workDays: number[]) => {
        return workDays.map(d => DAYS_OF_WEEK.find(day => day.value === d)?.short).join(', ');
    };

    // Calculate preview for UI
    const getPreviewHours = () => {
        if (formData.useDaySchedules) {
            let weekly = 0;
            formData.workDays.forEach(day => {
                const s = formData.daySchedules[day] || { startTime: formData.startTime, endTime: formData.endTime, breakMinutes: formData.breakMinutes };
                weekly += calculateDailyHours(s.startTime, s.endTime, s.breakMinutes);
            });
            return { daily: weekly / (formData.workDays.length || 1), weekly };
        }
        const daily = calculateDailyHours(formData.startTime, formData.endTime, formData.breakMinutes);
        return { daily, weekly: daily * formData.workDays.length };
    };

    const preview = getPreviewHours();

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
                            <p className="text-muted-foreground">
                                Administracion de turnos y horarios
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Turno
                    </Button>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Catalogo de Turnos</CardTitle>
                            <CardDescription>
                                Configuracion de horarios, dias laborales y de descanso
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Codigo</TableHead>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Horario</TableHead>
                                        <TableHead>Dias Laborales</TableHead>
                                        <TableHead className="text-center">Hrs/Dia (Prom)</TableHead>
                                        <TableHead className="text-center">Hrs/Sem</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8">
                                                Cargando turnos...
                                            </TableCell>
                                        </TableRow>
                                    ) : shifts && shifts.length > 0 ? (
                                        shifts.map((shift) => (
                                            <TableRow key={shift.id}>
                                                <TableCell className="font-mono font-medium">
                                                    {shift.code}
                                                </TableCell>
                                                <TableCell>{shift.name}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {getShiftTypeIcon(shift.type)}
                                                        <span className="capitalize">
                                                            {shift.type === 'diurnal' ? 'Diurno' :
                                                                shift.type === 'nocturnal' ? 'Nocturno' : 'Mixto'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    {shift.daySchedules && Object.keys(shift.daySchedules).length > 0 ? (
                                                        <Badge variant="outline" className="text-xs">Variable</Badge>
                                                    ) : (
                                                        `${shift.startTime} - ${shift.endTime}`
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-xs">
                                                        {formatWorkDays(shift.workDays)}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {shift.dailyHours}h
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {shift.weeklyHours}h
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={shift.isActive}
                                                        onCheckedChange={() => handleToggleActive(shift)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenDialog(shift)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                No hay turnos registrados
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Dialog para crear/editar */}
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-3xl overflow-y-auto max-h-[90vh]">
                            <DialogHeader>
                                <DialogTitle>
                                    {isEditing ? 'Editar Turno' : 'Nuevo Turno'}
                                </DialogTitle>
                                <DialogDescription>
                                    Configure los horarios y dias laborales del turno
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Codigo *</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                            placeholder="TM-01"
                                            className="font-mono uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nombre *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Turno Matutino"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Tipo de Turno</Label>
                                    <Select
                                        value={formData.type}
                                        onValueChange={(v) => setFormData(prev => ({ ...prev, type: v as ShiftType }))}
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="diurnal">Diurno (6:00-20:00)</SelectItem>
                                            <SelectItem value="nocturnal">Nocturno (20:00-6:00)</SelectItem>
                                            <SelectItem value="mixed">Mixto</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Dias Laborales</Label>
                                    <div className="flex flex-wrap gap-4">
                                        {DAYS_OF_WEEK.map((day) => (
                                            <div key={day.value} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`day-${day.value}`}
                                                    checked={formData.workDays.includes(day.value)}
                                                    onCheckedChange={(checked) => {
                                                        const newWorkDays = checked
                                                            ? [...formData.workDays, day.value].sort()
                                                            : formData.workDays.filter(d => d !== day.value);
                                                        setFormData(prev => ({ ...prev, workDays: newWorkDays }));
                                                    }}
                                                />
                                                <Label htmlFor={`day-${day.value}`} className="text-sm">
                                                    {day.label}
                                                </Label>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="flex items-center space-x-2 py-2">
                                    <Switch
                                        id="use-day-schedules"
                                        checked={formData.useDaySchedules}
                                        onCheckedChange={(checked) => setFormData(prev => ({ ...prev, useDaySchedules: checked }))}
                                    />
                                    <Label htmlFor="use-day-schedules">Configurar Horario Diferente por Dia</Label>
                                </div>

                                {!formData.useDaySchedules ? (
                                    /* Single Global Schedule */
                                    <div className="grid grid-cols-3 gap-4 border p-4 rounded-md bg-muted/20">
                                        <div className="space-y-2">
                                            <Label>Hora Entrada</Label>
                                            <Input
                                                type="time"
                                                value={formData.startTime}
                                                onChange={(e) => setFormData(prev => ({ ...prev, startTime: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Hora Salida</Label>
                                            <Input
                                                type="time"
                                                value={formData.endTime}
                                                onChange={(e) => setFormData(prev => ({ ...prev, endTime: e.target.value }))}
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label>Descanso (min)</Label>
                                            <Input
                                                type="number"
                                                value={formData.breakMinutes}
                                                onChange={(e) => setFormData(prev => ({ ...prev, breakMinutes: parseInt(e.target.value) || 0 }))}
                                            />
                                        </div>
                                    </div>
                                ) : (
                                    /* Per Day Schedule */
                                    <div className="space-y-3 border p-4 rounded-md bg-muted/20">
                                        <div className="grid grid-cols-4 gap-2 text-xs font-medium text-muted-foreground mb-2">
                                            <div>Dia</div>
                                            <div>Entrada</div>
                                            <div>Salida</div>
                                            <div>Descanso (min)</div>
                                        </div>
                                        {formData.workDays.map(day => (
                                            <div key={day} className="grid grid-cols-4 gap-2 items-center">
                                                <div className="text-sm font-medium">{DAYS_OF_WEEK.find(d => d.value === day)?.label}</div>
                                                <Input
                                                    type="time"
                                                    className="h-8"
                                                    value={formData.daySchedules[day]?.startTime || formData.startTime}
                                                    onChange={e => handleDayScheduleChange(day, 'startTime', e.target.value)}
                                                />
                                                <Input
                                                    type="time"
                                                    className="h-8"
                                                    value={formData.daySchedules[day]?.endTime || formData.endTime}
                                                    onChange={e => handleDayScheduleChange(day, 'endTime', e.target.value)}
                                                />
                                                <Input
                                                    type="number"
                                                    className="h-8"
                                                    value={formData.daySchedules[day]?.breakMinutes ?? formData.breakMinutes}
                                                    onChange={e => handleDayScheduleChange(day, 'breakMinutes', parseInt(e.target.value) || 0)}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Preview de cálculos */}
                                <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                                    <h4 className="font-medium flex items-center gap-2">
                                        <Clock className="h-4 w-4" />
                                        Resumen del Turno
                                    </h4>
                                    <div className="grid grid-cols-3 gap-4 text-sm">
                                        <div>
                                            <span className="text-muted-foreground">Horas por dia:</span>
                                            <span className="ml-2 font-medium">{preview.daily.toFixed(1)} hrs</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Dias laborales:</span>
                                            <span className="ml-2 font-medium">{formData.workDays.length} dias</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground">Horas semanales:</span>
                                            <span className="ml-2 font-medium">{preview.weekly.toFixed(1)} hrs</span>
                                        </div>
                                    </div>
                                    <div className="text-xs text-muted-foreground pt-2">
                                        <span className="font-medium">Dias de descanso: </span>
                                        {DAYS_OF_WEEK.filter(d => !formData.workDays.includes(d.value)).map(d => d.label).join(', ') || 'Ninguno'}
                                    </div>
                                </div>
                            </div>

                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                                    Cancelar
                                </Button>
                                <Button onClick={handleSave} disabled={isSaving}>
                                    {isSaving ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Guardando...
                                        </>
                                    ) : isEditing ? 'Actualizar' : 'Crear'}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </main>
            </div>
        </SiteLayout>
    );
}
