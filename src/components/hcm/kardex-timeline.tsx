
"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Briefcase, Building2, User, MapPin, ArrowRight, Calendar, FileText } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";

// --- Types (Local for now, move to types/hcm.ts later if needed) ---

export type MovementType = 'hire' | 'promotion' | 'demotion' | 'transfer' | 'salary_change' | 'termination' | 'rehire' | 'data_update';

export interface EmployeeMovement {
    id: string;
    employeeId: string;
    type: MovementType;
    date: string;
    reason: string;

    // Changes
    previousPosition?: string;
    newPosition?: string;

    previousDepartment?: string;
    newDepartment?: string;

    previousManager?: string;
    newManager?: string;

    previousLocation?: string;
    newLocation?: string;

    // Metadata
    registeredBy: string; // User ID or Name
    requestId?: string; // Linked request
    createdAt: string;
}

interface KardexTimelineProps {
    movements: EmployeeMovement[];
    isLoading?: boolean;
}

/*
 * Helper to get icon based on movement type
 */
const getMovementIcon = (type: MovementType) => {
    switch (type) {
        case 'hire': return <User className="h-4 w-4 text-green-600" />;
        case 'termination': return <User className="h-4 w-4 text-red-600" />;
        case 'promotion': return <Briefcase className="h-4 w-4 text-blue-600" />;
        case 'demotion': return <Briefcase className="h-4 w-4 text-orange-600" />;
        case 'transfer': return <Building2 className="h-4 w-4 text-purple-600" />;
        case 'rehire': return <User className="h-4 w-4 text-green-600" />;
        case 'data_update': return <FileText className="h-4 w-4 text-gray-600" />;
        default: return <Briefcase className="h-4 w-4 text-gray-600" />;
    }
};

const getMovementLabel = (type: MovementType) => {
    switch (type) {
        case 'hire': return 'Contratación';
        case 'termination': return 'Baja';
        case 'promotion': return 'Promoción';
        case 'demotion': return 'Cambio de Puesto';
        case 'transfer': return 'Transferencia';
        case 'rehire': return 'Reingreso';
        case 'data_update': return 'Actualización de Datos';
        default: return 'Movimiento';
    }
};

export function KardexTimeline({ movements, isLoading }: KardexTimelineProps) {
    if (isLoading) {
        return <div className="p-4 text-center text-muted-foreground">Cargando historial...</div>;
    }

    if (!movements || movements.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed bg-muted/10">
                <FileText className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Historial Vacío</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    No se han registrado movimientos para este empleado.
                </p>
            </div>
        );
    }

    // Sort by date desc
    const sortedMovements = [...movements].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return (
        <ScrollArea className="h-[600px] pr-4">
            <div className="relative border-l border-muted ml-4 space-y-8 py-2">
                {sortedMovements.map((move, index) => (
                    <div key={move.id} className="relative pl-8">
                        {/* Timeline Dot */}
                        <div className="absolute -left-[9px] top-1 h-4 w-4 rounded-full bg-background border-2 border-primary flex items-center justify-center">
                            <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        </div>

                        <Card className="mb-2">
                            <CardHeader className="p-4 pb-2">
                                <div className="flex justify-between items-start">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="gap-1 pl-1 pr-2">
                                                <div className="bg-muted p-0.5 rounded-full">
                                                    {getMovementIcon(move.type)}
                                                </div>
                                                {getMovementLabel(move.type)}
                                            </Badge>
                                            <span className="text-sm text-muted-foreground hidden sm:inline-block">
                                                • {format(new Date(move.date), "PPP", { locale: es })}
                                            </span>
                                        </div>
                                    </div>
                                    {move.requestId && (
                                        <Badge variant="secondary" className="text-[10px] font-mono">
                                            REQ: {move.requestId.slice(0, 8)}
                                        </Badge>
                                    )}
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 pt-2 space-y-3">
                                <p className="text-sm font-medium">{move.reason}</p>

                                {(move.previousPosition || move.newPosition) && (
                                    <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-center text-sm bg-muted/30 p-2 rounded">
                                        <span className="text-muted-foreground text-right truncate">{move.previousPosition || '---'}</span>
                                        <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                        <span className="font-medium truncate">{move.newPosition || '---'}</span>
                                    </div>
                                )}

                                {(move.previousDepartment || move.newDepartment) && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                        <Building2 className="h-3 w-3" />
                                        <span>{move.previousDepartment}</span>
                                        <ArrowRight className="h-3 w-3" />
                                        <span className="font-medium text-foreground">{move.newDepartment}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                        <User className="h-3 w-3" /> Registrado por: {move.registeredBy}
                                    </span>
                                    <span className="sm:hidden">
                                        {format(new Date(move.date), "dd/MM/yy")}
                                    </span>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                ))}
            </div>
        </ScrollArea>
    );
}
