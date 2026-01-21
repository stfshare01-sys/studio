'use client';

import { useState } from 'react';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { OrgChart, EmployeeDetailPanel } from '@/components/hcm/org-chart';
import type { Employee } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Network } from 'lucide-react';

/**
 * Org Chart Page
 */
export default function OrgChartPage() {
    const { firestore, isUserLoading } = useFirebase();
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

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
                            <Network className="h-8 w-8" />
                            Organigrama
                        </h1>
                        <p className="text-muted-foreground mt-1">
                            Estructura jerárquica de la organización
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="flex gap-6">
                {/* Org Chart */}
                <Card className="flex-1">
                    <CardHeader>
                        <CardTitle>Estructura Organizacional</CardTitle>
                        <CardDescription>
                            {isLoading ? 'Cargando...' :
                                employees ? `${employees.length} empleados • Haz clic en un nodo para ver detalles` :
                                    'Sin empleados'}
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="overflow-auto">
                        {isLoading ? (
                            <div className="flex items-center justify-center h-64">
                                <p className="text-muted-foreground">Cargando organigrama...</p>
                            </div>
                        ) : employees ? (
                            <OrgChart
                                employees={employees}
                                onEmployeeClick={setSelectedEmployee}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-64">
                                <p className="text-muted-foreground">No hay empleados para mostrar</p>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Employee Detail Panel */}
                {selectedEmployee && (
                    <div className="w-80 shrink-0">
                        <EmployeeDetailPanel
                            employee={selectedEmployee}
                            onClose={() => setSelectedEmployee(null)}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
