'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    ChevronDown,
    ChevronRight,
    User,
    Users,
    Building2,
    Mail,
    Briefcase
} from 'lucide-react';
import type { Employee } from '@/lib/types';
import Link from 'next/link';
import { useState } from 'react';

interface OrgChartProps {
    employees: Employee[];
    onEmployeeClick?: (employee: Employee) => void;
}

interface OrgNode {
    employee: Employee;
    children: OrgNode[];
    level: number;
}

/**
 * Builds an organizational tree structure from flat employee list
 */
function buildOrgTree(employees: Employee[]): OrgNode[] {
    // Find root nodes (employees without manager or with non-existent manager)
    const employeeMap = new Map(employees.map(e => [e.id, e]));

    const rootEmployees = employees.filter(e =>
        !e.managerId || !employeeMap.has(e.managerId)
    );

    function buildNode(employee: Employee, level: number): OrgNode {
        const directReports = employees.filter(e => e.managerId === employee.id);
        return {
            employee,
            children: directReports.map(dr => buildNode(dr, level + 1)),
            level
        };
    }

    return rootEmployees.map(e => buildNode(e, 0));
}

/**
 * Single node in the org chart
 */
function OrgChartNode({
    node,
    onEmployeeClick,
    isExpanded,
    onToggle
}: {
    node: OrgNode;
    onEmployeeClick?: (employee: Employee) => void;
    isExpanded: boolean;
    onToggle: () => void;
}) {
    const { employee, children } = node;
    const hasChildren = children.length > 0;

    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    const getRoleBadgeColor = (role?: string) => {
        switch (role) {
            case 'Admin':
                return 'bg-purple-100 text-purple-800';
            case 'HRManager':
                return 'bg-blue-100 text-blue-800';
            case 'Manager':
                return 'bg-green-100 text-green-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    return (
        <div className="flex flex-col items-center">
            {/* Employee Card */}
            <div
                className={`
          relative bg-card border rounded-lg p-4 shadow-sm 
          hover:shadow-md transition-shadow cursor-pointer
          min-w-[200px] max-w-[250px]
        `}
                onClick={() => onEmployeeClick?.(employee)}
            >
                {/* Expand/Collapse Button */}
                {hasChildren && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                        className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 z-10
                       bg-background border rounded-full p-1 shadow-sm hover:bg-muted"
                    >
                        {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                        ) : (
                            <ChevronRight className="h-4 w-4" />
                        )}
                    </button>
                )}

                <div className="flex flex-col items-center text-center gap-2">
                    <Avatar className="h-16 w-16">
                        <AvatarImage src={employee.avatarUrl} alt={employee.fullName} />
                        <AvatarFallback className="text-lg">{getInitials(employee.fullName)}</AvatarFallback>
                    </Avatar>

                    <div>
                        <h4 className="font-semibold text-sm">{employee.fullName}</h4>
                        <p className="text-xs text-muted-foreground">{employee.positionTitle || 'Sin puesto'}</p>
                    </div>

                    <div className="flex flex-wrap gap-1 justify-center">
                        <Badge variant="outline" className="text-xs">
                            <Building2 className="h-3 w-3 mr-1" />
                            {employee.department}
                        </Badge>
                        {employee.role && (
                            <Badge className={`text-xs ${getRoleBadgeColor(employee.role)}`}>
                                {employee.role}
                            </Badge>
                        )}
                    </div>

                    {hasChildren && (
                        <p className="text-xs text-muted-foreground mt-1">
                            <Users className="h-3 w-3 inline mr-1" />
                            {children.length} reporte{children.length !== 1 ? 's' : ''} directo{children.length !== 1 ? 's' : ''}
                        </p>
                    )}
                </div>
            </div>

            {/* Children */}
            {hasChildren && isExpanded && (
                <>
                    {/* Vertical line from parent */}
                    <div className="w-px h-8 bg-border" />

                    {/* Horizontal connector if multiple children */}
                    {children.length > 1 && (
                        <div
                            className="h-px bg-border"
                            style={{
                                width: `${Math.min(children.length * 220, 880)}px`
                            }}
                        />
                    )}

                    {/* Children nodes */}
                    <div className="flex gap-4 pt-2">
                        {children.map((child, index) => (
                            <div key={child.employee.id} className="flex flex-col items-center">
                                {/* Vertical line to child */}
                                <div className="w-px h-4 bg-border" />
                                <OrgChartNodeWrapper node={child} onEmployeeClick={onEmployeeClick} />
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/**
 * Wrapper to handle expansion state
 */
function OrgChartNodeWrapper({
    node,
    onEmployeeClick
}: {
    node: OrgNode;
    onEmployeeClick?: (employee: Employee) => void;
}) {
    const [isExpanded, setIsExpanded] = useState(node.level < 2); // Auto-expand first 2 levels

    return (
        <OrgChartNode
            node={node}
            onEmployeeClick={onEmployeeClick}
            isExpanded={isExpanded}
            onToggle={() => setIsExpanded(!isExpanded)}
        />
    );
}

/**
 * Main Org Chart Component
 */
export function OrgChart({ employees, onEmployeeClick }: OrgChartProps) {
    const orgTree = useMemo(() => buildOrgTree(employees), [employees]);

    if (employees.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">No hay empleados</h3>
                <p className="text-muted-foreground">
                    Agrega empleados para ver el organigrama
                </p>
            </div>
        );
    }

    return (
        <div className="overflow-auto p-8">
            <div className="flex flex-col items-center gap-4 min-w-max">
                {orgTree.map((rootNode) => (
                    <OrgChartNodeWrapper
                        key={rootNode.employee.id}
                        node={rootNode}
                        onEmployeeClick={onEmployeeClick}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * Employee Detail Panel (shows when clicking on an employee in the org chart)
 */
export function EmployeeDetailPanel({ employee, onClose }: { employee: Employee; onClose: () => void }) {
    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    return (
        <Card className="w-80">
            <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-12 w-12">
                            <AvatarImage src={employee.avatarUrl} alt={employee.fullName} />
                            <AvatarFallback>{getInitials(employee.fullName)}</AvatarFallback>
                        </Avatar>
                        <div>
                            <CardTitle className="text-lg">{employee.fullName}</CardTitle>
                            <CardDescription>{employee.positionTitle}</CardDescription>
                        </div>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <a href={`mailto:${employee.email}`} className="text-primary hover:underline">
                        {employee.email}
                    </a>
                </div>

                <div className="flex items-center gap-2 text-sm">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <span>{employee.department}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span>
                        {employee.employmentType === 'full_time' ? 'Tiempo Completo' :
                            employee.employmentType === 'part_time' ? 'Medio Tiempo' :
                                employee.employmentType === 'contractor' ? 'Contratista' :
                                    employee.employmentType === 'intern' ? 'Practicante' : '-'}
                    </span>
                </div>

                {employee.hireDate && (
                    <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Ingreso: {new Date(employee.hireDate).toLocaleDateString('es-MX')}</span>
                    </div>
                )}

                <div className="pt-3 flex gap-2">
                    <Button asChild size="sm" className="flex-1">
                        <Link href={`/hcm/employees/${employee.id}`}>
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

export default OrgChart;
