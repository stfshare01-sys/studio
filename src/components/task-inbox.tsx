'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { CheckCircle2, Clock, AlertTriangle, ArrowRight, Inbox } from 'lucide-react';

import { useFirebase, useMemoFirebase } from '@/firebase/provider';
import { useCollection } from '@/firebase/firestore/use-collection';
import { query, collection, where, orderBy, limit } from 'firebase/firestore';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TableSkeleton } from '@/components/ui/table-skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { cn } from '@/lib/utils';

import type { Task } from '@/types/bpmn';

export type TaskInboxContextFilter = 'HCM' | 'IT' | 'all';

interface TaskInboxProps {
    /**
     * Filter tasks by module context
     * - 'HCM': Only HCM-related tasks
     * - 'IT': Only IT-related tasks
     * - 'all': All tasks (default)
     */
    contextFilter?: TaskInboxContextFilter;

    /**
     * Maximum number of tasks to display
     */
    taskLimit?: number;

    /**
     * Show empty state when no tasks
     */
    showEmptyState?: boolean;

    /**
     * Compact mode for embedding in dashboards
     */
    compact?: boolean;

    /**
     * Custom title for the card
     */
    title?: string;

    /**
     * Custom description
     */
    description?: string;

    /**
     * Hide the card wrapper
     */
    hideCard?: boolean;
}

/**
 * TaskInbox - Universal task inbox component with contextual filtering
 * 
 * Used in:
 * - Main Dashboard: Shows all pending tasks for the user
 * - HCM Dashboard: Shows only HCM-related tasks
 * - IT Dashboard: Shows only IT-related tasks
 */
export function TaskInbox({
    contextFilter = 'all',
    taskLimit = 10,
    showEmptyState = true,
    compact = false,
    title = 'Mis Tareas Pendientes',
    description = 'Tareas asignadas que requieren tu atención',
    hideCard = false,
}: TaskInboxProps) {
    const { firestore, auth, isUserLoading: firebaseLoading } = useFirebase();

    // Build the query based on context filter
    const tasksQuery = useMemoFirebase(
        () => {
            if (!firestore || !auth?.currentUser) return null;

            let q = query(
                collection(firestore, 'tasks'),
                where('assigneeId', '==', auth.currentUser.uid),
                where('status', 'in', ['Pending', 'Active']),
                orderBy('createdAt', 'desc'),
                limit(taskLimit)
            );

            return q;
        },
        [firestore, auth?.currentUser?.uid, taskLimit]
    );

    const { data: allTasks, isLoading } = useCollection<Task>(tasksQuery);

    // Filter tasks by moduleTag if context is specified
    const filteredTasks = useMemo(() => {
        if (!allTasks) return [];
        if (contextFilter === 'all') return allTasks;

        // Filter by moduleTag from task metadata
        return allTasks.filter(task => {
            // The moduleTag should be stored in the task when created
            // or we can derive it from templateId using the catalog
            const taskModule = (task as Task & { moduleTag?: string }).moduleTag;
            return taskModule === contextFilter;
        });
    }, [allTasks, contextFilter]);

    const getStatusBadge = (task: Task) => {
        const isEscalated = task.isEscalated;
        const isOverdue = task.slaExpiresAt && new Date(task.slaExpiresAt) < new Date();

        if (isOverdue || isEscalated) {
            return (
                <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {isOverdue ? 'Vencida' : 'Escalada'}
                </Badge>
            );
        }

        if (task.status === 'Active') {
            return (
                <Badge variant="default" className="gap-1">
                    <Clock className="h-3 w-3" />
                    En Progreso
                </Badge>
            );
        }

        return (
            <Badge variant="secondary" className="gap-1">
                <Clock className="h-3 w-3" />
                Pendiente
            </Badge>
        );
    };

    const renderContent = () => {
        if (firebaseLoading || isLoading) {
            return <TableSkeleton rows={compact ? 3 : 5} columns={3} />;
        }

        if (filteredTasks.length === 0 && showEmptyState) {
            return (
                <EmptyState
                    variant="inbox"
                    title={contextFilter === 'all'
                        ? 'Sin tareas pendientes'
                        : `Sin tareas ${contextFilter}`}
                    description={contextFilter === 'all'
                        ? '¡Excelente! No tienes tareas pendientes por el momento.'
                        : `No tienes tareas ${contextFilter} pendientes.`}
                    compact={compact}
                />
            );
        }

        return (
            <div className="space-y-2">
                {filteredTasks.map((task) => (
                    <Link
                        key={task.id}
                        href={`/requests/${task.requestId}?task=${task.id}`}
                        className={cn(
                            "flex items-center justify-between p-3 rounded-lg border",
                            "hover:bg-muted/50 transition-colors",
                            compact && "p-2"
                        )}
                    >
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <p className={cn(
                                    "font-medium truncate",
                                    compact ? "text-sm" : "text-base"
                                )}>
                                    {task.name}
                                </p>
                                {getStatusBadge(task)}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                {task.createdAt && formatDistanceToNow(new Date(task.createdAt), {
                                    addSuffix: true,
                                    locale: es
                                })}
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                    </Link>
                ))}

                {!compact && filteredTasks.length >= taskLimit && (
                    <div className="pt-2 text-center">
                        <Button variant="ghost" size="sm" asChild>
                            <Link href="/tasks">
                                Ver todas las tareas
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </Button>
                    </div>
                )}
            </div>
        );
    };

    if (hideCard) {
        return renderContent();
    }

    return (
        <Card className={compact ? "h-full" : ""}>
            <CardHeader className={compact ? "pb-2" : ""}>
                <div className="flex items-center justify-between">
                    <div>
                        <CardTitle className={compact ? "text-base" : "text-lg"}>
                            {title}
                        </CardTitle>
                        {!compact && (
                            <CardDescription>{description}</CardDescription>
                        )}
                    </div>
                    {contextFilter !== 'all' && (
                        <Badge variant="outline">{contextFilter}</Badge>
                    )}
                </div>
            </CardHeader>
            <CardContent className={compact ? "pt-0" : ""}>
                {renderContent()}
            </CardContent>
        </Card>
    );
}

// Preset components for common use cases
export function HCMTaskInbox(props: Omit<TaskInboxProps, 'contextFilter'>) {
    return (
        <TaskInbox
            {...props}
            contextFilter="HCM"
            title={props.title || "Tareas HCM"}
            description={props.description || "Solicitudes de Recursos Humanos pendientes"}
        />
    );
}

export function ITTaskInbox(props: Omit<TaskInboxProps, 'contextFilter'>) {
    return (
        <TaskInbox
            {...props}
            contextFilter="IT"
            title={props.title || "Tareas TI"}
            description={props.description || "Solicitudes de Tecnología pendientes"}
        />
    );
}
