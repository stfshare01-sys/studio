"use client";

import SiteLayout from '@/components/site-layout';
import { Button } from '@/components/ui/button';
import { Form } from '@/components/ui/form';
import { UserPlus, ArrowLeft, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { useNewEmployee } from './hooks/use-new-employee';
import { PersonalInfoCard } from './components/personal-info-card';
import { AttendanceConfigCard } from './components/attendance-config-card';
import { LegalInfoCard } from './components/legal-info-card';

export default function NewEmployeePage() {
    const { 
        form, 
        isSubmitting, 
        isLoadingCatalogs, 
        onSubmit, 
        catalogs, 
        autoDepartment 
    } = useNewEmployee();

    return (
        <SiteLayout>
            <div className="flex-col md:flex">
                <div className="flex-1 space-y-4 p-8 pt-6">
                    {/* Navegación */}
                    <div className="flex flex-col space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Link href="/hcm/employees">
                                    <Button variant="outline" size="icon" className="h-8 w-8">
                                        <ArrowLeft className="h-4 w-4" />
                                    </Button>
                                </Link>
                                <div>
                                    <h2 className="text-2xl font-bold tracking-tight">Alta de Empleado</h2>
                                    <p className="text-muted-foreground">
                                        Registra un nuevo colaborador en la plataforma
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Estado de Carga */}
                    {isLoadingCatalogs ? (
                        <div className="flex h-[400px] items-center justify-center rounded-lg border border-dashed">
                            <div className="flex flex-col items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin" />
                                <p>Cargando catálogos de HCM...</p>
                            </div>
                        </div>
                    ) : (
                        <Form {...form}>
                            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8 pb-10">
                                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                                    {/* Componente: Información Personal */}
                                    <PersonalInfoCard 
                                        form={form} 
                                        catalogs={catalogs} 
                                        autoDepartmentName={autoDepartment?.name || ''} 
                                    />

                                    {/* Columna Derecha */}
                                    <div className="space-y-6">
                                        {/* Componente: Configuración de Asistencia */}
                                        <AttendanceConfigCard form={form} />

                                        {/* Componente: Información Legal y Fiscal */}
                                        <LegalInfoCard form={form} />
                                    </div>
                                </div>

                                {/* Acciones */}
                                <div className="flex justify-end gap-4 border-t pt-6">
                                    <Link href="/hcm/employees">
                                        <Button type="button" variant="outline" disabled={isSubmitting}>
                                            Cancelar
                                        </Button>
                                    </Link>
                                    <Button type="submit" disabled={isSubmitting}>
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Creando empleado...
                                            </>
                                        ) : (
                                            <>
                                                <UserPlus className="mr-2 h-4 w-4" />
                                                Guardar y Crear Cuenta
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </Form>
                    )}
                </div>
            </div>
        </SiteLayout>
    );
}
