
"use client";

import SiteLayout from "@/components/site-layout";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { Employee } from "@/lib/types";
import { OrgChartTree } from "@/components/hcm/org-chart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, ZoomIn, ZoomOut, Move } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { useState, useRef, useEffect } from "react";

export default function OrgChartPage() {
    const firestore = useFirestore();

    const employeesQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'employees'),
            where('status', '==', 'active'),
            orderBy('fullName', 'asc')
        );
    }, [firestore]);

    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    // Zoom & Pan State
    const [scale, setScale] = useState(0.8);
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [startPos, setStartPos] = useState({ x: 0, y: 0 });
    const containerRef = useRef<HTMLDivElement>(null);

    const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 2));
    const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.4));
    const handleReset = () => {
        setScale(0.8);
        setPosition({ x: 0, y: 0 });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setStartPos({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        setPosition({
            x: e.clientX - startPos.x,
            y: e.clientY - startPos.y
        });
    };

    const handleMouseUp = () => setIsDragging(false);

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
                        <>
                            <div className="absolute bottom-4 right-4 flex gap-2 z-50 shadow-lg bg-background/50 backdrop-blur rounded-lg p-1">
                                <Button variant="ghost" size="icon" onClick={handleZoomIn} title="Acercar">
                                    <ZoomIn className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={handleZoomOut} title="Alejar">
                                    <ZoomOut className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={handleReset} title="Restablecer">
                                    <Maximize2 className="h-4 w-4" />
                                </Button>
                            </div>

                            <div
                                className="w-full h-full overflow-hidden cursor-grab active:cursor-grabbing"
                                onMouseDown={handleMouseDown}
                                onMouseMove={handleMouseMove}
                                onMouseUp={handleMouseUp}
                                onMouseLeave={handleMouseUp}
                                ref={containerRef}
                            >
                                <div
                                    className="w-full h-full flex items-center justify-center p-12 transition-transform duration-75 origin-center"
                                    style={{
                                        transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`
                                    }}
                                >
                                    <OrgChartTree employees={employees} />
                                </div>
                            </div>
                        </>
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
