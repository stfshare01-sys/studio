import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, XCircle, Clock, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateDDMMYYYY } from '../../utils';

interface TeamOvertimeTabProps {
    overtimeStats: any;
    selectedEmployeeFilter: string;
    setSelectedEmployeeFilter: (val: string) => void;
    employees: any[];
    filteredOvertime: any[];
    hourBanks: any[];
    permissions: any;
    hasPermission: (permissions: any, resource: string, action: string) => boolean;
    isPeriodClosed: boolean;
    setOvertimeDialog: (val: any) => void;
    setHoursToApprove: (val: string) => void;
    setRejectionReason: (val: string) => void;
}

export function TeamOvertimeTab({
    overtimeStats,
    selectedEmployeeFilter,
    setSelectedEmployeeFilter,
    employees,
    filteredOvertime,
    hourBanks,
    permissions,
    hasPermission,
    isPeriodClosed,
    setOvertimeDialog,
    setHoursToApprove,
    setRejectionReason
}: TeamOvertimeTabProps) {
    return (
        <Card>
            <CardHeader>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle>Solicitudes de Horas Extras</CardTitle>
                        <CardDescription>
                            Aprobadas: {Number(overtimeStats.totalHoursApproved).toFixed(2)}h |
                            Pendientes: {Number(overtimeStats.totalHoursPending).toFixed(2)}h
                        </CardDescription>
                    </div>
                    <div className="flex gap-2">
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
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{overtimeStats.approved} aprobadas</Badge>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{overtimeStats.pending} pendientes</Badge>
                        <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200">{overtimeStats.rejected} rechazada(s)</Badge>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Fecha</TableHead>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Deuda B. Horas</TableHead>
                            <TableHead>Horas Solicitadas</TableHead>
                            <TableHead>Razón</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Aprobadas</TableHead>
                            <TableHead>Dobles</TableHead>
                            <TableHead>Triples</TableHead>
                            <TableHead className="text-right">Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {filteredOvertime.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={10} className="text-center text-muted-foreground">
                                    Sin solicitudes de horas extras
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredOvertime.map((request) => (
                                <TableRow key={request.id}>
                                    <TableCell>{formatDateDDMMYYYY(request.date)}</TableCell>
                                    <TableCell className="font-medium">{request.employeeName}</TableCell>
                                    <TableCell>
                                        {(() => {
                                            const hb = hourBanks.find(h => h.employeeId === request.employeeId);
                                            const balance = hb?.balanceMinutes || 0;
                                            if (balance > 0) {
                                                const debt = Math.abs(balance);
                                                const hours = Math.floor(debt / 60);
                                                const mins = debt % 60;
                                                return (
                                                    <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 font-bold">
                                                        -{hours}h {mins}m
                                                    </Badge>
                                                );
                                            }
                                            return <span className="text-muted-foreground">-</span>;
                                        })()}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 font-semibold">
                                            {Number(request.hoursRequested).toFixed(2)}h
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate">{request.reason}</TableCell>
                                    <TableCell>
                                        <Badge className={cn(
                                            "gap-1.5 px-3 py-1 font-semibold shadow-sm border-2",
                                            request.status === 'approved' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                                                request.status === 'rejected' ? 'bg-rose-100 text-rose-800 border-rose-300' :
                                                    request.status === 'partial' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' : 
                                                    'bg-amber-100 text-amber-800 border-amber-300'
                                        )} variant="outline">
                                            {request.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                                            {request.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                                            {request.status === 'partial' && <Clock className="w-3.5 h-3.5" />}
                                            {request.status === 'pending' && <AlertCircle className="w-3.5 h-3.5" />}
                                            {request.status === 'approved' ? 'Aprobada' :
                                                request.status === 'rejected' ? 'Rechazada' :
                                                    request.status === 'partial' ? 'Parcial' : 'Pendiente'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {request.hoursApproved !== undefined ? `${Number(request.hoursApproved).toFixed(2)}h` : '-'}
                                    </TableCell>
                                    <TableCell>
                                        {request.doubleHours !== undefined ? `${Number(request.doubleHours).toFixed(2)}h` : '-'}
                                    </TableCell>
                                    <TableCell>
                                        {request.tripleHours !== undefined ? `${Number(request.tripleHours).toFixed(2)}h` : '-'}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        {request.status === 'pending' && hasPermission(permissions, 'hcm_team_overtime', 'write') && (
                                            <Button
                                                size="sm"
                                                disabled={isPeriodClosed}
                                                onClick={() => {
                                                    setOvertimeDialog({ open: true, request });
                                                    setHoursToApprove(request.hoursRequested.toString());
                                                    setRejectionReason('');
                                                }}
                                            >
                                                Revisar
                                            </Button>
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
