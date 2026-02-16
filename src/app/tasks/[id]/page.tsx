'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import SiteLayout from '@/components/site-layout';
import { useFirestore, useUser } from '@/firebase';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AttendanceJustificationTask } from '@/components/tasks/AttendanceJustificationTask';
import { useToast } from '@/hooks/use-toast';
import type { Task } from '@/lib/types';

export default function TaskDetailPage() {
    const params = useParams();
    const router = useRouter();
    const { toast } = useToast();
    const firestore = useFirestore();
    const { user } = useUser();
    const [task, setTask] = useState<Task | null>(null);
    const [loading, setLoading] = useState(true);

    const taskId = params?.id as string;

    useEffect(() => {
        if (!firestore || !taskId) return;

        const loadTask = async () => {
            try {
                const taskRef = doc(firestore, 'tasks', taskId);
                const taskSnap = await getDoc(taskRef);

                if (taskSnap.exists()) {
                    setTask({ id: taskSnap.id, ...taskSnap.data() } as Task);
                } else {
                    toast({
                        title: 'Tarea no encontrada',
                        description: 'La tarea que buscas no existe o fue eliminada.',
                        variant: 'destructive'
                    });
                    router.push('/tasks');
                }
            } catch (error) {
                console.error('Error loading task:', error);
                toast({
                    title: 'Error al cargar tarea',
                    description: 'No se pudo cargar la información de la tarea.',
                    variant: 'destructive'
                });
            } finally {
                setLoading(false);
            }
        };

        loadTask();
    }, [firestore, taskId, router, toast]);

    const handleComplete = async () => {
        if (!firestore || !taskId) return;

        try {
            const taskRef = doc(firestore, 'tasks', taskId);
            await updateDoc(taskRef, {
                status: 'completed',
                completedAt: new Date().toISOString(),
                completedBy: user?.uid
            });

            toast({
                title: 'Tarea completada',
                description: 'La tarea ha sido marcada como completada.'
            });

            setTimeout(() => {
                router.push('/tasks');
            }, 1500);
        } catch (error) {
            console.error('Error completing task:', error);
            toast({
                title: 'Error',
                description: 'No se pudo completar la tarea.',
                variant: 'destructive'
            });
        }
    };

    if (loading) {
        return (
            <SiteLayout>
                <div className="container mx-auto p-6 max-w-5xl">
                    <Skeleton className="h-8 w-64 mb-6" />
                    <Skeleton className="h-96 w-full" />
                </div>
            </SiteLayout>
        );
    }

    if (!task) {
        return (
            <SiteLayout>
                <div className="container mx-auto p-6 max-w-5xl">
                    <p>Tarea no encontrada</p>
                </div>
            </SiteLayout>
        );
    }

    return (
        <SiteLayout>
            <div className="container mx-auto p-6 max-w-5xl">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push('/tasks')}
                    className="mb-4"
                >
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Volver al Buzón
                </Button>

                <Card>
                    <CardHeader>
                        <div className="flex items-start justify-between">
                            <div>
                                <CardTitle className="text-2xl mb-2">{task.name || task.title}</CardTitle>
                                <p className="text-sm text-muted-foreground whitespace-pre-line">
                                    {task.description}
                                </p>
                            </div>
                            <div className="flex flex-col gap-2 items-end">
                                <Badge variant={task.priority === 'high' ? 'destructive' : 'default'}>
                                    {task.priority === 'high' ? 'Alta Prioridad' : 'Normal'}
                                </Badge>
                                <Badge variant="outline">
                                    {task.status === 'pending' ? 'Pendiente' : task.status}
                                </Badge>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {task.type === 'attendance_justification' ? (
                            <AttendanceJustificationTask
                                task={task}
                                onComplete={handleComplete}
                            />
                        ) : (
                            <div className="text-center py-8 text-muted-foreground">
                                <p>Tipo de tarea no soportado: {task.type}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </SiteLayout>
    );
}
