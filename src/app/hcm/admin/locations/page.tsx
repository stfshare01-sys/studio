
'use client';

import { useState } from 'react';
import Link from 'next/link';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, addDoc, updateDoc, doc, deleteDoc } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
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
    Trash2,
    MapPin,
    Building2,
    Store,
    Factory,
    Loader2,
} from 'lucide-react';

import type { Location, LocationType } from '@/lib/types';

const LOCATION_TYPE_LABELS: Record<LocationType, { label: string; icon: React.ReactNode }> = {
    cedis: { label: 'CEDIS', icon: <Building2 className="h-4 w-4" /> },
    tienda: { label: 'Tienda', icon: <Store className="h-4 w-4" /> },
    corporativo: { label: 'Corporativo', icon: <Building2 className="h-4 w-4" /> },
    planta: { label: 'Planta', icon: <Factory className="h-4 w-4" /> },
    otro: { label: 'Otro', icon: <MapPin className="h-4 w-4" /> },
};

const initialFormState = {
    name: '',
    code: '',
    type: 'tienda' as LocationType,
    address: '',
    city: '',
    state: '',
    overtimeResetDay: 'sunday' as 'sunday' | 'saturday' | 'custom',
    toleranceMinutes: 10,
    useVirtualCheckIn: false,
    isOfficeLocation: false,
    companyBenefitDays: '',
};

