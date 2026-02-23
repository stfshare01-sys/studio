
'use client';

import { useState, useEffect, useMemo } from 'react';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { hasDirectReports } from '@/firebase/actions/team-actions';
import { getEmployeeByUserId } from '@/firebase/actions/employee-actions';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamCalendar } from '@/components/hcm/team-calendar';
import type { Employee, Incidence } from '@/lib/types';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Calendar, Users, ShieldAlert } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { usePermissions } from "@/hooks/use-permissions";
import { es } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';

function AccessDenied() {
    return (
        <Card className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8 mt-8">
            <div className="flex flex-col items-center gap-2 text-center">
                <ShieldAlert className="h-12 w-12 text-destructive" />
                <h3 className="text-2xl font-bold tracking-tight">Acceso Denegado</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                    Esta página solo está disponible para usuarios con roles de Manager, HRManager o Admin.
                </p>
                <Button className="mt-4" asChild>
                    <Link href="/hcm">Volver al Módulo HCM</Link>
                </Button>
            </div>
        </Card>
    );
}

function CalendarSkeleton() {
    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Skeleton className="h-10 w-10" />
                <div className="space-y-2">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-4 w-48" />
                </div>
            </div>
            <Card>
                <CardHeader>
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-64" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-[400px] w-full" />
                </CardContent>
            </Card>
        </div>
    );
}


/**
 * Team Calendar Page
 */
