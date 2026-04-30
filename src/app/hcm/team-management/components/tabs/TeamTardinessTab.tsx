import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatDateDDMMYYYY } from '../../utils';

interface TeamTardinessTabProps {
    searchTerm: string;
    setSearchTerm: (val: string) => void;
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (val: string) => void;
    employees: any[];
    statusFilter: string;
    setStatusFilter: (val: string) => void;
    filteredTardiness: any[];
    permissions: any;
    hasPermission: (permissions: any, resource: string, action: string) => boolean;
    isPeriodClosed: boolean;
    submitting: boolean;
    handleMarkTardinessUnjustified: (record: any) => void;
    setJustifyTardinessDialog: (val: any) => void;
    setJustificationReason: (val: string) => void;
    setJustificationType: (val: any) => void;
    setUseHourBank: (val: boolean) => void;
}

export function TeamTardinessTab({
    searchTerm,
    setSearchTerm,
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    employees,
    statusFilter,
    setStatusFilter,
    filteredTardiness,
    permissions,
    hasPermission,
    isPeriodClosed,
    submitting,
    handleMarkTardinessUnjustified,
    setJustifyTardinessDialog,
    setJustificationReason,
    setJustificationType,
    setUseHourBank
}: TeamTardinessTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Retardos del Equipo</CardTitle>
                        <CardDescription>Justifica los retardos pendientes de tu equipo</CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            placeholder="Buscar empleado..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-48"
                        />
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
                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                            <SelectTrigger className="w-32">
                                <SelectValue placeholder="Estado" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">Todos</SelectItem>
                                <SelectItem value="pending">Pendientes</SelectItem>
                                <SelectItem value="justified">Justificados</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Hora Prog.</TableHead>
                            <TableHead>Hora Real</TableHead>
                            <TableHead>Minutos</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredTardiness.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-muted-foreground">
                                    Sin registros para los filtros seleccionados
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredTardiness.map((record) => (
                                <TableRow key={record.id}>
                                    <TableCell>{formatDateDDMMYYYY(record.date)}</TableCell>
                                    <TableCell className="font-medium">
                                        {(record as any).employeeName || employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId}
                                    </TableCell>
                                    <TableCell>{record.scheduledTime}</TableCell>
                                    <TableCell>{record.actualTime}</TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{record.minutesLate} min</Badge>
                                    </TableCell>
                                    <TableCell>
                                        {record.justificationStatus === 'unjustified' ? (
                                            <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">Injustificado</Badge>
                                        ) : record.isJustified ? (
                                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Justificado</Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendiente</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {!record.isJustified && record.justificationStatus !== 'unjustified' && hasPermission(permissions, 'hcm_team_tardiness', 'write') && (
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-destructive hover:text-destructive/90 hover:bg-destructive/10"
                                                    disabled={isPeriodClosed || submitting}
                                                    onClick={() => handleMarkTardinessUnjustified(record)}
                                                >
                                                    Injustificado
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    disabled={isPeriodClosed}
                                                    onClick={() => {
                                                        setJustifyTardinessDialog({ open: true, record, employeeName: employees.find(e => e.id === record.employeeId)?.fullName || record.employeeId });
                                                        setJustificationReason('');
                                                        setJustificationType(undefined);
                                                        setUseHourBank(false);
                                                    }}
                                                >
                                                    Justificar
                                                </Button>
                                            </div>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
