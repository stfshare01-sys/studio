
"use client";

import React, { useState } from "react";
import { Employee } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, User, Mail, Building2, Briefcase, Calendar, X, ExternalLink } from "lucide-react";
import Link from "next/link";

// --- Types ---

export type OrgNode = Employee & {
    children: OrgNode[];
    directReportsCount: number;
};

interface OrgChartNodeProps {
    node: OrgNode;
    depth?: number;
    onEmployeeClick?: (employee: Employee) => void;
}

interface OrgChartTreeProps {
    employees: Employee[];
    onEmployeeClick?: (employee: Employee) => void;
}

interface EmployeeDetailPanelProps {
    employee: Employee;
    onClose: () => void;
}

// --- Employee Detail Panel ---

export function EmployeeDetailPanel({ employee, onClose }: EmployeeDetailPanelProps) {
    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

    const formatDate = (date: Date | string | undefined) => {
        if (!date) return 'N/A';
        const d = date instanceof Date ? date : new Date(date);
        return d.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
    };

    return (
        <Card className="h-fit sticky top-4">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">Detalles del Colaborador</CardTitle>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Avatar and Name */}
                <div className="flex items-center gap-4">
                    <Avatar className="h-16 w-16 border-2">
                        <AvatarImage src={employee.avatarUrl} alt={employee.fullName} />
                        <AvatarFallback className="text-lg">{getInitials(employee.fullName)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <h3 className="font-semibold text-lg">{employee.fullName}</h3>
                        <p className="text-sm text-muted-foreground">{employee.positionTitle}</p>
                    </div>
                </div>

                {/* Details */}
                <div className="space-y-3 pt-2">
                    {employee.email && (
                        <div className="flex items-center gap-3 text-sm">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <a href={`mailto:${employee.email}`} className="text-primary hover:underline">
                                {employee.email}
                            </a>
                        </div>
                    )}
                    {employee.department && (
                        <div className="flex items-center gap-3 text-sm">
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                            <span>{employee.department}</span>
                        </div>
                    )}
                    {employee.employmentType && (
                        <div className="flex items-center gap-3 text-sm">
                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                            <Badge variant="secondary">{employee.employmentType}</Badge>
                        </div>
                    )}
                    {employee.hireDate && (
                        <div className="flex items-center gap-3 text-sm">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>Ingreso: {formatDate(employee.hireDate)}</span>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="pt-3 flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                        <Link href={`/hcm/employees/${employee.id}`}>
                            <ExternalLink className="h-4 w-4 mr-2" />
                            Ver Expediente
                        </Link>
                    </Button>
                    <Button size="sm" variant="outline" onClick={onClose}>
                        Cerrar
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

// --- Org Chart Node ---

export function OrgChartNode({ node, depth = 0, onEmployeeClick }: OrgChartNodeProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

    const handleCardClick = (e: React.MouseEvent) => {
        // Prevent triggering when clicking the expand/collapse button
        if ((e.target as HTMLElement).closest('button')) return;
        onEmployeeClick?.(node);
    };

    return (
        <div className="flex flex-col items-center">
            {/* The Node Card */}
            <Card
                className={`relative w-[280px] z-10 transition-all hover:border-primary/50 cursor-pointer hover:shadow-md ${depth === 0 ? 'border-primary shadow-md' : ''}`}
                onClick={handleCardClick}
            >
                <CardContent className="p-4 flex items-center gap-3">
                    <Avatar className="h-10 w-10 border">
                        <AvatarImage src={node.avatarUrl} alt={node.fullName} />
                        <AvatarFallback>{getInitials(node.fullName)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold truncate" title={node.fullName}>
                            {node.fullName}
                        </h4>
                        <p className="text-xs text-muted-foreground truncate" title={node.positionTitle}>
                            {node.positionTitle}
                        </p>
                        {node.directReportsCount > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                                {node.directReportsCount} reporte{node.directReportsCount !== 1 ? 's' : ''} directo{node.directReportsCount !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                </CardContent>

                {/* Expand/Collapse Toggle (if has children) */}
                {hasChildren && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 rounded-full bg-background border shadow-sm"
                            onClick={(e) => {
                                e.stopPropagation();
                                setIsExpanded(!isExpanded);
                            }}
                        >
                            {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </Button>
                    </div>
                )}
            </Card>

            {/* Connecting Lines & Children */}
            {hasChildren && isExpanded && (
                <div className="flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-300">
                    {/* Vertical line from parent to children-bar */}
                    <div className="w-px h-6 bg-border" />

                    {/* Container for children */}
                    <div className="flex gap-4 pt-4 border-t border-border relative">
                        {node.children.map((child) => (
                            <div key={child.id} className="relative flex flex-col items-center">
                                {/* Vertical line TO child */}
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-px h-4 bg-border" />
                                <OrgChartNode node={child} depth={depth + 1} onEmployeeClick={onEmployeeClick} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Org Chart Tree ---

export function OrgChartTree({ employees, onEmployeeClick }: OrgChartTreeProps) {
    // Transform flat list to tree
    const buildTree = (allEmployees: Employee[]): OrgNode[] => {
        const employeeMap = new Map<string, OrgNode>();
        const roots: OrgNode[] = [];

        // 1. Initialize nodes
        allEmployees.forEach(emp => {
            employeeMap.set(emp.id, { ...emp, children: [], directReportsCount: 0 });
        });

        // 2. Link children to parents
        allEmployees.forEach(emp => {
            const node = employeeMap.get(emp.id)!;
            // If has manager AND manager exists in lists
            if (emp.directManagerId && employeeMap.has(emp.directManagerId)) {
                const manager = employeeMap.get(emp.directManagerId)!;
                manager.children.push(node);
                manager.directReportsCount++;
            } else {
                // If no manager or manager not found (e.g. external/deleted), consider root
                roots.push(node);
            }
        });

        return roots;
    };

    const roots = React.useMemo(() => buildTree(employees), [employees]);

    if (employees.length === 0) {
        return <div className="text-center p-8 text-muted-foreground">No hay empleados para mostrar.</div>;
    }

    return (
        <div className="flex flex-col items-center gap-8 overflow-auto p-8 min-h-[500px]">
            {roots.map(root => (
                <OrgChartNode key={root.id} node={root} onEmployeeClick={onEmployeeClick} />
            ))}
        </div>
    );
}
