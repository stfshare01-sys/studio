import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LogIn, LogOut, ArrowLeftRight, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TeamMissingPunchesTabProps {
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (val: string) => void;
    employees: any[];
    filteredMissingPunches: any[];
    permissions: any;
    hasPermission: (permissions: any, resource: string, action: string) => boolean;
    isPeriodClosed: boolean;
    submitting: boolean;
    handleMarkMissingPunchAsFault: (punch: any) => void;
    setJustifyMissingPunchDialog: (val: any) => void;
    setJustificationReason: (val: string) => void;
    setProvidedEntryTime: (val: string) => void;
    setProvidedExitTime: (val: string) => void;
}

export function TeamMissingPunchesTab({
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    employees,
    filteredMissingPunches,
    permissions,
    hasPermission,
    isPeriodClosed,
    submitting,
    handleMarkMissingPunchAsFault,
    setJustifyMissingPunchDialog,
    setJustificationReason,
    setProvidedEntryTime,
    setProvidedExitTime
}: TeamMissingPunchesTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Marcajes Faltantes</CardTitle>
                        <CardDescription>Justifica o marca como falta los registros incompletos de entrada/salida</CardDescription>
                    </div>
                    <Select value={selectedEmployeeFilter} onValueChange={setSelectedEmployeeFilter}>
                        <SelectTrigger className="w-48">
                            <SelectValue placeholder="Filtrar por empleado" />
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
                            <TableHead>Fecha</TableHead>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Tipo Faltante</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredMissingPunches.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="text-center text-muted-foreground">
                                    Sin marcajes faltantes para los filtros seleccionados
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredMissingPunches
                                .map((punch) => {
                                    const employee = employees.find(e => e.id === punch.employeeId);
                                    const missingTypeLabels = {
                                        entry: 'Entrada',
                                        exit: 'Salida',
                                        both: 'Ambos'
                                    };

                                    return (
                                        <TableRow key={punch.id}>
                                            <TableCell>{punch.date}</TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    <div className="font-medium">{employee?.fullName || punch.employeeName}</div>
                                                    {punch.isHomeOffice && (
                                                        <Badge
                                                            variant="outline"
                                                            className="bg-blue-100 text-blue-700 border-blue-300 text-[10px] px-1.5 py-0 font-bold tracking-wide"
                                                        >
                                                            HO
                                                        </Badge>
                                                    )}
                                                    {(employee?.workMode === 'remote' || employee?.workMode === 'field') && (
                                                        <span
                                                            title={employee.workMode === 'remote' ? 'Trabajo Remoto' : 'En Campo'}
                                                            className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0 rounded border ${
                                                                employee.workMode === 'remote'
                                                                    ? 'bg-violet-100 text-violet-700 border-violet-300'
                                                                    : 'bg-amber-100 text-amber-700 border-amber-300'
                                                            }`}
                                                        >
                                                            <MapPin className="h-2.5 w-2.5" />
                                                            {employee.workMode === 'remote' ? 'REM' : 'CAM'}
                                                        </span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={cn(
                                                    "gap-1.5 px-3 py-1 font-semibold shadow-sm border-2",
                                                    punch.missingType === 'entry' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                                        punch.missingType === 'exit' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                                                            'bg-rose-100 text-rose-800 border-rose-300'
                                                )} variant="outline">
                                                    {punch.missingType === 'entry' && <LogIn className="w-3.5 h-3.5" />}
                                                    {punch.missingType === 'exit' && <LogOut className="w-3.5 h-3.5" />}
                                                    {punch.missingType === 'both' && <ArrowLeftRight className="w-3.5 h-3.5" />}
                                                    {missingTypeLabels[punch.missingType as keyof typeof missingTypeLabels]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {punch.isJustified ? (
                                                    <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Justificado</Badge>
                                                ) : punch.resultedInAbsence ? (
                                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Falta</Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendiente</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                {!punch.isJustified && !punch.resultedInAbsence && hasPermission(permissions, 'hcm_team_tardiness', 'write') && (
                                                    <div className="flex justify-end gap-2">
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                            disabled={isPeriodClosed || submitting}
                                                            onClick={() => handleMarkMissingPunchAsFault(punch)}
                                                        >
                                                            Marcar Falta
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            disabled={isPeriodClosed || submitting}
                                                            onClick={() => {
                                                                setJustifyMissingPunchDialog({
                                                                    open: true,
                                                                    punch,
                                                                    employeeName: employee?.fullName || punch.employeeName
                                                                });
                                                                setJustificationReason('');
                                                                setProvidedEntryTime('');
                                                                setProvidedExitTime('');
                                                            }}
                                                        >
                                                            Justificar
                                                        </Button>
                                                    </div>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
