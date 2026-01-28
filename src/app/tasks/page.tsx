
"use client";

import { useEffect, useState, useMemo } from "react";
import SiteLayout from "@/components/site-layout";
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, documentId } from "firebase/firestore";
import type { Task, Request, Template } from "@/lib/types";
import { SERVICE_CATALOG } from "@/lib/catalog-definitions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, CheckSquare, Users, Laptop, Briefcase, FileText } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";

// --- Types ---

type EnrichedTask = Task & {
    moduleTag?: string;
    requestPriority?: string;
    templateName?: string;
};

type TaskFilterMode = 'ALL' | 'HCM' | 'IT' | 'FIN' | 'GEN';

// --- Components ---

function InboxSidebar({ currentMode, setMode, counts }: { currentMode: TaskFilterMode, setMode: (m: TaskFilterMode) => void, counts: Record<TaskFilterMode, number> }) {
    const navItems = [
        { mode: 'ALL', label: 'Todas las Tareas', icon: LayoutDashboard },
        { mode: 'HCM', label: 'Recursos Humanos', icon: Users },
        { mode: 'IT', label: 'Tecnología (IT)', icon: Laptop },
        { mode: 'FIN', label: 'Finanzas', icon: Briefcase },
    ];

    return (
        <aside className="w-full md:w-64 flex flex-col gap-2">
            <div className="px-4 py-2">
                <h2 className="text-lg font-semibold tracking-tight">Buzón de Tareas</h2>
                <p className="text-sm text-muted-foreground">Gestiona tus pendientes.</p>
            </div>
            <Separator className="my-2" />
            <nav className="flex flex-col gap-1 px-2">
                {navItems.map((item) => (
                    <Button
                        key={item.mode}
                        variant={currentMode === item.mode ? "secondary" : "ghost"}
                        className="justify-start"
                        onClick={() => setMode(item.mode as TaskFilterMode)}
                    >
                        <item.icon className="mr-2 h-4 w-4" />
                        {item.label}
                        {counts[item.mode as TaskFilterMode] > 0 && (
                            <Badge variant="secondary" className="ml-auto text-xs">
                                {counts[item.mode as TaskFilterMode]}
                            </Badge>
                        )}
                    </Button>
                ))}
            </nav>
        </aside>
    );
}

