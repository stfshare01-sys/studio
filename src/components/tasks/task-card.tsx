
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, ArrowRight } from "lucide-react";
import Link from "next/link";
import { formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";
import type { Task } from "@/types/workflow.types";

// Extended Task type to include optional enrichment fields
export type EnrichedTask = Task & {
    moduleTag?: string; // e.g. 'HCM', 'IT'
    requestPriority?: string;
    templateName?: string;
};

interface TaskCardProps {
    task: EnrichedTask;
    variant?: 'default' | 'compact';
}

function getTaskRedirectUrl(task: EnrichedTask): string {
    const title = (task.requestTitle || task.name || '').toLowerCase();

    // Handle attendance justification tasks
    // // Basado en Plan de Implementación de NotebookLM
    // Redirect to Team Management where managers can justify/approve based on permissions
    if (task.type === 'attendance_justification') {
        const batchId = task.metadata?.batchId;
        return `/hcm/team-management${batchId ? `?batchId=${batchId}&tab=tardiness` : ''}`;
    }

    // Handle incidence approval tasks (vacations, leaves, etc.)
    if (task.type === 'incidence_approval') {
        const incidenceId = task.metadata?.incidenceId;
        return `/hcm/incidences${incidenceId ? `?incidentId=${incidenceId}` : ''}`;
    }

    // Smart Redirection Rules
    if (title.includes('corte') && title.includes('quincena')) {
        return '/hcm/team-management?tab=overview';
    }

    // Generic fallback: use task's link property if available
    if (task.link) {
        return task.link;
    }

    return `/requests/${task.requestId}`;
}

export function TaskCard({ task, variant = 'default' }: TaskCardProps) {
    const isOverdue = task.slaExpiresAt && isPast(new Date(task.slaExpiresAt));
    const isCompact = variant === 'compact';

    return (
        <Card className={`transition-all hover:border-primary/50 group ${isOverdue ? "border-amber-200 bg-amber-50 dark:bg-amber-950/10 dark:border-amber-900" : ""}`}>
            <CardHeader className={`${isCompact ? "p-3 pb-1" : "p-4 pb-2"}`}>
                <div className="flex justify-between items-start">
                    <div className="space-y-1 overflow-hidden">
                        <CardTitle className={`${isCompact ? "text-sm" : "text-base"} font-medium flex items-center gap-2 truncate`}>
                            <Link href={getTaskRedirectUrl(task)} className="hover:underline truncate">
                                {task.name}
                            </Link>
                            {isOverdue && (
                                <Badge variant="destructive" className="text-[10px] h-5 px-1.5 shrink-0">
                                    Vencida
                                </Badge>
                            )}
                            {!isCompact && task.moduleTag && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 shrink-0">
                                    {task.moduleTag}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription className={`${isCompact ? "text-xs" : "text-xs"} truncate`}>
                            {task.requestTitle}
                        </CardDescription>
                    </div>
                    <div className="text-right shrink-0">
                        <span className="text-xs text-muted-foreground block">
                            {formatDistanceToNow(new Date(task.createdAt), { locale: es, addSuffix: true })}
                        </span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className={`${isCompact ? "p-3 pt-1" : "p-4 pt-2"} flex justify-between items-center`}>
                <div className="text-sm text-muted-foreground truncate flex-1 mr-2">
                    {!isCompact && task.stepId && (
                        <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            <span className="truncate">Paso: {task.name}</span>
                        </span>
                    )}
                </div>
                <Button size={isCompact ? "sm" : "sm"} variant={isCompact ? "ghost" : "default"} className={isCompact ? "h-6 px-2 text-xs" : ""} asChild>
                    <Link href={getTaskRedirectUrl(task)}>
                        {isCompact ? <span className="flex items-center group-hover:underline">Ver <ArrowRight className="ml-1 h-3 w-3" /></span> : "Atender"}
                    </Link>
                </Button>
            </CardContent>
        </Card>
    );
}