export default function LocationsAdminPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState(initialFormState);

    // Fetch locations
    const locationsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'locations'));
    }, [firestore]);

    const { data: locations, isLoading } = useCollection<Location>(locationsQuery);

    const handleOpenDialog = (location?: Location) => {
        if (location) {
            setIsEditing(true);
            setEditingId(location.id);
            setFormData({
                name: location.name,
                code: location.code,
                type: location.type,
                address: location.address || '',
                city: location.city || '',
                state: location.state || '',
                overtimeResetDay: location.overtimeResetDay,
                toleranceMinutes: location.toleranceMinutes,
                useVirtualCheckIn: location.useVirtualCheckIn || false,
                isOfficeLocation: location.isOfficeLocation || false,
                companyBenefitDays: location.companyBenefitDays?.join(', ') || '',
            });
        } else {
            setIsEditing(false);
            setEditingId(null);
            setFormData(initialFormState);
        }
        setIsDialogOpen(true);
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

        setIsSaving(true);
        try {
            const now = new Date().toISOString();
            const benefitDays = formData.companyBenefitDays
                .split(',')
                .map(d => d.trim())
                .filter(d => d);

            const locationData: Record<string, any> = {
                name: formData.name,
                code: formData.code.toUpperCase(),
                type: formData.type,
                overtimeResetDay: formData.overtimeResetDay,
                toleranceMinutes: formData.toleranceMinutes,
                useVirtualCheckIn: formData.useVirtualCheckIn,
                isOfficeLocation: formData.isOfficeLocation,
                isActive: true,
                updatedAt: now,
            };

            // Solo agregar campos opcionales si tienen valor (Firestore no acepta undefined)
            if (formData.address) {
                locationData.address = formData.address;
            }
            if (formData.city) {
                locationData.city = formData.city;
            }
            if (formData.state) {
                locationData.state = formData.state;
            }
            if (benefitDays.length > 0) {
                locationData.companyBenefitDays = benefitDays;
            }

            if (isEditing && editingId) {
                await updateDoc(doc(firestore, 'locations', editingId), locationData);
                toast({ title: 'Ubicacion actualizada' });
            } else {
                await addDoc(collection(firestore, 'locations'), {
                    ...locationData,
                    createdAt: now,
                    createdById: user.uid,
                });
                toast({ title: 'Ubicacion creada' });
            }

            setIsDialogOpen(false);
            setFormData(initialFormState);
        } catch (error) {
            console.error('Error saving location:', error);
            toast({
                title: 'Error',
                description: 'No se pudo guardar la ubicacion.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (location: Location) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'locations', location.id), {
                isActive: !location.isActive,
                updatedAt: new Date().toISOString(),
            });
            toast({
                title: location.isActive ? 'Ubicacion desactivada' : 'Ubicacion activada',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado.',
                variant: 'destructive',
            });
        }
    };

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
                            <h1 className="text-2xl font-bold tracking-tight">Ubicaciones</h1>
                            <p className="text-muted-foreground">
                                Administracion de ubicaciones y sucursales
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nueva Ubicacion
                    </Button>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Catalogo de Ubicaciones</CardTitle>
                            <CardDescription>
                                Configuracion de ubicaciones, calendarios y tolerancias
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Codigo</TableHead>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Tipo</TableHead>
                                        <TableHead>Ciudad</TableHead>
                                        <TableHead>Reinicio HE</TableHead>
                                        <TableHead className="text-center">Tolerancia</TableHead>
                                        <TableHead className="text-center">Home Office</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8">
                                                Cargando ubicaciones...
                                            </TableCell>
                                        </TableRow>
                                    ) : locations && locations.length > 0 ? (
                                        locations.map((location) => (
                                            <TableRow key={location.id}>
                                                <TableCell className="font-mono font-medium">
                                                    {location.code}
                                                </TableCell>
                                                <TableCell>{location.name}</TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        {LOCATION_TYPE_LABELS[location.type]?.icon}
                                                        {LOCATION_TYPE_LABELS[location.type]?.label}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{location.city || '-'}</TableCell>
                                                <TableCell>
                                                    {location.overtimeResetDay === 'sunday' ? 'Domingo' :
                                                        location.overtimeResetDay === 'saturday' ? 'Sabado' : 'Personalizado'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {location.toleranceMinutes} min
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    {location.useVirtualCheckIn ? (
                                                        <Badge className="bg-green-100 text-green-800">Si</Badge>
                                                    ) : (
                                                        <Badge variant="secondary">No</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={location.isActive}
                                                        onCheckedChange={() => handleToggleActive(location)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenDialog(location)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                No hay ubicaciones registradas
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Dialog para crear/editar */}
                    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                        <DialogContent className="max-w-2xl">
                            <DialogHeader>
                                <DialogTitle>
                                    {isEditing ? 'Editar Ubicacion' : 'Nueva Ubicacion'}
                                </DialogTitle>
                                <DialogDescription>
                                    Configure los datos de la ubicacion y sus reglas de nomina
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Codigo *</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                            placeholder="CEDIS-GDL"
                                            className="font-mono uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nombre *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Nombre de la ubicacion"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Tipo de Ubicacion</Label>
                                        <Select
                                            value={formData.type}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, type: v as LocationType }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="cedis">CEDIS</SelectItem>
                                                <SelectItem value="tienda">Tienda</SelectItem>
                                                <SelectItem value="corporativo">Corporativo</SelectItem>
                                                <SelectItem value="planta">Planta</SelectItem>
                                                <SelectItem value="otro">Otro</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Reinicio de Horas Extra</Label>
                                        <Select
                                            value={formData.overtimeResetDay}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, overtimeResetDay: v as any }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="sunday">Domingo (CEDIS)</SelectItem>
                                                <SelectItem value="saturday">Sabado</SelectItem>
                                                <SelectItem value="custom">Dia anterior al descanso</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-2">
                                        <Label>Ciudad</Label>
                                        <Input
                                            value={formData.city}
                                            onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                                            placeholder="Ciudad"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Estado</Label>
                                        <Input
                                            value={formData.state}
                                            onChange={(e) => setFormData(prev => ({ ...prev, state: e.target.value }))}
                                            placeholder="Estado"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Tolerancia (min)</Label>
                                        <Input
                                            type="number"
                                            value={formData.toleranceMinutes}
                                            onChange={(e) => setFormData(prev => ({ ...prev, toleranceMinutes: parseInt(e.target.value) || 10 }))}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Direccion</Label>
                                    <Input
                                        value={formData.address}
                                        onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))}
                                        placeholder="Direccion completa"
                                    />
                                </div>

                                <div className="space-y-2">
                                    <Label>Dias de Beneficio Empresa (separados por coma)</Label>
                                    <Input
                                        value={formData.companyBenefitDays}
                                        onChange={(e) => setFormData(prev => ({ ...prev, companyBenefitDays: e.target.value }))}
                                        placeholder="12-24, 12-31"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Dias adicionales de descanso otorgados por la empresa (formato: MM-DD)
                                    </p>
                                </div>

                                <div className="flex items-center space-x-2">
                                    <Switch
                                        checked={formData.useVirtualCheckIn}
                                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, useVirtualCheckIn: v }))}
                                    />
                                    <Label>Habilitar check-in virtual (Home Office)</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Switch
                                        checked={formData.isOfficeLocation}
                                        onCheckedChange={(v) => setFormData(prev => ({ ...prev, isOfficeLocation: v }))}
                                    />
                                    <Label>Ubicación Oficina (Descarta marcajes en días de descanso)</Label>
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
