'use client';

import { useState, useEffect } from 'react';
import { useFirebase } from '@/firebase/provider';
import SiteLayout from '@/components/site-layout';
import { Clock, Loader2, ArrowLeft } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { MyAttendanceWidget } from '@/components/hcm/my-attendance-widget';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import type { Employee } from "@/types/hcm.types";

export default function MyAttendancePage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const [employee, setEmployee] = useState<Employee | null>(null);
    const [profileLoading, setProfileLoading] = useState(true);

    // Cargar el perfil completo del empleado desde Firestore
    useEffect(() => {
        if (!firestore || !user?.uid || isUserLoading) return;

        setProfileLoading(true);
        getDoc(doc(firestore, 'employees', user.uid))
            .then(snap => {
                if (snap.exists()) {
                    setEmployee({ id: snap.id, ...snap.data() } as Employee);
                }
            })
            .catch(() => {
                // Si no encuentra perfil en employees, construir uno mínimo desde session
                setEmployee({
                    id: user.uid,
                    fullName: user.displayName ?? user.email ?? 'Empleado',
                    homeOfficeDays: [],
                    directManagerId: null,
                    shiftType: 'diurnal',
                } as unknown as Employee);
            })
            .finally(() => setProfileLoading(false));
    }, [firestore, user?.uid, isUserLoading]);

    const isLoading = isUserLoading || profileLoading;

    if (isLoading) {
        return (
            <SiteLayout>
                <div className="flex flex-1 items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </SiteLayout>
        );
    }

    if (!employee) {
        return (
            <SiteLayout>
                <div className="flex flex-1 items-center justify-center p-8">
                    <p className="text-muted-foreground">No se pudo cargar tu información de empleado.</p>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-2 p-4 sm:p-6">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="outline"
                            size="icon"
                            className="border-blue-500 text-blue-600 hover:bg-blue-50 shrink-0"
                            asChild
                        >
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-blue-600 p-2">
                                <Clock className="h-5 w-5 text-white" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold tracking-tight">Mi Asistencia</h1>
                                <p className="text-sm text-muted-foreground">Registra tu entrada y salida de hoy</p>
                            </div>
                        </div>
                    </div>
                </header>

                <main className="flex flex-1 flex-col items-center justify-start gap-4 p-4 pt-0 sm:p-6 sm:pt-0">
                    <MyAttendanceWidget employee={employee} />
                </main>
            </div>
        </SiteLayout>
    );
}
