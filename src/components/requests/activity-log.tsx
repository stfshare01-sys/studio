
"use client";

import type { AuditLog, AuditLogAction } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { FilePlus, MessageSquarePlus, UserCheck, CheckCircle2, Bot, Trash2 } from "lucide-react";
import { Skeleton } from "../ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ActivityLogProps {
    logs: AuditLog[];
}

const actionDetails: Record<AuditLogAction, { icon: React.ElementType, text: (log: AuditLog) => string }> = {
    REQUEST_SUBMITTED: {
        icon: FilePlus,
        text: (log) => `${log.userFullName} envió la solicitud.`,
    },
    STEP_ASSIGNEE_CHANGED: {
        icon: UserCheck,
        text: (log) => {
            if (log.userId === 'system') {
                return `IA asignó la tarea "${log.details.stepName}" a ${log.details.assigneeName}.`;
            }
            return `${log.userFullName} asignó la tarea "${log.details.stepName}" a ${log.details.assigneeName}.`;
        },
    },
    COMMENT_ADDED: {
        icon: MessageSquarePlus,
        text: (log) => `${log.userFullName} añadió un comentario.`,
    },
    STEP_COMPLETED: {
        icon: CheckCircle2,
        text: (log) => `${log.userFullName} completó la tarea "${log.details.stepName}".`,
    },
    DOCUMENT_DELETED: {
        icon: Trash2,
        text: (log) => `${log.userFullName} eliminó el documento "${log.details.filename}".`,
    }
};

export function ActivityLog({ logs }: ActivityLogProps) {
    if (!logs) {
        return <Skeleton className="h-40 w-full" />;
    }

    if (logs.length === 0) {
        return <p className="text-sm text-center text-muted-foreground py-4">No hay actividad registrada.</p>
    }

    return (
        <TooltipProvider>
            <ul className="space-y-6">
                {logs.map(log => {
                    const config = actionDetails[log.action];
                    if (!config) return null;
                    const Icon = config.icon;
                    const isSystemAction = log.userId === 'system';

                    return (
                        <li key={log.id} className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                                {isSystemAction ? (
                                    <AvatarFallback><Bot /></AvatarFallback>
                                ) : (
                                    <>
                                    <AvatarImage src={log.userAvatarUrl} />
                                    <AvatarFallback>{log.userFullName?.charAt(0) || '?'}</AvatarFallback>
                                    </>
                                )}
                            </Avatar>
                            <div className="flex-1">
                                <div className="flex items-center gap-2">
                                    <Icon className="h-4 w-4 text-muted-foreground" />
                                    <p className="text-sm text-foreground">{config.text(log)}</p>
                                    {isSystemAction && log.details.reason && (
                                        <Tooltip>
                                            <TooltipTrigger>
                                                <Bot className="h-4 w-4 text-primary cursor-help"/>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                                <p className="text-xs font-bold mb-1">Razonamiento de la IA:</p>
                                                <p className="text-xs">{log.details.reason}</p>
                                            </TooltipContent>
                                        </Tooltip>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true, locale: es })}
                                </p>
                            </div>
                        </li>
                    );
                })}
            </ul>
        </TooltipProvider>
    );
}
