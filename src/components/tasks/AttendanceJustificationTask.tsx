'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useFirebase } from '@/firebase/provider';
import { justifyTardiness } from '@/firebase/actions/incidence-actions';
import { Calendar, Clock, User } from 'lucide-react';

interface AttendanceRecord {
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    type: 'tardiness' | 'early_departure';
    minutesLate?: number;
    minutesEarly?: number;
}

interface AttendanceJustificationTaskProps {
    task: {
        id: string;
        title: string;
        description: string;
        metadata?: {
            batchId: string;
            filename: string;
            records: AttendanceRecord[];
        };
    };
    onComplete: () => void;
}

export function AttendanceJustificationTask({ task, onComplete }: AttendanceJustificationTaskProps) {
    const { toast } = useToast();
    const { user } = useFirebase();
    const [justifications, setJustifications] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [justifiedRecords, setJustifiedRecords] = useState<Set<string>>(new Set());

    const records = task.metadata?.records || [];
    const pendingRecords = records.filter(r => !justifiedRecords.has(r.id));

    const handleJustify = async (record: AttendanceRecord) => {
        const reason = justifications[record.id];
        if (!reason || reason.trim().length < 10) {
            toast({
                title: 'Motivo muy corto',
                description: 'El motivo debe tener al menos 10 caracteres',
                variant: 'destructive'
            });
            return;
        }

        setLoading({ ...loading, [record.id]: true });

        try {
            if (record.type === 'tardiness') {
                await justifyTardinessRecord(
                    record.id,
                    reason,
                    user?.uid || '',
                    user?.fullName || 'Manager'
                );
            } else {
                // TODO: Implementar justifyEarlyDeparture cuando esté disponible
                // await justifyEarlyDeparture(record.id, reason, user.uid, user.fullName);
                console.log('Early departure justification not yet implemented');
            }

            toast({
                title: 'Incidencia justificada',
                description: `Se justificó el ${record.type === 'tardiness' ? 'retardo' : 'salida temprana'} de ${record.employeeName}`
            });

            // Marcar como justificado
            setJustifiedRecords(new Set([...justifiedRecords, record.id]));

            // Si todos están justificados, completar la tarea
            if (pendingRecords.length === 1) {
                setTimeout(() => {
                    onComplete();
                }, 1000);
            }
        } catch (error) {
            console.error('Error justifying record:', error);
            toast({
                title: 'Error al justificar',
                description: 'No se pudo justificar la incidencia. Intenta nuevamente.',
                variant: 'destructive'
            });
        } finally {
            setLoading({ ...loading, [record.id]: false });
        }
    };

    if (pendingRecords.length === 0) {
        return (
            <div className="text-center py-8">
                <p className="text-lg font-medium text-green-600">✓ Todas las incidencias han sido justificadas</p>
                <p className="text-sm text-muted-foreground mt-2">Esta tarea se completará automáticamente</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">Incidencias Pendientes de Justificación</h3>
                <Badge variant="outline">
                    {pendingRecords.length} pendiente{pendingRecords.length !== 1 ? 's' : ''}
                </Badge>
            </div>

            {task.metadata?.filename && (
                <div className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                    <strong>Archivo procesado:</strong> {task.metadata.filename}
                </div>
            )}

            <div className="space-y-3">
                {pendingRecords.map((record) => (
                    <Card key={record.id} className="border-l-4 border-l-yellow-500">
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between mb-3">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                        <User className="h-4 w-4 text-muted-foreground" />
                                        <p className="font-medium">{record.employeeName}</p>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                        <div className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            <span>{record.date}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            <span>
                                                {record.type === 'tardiness' ? 'Retardo' : 'Salida Temprana'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <Badge
                                    variant={record.type === 'tardiness' ? 'destructive' : 'default'}
                                    className="ml-2"
                                >
                                    {record.minutesLate || record.minutesEarly} min
                                </Badge>
                            </div>

                            <Textarea
                                placeholder="Motivo de justificación (mínimo 10 caracteres)"
                                value={justifications[record.id] || ''}
                                onChange={(e) => setJustifications({
                                    ...justifications,
                                    [record.id]: e.target.value
                                })}
                                className="mb-2"
                                rows={2}
                            />

                            <Button
                                onClick={() => handleJustify(record)}
                                disabled={loading[record.id] || !justifications[record.id] || justifications[record.id].trim().length < 10}
                                size="sm"
                                className="w-full sm:w-auto"
                            >
                                {loading[record.id] ? 'Justificando...' : 'Justificar'}
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {justifiedRecords.size > 0 && (
                <div className="text-sm text-muted-foreground text-center pt-2">
                    {justifiedRecords.size} de {records.length} incidencias justificadas
                </div>
            )}
        </div>
    );
}
