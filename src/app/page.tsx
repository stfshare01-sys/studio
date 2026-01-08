'use client';

import SiteLayout from "@/components/site-layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RequestsTable } from "@/components/dashboard/requests-table";
import { useCollection, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { collection, query, where } from "firebase/firestore";
import type { Request as RequestType, Task } from '@/lib/types';
import { FilePlus } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { TasksTable } from "@/components/dashboard/tasks-table";

function DataTableSkeleton() {
    return (
      <div className="rounded-md border">
        <div className="p-4">
            <div className="space-y-3">
                <Skeleton className="h-5 w-2/5" />
                <Skeleton className="h-4 w-4/5" />
            </div>
        </div>
        <div className="p-4">
            <Skeleton className="h-10 w-full" />
        </div>
        <div className="p-4">
            <div className="space-y-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
      </div>
    );
  }

export default function DashboardPage() {
  const { user } = useUser();
  const firestore = useFirestore();

  // Query for requests submitted BY the current user
  const requestsQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
      collection(firestore, 'users', user.uid, 'requests')
    );
  }, [firestore, user]);

  const { data: requests, isLoading: isLoadingRequests } = useCollection<RequestType>(requestsQuery);

  // Query for tasks assigned TO the current user that are active
  const tasksQuery = useMemoFirebase(() => {
    if (!firestore || !user) return null;
    return query(
        collection(firestore, 'tasks'),
        where('assigneeId', '==', user.uid),
        where('status', '==', 'Active')
    );
  }, [firestore, user]);

  const { data: tasks, isLoading: isLoadingTasks } = useCollection<Task>(tasksQuery);


  return (
    <SiteLayout>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between p-4 sm:p-6">
          <h1 className="text-2xl font-bold tracking-tight">Panel de Control</h1>
          <Button asChild>
            <Link href="/requests/new">
              <FilePlus className="mr-2 h-4 w-4" />
              Nueva Solicitud
            </Link>
          </Button>
        </header>
        <main className="flex flex-1 flex-col gap-8 p-4 pt-0 sm:p-6 sm:pt-0">
          <Card>
            <CardHeader>
              <CardTitle>Mis Tareas Pendientes</CardTitle>
              <CardDescription>Estas son las tareas activas que requieren tu atención.</CardDescription>
            </CardHeader>
            <CardContent>
                {isLoadingTasks && <DataTableSkeleton />}
                {!isLoadingTasks && tasks && <TasksTable tasks={tasks} />}
                {!isLoadingTasks && !tasks?.length && (
                    <div className="flex items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                        <div className="text-center">
                            <h3 className="text-2xl font-bold tracking-tight">Bandeja de entrada vacía</h3>
                            <p className="text-sm text-muted-foreground">No tienes ninguna tarea asignada en este momento.</p>
                        </div>
                    </div>
                )}
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Mis Solicitudes</CardTitle>
              <CardDescription>Rastree el estado de todas las solicitudes que ha enviado.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingRequests && <DataTableSkeleton />}
              {!isLoadingRequests && requests && <RequestsTable requests={requests} />}
              {!isLoadingRequests && !requests?.length && (
                 <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed shadow-sm p-8">
                    <div className="flex flex-col items-center gap-1 text-center">
                        <h3 className="text-2xl font-bold tracking-tight">No tiene solicitudes</h3>
                        <p className="text-sm text-muted-foreground">Cree una nueva solicitud para empezar.</p>
                        <Button className="mt-4" asChild>
                            <Link href="/requests/new">
                                <FilePlus className="mr-2 h-4 w-4" />
                                Nueva Solicitud
                            </Link>
                        </Button>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </SiteLayout>
  );
}
