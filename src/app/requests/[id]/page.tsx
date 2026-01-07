
'use client';

import SiteLayout from "@/components/site-layout";
import { notFound, useParams } from "next/navigation";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser } from "@/firebase";
import { doc, collection, query } from "firebase/firestore";
import type { Request as RequestType, EnrichedRequest, User, EnrichedWorkflowStep } from "@/lib/types";
import { ArrowLeft, User as UserIcon, Paperclip, Loader2 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { WorkflowStepper } from "@/components/requests/workflow-stepper";
import { AssigneeSuggester } from "@/components/requests/assignee-suggester";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";

function SubmittedBy({ userId }: { userId: string }) {
    const firestore = useFirestore();
    const userRef = useMemoFirebase(() => {
        if (!firestore || !userId) return null;
        return doc(firestore, 'users', userId);
    }, [firestore, userId]);
    
    const { data: user, isLoading } = useDoc<User>(userRef);

    if (isLoading || !user) {
        return <Skeleton className="h-6 w-32" />;
    }

    return (
        <div className="ml-auto flex items-center gap-2">
            <Avatar className="h-6 w-6">
                <AvatarImage src={user.avatarUrl} alt={user.fullName} />
                <AvatarFallback>{user.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>{user.fullName}</span>
        </div>
    );
}

function enrichRequest(request: RequestType, users: User[]): EnrichedRequest {
    const submittedBy = users.find(u => u.id === request.submittedBy);
    const steps: EnrichedWorkflowStep[] = request.steps.map(step => ({
        ...step,
        assignee: users.find(u => u.id === step.assigneeId) ?? null,
    }));
    return { ...request, submittedBy: submittedBy!, steps };
}


function RequestDetailSkeleton() {
    return (
        <div className="flex flex-1 flex-col">
            <header className="flex items-center p-4 sm:p-6">
                <Skeleton className="h-10 w-10 rounded-md" />
                <div className="ml-4 space-y-2">
                    <Skeleton className="h-7 w-64" />
                    <Skeleton className="h-5 w-48" />
                </div>
            </header>
            <main className="grid flex-1 gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-3">
                <div className="md:col-span-2 space-y-8">
                    <Card>
                        <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
                        <CardContent className="space-y-6">
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                            <Skeleton className="h-12 w-full" />
                        </CardContent>
                    </Card>
                </div>
                <div className="space-y-8">
                    <Card>
                        <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
                        <CardContent className="space-y-4">
                            <Skeleton className="h-6 w-full" />
                            <Separator />
                            <Skeleton className="h-5 w-full" />
                            <Skeleton className="h-5 w-full" />
                        </CardContent>
                    </Card>
                </div>
            </main>
        </div>
    )
}

export default function RequestDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const { user, isUserLoading } = useUser();
  const firestore = useFirestore();

  const requestRef = useMemoFirebase(() => {
    if (!firestore || !user?.uid) return null;
    return doc(firestore, 'users', user.uid, 'requests', id);
  }, [firestore, user?.uid, id]);

  const { data: request, isLoading: isRequestLoading } = useDoc<RequestType>(requestRef);

  const usersQuery = useMemoFirebase(() => {
      if(!firestore) return null;
      // This is not ideal, but for now we fetch all users to enrich the data.
      // In a real app with many users, this should be optimized.
      return query(collection(firestore, 'users'));
  }, [firestore]);

  const { data: users, isLoading: areUsersLoading } = useCollection<User>(usersQuery);
  
  const [enrichedRequest, setEnrichedRequest] = useState<EnrichedRequest | null>(null);

  useEffect(() => {
    if (request && users) {
        const submittedByUser = users.find(u => u.id === request.submittedBy);
        if (!submittedByUser) {
            // Handle case where submitter is not found, maybe set a default or show an error
            return;
        }

        const enrichedSteps: EnrichedWorkflowStep[] = request.steps.map(s => ({
            ...s,
            assignee: users.find(u => u.id === s.assigneeId) ?? null,
        }));
        setEnrichedRequest({ ...request, submittedBy: submittedByUser, steps: enrichedSteps });
    }
  }, [request, users]);


  if (isUserLoading || isRequestLoading || areUsersLoading) {
    return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
  }

  if (!request || !enrichedRequest) {
    // If we are not loading and there's no request, it's a 404
    if(!isRequestLoading){
        notFound();
    }
    // Otherwise, we might still be enriching, so show skeleton
    return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
  }

  const activeStep = enrichedRequest.steps.find(s => s.status === 'Active');

  return (
    <SiteLayout>
        <div className="flex flex-1 flex-col">
        <header className="flex items-center p-4 sm:p-6">
            <Button variant="outline" size="icon" asChild>
            <Link href="/">
                <ArrowLeft className="h-4 w-4" />
            </Link>
            </Button>
            <div className="ml-4">
                <h1 className="text-2xl font-bold tracking-tight">{enrichedRequest.title}</h1>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>ID: {enrichedRequest.id}</span>
                    <Separator orientation="vertical" className="h-4" />
                    <Badge
                    variant={
                        enrichedRequest.status === "Completed"
                        ? "default"
                        : enrichedRequest.status === "Rejected"
                        ? "destructive"
                        : "secondary"
                    }
                    className={enrichedRequest.status === 'Completed' ? 'bg-green-600 text-white' : ''}
                    >
                    {enrichedRequest.status}
                    </Badge>
                </div>
            </div>
        </header>

        <main className="grid flex-1 gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-3">
            <div className="md:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Progreso del Flujo de Trabajo</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <WorkflowStepper steps={enrichedRequest.steps} />
                    </CardContent>
                </Card>

                {activeStep && !activeStep.assignee && users && (
                    <AssigneeSuggester step={activeStep} availableUsers={users} />
                )}
            </div>
            
            <div className="space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Información de la Solicitud</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center gap-2">
                            <UserIcon className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Enviado por:</span>
                            <SubmittedBy userId={enrichedRequest.submittedBy.id} />
                        </div>
                        <Separator />
                        <dl className="grid gap-2">
                            {Object.entries(enrichedRequest.formData).map(([key, value]) => {
                               // Find the field label from the template data if available, otherwise use the key
                               const fieldLabel = request.template?.fields.find((f: any) => f.id === key)?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                               return (
                                <div key={key} className="flex justify-between">
                                    <dt className="text-muted-foreground">{fieldLabel}</dt>
                                    <dd className="font-medium text-right">{String(value)}</dd>
                                </div>
                               )
                            })}
                        </dl>
                    </CardContent>
                </Card>
                
                {enrichedRequest.documents.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Documentos Adjuntos</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="space-y-2">
                                {enrichedRequest.documents.map(doc => (
                                    <li key={doc.name}>
                                        <a href={doc.url} className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                                            <Paperclip className="h-4 w-4" />
                                            <span>{doc.name}</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </CardContent>
                    </Card>
                )}
            </div>
        </main>
        </div>
    </SiteLayout>
  );
}
