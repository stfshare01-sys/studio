import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar, FileText } from 'lucide-react';
import type { Incidence, Employee } from "@/types/hcm.types";
import { getTypeLabel, getStatusBadge, formatDate } from '../utils/incidence-helpers';

interface IncidencesTableProps {
    filteredIncidences: Incidence[];
    isLoading: boolean;
    teamEmployees: Employee[];
    hasHRPermissions: boolean;
    isManagerOnly: boolean;
    setSelectedIncidence: (incidence: Incidence | null) => void;
    setIsReviewDialogOpen: (open: boolean) => void;
}

export function IncidencesTable({
    filteredIncidences,
    isLoading,
    teamEmployees,
    hasHRPermissions,
    isManagerOnly,
    setSelectedIncidence,
    setIsReviewDialogOpen
}: IncidencesTableProps) {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Permisos</CardTitle>
                <CardDescription>
                    {isLoading ? 'Cargando...' : `${filteredIncidences.length} registros`}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Empleado</TableHead>
                            <TableHead>Tipo</TableHead>
                            <TableHead>Período</TableHead>
                            <TableHead>Días</TableHead>
                            <TableHead>Con Goce</TableHead>
                            <TableHead>Estado</TableHead>
                            <TableHead>Acciones</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {isLoading ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8">
                                    Cargando permisos...
                                </TableCell>
                            </TableRow>
                        ) : filteredIncidences.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                    No se encontraron permisos
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredIncidences.map((incidence) => (
                                <TableRow key={incidence.id}>
                                    <TableCell>
                                        <div>
                                            <div className="font-medium">
                                                {incidence.employeeName || teamEmployees.find(e => e.id === incidence.employeeId)?.fullName || 'Falta Automática (Sistema)'}
                                            </div>
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="outline">{getTypeLabel(incidence.type)}</Badge>
                                    </TableCell>
                                    <TableCell>
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3 text-muted-foreground" />
                                            <span className="text-sm">
                                                {formatDate(incidence.startDate)} - {formatDate(incidence.endDate)}
                                            </span>
                                        </div>
                                    </TableCell>
                                    <TableCell>{incidence.totalDays}</TableCell>
                                    <TableCell>
                                        {incidence.isPaid ? (
                                            <Badge className="bg-green-100 text-green-800">Sí</Badge>
                                        ) : (
                                            <Badge variant="secondary">No</Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{getStatusBadge(incidence.status)}</TableCell>
                                    <TableCell>
                                        {incidence.status === 'pending' && (hasHRPermissions || isManagerOnly) && (
                                            <Button
                                                size="sm"
                                                onClick={() => {
                                                    setSelectedIncidence(incidence);
                                                    setIsReviewDialogOpen(true);
                                                }}
                                            >
                                                Revisar
                                            </Button>
                                        )}
                                        {incidence.status !== 'pending' && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => {
                                                    setSelectedIncidence(incidence);
                                                    setIsReviewDialogOpen(true);
                                                }}
                                            >
                                                <FileText className="h-4 w-4" />
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