function TaskList({ tasks, isLoading }: { tasks: EnrichedTask[], isLoading: boolean }) {
    if (isLoading) {
        return <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>;
    }

    if (tasks.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-center border rounded-lg border-dashed">
                <CheckSquare className="h-10 w-10 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium">Bandeja Vacía</h3>
                <p className="text-sm text-muted-foreground max-w-sm mt-1">
                    No tienes tareas pendientes en esta categoría. ¡Buen trabajo!
                </p>
            </div>
        );
    }

    return (
        <div className="grid gap-4">
            {tasks.map(task => {
                const isOverdue = task.slaExpiresAt && isPast(new Date(task.slaExpiresAt));
                return (
                    <Card key={task.id} className={`transition-all hover:border-primary/50 ${isOverdue ? "border-amber-200 bg-amber-50 dark:bg-amber-950/10 dark:border-amber-900" : ""}`}>
                        <CardHeader className="p-4 pb-2">
                            <div className="flex justify-between items-start">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-medium flex items-center gap-2">
                                        <Link href={`/requests/${task.requestId}`} className="hover:underline">
                                            {task.name}
                                        </Link>
                                        {isOverdue && <Badge variant="destructive" className="text-[10px] h-5 px-1.5">Vencida</Badge>}
                                        {task.moduleTag && <Badge variant="outline" className="text-[10px] h-5 px-1.5">{task.moduleTag}</Badge>}
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        {task.requestTitle}
                                    </CardDescription>
                                </div>
                                <div className="text-right">
                                    <span className="text-xs text-muted-foreground block">
                                        Hace {formatDistanceToNow(new Date(task.createdAt), { locale: es })}
                                    </span>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-2 flex justify-between items-center">
                            <div className="text-sm text-muted-foreground">
                                {task.stepId && <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> Paso: {task.name}</span>}
                            </div>
                            <Button size="sm" asChild>
                                <Link href={`/requests/${task.requestId}`}>
                                    Atender
                                </Link>
                            </Button>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

// --- Main Page ---

export default function InboxPage() {
    const { user, isUserLoading } = useUser();
    const firestore = useFirestore();
    const [mode, setMode] = useState<TaskFilterMode>('ALL');

    // 1. Fetch Tasks Assigned to User
    const tasksQuery = useMemoFirebase(() => {
        if (isUserLoading || !firestore || !user) return null;
        return query(
            collection(firestore, 'tasks'),
            where('assigneeId', '==', user.uid),
            where('status', '==', 'Active')
        );
    }, [firestore, user, isUserLoading]);

    const { data: tasks, isLoading: tasksLoading } = useCollection<Task>(tasksQuery);

    // 2. We need to enrich tasks with Module Tag. 
    // Since we can't join in Firestore, and we don't carry moduleTag in Task,
    // we have to infer it from the Request -> Template -> Catalog.

    // Optimization: Note that 'requestTitle' often contains "Solicitud de Vacaciones - date".
    // We can fuzzy match the title to the Service Catalog titles if needed (client side join).
    // Or we can fetch the requests. Fetching specific requests is better.

    const requestIds = useMemo(() => {
        if (!tasks) return [];
        return Array.from(new Set(tasks.map(t => t.requestId)));
    }, [tasks]);

    // 3. Fetch Requests (in chunks if needed, but for an inbox < 20 usually ok)
    // Note: useCollection doesn't support 'in' with large arrays efficiently in this hook wrapper easily without custom logic
    // So we'll use a pragmatic approach: Fetch ALL active requests? No.
    // We will assume metadata for now, OR fetch all templates once?

    // Better strategy: We have SERVICE_CATALOG.
    // If the Request Title contains the Service Title, we know the module.
    // Most requests are named `${template.name} - ${date}`.

    const enrichedTasks = useMemo(() => {
        if (!tasks) return [];
        return tasks.map(task => {
            // Try to match task.requestTitle to a Catalog Item
            // task.requestTitle format: "Template Name - Date"
            // We look for a catalog item whose title is a substring of requestTitle

            const matchedService = SERVICE_CATALOG.find(service =>
                task.requestTitle.includes(service.title) ||
                (service.id === 'vacation-request' && task.requestTitle.toLowerCase().includes('vacaciones')) // specific fallbacks
            );

            return {
                ...task,
                moduleTag: matchedService?.moduleTag || 'GEN',
                templateName: matchedService?.title || 'General'
            };
        });
    }, [tasks]);

    // 4. Counts
    const counts = useMemo(() => {
        const c = { ALL: 0, HCM: 0, IT: 0, FIN: 0, GEN: 0 };
        enrichedTasks.forEach(t => {
            c.ALL++;
            const tag = t.moduleTag as keyof typeof c;
            if (c[tag] !== undefined) c[tag]++;
            else c.GEN++; // Default to generic if unknown tag
        });
        return c;
    }, [enrichedTasks]);

    // 5. Filtered List
    const filteredTasks = useMemo(() => {
        if (mode === 'ALL') return enrichedTasks;
        return enrichedTasks.filter(t => t.moduleTag === mode);
    }, [enrichedTasks, mode]);

    return (
        <SiteLayout>
            <div className="flex flex-col sm:flex-row h-[calc(100vh-65px)]">
                {/* Sidebar */}
                <div className="border-r bg-muted/10 p-4 sm:w-64">
                    <InboxSidebar currentMode={mode} setMode={setMode} counts={counts} />
                </div>

                {/* Main Content */}
                <div className="flex-1 overflow-auto p-4 sm:p-8">
                    <div className="max-w-4xl mx-auto space-y-6">
                        <div>
                            <h1 className="text-2xl font-bold tracking-tight">
                                {mode === 'ALL' ? 'Todas las Tareas' :
                                    mode === 'HCM' ? 'Recursos Humanos' :
                                        mode === 'IT' ? 'Tecnología' :
                                            mode === 'FIN' ? 'Finanzas' : 'Tareas Generales'}
                            </h1>
                            <p className="text-muted-foreground">
                                {filteredTasks.length} {filteredTasks.length === 1 ? 'tarea pendiente' : 'tareas pendientes'}
                            </p>
                        </div>

                        <TaskList tasks={filteredTasks} isLoading={tasksLoading} />
                    </div>
                </div>
            </div>
        </SiteLayout>
    );
}