export default function TeamCalendarPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const [selectedDate, setSelectedDate] = useState<Date | null>(null);
    const [selectedEmployees, setSelectedEmployees] = useState<Employee[]>([]);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    // Check if user has Admin permissions (only Admin role exists in current UserRole type)
    const [isDirectManager, setIsDirectManager] = useState(false);

    useEffect(() => {
        const canCheckReports = user?.role && ['Manager', 'HRManager', 'Admin'].includes(user.role);
        if (user?.uid && canCheckReports) {
            hasDirectReports(user.uid).then(setIsDirectManager);
        }
    }, [user]);

    const { hasPermission } = usePermissions();
    const isGlobalManager = hasPermission('hcm_team_management_global', 'read');
    const canAccess = true; // Everyone can access, but data is scoped

    // Fetch the current user's employee document if they are not a global manager
    const [managerDoc, setManagerDoc] = useState<Employee | null>(null);
    useEffect(() => {
        if (user?.uid && !isGlobalManager) {
            getEmployeeByUserId(user.uid).then((res: any) => {
                if (res.success && res.employee) {
                    setManagerDoc(res.employee);
                }
            });
        }
    }, [user?.uid, isGlobalManager]);

    // Fetch active employees - only if user is loaded and has permissions
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading || !user?.uid) return null;

        if (isGlobalManager) {
            return query(
                collection(firestore, 'employees'),
                where('status', '==', 'active'),
                orderBy('fullName', 'asc')
            );
        } else if (isDirectManager) {
            // Managers only see their direct reports
            return query(
                collection(firestore, 'employees'),
                where('directManagerId', '==', user.uid),
                where('status', '==', 'active'),
                orderBy('fullName', 'asc')
            );
        } else {
            // Regular employee just themselves
            return query(
                collection(firestore, 'employees'),
                where('userId', '==', user.uid),
                limit(1)
            );
        }
    }, [firestore, isUserLoading, isGlobalManager, isDirectManager, user?.uid]);

    const { data: rawEmployees, isLoading: employeesLoading } = useCollection<Employee>(employeesQuery);

    const employees = useMemo(() => {
        if (!rawEmployees) return [];
        if (isGlobalManager) return rawEmployees;

        let list = [...rawEmployees];
        if (managerDoc && !list.find((e: Employee) => e.id === managerDoc.id)) {
            list.push(managerDoc);
        }
        return list;
    }, [rawEmployees, managerDoc, isGlobalManager]);

    // Fetch approved incidences - only if user is loaded and has permissions
    const incidencesQuery = useMemoFirebase(() => {
        if (!firestore || isUserLoading) return null;
        if (isGlobalManager) {
            return query(
                collection(firestore, 'incidences'),
                where('status', '==', 'approved'),
                orderBy('startDate', 'desc')
            );
        } else if (employees && employees.length > 0) {
            const validIds = employees.map((e: Employee) => e.id).filter(Boolean);
            if (validIds.length > 0 && validIds.length <= 30) {
                return query(
                    collection(firestore, 'incidences'),
                    where('employeeId', 'in', validIds),
                    where('status', '==', 'approved')
                );
            }
        }
        return null; // Don't fetch if no employees configured yet
    }, [firestore, isUserLoading, isGlobalManager, employees]);

    const { data: incidences, isLoading: incidencesLoading } = useCollection<Incidence>(incidencesQuery);

    const isLoading = isUserLoading || employeesLoading || incidencesLoading;

    if (isUserLoading) {
        return (
            <SiteLayout>
                <div className="flex-1 flex-col p-4 sm:p-6">
                    <CalendarSkeleton />
                </div>
            </SiteLayout>
        );
    }

    const handleDayClick = (date: Date, employeesOff: Employee[]) => {
        setSelectedDate(date);
        setSelectedEmployees(employeesOff);
        if (employeesOff.length > 0) {
            setIsDialogOpen(true);
        }
    };

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Calculate team availability
    const totalEmployees = employees?.length ?? 0;
    const todayAbsent = employees?.filter(emp => {
        const today = new Date();
        return incidences?.some(inc => {
            const start = new Date(inc.startDate);
            const end = new Date(inc.endDate);
            return inc.employeeId === emp.id && today >= start && today <= end && inc.status === 'approved';
        });
    }).length ?? 0;

    const availableToday = totalEmployees - todayAbsent;
    const availabilityPercent = totalEmployees > 0 ? Math.round((availableToday / totalEmployees) * 100) : 100;

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
                                <Calendar className="h-6 w-6" />
                                Calendario del Equipo
                            </h1>
                            <p className="text-muted-foreground">
                                Visualización de disponibilidad y ausencias del equipo
                            </p>
                        </div>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">

                    {/* Availability Badge */}
                    <Card>
                        <CardContent className="p-4 flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-muted-foreground" />
                                <span className="text-sm font-medium">Disponibilidad Hoy:</span>
                            </div>
                            <Badge
                                variant="outline"
                                className={`text-lg px-3 py-1 ${availabilityPercent >= 90 ? 'bg-green-100 text-green-800 border-green-300' :
                                    availabilityPercent >= 70 ? 'bg-yellow-100 text-yellow-800 border-yellow-300' :
                                        'bg-red-100 text-red-800 border-red-300'
                                    }`}
                            >
                                {availableToday}/{totalEmployees} ({availabilityPercent}%)
                            </Badge>
                        </CardContent>
                    </Card>

                    {/* Main Content */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Calendario de Ausencias</CardTitle>
                            <CardDescription>
                                {isLoading ? 'Cargando...' :
                                    `${totalEmployees} empleados • ${incidences?.length ?? 0} permisos aprobados`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-muted-foreground">Cargando calendario...</p>
                                </div>
                            ) : employees && incidences ? (
                                <TeamCalendar
                                    employees={employees}
                                    incidences={incidences}
                                    onDayClick={handleDayClick}
                                />
                            ) : (
                                <div className="flex items-center justify-center h-64">
                                    <p className="text-muted-foreground">No hay datos para mostrar</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </main>
            </div>

            {/* Day Detail Dialog */}
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            Ausencias del {selectedDate && format(selectedDate, "d 'de' MMMM, yyyy", { locale: es })}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedEmployees.length} empleado{selectedEmployees.length !== 1 ? 's' : ''} ausente{selectedEmployees.length !== 1 ? 's' : ''}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {selectedEmployees.map(emp => {
                            const empIncidences = incidences?.filter(inc => {
                                if (inc.employeeId !== emp.id || !selectedDate) return false;
                                const start = new Date(inc.startDate);
                                const end = new Date(inc.endDate);
                                return selectedDate >= start && selectedDate <= end;
                            }) ?? [];

                            return (
                                <div key={emp.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />
                                            <AvatarFallback>{getInitials(emp.fullName)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium">{emp.fullName}</p>
                                            <p className="text-sm text-muted-foreground">{emp.positionTitle} • {emp.department}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end gap-1">
                                        {empIncidences.map(inc => (
                                            <Badge key={inc.id} variant="secondary">
                                                {inc.type === 'vacation' ? 'Vacaciones' :
                                                    inc.type === 'sick_leave' ? 'Incapacidad' :
                                                        inc.type === 'personal_leave' ? 'Permiso' :
                                                            inc.type}
                                            </Badge>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    <div className="flex justify-end pt-4">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cerrar
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </SiteLayout>
    );
}
