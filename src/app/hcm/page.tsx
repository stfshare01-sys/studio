'use client';

import SiteLayout from '@/components/site-layout';
import { Wrench } from 'lucide-react';

/**
 * HCM Dashboard - Main page for Human Capital Management module
 */
export default function HCMPage() {
    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col h-full items-center justify-center p-8 text-center min-h-[70vh]">
                <div className="flex flex-col items-center max-w-md space-y-4">
                    <div className="bg-primary/10 p-4 rounded-full mb-4">
                        <Wrench className="h-12 w-12 text-primary" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Capital Humano</h1>
                    <p className="text-muted-foreground text-lg">
                        Panel en construcción
                    </p>
                    <p className="text-sm text-muted-foreground mt-4">
                        Utiliza el menú lateral para acceder a las funciones de Directorio, Asistencia, Pre-Nómina y Configuración HCM.
                    </p>
                </div>
            </div>
        </SiteLayout>
    );
}
