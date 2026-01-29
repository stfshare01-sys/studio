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
import { Textarea } from '@/components/ui/textarea';
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
    Building2,
    Loader2,
    Users,
} from 'lucide-react';

import type { Department, Employee, Location } from '@/lib/types';

const initialFormState = {
    name: '',
    code: '',
    description: '',
    managerId: '',
    parentDepartmentId: '',
    costCenter: '',
    locationId: '',
};

export default function DepartmentsAdminPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState(initialFormState);

    // Fetch departments
    const departmentsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'departments'));
    }, [firestore]);

    const { data: departments, isLoading } = useCollection<Department>(departmentsQuery);

    // Fetch employees for manager selection
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'employees'));
    }, [firestore]);

    const { data: employees } = useCollection<Employee>(employeesQuery);

    // Fetch locations
    const locationsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'locations'));
    }, [firestore]);

    const { data: locations } = useCollection<Location>(locationsQuery);

    const handleOpenDialog = (department?: Department) => {
        if (department) {
            setIsEditing(true);
            setEditingId(department.id);
            setFormData({
                name: department.name,
                code: department.code,
                description: department.description || '',
                managerId: department.managerId || '',
                parentDepartmentId: department.parentDepartmentId || '',
                costCenter: department.costCenter || '',
                locationId: department.locationId || '',
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
                description: 'El nombre y código son requeridos.',
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const now = new Date().toISOString();

            const departmentData: Record<string, any> = {
                name: formData.name,
                code: formData.code.toUpperCase(),
                isActive: true,
                updatedAt: now,
            };

            // Solo agregar campos opcionales si tienen valor
            if (formData.description) {
                departmentData.description = formData.description;
            }
            if (formData.managerId && formData.managerId !== '_none') {
                departmentData.managerId = formData.managerId;
            }
            if (formData.parentDepartmentId && formData.parentDepartmentId !== '_none') {
                departmentData.parentDepartmentId = formData.parentDepartmentId;
            }
            if (formData.costCenter) {
                departmentData.costCenter = formData.costCenter;
            }
            if (formData.locationId && formData.locationId !== '_none') {
                departmentData.locationId = formData.locationId;
            }

            if (isEditing && editingId) {
                await updateDoc(doc(firestore, 'departments', editingId), departmentData);
                toast({ title: 'Departamento actualizado' });
            } else {
                await addDoc(collection(firestore, 'departments'), {
                    ...departmentData,
                    createdAt: now,
                    createdById: user.uid,
                });
                toast({ title: 'Departamento creado' });
            }

            setIsDialogOpen(false);
            setFormData(initialFormState);
        } catch (error) {
            console.error('Error saving department:', error);
            toast({
                title: 'Error',
                description: 'No se pudo guardar el departamento.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (department: Department) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'departments', department.id), {
                isActive: !department.isActive,
                updatedAt: new Date().toISOString(),
            });
            toast({
                title: department.isActive ? 'Departamento desactivado' : 'Departamento activado',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado.',
                variant: 'destructive',
            });
        }
    };

    const getManagerName = (managerId?: string) => {
        if (!managerId) return '-';
        const manager = employees?.find(e => e.id === managerId);
        return manager?.fullName || '-';
    };

    const getParentDepartmentName = (parentId?: string) => {
        if (!parentId) return '-';
        const parent = departments?.find(d => d.id === parentId);
        return parent?.name || '-';
    };

    const getLocationName = (locationId?: string) => {
        if (!locationId) return '-';
        const location = locations?.find(l => l.id === locationId);
        return location?.name || '-';
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
                            <h1 className="text-2xl font-bold tracking-tight">Departamentos</h1>
                            <p className="text-muted-foreground">
                                Catálogo de departamentos organizacionales
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Departamento
                    </Button>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Catálogo de Departamentos</CardTitle>
                            <CardDescription>
                                Configuración de departamentos, jerarquías y responsables
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Código</TableHead>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Responsable</TableHead>
                                        <TableHead>Departamento Padre</TableHead>
                                        <TableHead>Ubicación</TableHead>
                                        <TableHead>Centro de Costo</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8">
                                                Cargando departamentos...
                                            </TableCell>
                                        </TableRow>
                                    ) : departments && departments.length > 0 ? (
                                        departments.map((department) => (
                                            <TableRow key={department.id}>
                                                <TableCell className="font-mono font-medium">
                                                    {department.code}
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Building2 className="h-4 w-4 text-muted-foreground" />
                                                        {department.name}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="flex items-center gap-2">
                                                        <Users className="h-4 w-4 text-muted-foreground" />
                                                        {getManagerName(department.managerId)}
                                                    </div>
                                                </TableCell>
                                                <TableCell>{getParentDepartmentName(department.parentDepartmentId)}</TableCell>
                                                <TableCell>{getLocationName(department.locationId)}</TableCell>
                                                <TableCell className="font-mono text-sm">
                                                    {department.costCenter || '-'}
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={department.isActive}
                                                        onCheckedChange={() => handleToggleActive(department)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenDialog(department)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                                                No hay departamentos registrados
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
                                    {isEditing ? 'Editar Departamento' : 'Nuevo Departamento'}
                                </DialogTitle>
                                <DialogDescription>
                                    Configure los datos del departamento y su jerarquía organizacional
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Código *</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                            placeholder="RH"
                                            className="font-mono uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nombre del Departamento *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Recursos Humanos"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label>Descripción</Label>
                                    <Textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                        placeholder="Descripción del departamento..."
                                        rows={2}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Responsable / Jefe</Label>
                                        <Select
                                            value={formData.managerId || '_none'}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, managerId: v === '_none' ? '' : v }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar responsable" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_none">Sin responsable asignado</SelectItem>
                                                {employees?.filter(e => e.status === 'active').map((employee) => (
                                                    <SelectItem key={employee.id} value={employee.id}>
                                                        {employee.fullName} - {employee.positionTitle}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Departamento Padre</Label>
                                        <Select
                                            value={formData.parentDepartmentId || '_none'}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, parentDepartmentId: v === '_none' ? '' : v }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar padre" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_none">Sin departamento padre</SelectItem>
                                                {departments?.filter(d => d.id !== editingId && d.isActive).map((dept) => (
                                                    <SelectItem key={dept.id} value={dept.id}>
                                                        {dept.code} - {dept.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Ubicación Principal</Label>
                                        <Select
                                            value={formData.locationId || '_none'}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, locationId: v === '_none' ? '' : v }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar ubicación" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="_none">Sin ubicación asignada</SelectItem>
                                                {locations?.filter(l => l.isActive).map((location) => (
                                                    <SelectItem key={location.id} value={location.id}>
                                                        {location.code} - {location.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Centro de Costos</Label>
                                        <Input
                                            value={formData.costCenter}
                                            onChange={(e) => setFormData(prev => ({ ...prev, costCenter: e.target.value }))}
                                            placeholder="CC-001"
                                            className="font-mono"
                                        />
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
