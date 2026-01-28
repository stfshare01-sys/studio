
"use client";

import React, { useState } from "react";
import { Employee } from "@/lib/types";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, User } from "lucide-react";

// --- Types ---

export type OrgNode = Employee & {
    children: OrgNode[];
    directReportsCount: number;
};

interface OrgChartNodeProps {
    node: OrgNode;
    depth?: number;
}

// --- Component ---

export function OrgChartNode({ node, depth = 0 }: OrgChartNodeProps) {
    const [isExpanded, setIsExpanded] = useState(true);
    const hasChildren = node.children && node.children.length > 0;

    const getInitials = (name: string) => {
        return name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || '??';
    };

    return (
        <div className="flex flex-col items-center">
            {/* The Node Card */}
            <Card className={`relative w-[280px] z-10 transition-all hover:border-primary/50 ${depth === 0 ? 'border-primary shadow-md' : ''}`}>
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
                    </div>
                </CardContent>

                {/* Expand/Collapse Toggle (if has children) */}
                {hasChildren && (
                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2">
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-6 w-6 rounded-full bg-background border shadow-sm"
                            onClick={() => setIsExpanded(!isExpanded)}
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
                        {/* 
                           We need a way to hide the top border for the leftmost and rightmost parts 
                           to create the "bracket" shape perfectly, but simple border-t works okay for now.
                           To make it perfect, we'd need pseudo-elements or specific connector logic.
                           For simplicity in MVP, we use a simple top border on the children container 
                           and centralize them.
                        */}
                        {node.children.map((child) => (
                            <div key={child.id} className="relative flex flex-col items-center">
                                {/* Vertical line TO child */}
                                <div className="absolute -top-4 left-1/2 -translate-x-1/2 w-px h-4 bg-border" />
                                <OrgChartNode node={child} depth={depth + 1} />
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function OrgChartTree({ employees }: { employees: Employee[] }) {
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
            if (emp.managerId && employeeMap.has(emp.managerId)) {
                const manager = employeeMap.get(emp.managerId)!;
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
                <OrgChartNode key={root.id} node={root} />
            ))}
        </div>
    );
}
