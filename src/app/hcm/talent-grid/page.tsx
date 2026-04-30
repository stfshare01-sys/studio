
'use client';

import { useState } from 'react';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NineBoxGrid } from '@/components/hcm/nine-box-grid';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Grid3X3, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { usePermissions } from '@/hooks/use-permissions';
import type { Employee } from "@/types/hcm.types";

/**
 * 9-Box Grid Talent Evaluation Page
 */
export default function TalentGridPage() {
    const { firestore, user, isUserLoading } = useFirebase();

    // Check if user has HR/Admin permissions to view employees (dynamic permissions)
    const { canRead, isAdmin } = usePermissions();
    const hasHRPermissions = isAdmin || canRead('hcm_talent_grid');

    // Fetch active employees - only if user has HR permissions
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore || !hasHRPermissions) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active'),
            orderBy('fullName', 'asc')
        );
    }, [firestore, hasHRPermissions]);

    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    const handleEmployeeClick = (employee: Employee) => {
        // Navigate to employee detail or open modal
        window.location.href = `/hcm/employees/${employee.id}`;
    };

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                                <Grid3X3 className="h-6 w-6" />
                                Matriz 9-Box
                            </h1>
                            <p className="text-muted-foreground">
                                Evaluación de talento por desempeño y potencial
                            </p>
                        </div>
                    </div>
                </header>
                <main className="flex-1 p-4 pt-0 sm:p-6 sm:pt-0 space-y-6">

                    {/* Info Alert */}
                    <Alert>
                        <Info className="h-4 w-4" />
                        <AlertTitle>¿Cómo funciona la Matriz 9-Box?</AlertTitle>
                        <AlertDescription>
                            Esta herramienta clasifica a los empleados según su <strong>desempeño actual</strong> (eje X)
                            y su <strong>potencial de crecimiento</strong> (eje Y). Los empleados en la esquina superior
                            derecha ("Estrellas") son candidatos para roles de liderazgo. Los de la esquina inferior
                            izquierda requieren atención inmediata.
                        </AlertDescription>
                    </Alert>

                    {/* Main Content */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Mapa de Talento</CardTitle>
                            <CardDescription>
                                {isLoading ? 'Cargando...' :
                                    employees ? `${employees.length} empleados • Haz clic en una celda para ver detalles` :
                                        'Sin empleados'}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-muted-foreground">Cargando matriz de talento...</p>
                                </div>
                            ) : employees ? (
                                <NineBoxGrid
                                    employees={employees}
                                    onEmployeeClick={handleEmployeeClick}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-muted-foreground">No hay empleados para mostrar</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Instructions */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Guía de Interpretación</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-green-600">🌟 Alto Potencial + Alto Desempeño</h4>
                                    <p className="text-sm text-muted-foreground">
                                        "Estrellas" - Invertir en desarrollo acelerado, preparar para sucesión,
                                        asignar proyectos estratégicos y mentorías.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-blue-600">📈 Alto Potencial + Bajo Desempeño</h4>
                                    <p className="text-sm text-muted-foreground">
                                        "Enigmas" - Investigar barreras, proporcionar coaching intensivo,
                                        considerar cambio de rol o equipo.
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <h4 className="font-semibold text-red-600">⚠️ Bajo Potencial + Bajo Desempeño</h4>
                                    <p className="text-sm text-muted-foreground">
                                        "Separación" - Establecer plan de mejora con métricas claras,
                                        evaluar reubicación o proceso de salida.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
