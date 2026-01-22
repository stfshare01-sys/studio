'use client';

import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Star,
    TrendingUp,
    Award,
    AlertTriangle,
    Target,
    Zap
} from 'lucide-react';
import type { Employee } from '@/lib/types';
import Link from 'next/link';

interface NineBoxGridProps {
    employees: Employee[];
    onEmployeeClick?: (employee: Employee) => void;
}

// 9-Box Grid cell definitions
const GRID_CELLS = [
    // Row 1 (High Potential)
    { performance: 1, potential: 3, label: 'Enigma', description: 'Alto potencial, bajo desempeño', color: 'bg-yellow-50 border-yellow-200', icon: AlertTriangle, recommendation: 'Investigar barreras y brindar soporte' },
    { performance: 2, potential: 3, label: 'Estrella Emergente', description: 'Alto potencial, desempeño medio', color: 'bg-blue-50 border-blue-200', icon: TrendingUp, recommendation: 'Acelerar desarrollo con mentoring' },
    { performance: 3, potential: 3, label: 'Estrella', description: 'Alto potencial, alto desempeño', color: 'bg-green-50 border-green-200', icon: Star, recommendation: 'Preparar para roles de liderazgo' },

    // Row 2 (Medium Potential)
    { performance: 1, potential: 2, label: 'Dilema', description: 'Potencial medio, bajo desempeño', color: 'bg-red-50 border-red-200', icon: AlertTriangle, recommendation: 'Plan de mejora con timeline definido' },
    { performance: 2, potential: 2, label: 'Profesional Clave', description: 'Potencial y desempeño medio', color: 'bg-gray-50 border-gray-200', icon: Target, recommendation: 'Mantener motivación y desarrollo continuo' },
    { performance: 3, potential: 2, label: 'Alto Desempeño', description: 'Potencial medio, alto desempeño', color: 'bg-emerald-50 border-emerald-200', icon: Award, recommendation: 'Reconocer logros, explorar especialización' },

    // Row 3 (Low Potential)
    { performance: 1, potential: 1, label: 'Separación', description: 'Bajo potencial, bajo desempeño', color: 'bg-red-100 border-red-300', icon: AlertTriangle, recommendation: 'Evaluar continuidad o reubicación' },
    { performance: 2, potential: 1, label: 'Contribuidor Efectivo', description: 'Bajo potencial, desempeño medio', color: 'bg-orange-50 border-orange-200', icon: Target, recommendation: 'Optimizar en rol actual' },
    { performance: 3, potential: 1, label: 'Especialista', description: 'Bajo potencial, alto desempeño', color: 'bg-teal-50 border-teal-200', icon: Zap, recommendation: 'Retener como experto técnico' },
];

/**
 * Get cell definition for an employee based on their ratings
 */
function getCellForEmployee(employee: Employee) {
    const performance = employee.performanceRating || 2;
    const potential = employee.potentialRating || 2;

    // Map 1-5 scale to 1-3 grid
    const perfLevel = performance <= 2 ? 1 : performance <= 3 ? 2 : 3;
    const potLevel = potential <= 2 ? 1 : potential <= 3 ? 2 : 3;

    return GRID_CELLS.find(c => c.performance === perfLevel && c.potential === potLevel);
}

/**
 * Group employees by their 9-box position
 */
function groupEmployeesByCell(employees: Employee[]): Map<string, Employee[]> {
    const groups = new Map<string, Employee[]>();

    employees.forEach(emp => {
        if (!emp.performanceRating && !emp.potentialRating) return; // Skip unrated employees

        const cell = getCellForEmployee(emp);
        if (!cell) return;

        const key = `${cell.performance}-${cell.potential}`;
        const existing = groups.get(key) || [];
        groups.set(key, [...existing, emp]);
    });

    return groups;
}

/**
 * Single cell in the 9-box grid
 */
