import React from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Employee, TeamDailyStats, EmployeeMonthlyStats } from "@/types/hcm.types";

interface TeamOverviewTabProps {
    dailyStats: TeamDailyStats[];
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (val: string) => void;
    employees: Employee[];
    changeDate: (days: number) => void;
    selectedDate: string;
    setSelectedDate: (val: string) => void;
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    selectedMonth: string;
    setSelectedMonth: (val: string) => void;
    filteredMonthlyStats: EmployeeMonthlyStats[];
}

export function TeamOverviewTab({
    dailyStats,
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    employees,
    changeDate,
    selectedDate,
    setSelectedDate,
    searchTerm,
    setSearchTerm,
    selectedMonth,
    setSelectedMonth,
    filteredMonthlyStats,
}: TeamOverviewTabProps) {
    return (
        <div className="space-y-4">
            {/* Date Navigation */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Vista Diaria</CardTitle>
                        <div className="flex items-center gap-2">
                            <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                                <SelectTrigger className="w-[220px]">
                                    <SelectValue placeholder="Todos los empleados" />
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
                            <Button variant="outline" size="icon" onClick={() => changeDate(-1)}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Input
                                type="date"
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="w-40"
                            />
                            <Button variant="outline" size="icon" onClick={() => changeDate(1)}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Empleado</TableHead>
                                <TableHead>Entrada</TableHead>
                                <TableHead>Salida</TableHead>
                                <TableHead>Retardo</TableHead>
                                <TableHead>Salida Temprana</TableHead>
                                <TableHead>Horas Extras</TableHead>
                                <TableHead>Sin Registro</TableHead>
                                <TableHead>Incidencia</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {dailyStats.filter(s => selectedEmployeeFilter === 'all' || s.employeeId === selectedEmployeeFilter).length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                                        Sin registros para este día
                                    </TableCell>
                                </TableRow>
                            ) : (
                                dailyStats.filter(s => selectedEmployeeFilter === 'all' || s.employeeId === selectedEmployeeFilter).map((stat) => (
                                    <TableRow key={stat.employeeId}>
                                        <TableCell className="font-medium">{stat.employeeName}</TableCell>
                                        <TableCell>
                                            {stat.isRestDay && !stat.checkIn && !stat.checkOut
                                                ? <span className="text-blue-500 font-medium">Descanso</span>
                                                : stat.checkIn || '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.isRestDay && !stat.checkIn && !stat.checkOut
                                                ? <span className="text-blue-500 font-medium">Descanso</span>
                                                : stat.checkOut || '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.tardinessMinutes ? (
                                                <Badge variant="outline" className={stat.tardinessJustified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                                                    {stat.tardinessMinutes} min
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.earlyDepartureMinutes ? (
                                                <Badge variant="outline" className={stat.earlyDepartureJustified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                                                    {stat.earlyDepartureMinutes} min
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.overtimeHoursRequested ? (
                                                <Badge variant="outline" className={
                                                    stat.overtimeStatus === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                                        stat.overtimeStatus === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' :
                                                            stat.overtimeStatus === 'partial' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                                                }>
                                                    {stat.overtimeHoursApproved || stat.overtimeHoursRequested}h
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.hasMissingPunch ? (
                                                <Badge variant="outline" className={stat.missingPunchJustified ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200'}>
                                                    {stat.missingPunchType === 'both' ? 'Entrada + Salida' :
                                                        stat.missingPunchType === 'entry' ? 'Entrada' : 'Salida'}
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell>
                                            {stat.hasIncidence ? (
                                                <Badge variant="outline" className={stat.incidenceStatus === 'approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'}>
                                                    {stat.incidenceType === 'vacation' ? 'Vacaciones' :
                                                        stat.incidenceType === 'sick_leave' ? 'Incapacidad' :
                                                            stat.incidenceType === 'personal_leave' ? 'Permiso Personal' :
                                                                stat.incidenceType === 'maternity' ? 'Maternidad' :
                                                                    stat.incidenceType === 'paternity' ? 'Paternidad' :
                                                                        stat.incidenceType === 'bereavement' ? 'Duelo' :
                                                                            stat.incidenceType === 'marriage' ? 'Matrimonio' :
                                                                                stat.incidenceType === 'unpaid_leave' ? 'Permiso sin Goce' :
                                                                                    stat.incidenceType === 'unjustified_absence' ? 'Falta Injustificada' :
                                                                                        stat.incidenceType === 'abandono_empleo' ? 'Abandono de Empleo' :
                                                                                            stat.incidenceType || '-'}
                                                </Badge>
                                            ) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Monthly Stats */}
            <Card>
                <CardHeader>
                    <div className="flex items-center justify-between">
                        <CardTitle>Estadísticas Mensuales</CardTitle>
                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Buscar empleado..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-48"
                            />
                            <Button variant="outline" size="icon" onClick={() => {
                                const [y, m] = selectedMonth.split('-').map(Number);
                                const d = new Date(y, m - 2, 1);
                                setSelectedMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                            }}>
                                <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Input
                                type="month"
                                value={selectedMonth}
                                onChange={(e) => setSelectedMonth(e.target.value)}
                                className="w-52"
                            />
                            <Button variant="outline" size="icon" onClick={() => {
                                const [y, m] = selectedMonth.split('-').map(Number);
                                const d = new Date(y, m, 1);
                                setSelectedMonth(`${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`);
                            }}>
                                <ChevronRight className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredMonthlyStats.map((stat) => (
                            <Card key={stat.employeeId} className="border">
                                <CardHeader className="pb-2">
                                    <div className="flex items-center gap-3">
                                        <Avatar>
                                            <AvatarImage src={stat.avatarUrl} />
                                            <AvatarFallback>{stat.employeeName.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <CardTitle className="text-base">{stat.employeeName}</CardTitle>
                                            <CardDescription>{stat.positionTitle}</CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <div className="flex justify-between text-sm">
                                        <span>Retardos</span>
                                        <span className={stat.unjustifiedTardiness > 0 ? 'text-red-500 font-medium' : ''}>
                                            {stat.justifiedTardiness}/{stat.totalTardiness}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>Salidas Tempranas</span>
                                        <span>
                                            {stat.justifiedEarlyDepartures}/{stat.totalEarlyDepartures}
                                        </span>
                                    </div>
                                    <div className="flex justify-between text-sm">
                                        <span>HE Aprobadas</span>
                                        <span className="text-green-600 font-medium">
                                            {stat.overtimeHoursApproved}h
                                        </span>
                                    </div>
                                    {stat.overtimeRequestsPending > 0 && (
                                        <Badge variant="outline" className="w-full justify-center">
                                            {stat.overtimeRequestsPending} solicitudes pendientes
                                        </Badge>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
