
"use client";

import SiteLayout from "@/components/site-layout";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { Employee } from "@/lib/types";
import { OrgChartTree } from "@/components/hcm/org-chart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export default function OrgChartPage() {
    const firestore = useFirestore();

    const employeesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active'),
            orderBy('fullName', 'asc') // Sort matters less for tree, but good for consistency
        );
    }, [firestore]);

    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    return (
        <SiteLayout>
            <div className="flex flex-col h-[calc(100vh-65px)]">
                <header className="flex items-center justify-between p-4 px-6 border-b bg-background z-10">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-lg font-semibold">Organigrama Dinámico</h1>
                            <p className="text-sm text-muted-foreground hidden sm:block">
                                Visualización jerárquica de la organización.
                            </p>
                        </div>
                    </div>
                    {employees && (
                        <div className="text-sm text-muted-foreground">
                            {employees.length} Empleados Activos
                        </div>
                    )}
                </header>

                <main className="flex-1 relative bg-muted/5 overflow-hidden">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-full">
                            <div className="space-y-4 text-center">
                                <Skeleton className="h-12 w-12 rounded-full mx-auto" />
                                <Skeleton className="h-4 w-48 mx-auto" />
                                <p className="text-sm text-muted-foreground">Construyendo jerarquía...</p>
                            </div>
                        </div>
                    ) : employees && employees.length > 0 ? (
                        <TransformWrapper
                            initialScale={0.8}
                            minScale={0.4}
                            maxScale={2}
                            centerOnInit
                            limitToBounds={false}
                        >
                            {({ zoomIn, zoomOut, resetTransform }) => (
                                <>
                                    <div className="absolute bottom-4 right-4 flex gap-2 z-50">
                                        <Button variant="secondary" size="icon" onClick={() => zoomIn()}>
                                            <ZoomIn className="h-4 w-4" />
                                        </Button>
                                        <Button variant="secondary" size="icon" onClick={() => zoomOut()}>
                                            <ZoomOut className="h-4 w-4" />
                                        </Button>
                                        <Button variant="secondary" size="icon" onClick={() => resetTransform()}>
                                            <Maximize2 className="h-4 w-4" />
                                        </Button>
                                    </div>

                                    <TransformComponent wrapperClass="w-full h-full" contentClass="w-full h-full">
                                        <div className="min-w-full min-h-full flex items-center justify-center p-12">
                                            <OrgChartTree employees={employees} />
                                        </div>
                                    </TransformComponent>
                                </>
                            )}
                        </TransformWrapper>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            No se encontraron empleados activos.
                        </div>
                    )}
                </main>
            </div>
        </SiteLayout>
    );
}
