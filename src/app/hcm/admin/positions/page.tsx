
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
    Briefcase,
    Loader2,
    Shield,
    DollarSign,
} from 'lucide-react';

import type { Position, Department } from '@/lib/types';
import { formatCurrency } from '@/lib/hcm-utils';

const initialFormState = {
    name: '',
    code: '',
    departmentId: '',
    level: 3,
    salaryMin: '',
    salaryMax: '',
    canApproveOvertime: false,
    canApproveIncidences: false,
};

export default function PositionsAdminPage() {
    const { firestore, user } = useFirebase();
    const { toast } = useToast();

    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState(initialFormState);

    // Fetch positions
    const positionsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'positions'));
    }, [firestore]);

    const { data: positions, isLoading } = useCollection<Position>(positionsQuery);

    // Fetch departments
    const departmentsQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(collection(firestore, 'departments'));
    }, [firestore]);

    const { data: departments } = useCollection<Department>(departmentsQuery);

    // Helper to get department name by ID
    const getDepartmentName = (departmentId?: string) => {
        if (!departmentId) return '-';
        const dept = departments?.find(d => d.id === departmentId);
        return dept?.name || departmentId; // Fallback to ID if name not found (for backward compatibility)
    };

    const handleOpenDialog = (position?: Position) => {
        if (position) {
            setIsEditing(true);
            setEditingId(position.id);
            setFormData({
                name: position.name,
                code: position.code,
                departmentId: position.departmentId || position.department || '', // Support legacy 'department' field
                level: position.level,
                salaryMin: position.salaryMin?.toString() || '',
                salaryMax: position.salaryMax?.toString() || '',
                canApproveOvertime: position.canApproveOvertime || false,
                canApproveIncidences: position.canApproveIncidences || false,
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

        if (!formData.name || !formData.code || !formData.departmentId) {
            toast({
                title: 'Error',
                description: 'El nombre, código y departamento son requeridos.',
                variant: 'destructive',
            });
            return;
        }

        setIsSaving(true);
        try {
            const now = new Date().toISOString();
            const selectedDept = departments?.find(d => d.id === formData.departmentId);

            const positionData: Record<string, any> = {
                name: formData.name,
                code: formData.code.toUpperCase(),
                departmentId: formData.departmentId,
                department: selectedDept?.name || '', // Denormalized for display
                level: formData.level,
                canApproveOvertime: formData.canApproveOvertime,
                canApproveIncidences: formData.canApproveIncidences,
                isActive: true,
                updatedAt: now,
            };

            // Solo agregar salarios si tienen valor (Firestore no acepta undefined)
            if (formData.salaryMin) {
                positionData.salaryMin = parseFloat(formData.salaryMin);
            }
            if (formData.salaryMax) {
                positionData.salaryMax = parseFloat(formData.salaryMax);
            }

            if (isEditing && editingId) {
                await updateDoc(doc(firestore, 'positions', editingId), positionData);
                toast({ title: 'Puesto actualizado' });
            } else {
                await addDoc(collection(firestore, 'positions'), {
                    ...positionData,
                    createdAt: now,
                });
                toast({ title: 'Puesto creado' });
            }

            setIsDialogOpen(false);
            setFormData(initialFormState);
        } catch (error) {
            console.error('Error saving position:', error);
            toast({
                title: 'Error',
                description: 'No se pudo guardar el puesto.',
                variant: 'destructive',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (position: Position) => {
        if (!firestore) return;
        try {
            await updateDoc(doc(firestore, 'positions', position.id), {
                isActive: !position.isActive,
                updatedAt: new Date().toISOString(),
            });
            toast({
                title: position.isActive ? 'Puesto desactivado' : 'Puesto activado',
            });
        } catch (error) {
            toast({
                title: 'Error',
                description: 'No se pudo actualizar el estado.',
                variant: 'destructive',
            });
        }
    };

    const getLevelLabel = (level: number) => {
        const labels: Record<number, string> = {
            1: 'Director',
            2: 'Gerente',
            3: 'Coordinador',
            4: 'Supervisor',
            5: 'Analista',
            6: 'Operativo',
        };
        return labels[level] || `Nivel ${level}`;
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
                            <h1 className="text-2xl font-bold tracking-tight">Puestos</h1>
                            <p className="text-muted-foreground">
                                Catalogo de puestos y niveles jerarquicos
                            </p>
                        </div>
                    </div>
                    <Button onClick={() => handleOpenDialog()}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nuevo Puesto
                    </Button>
                </header>

                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0">
                    <Card>
                        <CardHeader>
                            <CardTitle>Catalogo de Puestos</CardTitle>
                            <CardDescription>
                                Configuracion de puestos, tabuladores y permisos
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Codigo</TableHead>
                                        <TableHead>Nombre</TableHead>
                                        <TableHead>Departamento</TableHead>
                                        <TableHead>Nivel</TableHead>
                                        <TableHead className="text-right">Tabulador Min</TableHead>
                                        <TableHead className="text-right">Tabulador Max</TableHead>
                                        <TableHead className="text-center">Permisos</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8">
                                                Cargando puestos...
                                            </TableCell>
                                        </TableRow>
                                    ) : positions && positions.length > 0 ? (
                                        positions.map((position) => (
                                            <TableRow key={position.id}>
                                                <TableCell className="font-mono font-medium">
                                                    {position.code}
                                                </TableCell>
                                                <TableCell>{position.name}</TableCell>
                                                <TableCell>{position.department}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline">
                                                        {getLevelLabel(position.level)}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {position.salaryMin ? formatCurrency(position.salaryMin) : '-'}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    {position.salaryMax ? formatCurrency(position.salaryMax) : '-'}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex justify-center gap-1">
                                                        {position.canApproveOvertime && (
                                                            <Badge className="bg-orange-100 text-orange-800 text-[10px]">HE</Badge>
                                                        )}
                                                        {position.canApproveIncidences && (
                                                            <Badge className="bg-blue-100 text-blue-800 text-[10px]">INC</Badge>
                                                        )}
                                                        {!position.canApproveOvertime && !position.canApproveIncidences && '-'}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Switch
                                                        checked={position.isActive}
                                                        onCheckedChange={() => handleToggleActive(position)}
                                                    />
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleOpenDialog(position)}
                                                    >
                                                        <Edit className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                                                No hay puestos registrados
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
                                    {isEditing ? 'Editar Puesto' : 'Nuevo Puesto'}
                                </DialogTitle>
                                <DialogDescription>
                                    Configure los datos del puesto, tabulador salarial y permisos
                                </DialogDescription>
                            </DialogHeader>

                            <div className="grid gap-4 py-4">
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Codigo *</Label>
                                        <Input
                                            value={formData.code}
                                            onChange={(e) => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                            placeholder="GER-001"
                                            className="font-mono uppercase"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nombre del Puesto *</Label>
                                        <Input
                                            value={formData.name}
                                            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                            placeholder="Gerente de Operaciones"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Departamento *</Label>
                                        <Select
                                            value={formData.departmentId || '_empty'}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, departmentId: v === '_empty' ? '' : v }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Seleccionar departamento" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {departments && departments.length > 0 ? (
                                                    departments.filter(d => d.isActive).map((dept) => (
                                                        <SelectItem key={dept.id} value={dept.id}>
                                                            {dept.code} - {dept.name}
                                                        </SelectItem>
                                                    ))
                                                ) : (
                                                    <SelectItem value="_empty" disabled>
                                                        No hay departamentos. Créelos primero.
                                                    </SelectItem>
                                                )}
                                            </SelectContent>
                                        </Select>
                                        <p className="text-xs text-muted-foreground">
                                            <Link href="/hcm/admin/departments" className="text-primary hover:underline">
                                                Administrar departamentos
                                            </Link>
                                        </p>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Nivel Jerárquico</Label>
                                        <Select
                                            value={formData.level.toString()}
                                            onValueChange={(v) => setFormData(prev => ({ ...prev, level: parseInt(v) }))}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1">1 - Director</SelectItem>
                                                <SelectItem value="2">2 - Gerente</SelectItem>
                                                <SelectItem value="3">3 - Coordinador</SelectItem>
                                                <SelectItem value="4">4 - Supervisor</SelectItem>
                                                <SelectItem value="5">5 - Analista</SelectItem>
                                                <SelectItem value="6">6 - Operativo</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <Label className="flex items-center gap-2">
                                        <DollarSign className="h-4 w-4" />
                                        Tabulador Salarial (Diario)
                                    </Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Minimo</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.salaryMin}
                                                onChange={(e) => setFormData(prev => ({ ...prev, salaryMin: e.target.value }))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs text-muted-foreground">Maximo</Label>
                                            <Input
                                                type="number"
                                                step="0.01"
                                                value={formData.salaryMax}
                                                onChange={(e) => setFormData(prev => ({ ...prev, salaryMax: e.target.value }))}
                                                placeholder="0.00"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    <Label className="flex items-center gap-2">
                                        <Shield className="h-4 w-4" />
                                        Permisos Especiales
                                    </Label>
                                    <div className="space-y-3">
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="canApproveOvertime"
                                                checked={formData.canApproveOvertime}
                                                onCheckedChange={(checked) =>
                                                    setFormData(prev => ({ ...prev, canApproveOvertime: !!checked }))
                                                }
                                            />
                                            <Label htmlFor="canApproveOvertime">
                                                Puede aprobar horas extras
                                            </Label>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <Checkbox
                                                id="canApproveIncidences"
                                                checked={formData.canApproveIncidences}
                                                onCheckedChange={(checked) =>
                                                    setFormData(prev => ({ ...prev, canApproveIncidences: !!checked }))
                                                }
                                            />
                                            <Label htmlFor="canApproveIncidences">
                                                Puede aprobar incidencias
                                            </Label>
                                        </div>
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
