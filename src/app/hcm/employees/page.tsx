
'use client';

import { useState } from 'react';
import SiteLayout from '@/components/site-layout';
import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { collection, query, where, orderBy } from 'firebase/firestore';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Search,
    UserPlus,
    MoreHorizontal,
    Eye,
    Edit,
    FileText,
    Building2,
    Calendar,
    BadgeCheck,
    ArrowLeft,
    Upload,
    Download
} from 'lucide-react';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import type { Employee } from '@/lib/types';
import { calculateYearsOfService } from '@/lib/hcm-utils';
import { SearchEmptyState } from '@/components/ui/empty-state';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Employees Directory Page
 */
export default function EmployeesPage() {
    const { firestore, user, isUserLoading } = useFirebase();
    const [searchTerm, setSearchTerm] = useState('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('all');
    const [statusFilter, setStatusFilter] = useState<string>('active');

    // Check if user has HR/Admin permissions to view employees (dynamic permissions)
    const { canRead, canWrite, isAdmin } = usePermissions();
    const hasHRPermissions = isAdmin || canRead('hcm_employees');

    // Fetch employees - only if user has HR permissions
    const employeesQuery = useMemoFirebase(() => {
        if (!firestore || !hasHRPermissions) return null;

        let q = collection(firestore, 'employees');

        if (statusFilter !== 'all') {
            return query(q, where('status', '==', statusFilter), orderBy('fullName', 'asc'));
        }

        return query(q, orderBy('fullName', 'asc'));
    }, [firestore, statusFilter, hasHRPermissions]);

    const { data: employees, isLoading } = useCollection<Employee>(employeesQuery);

    // Filter employees client-side for search and department
    const filteredEmployees = employees?.filter(emp => {
        const matchesSearch = searchTerm === '' ||
            emp.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
            emp.positionTitle?.toLowerCase().includes(searchTerm.toLowerCase());

        const matchesDepartment = departmentFilter === 'all' || emp.department === departmentFilter;

        return matchesSearch && matchesDepartment;
    }) ?? [];

    // Get unique departments for filter
    const departments = [...new Set(employees?.map(e => e.department).filter(Boolean) ?? [])];

    // Helper to get initials
    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    // Helper to format shift type
    const formatShiftType = (shift?: string) => {
        return shift === 'diurnal' ? 'Diurno' :
            shift === 'nocturnal' ? 'Nocturno' :
                shift === 'mixed' ? 'Mixto' : '-';
    };

    // Helper to format employment type
    const formatEmploymentType = (type?: string) => {
        return type === 'full_time' ? 'Tiempo Completo' :
            type === 'part_time' ? 'Medio Tiempo' :
                type === 'contractor' ? 'Contratista' :
                    type === 'intern' ? 'Practicante' : '-';
    };

    // Handler to export filtered employees to Excel
    const handleExportExcel = () => {
        if (!filteredEmployees || filteredEmployees.length === 0) return;

        // Map data to a clean format for Excel
        const exportData = filteredEmployees.map(emp => ({
            'ID Numérico': emp.employeeId || '-',
            'ID Sistema': emp.id,
            'Nombre Completo': emp.fullName,
            'Correo': emp.email,
            'RFC': emp.rfc || '-',
            'NSS': emp.nss || '-',
            'CURP': emp.curp || '-',
            'Puesto': emp.positionTitle || '-',
            'Departamento': emp.department || '-',
            'Turno': formatShiftType(emp.shiftType),
            'Tipo de Contrato': formatEmploymentType(emp.employmentType),
            'Fecha de Contratación': emp.hireDate || '-',
            'Antigüedad (Años)': emp.hireDate ? calculateYearsOfService(emp.hireDate) : 0,
            'Estado': emp.status === 'active' ? 'Activo' : 'Inactivo',
            'Sueldo Bruto': emp.compensation?.grossSalary || 0
        }));

        // Create workbook and worksheet
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Empleados');

        // Generate download
        XLSX.writeFile(workbook, `Directorio_Empleados_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
                            <Link href="/hcm">
                                <ArrowLeft className="h-4 w-4" />
                            </Link>
                        </Button>
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">Directorio de Empleados</h1>
                            <p className="text-muted-foreground">
                                Gestión de expedientes digitales del personal
                            </p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        {hasHRPermissions && (
                            <Button variant="outline" onClick={handleExportExcel} disabled={isLoading || filteredEmployees.length === 0}>
                                <Download className="mr-2 h-4 w-4" />
                                Exportar
                            </Button>
                        )}
                        <Button asChild variant="outline">
                            <Link href="/hcm/employees/import">
                                <Upload className="mr-2 h-4 w-4" />
                                Importar
                            </Link>
                        </Button>
                        <Button asChild>
                            <Link href="/hcm/employees/new">
                                <UserPlus className="mr-2 h-4 w-4" />
                                Nuevo Empleado
                            </Link>
                        </Button>
                    </div>
                </header>
                <main className="flex flex-1 flex-col gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0">
                    {/* Filters */}
                    <Card>
                        <CardContent className="pt-6">
                            <div className="flex flex-col md:flex-row gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Buscar por nombre, email o puesto..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                                    <SelectTrigger className="w-full md:w-[200px]">
                                        <Building2 className="mr-2 h-4 w-4" />
                                        <SelectValue placeholder="Departamento" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos los departamentos</SelectItem>
                                        {departments.map(dept => (
                                            <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={statusFilter} onValueChange={setStatusFilter}>
                                    <SelectTrigger className="w-full md:w-[150px]">
                                        <SelectValue placeholder="Estado" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">Todos</SelectItem>
                                        <SelectItem value="active">Activos</SelectItem>
                                        <SelectItem value="disabled">Inactivos</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Employees Table */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Empleados</CardTitle>
                            <CardDescription>
                                {isLoading ? 'Cargando...' : `${filteredEmployees.length} empleados encontrados`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Empleado</TableHead>
                                        <TableHead>Puesto</TableHead>
                                        <TableHead>Departamento</TableHead>
                                        <TableHead>Tipo Jornada</TableHead>
                                        <TableHead>Antigüedad</TableHead>
                                        <TableHead>Estado</TableHead>
                                        <TableHead className="text-right">Acciones</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
                                                Cargando empleados...
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredEmployees.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7}>
                                                <SearchEmptyState
                                                    searchTerm={searchTerm || undefined}
                                                    onClear={searchTerm ? () => setSearchTerm('') : undefined}
                                                />
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredEmployees.map((employee) => {
                                            const yearsOfService = employee.hireDate
                                                ? calculateYearsOfService(employee.hireDate)
                                                : 0;

                                            return (
                                                <TableRow key={employee.id}>
                                                    <TableCell>
                                                        <div className="flex items-center gap-3">
                                                            <Avatar>
                                                                <AvatarImage src={employee.avatarUrl} alt={employee.fullName} />
                                                                <AvatarFallback>{getInitials(employee.fullName)}</AvatarFallback>
                                                            </Avatar>
                                                            <div>
                                                                <div className="font-medium">{employee.fullName}</div>
                                                                <div className="text-sm text-muted-foreground">{employee.email}</div>
                                                                {employee.employeeId && (
                                                                    <div className="text-xs text-muted-foreground mt-0.5">
                                                                        ID: <span className="font-medium text-foreground">{employee.employeeId}</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="flex flex-col">
                                                            <span>{employee.positionTitle || '-'}</span>
                                                            <span className="text-xs text-muted-foreground">
                                                                {formatEmploymentType(employee.employmentType)}
                                                            </span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>{employee.department}</TableCell>
                                                    <TableCell>{formatShiftType(employee.shiftType)}</TableCell>
                                                    <TableCell>
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                                            <span>{yearsOfService} {yearsOfService === 1 ? 'año' : 'años'}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        {employee.status === 'active' ? (
                                                            <Badge variant="default" className="bg-green-100 text-green-800 hover:bg-green-100">
                                                                <BadgeCheck className="mr-1 h-3 w-3" />
                                                                Activo
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="secondary">
                                                                Inactivo
                                                            </Badge>
                                                        )}
                                                        {employee.onboardingStatus && employee.onboardingStatus !== 'completed' && (
                                                            <Badge variant="outline" className="ml-1">
                                                                {employee.onboardingStatus === 'day_0' ? 'Onboarding' :
                                                                    employee.onboardingStatus === 'day_30' ? 'Día 30' :
                                                                        employee.onboardingStatus === 'day_60' ? 'Día 60' :
                                                                            'Día 90'}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon">
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/hcm/employees/${employee.id}`}>
                                                                        <Eye className="mr-2 h-4 w-4" />
                                                                        Ver Expediente
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/hcm/employees/${employee.id}/edit`}>
                                                                        <Edit className="mr-2 h-4 w-4" />
                                                                        Editar
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem asChild>
                                                                    <Link href={`/hcm/employees/${employee.id}/compensation`}>
                                                                        <FileText className="mr-2 h-4 w-4" />
                                                                        Compensación
                                                                    </Link>
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </main>
            </div>
        </SiteLayout>
    );
}
