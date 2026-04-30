import React from 'react';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Employee, HourBank } from "@/types/hcm.types";

interface TeamHourBankTabProps {
    employees: Employee[];
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (value: string) => void;
    hourBanks: HourBank[];
    formatHourBankBalance: (balance: number) => { text: string; isDebt: boolean; colorClass: string };
    handleViewHourBankHistory: (employee: Employee) => void;
}

export function TeamHourBankTab({
    employees,
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    hourBanks,
    formatHourBankBalance,
    handleViewHourBankHistory,
}: TeamHourBankTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <CardTitle>Bolsa de Horas del Equipo</CardTitle>
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
                <CardDescription>Gestiona el saldo de horas de tu equipo</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Puesto</TableHead>
                            <TableHead>Saldo Actual</TableHead>
                            <TableHead>Acumulado Histórico</TableHead>
                            <TableHead>Compensado Histórico</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {employees.filter(e => selectedEmployeeFilter === 'all' || e.id === selectedEmployeeFilter).map((employee) => {
                            const hb = hourBanks.find(h => h.employeeId === employee.id);
                            const balance = hb?.balanceMinutes || 0;
                            const formatted = formatHourBankBalance(balance);

                            return (
                                <TableRow key={employee.id}>
                                    <TableCell>
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={employee.avatarUrl} />
                                                <AvatarFallback>{employee.fullName?.charAt(0)}</AvatarFallback>
                                            </Avatar>
                                            <div>
                                                <div className="font-medium">{employee.fullName}</div>
                                                <div className="text-xs text-muted-foreground">{employee.email}</div>
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>{employee.positionTitle}</TableCell>
                                    <TableCell>
                                        <Badge 
                                            variant="outline" 
                                            className={cn(
                                                "font-bold px-2.5 py-0.5",
                                                balance > 0 ? "bg-rose-50 text-rose-700 border-rose-200" : 
                                                balance < 0 ? "bg-emerald-50 text-emerald-700 border-emerald-200" : 
                                                "bg-slate-50 text-slate-600 border-slate-200"
                                            )}
                                        >
                                            {formatted.text}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {hb?.totalDebtAccumulated ? (
                                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-medium">
                                                {`${Math.floor(hb.totalDebtAccumulated / 60)}h ${hb.totalDebtAccumulated % 60}min`}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {hb?.totalCompensated ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 font-medium">
                                                {`${Math.floor(hb.totalCompensated / 60)}h ${hb.totalCompensated % 60}min`}
                                            </Badge>
                                        ) : (
                                            <span className="text-muted-foreground">-</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleViewHourBankHistory(employee)}
                                        >
                                            Ver Historial
                                        </Button>
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
