
"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
    DialogDescription,
    DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import type { UserRole } from "@/lib/types";
import { Loader2 } from "lucide-react";
import { createNewUser } from "@/firebase/admin-actions";
import { createEmployee } from "@/firebase/actions/employee-actions";

interface CreateUserDialogProps {
    isOpen: boolean;
    onOpenChange: (open: boolean) => void;
}

const MIN_PASSWORD_LENGTH = 6;
const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

export function CreateUserDialog({ isOpen, onOpenChange }: CreateUserDialogProps) {
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<Record<string, string>>({});

    const [formData, setFormData] = useState({
        fullName: "",
        email: "",
        password: "",
        department: "",
        role: "Member" as UserRole,
    });

    const handleInputChange = (id: keyof typeof formData, value: string) => {
        setFormData(prev => ({ ...prev, [id]: value }));
    };

    const validateForm = (): boolean => {
        const newErrors: Record<string, string> = {};
        if (!formData.fullName.trim()) newErrors.fullName = "El nombre completo es requerido.";
        if (!formData.email.trim()) {
            newErrors.email = "El correo electrónico es requerido.";
        } else if (!isValidEmail(formData.email)) {
            newErrors.email = "Ingrese un correo electrónico válido.";
        }
        if (!formData.password) {
            newErrors.password = "La contraseña es requerida.";
        } else if (formData.password.length < MIN_PASSWORD_LENGTH) {
            newErrors.password = `La contraseña debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
        }
        if (!formData.department.trim()) newErrors.department = "El departamento es requerido.";

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    const handleSubmit = async () => {
        if (!validateForm()) {
            toast({
                variant: "destructive",
                title: "Formulario incompleto",
                description: "Por favor, corrija los errores indicados.",
            });
            return;
        }

        setIsSubmitting(true);
        try {
            // 1. Create the User (Auth + User Doc)
            const userResult = await createNewUser(formData);

            if (userResult.success && userResult.uid) {
                // 2. Create the Employee Record automatically
                // We provide default values for fields not collected in the User Dialog
                await createEmployee(userResult.uid, {
                    fullName: formData.fullName,
                    email: formData.email,
                    department: formData.department,
                    positionTitle: formData.role || 'Member', // Default position to Role
                    employmentType: 'full_time',
                    shiftType: 'diurnal',
                    hireDate: new Date().toISOString(),
                });
            }

            toast({
                title: "Usuario y Empleado Creados",
                description: `Se ha creado la cuenta y el expediente para ${formData.fullName}.`,
            });
            onOpenChange(false);
            // Reset form for next time
            setFormData({ fullName: "", email: "", password: "", department: "", role: "Member" as UserRole });
        } catch (error: any) {
            toast({
                variant: "destructive",
                title: "Error al crear usuario",
                description: error.message || "No se pudo crear el usuario.",
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>Crear Nuevo Usuario</DialogTitle>
                    <DialogDescription>
                        Complete los detalles para crear una nueva cuenta de usuario. Se le enviará la contraseña temporal.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                        <Label htmlFor="fullName">Nombre Completo</Label>
                        <Input id="fullName" value={formData.fullName} onChange={(e) => handleInputChange('fullName', e.target.value)} className={errors.fullName ? "border-destructive" : ""} />
                        {errors.fullName && <p className="text-sm text-destructive">{errors.fullName}</p>}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="email">Correo Electrónico</Label>
                        <Input id="email" type="email" value={formData.email} onChange={(e) => handleInputChange('email', e.target.value)} className={errors.email ? "border-destructive" : ""} />
                        {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="password">Contraseña Temporal</Label>
                        <Input id="password" type="password" value={formData.password} onChange={(e) => handleInputChange('password', e.target.value)} className={errors.password ? "border-destructive" : ""} />
                        {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="department">Departamento</Label>
                        <Input id="department" value={formData.department} onChange={(e) => handleInputChange('department', e.target.value)} className={errors.department ? "border-destructive" : ""} />
                        {errors.department && <p className="text-sm text-destructive">{errors.department}</p>}
                    </div>
                    <div className="grid gap-2">
                        <Label htmlFor="role">Rol</Label>
                        <Select value={formData.role} onValueChange={(value) => handleInputChange('role', value as UserRole)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Seleccionar rol" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="Admin">Admin</SelectItem>
                                <SelectItem value="Designer">Diseñador de Procesos</SelectItem>
                                <SelectItem value="Member">Miembro</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                    <DialogClose asChild>
                        <Button variant="outline" className="w-full sm:w-auto">Cancelar</Button>
                    </DialogClose>
                    <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full sm:w-auto">
                        {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Crear Usuario
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