function GridCell({
    cell,
    employees,
    onEmployeeClick
}: {
    cell: typeof GRID_CELLS[0];
    employees: Employee[];
    onEmployeeClick?: (employee: Employee) => void;
}) {
    const Icon = cell.icon;
    const [isExpanded, setIsExpanded] = useState(false);

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const displayEmployees = employees.slice(0, 4);
    const remainingCount = employees.length - 4;

    return (
        <>
            <div
                className={`
          ${cell.color} border-2 rounded-lg p-3 min-h-[140px]
          hover:shadow-md transition-shadow cursor-pointer
        `}
                onClick={() => employees.length > 0 && setIsExpanded(true)}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                        <Icon className="h-4 w-4" />
                        <span className="font-semibold text-sm">{cell.label}</span>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                        {employees.length}
                    </Badge>
                </div>

                {/* Employees */}
                {employees.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                        <TooltipProvider>
                            {displayEmployees.map((emp) => (
                                <Tooltip key={emp.id}>
                                    <TooltipTrigger asChild>
                                        <Avatar className="h-8 w-8 border-2 border-background cursor-pointer hover:ring-2 ring-primary">
                                            <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />
                                            <AvatarFallback className="text-xs">{getInitials(emp.fullName)}</AvatarFallback>
                                        </Avatar>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p className="font-medium">{emp.fullName}</p>
                                        <p className="text-xs text-muted-foreground">{emp.positionTitle}</p>
                                    </TooltipContent>
                                </Tooltip>
                            ))}
                            {remainingCount > 0 && (
                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium">
                                    +{remainingCount}
                                </div>
                            )}
                        </TooltipProvider>
                    </div>
                ) : (
                    <p className="text-xs text-muted-foreground italic">Sin empleados</p>
                )}
            </div>

            {/* Expanded Dialog */}
            <Dialog open={isExpanded} onOpenChange={setIsExpanded}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Icon className="h-5 w-5" />
                            {cell.label}
                        </DialogTitle>
                        <DialogDescription>{cell.description}</DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4">
                        {/* Recommendation */}
                        <div className="bg-muted/50 rounded-lg p-3">
                            <p className="text-sm font-medium mb-1">Recomendación:</p>
                            <p className="text-sm text-muted-foreground">{cell.recommendation}</p>
                        </div>

                        {/* Employees List */}
                        <div className="space-y-2 max-h-[300px] overflow-y-auto">
                            {employees.map((emp) => (
                                <div
                                    key={emp.id}
                                    className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 cursor-pointer"
                                    onClick={() => {
                                        onEmployeeClick?.(emp);
                                        setIsExpanded(false);
                                    }}
                                >
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-10 w-10">
                                            <AvatarImage src={emp.avatarUrl} alt={emp.fullName} />
                                            <AvatarFallback>{getInitials(emp.fullName)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-medium text-sm">{emp.fullName}</p>
                                            <p className="text-xs text-muted-foreground">{emp.positionTitle} • {emp.department}</p>
                                        </div>
                                    </div>
                                    <div className="flex gap-1">
                                        <Badge variant="outline" className="text-xs">
                                            P: {emp.performanceRating || '-'}
                                        </Badge>
                                        <Badge variant="outline" className="text-xs">
                                            Pot: {emp.potentialRating || '-'}
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

/**
 * 9-Box Grid Component for Talent Evaluation
 */
export function NineBoxGrid({ employees, onEmployeeClick }: NineBoxGridProps) {
    const groupedEmployees = useMemo(() => groupEmployeesByCell(employees), [employees]);

    const ratedEmployees = employees.filter(e => e.performanceRating || e.potentialRating);
    const unratedCount = employees.length - ratedEmployees.length;

    return (
        <div className="space-y-4">
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <span className="font-medium">Desempeño:</span>
                    <span className="text-muted-foreground">Bajo → Alto (izq. a der.)</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="font-medium">Potencial:</span>
                    <span className="text-muted-foreground">Bajo → Alto (abajo a arriba)</span>
                </div>
                {unratedCount > 0 && (
                    <Badge variant="outline">
                        {unratedCount} sin evaluar
                    </Badge>
                )}
            </div>

            {/* Grid */}
            <div className="relative">
                {/* Y-Axis Label */}
                <div className="absolute -left-8 top-1/2 -translate-y-1/2 -rotate-90 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    POTENCIAL
                </div>

                <div className="ml-4">
                    {/* Grid Container */}
                    <div className="grid grid-cols-3 gap-2">
                        {/* Row 1 - High Potential */}
                        {GRID_CELLS.slice(0, 3).map((cell) => (
                            <GridCell
                                key={`${cell.performance}-${cell.potential}`}
                                cell={cell}
                                employees={groupedEmployees.get(`${cell.performance}-${cell.potential}`) || []}
                                onEmployeeClick={onEmployeeClick}
                            />
                        ))}

                        {/* Row 2 - Medium Potential */}
                        {GRID_CELLS.slice(3, 6).map((cell) => (
                            <GridCell
                                key={`${cell.performance}-${cell.potential}`}
                                cell={cell}
                                employees={groupedEmployees.get(`${cell.performance}-${cell.potential}`) || []}
                                onEmployeeClick={onEmployeeClick}
                            />
                        ))}

                        {/* Row 3 - Low Potential */}
                        {GRID_CELLS.slice(6, 9).map((cell) => (
                            <GridCell
                                key={`${cell.performance}-${cell.potential}`}
                                cell={cell}
                                employees={groupedEmployees.get(`${cell.performance}-${cell.potential}`) || []}
                                onEmployeeClick={onEmployeeClick}
                            />
                        ))}
                    </div>

                    {/* X-Axis Label */}
                    <div className="text-center mt-2 text-xs font-medium text-muted-foreground">
                        DESEMPEÑO
                    </div>
                </div>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                            <Star className="h-5 w-5 text-yellow-500" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {(groupedEmployees.get('3-3')?.length || 0) + (groupedEmployees.get('2-3')?.length || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">Alto Potencial</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                            <Award className="h-5 w-5 text-green-500" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {(groupedEmployees.get('3-3')?.length || 0) +
                                        (groupedEmployees.get('3-2')?.length || 0) +
                                        (groupedEmployees.get('3-1')?.length || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">Alto Desempeño</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardContent className="pt-4">
                        <div className="flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-500" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {(groupedEmployees.get('1-1')?.length || 0) + (groupedEmployees.get('1-2')?.length || 0)}
                                </p>
                                <p className="text-xs text-muted-foreground">Requieren Atención</p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export default NineBoxGrid;
