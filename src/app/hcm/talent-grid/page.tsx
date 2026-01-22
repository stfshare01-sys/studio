'use client';

import { useState } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NineBoxGrid } from '@/components/hcm/nine-box-grid';
import type { Employee } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Grid3X3, Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * 9-Box Grid Talent Evaluation Page
 */
export default function TalentGridPage() {
    const { firestore, isUserLoading } = useFirebase();

    // Fetch active employees
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active'),
            orderBy('fullName', 'asc')
        );
    }, [firestore]);

    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    const handleEmployeeClick = (employee: Employee) => {
        // Navigate to employee detail or open modal
        window.location.href = `/hcm/employees/${employee.id}`;
    };

    return (
        <div className="container mx-auto py-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="ghost" size="icon" asChild>
                        <Link href="/hcm">
                            <ArrowLeft className="h-4 w-4" />
                        </Link>
                    </Button>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                            <Grid3X3 className="h-8 w-8" />
                            Matriz 9-Box
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Evaluación de talento por desempeño y potencial
                        </p>
                    </div>
                </div>
            </div>

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
        </div>
    );
}
