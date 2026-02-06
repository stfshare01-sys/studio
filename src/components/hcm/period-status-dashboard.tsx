/**
 * Period Status Dashboard Component
 * 
 * Muestra el estado de cierre del período para RH.
 * Indica qué jefes han cerrado su revisión y cuáles están pendientes.
 */

'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, Clock } from 'lucide-react';
import { useFirebase, useMemoFirebase } from '@/firebase';
import { collection, query, where } from 'firebase/firestore';
import { useCollection } from '@/firebase/firestore/use-collection';

interface PeriodClosure {
    id: string;
    managerId: string;
    managerName: string;
    period: string;
    closedAt: string;
    pendingInfractionsCount: number;
}

interface Manager {
    id: string;
    fullName: string;
    email: string;
}

interface PeriodStatusDashboardProps {
    period: string;
}

export function PeriodStatusDashboard({ period }: PeriodStatusDashboardProps) {
    const { firestore } = useFirebase();

    // Obtener cierres del período
    const closuresQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'period_closures'),
            where('period', '==', period)
        );
    }, [firestore, period]);

    const { data: closures } = useCollection<PeriodClosure>(closuresQuery);

    // Obtener jefes (empleados con managerId definido - son jefes de alguien)
    const managersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active')
        );
    }, [firestore]);

    const { data: allEmployees } = useCollection<Manager>(managersQuery);

    // Filtrar solo los que son jefes (tienen empleados a su cargo)
    const managers = allEmployees?.filter(emp =>
        allEmployees.some(e => (e as any).managerId === emp.id)
    ) || [];

    const closedCount = closures?.length || 0;
    const totalManagers = managers.length;
    const progress = totalManagers > 0 ? (closedCount / totalManagers) * 100 : 0;

    if (!firestore) {
        return (
            <Card>
                <CardHeader>
                    <CardTitle>Estado de Cierre del Período</CardTitle>
                    <CardDescription>Cargando...</CardDescription>
                </CardHeader>
            </Card>
        );
    }

    return (
        <Card>
            <CardHeader>
                <CardTitle>Estado de Cierre del Período</CardTitle>
                <CardDescription>
                    Período: {period}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="space-y-4">
                    {/* Barra de progreso */}
                    <div>
                        <div className="flex justify-between mb-2">
                            <span className="text-sm font-medium">
                                Jefes que han cerrado su revisión
                            </span>
                            <span className="text-sm text-muted-foreground">
                                {closedCount} / {totalManagers}
                            </span>
                        </div>
                        <Progress value={progress} className="h-2" />
                    </div>

                    {/* Lista de jefes */}
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                        {totalManagers === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-4">
                                No hay jefes registrados
                            </p>
                        ) : (
                            managers.map(manager => {
                                const closure = closures?.find(c => c.managerId === manager.id);
                                return (
                                    <div
                                        key={manager.id}
                                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <p className="text-sm font-medium">{manager.fullName}</p>
                                            <p className="text-xs text-muted-foreground">{manager.email}</p>
                                            {closure && (
                                                <p className="text-xs text-muted-foreground mt-1">
                                                    Cerrado: {new Date(closure.closedAt).toLocaleString('es-MX')}
                                                    {closure.pendingInfractionsCount > 0 && (
                                                        <span className="text-orange-600 ml-2">
                                                            ({closure.pendingInfractionsCount} pendientes)
                                                        </span>
                                                    )}
                                                </p>
                                            )}
                                        </div>
                                        {closure ? (
                                            <Badge className="bg-green-100 text-green-800 border-green-200">
                                                <CheckCircle2 className="mr-1 h-3 w-3" />
                                                Cerrado
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="text-orange-600 border-orange-200">
                                                <Clock className="mr-1 h-3 w-3" />
                                                Pendiente
                                            </Badge>
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>

                    {/* Resumen */}
                    {totalManagers > 0 && (
                        <div className="pt-4 border-t">
                            <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">Progreso general:</span>
                                <span className="font-medium">
                                    {progress.toFixed(0)}% completado
                                </span>
                            </div>
                        </div>
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
