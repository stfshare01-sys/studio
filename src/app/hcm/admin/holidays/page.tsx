'use client';

import React, { useState, useEffect } from 'react';
import {
    collection,
    query,
    getDocs,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    serverTimestamp,
    orderBy
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { HolidayCalendar, OfficialHoliday } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogTrigger
} from '@/components/ui/dialog';
import {
    Trash2,
    Plus,
    Calendar as CalendarIcon,
    Edit,
    Loader2,
    Save,
    MoreVertical
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function HolidayCalendarsPage() {
    const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
    const [selectedCalendar, setSelectedCalendar] = useState<HolidayCalendar | null>(null);

    // New Calendar Form
    const [newCalendarName, setNewCalendarName] = useState('');
    const [newCalendarYear, setNewCalendarYear] = useState(new Date().getFullYear());
    const [newCalendarCountry, setNewCalendarCountry] = useState('mx');

    useEffect(() => {
        fetchCalendars();
    }, []);

    const fetchCalendars = async () => {
        try {
            setLoading(true);
            const q = query(collection(db, 'holiday_calendars'), orderBy('year', 'desc'));
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })) as HolidayCalendar[];

            setCalendars(data);
        } catch (error) {
            console.error('Error fetching calendars:', error);
            toast.error('Error al cargar calendarios');
        } finally {
            setLoading(false);
        }
    };

    const handleCreateCalendar = async () => {
        if (!newCalendarName) return;

        try {
            const newCalendar = {
                name: newCalendarName,
                year: Number(newCalendarYear),
                countryCode: newCalendarCountry,
                holidays: [],
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };

            await addDoc(collection(db, 'holiday_calendars'), newCalendar);
            toast.success('Calendario creado correctamente');
            setIsDialogOpen(false);
            setNewCalendarName('');
            fetchCalendars();
        } catch (error) {
            console.error('Error creating calendar:', error);
            toast.error('Error al crear calendario');
        }
    };

    const handleDeleteCalendar = async (id: string) => {
        if (!confirm('¿Estás seguro de eliminar este calendario? Esta acción no se puede deshacer.')) return;

        try {
            await deleteDoc(doc(db, 'holiday_calendars', id));
            toast.success('Calendario eliminado');
            fetchCalendars();
        } catch (error) {
            console.error('Error deleting calendar:', error);
            toast.error('Error al eliminar');
        }
    };

    const openEditDialog = (calendar: HolidayCalendar) => {
        setSelectedCalendar({ ...calendar }); // Clone to edit
        setIsEditDialogOpen(true);
    };

    return (
        <div className="p-6 space-y-6 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-gray-900">Calendarios Oficiales</h1>
                    <p className="text-gray-500 mt-2">Gestiona los días festivos obligatorios y no laborables por país y año.</p>
                </div>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                        <Button className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-lg">
                            <Plus className="mr-2 h-4 w-4" /> Nuevo Calendario
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Crear Nuevo Calendario</DialogTitle>
                        </DialogHeader>
                        <div className="grid gap-4 py-4">
                            <div className="grid gap-2">
                                <Label htmlFor="name">Nombre del Calendario</Label>
                                <Input
                                    id="name"
                                    value={newCalendarName}
                                    onChange={(e) => setNewCalendarName(e.target.value)}
                                    placeholder="Ej. México 2026 Oficial"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="year">Año</Label>
                                    <Input
                                        id="year"
                                        type="number"
                                        value={newCalendarYear}
                                        onChange={(e) => setNewCalendarYear(Number(e.target.value))}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="country">Código País (ISO)</Label>
                                    <Input
                                        id="country"
                                        value={newCalendarCountry}
                                        onChange={(e) => setNewCalendarCountry(e.target.value)}
                                        placeholder="mx"
                                    />
                                </div>
                            </div>
                        </div>
                        <DialogFooter>
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                            <Button onClick={handleCreateCalendar}>Crear Calendario</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            </div>

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {calendars.map((calendar) => (
                        <Card key={calendar.id} className="hover:shadow-md transition-shadow">
                            <CardHeader className="flex flex-row items-start justify-between pb-2">
                                <div className="space-y-1">
                                    <CardTitle className="text-lg flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-gray-500" />
                                        {calendar.name}
                                    </CardTitle>
                                    <CardDescription>{calendar.year} • {calendar.countryCode?.toUpperCase()}</CardDescription>
                                </div>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" className="h-8 w-8 p-0">
                                            <span className="sr-only">Open menu</span>
                                            <MoreVertical className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => openEditDialog(calendar)}>
                                            <Edit className="mr-2 h-4 w-4" /> Editar Festivos
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => handleDeleteCalendar(calendar.id)}
                                            className="text-red-600 focus:text-red-600"
                                        >
                                            <Trash2 className="mr-2 h-4 w-4" /> Eliminar
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </CardHeader>
                            <CardContent>
                                <div className="flex justify-between items-center mb-4">
                                    <span className="text-sm text-gray-500">{calendar.holidays.length} días registrados</span>
                                    {calendar.isDefault && <Badge variant="secondary">Por Defecto</Badge>}
                                </div>
                                <div className="space-y-2">
                                    {calendar.holidays.slice(0, 3).map((h, i) => (
                                        <div key={i} className="flex justify-between text-sm py-1 border-b border-gray-100 last:border-0">
                                            <span className="text-gray-600">{h.name}</span>
                                            <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">
                                                {h.date}
                                            </span>
                                        </div>
                                    ))}
                                    {calendar.holidays.length > 3 && (
                                        <div className="text-xs text-center text-gray-400 mt-2">
                                            + {calendar.holidays.length - 3} más...
                                        </div>
                                    )}
                                    {calendar.holidays.length === 0 && (
                                        <div className="text-sm text-gray-400 italic text-center py-4">
                                            Sin días festivos configurados
                                        </div>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full mt-4"
                                    onClick={() => openEditDialog(calendar)}
                                >
                                    Gestor de Días
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Edit Holidays Dialog */}
            {selectedCalendar && (
                <EditHolidaysDialog
                    isOpen={isEditDialogOpen}
                    onClose={() => setIsEditDialogOpen(false)}
                    calendar={selectedCalendar}
                    onSave={() => {
                        setIsEditDialogOpen(false);
                        fetchCalendars();
                    }}
                />
            )}
        </div>
    );
}

function EditHolidaysDialog({
    isOpen,
    onClose,
    calendar,
    onSave
}: {
    isOpen: boolean;
    onClose: () => void;
    calendar: HolidayCalendar;
    onSave: () => void;
}) {
    const [holidays, setHolidays] = useState<OfficialHoliday[]>(calendar.holidays || []);
    const [newDate, setNewDate] = useState('');
    const [newName, setNewName] = useState('');
    const [isMandatory, setIsMandatory] = useState(true);
    const [saving, setSaving] = useState(false);

    // Sort holidays by date
    const sortedHolidays = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

    const handleAddHoliday = () => {
        if (!newDate || !newName) return;

        const newHoliday: OfficialHoliday = {
            date: newDate,
            name: newName,
            mandatory: isMandatory
        };

        setHolidays([...holidays, newHoliday]);
        setNewDate('');
        setNewName('');
        setIsMandatory(true);
    };

    const handleRemoveHoliday = (indexToRemove: number) => {
        setHolidays(sortedHolidays.filter((_, i) => i !== indexToRemove));
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            const docRef = doc(db, 'holiday_calendars', calendar.id);
            await updateDoc(docRef, {
                holidays: holidays,
                updatedAt: new Date().toISOString()
            });
            toast.success('Días festivos actualizados');
            onSave();
        } catch (error) {
            console.error('Error updating holidays:', error);
            toast.error('Error al guardar cambios');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle>Editar Días Festivos - {calendar.name}</DialogTitle>
                    <CardDescription>Agrega o elimina los días no laborables para este calendario.</CardDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden flex flex-col gap-6 py-4">
                    {/* Add Form */}
                    <div className="bg-gray-50 p-4 rounded-lg border space-y-4">
                        <h4 className="text-sm font-medium text-gray-700">Agregar Nuevo Día</h4>
                        <div className="grid grid-cols-12 gap-4 items-end">
                            <div className="col-span-3">
                                <Label className="text-xs">Fecha</Label>
                                <Input
                                    type="date"
                                    value={newDate}
                                    onChange={(e) => setNewDate(e.target.value)}
                                />
                            </div>
                            <div className="col-span-5">
                                <Label className="text-xs">Nombre Festividad</Label>
                                <Input
                                    placeholder="Ej. Año Nuevo"
                                    value={newName}
                                    onChange={(e) => setNewName(e.target.value)}
                                />
                            </div>
                            <div className="col-span-2 flex items-center gap-2 pb-2.5">
                                <Checkbox
                                    id="mandatory"
                                    checked={isMandatory}
                                    onCheckedChange={(c) => setIsMandatory(!!c)}
                                />
                                <Label htmlFor="mandatory" className="cursor-pointer text-xs">Obligatorio</Label>
                            </div>
                            <div className="col-span-2">
                                <Button onClick={handleAddHoliday} disabled={!newDate || !newName} className="w-full">
                                    <Plus className="h-4 w-4" /> Agregar
                                </Button>
                            </div>
                        </div>
                    </div>

                    {/* List */}
                    <div className="flex-1 overflow-auto border rounded-md">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[150px]">Fecha</TableHead>
                                    <TableHead>Festividad</TableHead>
                                    <TableHead className="w-[100px]">Tipo</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {sortedHolidays.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} className="text-center py-8 text-gray-500 italic">
                                            No hay días festivos registrados en este calendario.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    sortedHolidays.map((holiday, index) => (
                                        <TableRow key={`${holiday.date}-${index}`}>
                                            <TableCell className="font-medium font-mono">{holiday.date}</TableCell>
                                            <TableCell>{holiday.name}</TableCell>
                                            <TableCell>
                                                {holiday.mandatory ? (
                                                    <Badge variant="default" className="bg-blue-100 text-blue-800 hover:bg-blue-100 border-none">Ley</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-gray-500">Opcional</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                                                    onClick={() => handleRemoveHoliday(index)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
                    <Button onClick={handleSave} disabled={saving}>
                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Guardar Cambios
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
