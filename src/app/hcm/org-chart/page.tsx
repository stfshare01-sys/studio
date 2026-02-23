
"use client";

import React, { useState, useRef, useMemo } from "react";
import SiteLayout from "@/components/site-layout";
import { useFirestore, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, orderBy } from "firebase/firestore";
import type { Employee, User } from "@/lib/types";
import { OrgChartTree, EmployeeDetailPanel } from "@/components/hcm/org-chart";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Maximize2, ZoomIn, ZoomOut } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

export default function OrgChartPage() {
    const firestore = useFirestore();
    const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

    const usersQuery = useMemoFirebase(() => {
        if (!firestore) return null;
        return query(
            collection(firestore, 'users'),
            where('status', '==', 'active'),
            orderBy('fullName', 'asc')
        );
    }, [firestore]);

    const { data: users, isLoading } = useCollection<User>(usersQuery);

    const employees = useMemo(() => {
        if (!users) return null;
        return users.map(u => ({
            ...u,
            directManagerId: u.managerId,
            positionTitle: u.department || 'Sin Puesto Asignado',
        } as unknown as Employee));
    }, [users]);

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
        // Only start drag if not clicking on a card
        if ((e.target as HTMLElement).closest('[data-radix-collection-item]') ||
            (e.target as HTMLElement).closest('.cursor-pointer')) {
            return;
        }
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

    const handleEmployeeClick = (employee: Employee) => {
        setSelectedEmployee(employee);
    };

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
                                Haz clic en un nodo para ver detalles del colaborador.
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
                        <div className="flex h-full">
                            {/* Org Chart Area */}
                            <div className="flex-1 relative">
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
                                    className={`w-full h-full overflow-hidden ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
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
                                        <OrgChartTree
                                            employees={employees}
                                            onEmployeeClick={handleEmployeeClick}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Employee Detail Panel */}
                            {selectedEmployee && (
                                <div className="w-80 border-l bg-background p-4 overflow-y-auto animate-in slide-in-from-right duration-300">
                                    <EmployeeDetailPanel
                                        employee={selectedEmployee}
                                        onClose={() => setSelectedEmployee(null)}
                                    />
                                </div>
                            )}
                        </div>
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
