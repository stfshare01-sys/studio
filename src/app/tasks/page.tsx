
"use client";

import { useEffect, useState, useMemo } from "react";
import SiteLayout from "@/components/site-layout";
import { useFirestore, useUser, useCollection, useMemoFirebase } from "@/firebase";
import { collection, query, where, documentId } from "firebase/firestore";
import type { Task, Request, Template } from "@/lib/types";
import { SERVICE_CATALOG } from "@/lib/catalog-definitions";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LayoutDashboard, Users, Laptop, Briefcase, CheckSquare, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { formatDistanceToNow, isPast } from "date-fns";
import { es } from "date-fns/locale";

// --- Types ---

import { TaskCard, EnrichedTask } from "@/components/tasks/task-card";

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
            {tasks.map(task => (
                <TaskCard key={task.id} task={task} />
            ))}
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
                (task.requestTitle && task.requestTitle.includes(service.title)) ||
                (service.id === 'vacation-request' && task.requestTitle && task.requestTitle.toLowerCase().includes('vacaciones'))
            );

            // Determine module tag: 
            // 1. Matches catalog? 
            // 2. Is attendance justification? -> HCM
            // 3. Has explicit module field?
            let moduleTag = matchedService?.moduleTag || 'GEN';
            if (task.type === 'attendance_justification' || task.module?.startsWith('hcm')) {
                moduleTag = 'HCM';
            }

            return {
                ...task,
                moduleTag,
                templateName: matchedService?.title || task.name || 'General' // Fallback to task.name
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

                        {/* Bottleneck Analysis */}
                        <div className="mt-8 border-t pt-6">
                            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                                <Activity className="h-5 w-5 text-muted-foreground" />
                                Análisis de Cuellos de Botella
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Vencidas (SLA)</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-destructive">
                                            {filteredTasks.filter(t => t.slaExpiresAt && isPast(new Date(t.slaExpiresAt))).length}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Requieren atención inmediata</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Antigüedad &gt; 7 días</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold text-orange-500">
                                            {filteredTasks.filter(t => {
                                                const days = (new Date().getTime() - new Date(t.createdAt).getTime()) / (1000 * 3600 * 24);
                                                return days > 7;
                                            }).length}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Posible estancamiento</p>
                                    </CardContent>
                                </Card>
                                <Card>
                                    <CardHeader className="pb-2">
                                        <CardTitle className="text-sm font-medium text-muted-foreground">Carga Total</CardTitle>
                                    </CardHeader>
                                    <CardContent>
                                        <div className="text-2xl font-bold">
                                            {filteredTasks.length}
                                        </div>
                                        <p className="text-xs text-muted-foreground">Tareas activas en esta vista</p>
                                    </CardContent>
                                </Card>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </SiteLayout>
    );
}
