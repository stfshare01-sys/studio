import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Filter, Sun, Moon, SunMoon, History, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamShiftsTabProps {
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (val: string) => void;
    employees: any[];
    filteredEmployees: any[];
    permissions: any;
    hasPermission: (permissions: any, resource: string, action: string) => boolean;
    getCurrentShift: (employee: any) => any;
    handleViewShiftHistory: (employee: any) => void;
    setShiftDialog: (val: any) => void;
    setShiftForm: (val: any) => void;
}

export function TeamShiftsTab({
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    employees,
    filteredEmployees,
    permissions,
    hasPermission,
    getCurrentShift,
    handleViewShiftHistory,
    setShiftDialog,
    setShiftForm
}: TeamShiftsTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Turnos y Horarios del Equipo</CardTitle>
                        <CardDescription>Asigna turnos o modifica horarios de tus subordinados</CardDescription>
                    </div>
                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                        <SelectTrigger className="w-64 bg-slate-900 border-slate-800 text-slate-50 focus:ring-slate-400 font-medium shadow-md">
                            <div className="flex items-center gap-2">
                                <Filter className="h-4 w-4 text-indigo-400" />
                                <SelectValue placeholder="Filtrar por empleado" />
                            </div>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Todos los empleados</SelectItem>
                            {employees.map(emp => (
                                <SelectItem key={emp.id} value={emp.id}>
                                    {emp.fullName}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Puesto</TableHead>
                            <TableHead>Turno Actual</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredEmployees.map((employee) => {
                            const currentShift = getCurrentShift(employee);
                            return (
                                <TableRow key={employee.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={employee.avatarUrl} />
                                                <AvatarFallback>{employee.fullName?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <span className="font-medium">{employee.fullName}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{employee.positionTitle}</TableCell>
                                    <TableCell>
                                        <div className="flex flex-col">
                                            <Badge className={cn(
                                                "w-fit gap-1.5 px-3 py-1 font-semibold shadow-sm border-2",
                                                (currentShift?.name || '').toLowerCase().includes('diurno') ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                                    (currentShift?.name || '').toLowerCase().includes('nocturno') ? 'bg-slate-900 text-slate-50 border-slate-700 ring-1 ring-slate-600' :
                                                        (currentShift?.name || '').toLowerCase().includes('mixto') ? 'bg-amber-100 text-amber-800 border-amber-300' :
                                                            'bg-blue-100 text-blue-800 border-blue-300'
                                            )} variant="outline">
                                                {(currentShift?.name || '').toLowerCase().includes('diurno') && <Sun className="w-3.5 h-3.5 text-emerald-600" />}
                                                {(currentShift?.name || '').toLowerCase().includes('nocturno') && <Moon className="w-3.5 h-3.5 text-indigo-300" />}
                                                {(currentShift?.name || '').toLowerCase().includes('mixto') && <SunMoon className="w-3.5 h-3.5 text-amber-600" />}
                                                {currentShift?.name || 'Sin turno'}
                                            </Badge>
                                            {currentShift.isTemp && <span className="text-xs text-muted-foreground mt-1">Temporal</span>}
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex gap-2 justify-end">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleViewShiftHistory(employee)}
                                            >
                                                <History className="h-4 w-4 mr-1" />
                                            </Button>
                                            {hasPermission(permissions, 'hcm_team_shifts', 'write') && (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        setShiftDialog({ open: true, employee });
                                                        setShiftForm({ shiftId: '', type: 'temporary', startDate: new Date().toISOString().split('T')[0], endDate: '', reason: '' });
                                                    }}
                                                >
                                                    <CalendarDays className="h-4 w-4 mr-1" />
                                                    Asignar Turno
                                                </Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            );
                        })}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
