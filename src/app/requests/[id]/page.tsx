

'use client';

import SiteLayout from "@/components/site-layout";
import { notFound, useParams } from "next/navigation";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, useStorage } from "@/firebase";
import { doc, collection, query, serverTimestamp, orderBy, updateDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import type { Request as RequestType, EnrichedRequest, User, EnrichedWorkflowStep, Template, Comment as CommentType, EnrichedComment, AuditLog, FormField, Document as DocumentType, Task } from "@/lib/types";
import { ArrowLeft, User as UserIcon, Paperclip, Send, Trash2, CheckCircle } from "lucide-react";
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
import { ProcessDiscoveryChart } from "@/components/requests/process-discovery-chart";
import { Textarea } from "@/components/ui/textarea";
import { addDocumentNonBlocking, updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { ActivityLog } from "@/components/requests/activity-log";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { completeTaskAndProgressWorkflow } from "@/lib/workflow-engine";

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
                <AvatarFallback>{user.fullName?.charAt(0) || 'U'}</AvatarFallback>
            </Avatar>
            <span>{user.fullName}</span>
        </div>
    );
}

function CommentList({ comments, users }: { comments: CommentType[], users: User[] }) {
    const enrichedComments: EnrichedComment[] = comments.map(comment => ({
        ...comment,
        author: users.find(u => u.id === comment.authorId)
    }));

    if (enrichedComments.length === 0) {
        return <p className="text-sm text-muted-foreground text-center py-4">No hay comentarios todavía.</p>
    }

    return (
        <ul className="space-y-4">
            {enrichedComments.map(comment => (
                <li key={comment.id} className="flex items-start gap-3">
                    <Avatar className="h-8 w-8">
                        <AvatarImage src={comment.author?.avatarUrl} />
                        <AvatarFallback>{comment.author?.fullName?.charAt(0) || '?'}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                        <div className="flex items-baseline gap-2">
                            <span className="font-semibold text-sm">{comment.author?.fullName || 'Usuario Desconocido'}</span>
                            <span className="text-xs text-muted-foreground">
                                {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true, locale: es })}
                            </span>
                        </div>
                        <p className="text-sm text-foreground">{comment.text}</p>
                    </div>
                </li>
            ))}
        </ul>
    )
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
                     <Card>
                        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
                        <CardContent>
                            <Skeleton className="h-56 w-full" />
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
  const storage = useStorage();
  const isAdmin = user?.role === 'Admin';
  const { toast } = useToast();

  const [newComment, setNewComment] = useState("");

  const requestRef = useMemoFirebase(() => {
    if (isUserLoading || !firestore || !user?.uid) return null;
    // Admins need a different path to access any user's request
    // This is a simplified approach. A real-world app might need a collection group query
    // or a different data structure if admins need to view all requests.
    // For now, we assume admin can only view their own requests via this detail page.
    // This will be fixed later with a proper admin view.
    return doc(firestore, 'users', user.uid, 'requests', id);
  }, [firestore, user?.uid, id, isUserLoading]);

  const { data: request, isLoading: isRequestLoading } = useDoc<RequestType>(requestRef);

  const commentsQuery = useMemoFirebase(() => {
    if (!requestRef) return null;
    return query(collection(requestRef, 'comments'), orderBy('createdAt', 'desc'));
  }, [requestRef]);

  const auditLogsQuery = useMemoFirebase(() => {
    if (!requestRef) return null;
    return query(collection(requestRef, 'audit_logs'), orderBy('timestamp', 'desc'));
  }, [requestRef]);

  const { data: comments, isLoading: areCommentsLoading } = useCollection<CommentType>(commentsQuery);
  const { data: auditLogs, isLoading: areAuditLogsLoading } = useCollection<AuditLog>(auditLogsQuery);

  const templateRef = useMemoFirebase(() => {
      if (!firestore || !request?.templateId) return null;
      return doc(firestore, 'request_templates', request.templateId);
  }, [firestore, request?.templateId]);

  const { data: template, isLoading: isTemplateLoading } = useDoc<Template>(templateRef);

  const usersQuery = useMemoFirebase(() => {
    if (isUserLoading || !firestore) return null;
    return query(collection(firestore, 'users'));
  }, [firestore, isUserLoading]);

  const { data: users, isLoading: areUsersLoading } = useCollection<User>(usersQuery);
  
  const [enrichedRequest, setEnrichedRequest] = useState<EnrichedRequest | null>(null);

  useEffect(() => {
    if (request && template && user) {
        if ((isAdmin && users) || !isAdmin) {
            const userList = users || [user];
            const submittedByUser = userList.find(u => u.id === request.submittedBy) ?? { id: request.submittedBy, fullName: "Usuario Desconocido", email: "", department: "", role: "Member" };
            const enrichedSteps: EnrichedWorkflowStep[] = request.steps.map(s => {
                const assignee = userList.find(u => u.id === s.assigneeId);
                return {
                    ...s,
                    assignee: assignee ?? (s.assigneeId ? { id: s.assigneeId, fullName: "Usuario Asignado", email: "", department: "", role: "Member" } : null),
                }
            });
            setEnrichedRequest({ ...request, template, submittedBy: submittedByUser, steps: enrichedSteps });
        }
    }
  }, [request, users, template, user, isAdmin]);

  const handleAddComment = () => {
    if (!newComment.trim() || !user || !requestRef) return;
    const commentsCollection = collection(requestRef, 'comments');
    addDocumentNonBlocking(commentsCollection, {
        requestId: requestRef.id,
        authorId: user.uid,
        text: newComment.trim(),
        createdAt: new Date().toISOString(),
    });
    addDocumentNonBlocking(collection(requestRef, 'audit_logs'), {
        requestId: requestRef.id,
        userId: user.uid,
        userFullName: user.fullName || user.email,
        userAvatarUrl: user.avatarUrl,
        timestamp: new Date().toISOString(),
        action: 'COMMENT_ADDED',
        details: { text: newComment.trim() }
    });
    setNewComment("");
    toast({ title: "Comentario enviado" });
  };

  const handleDeleteDocument = async (docToDelete: DocumentType) => {
    if (!request || !requestRef || !storage || !user) return;
    try {
        // 1. Delete file from Storage
        const fileRef = ref(storage, docToDelete.storagePath);
        await deleteObject(fileRef);

        // 2. Remove document from Firestore array
        const updatedDocuments = request.documents.filter(d => d.id !== docToDelete.id);
        await updateDoc(requestRef, { documents: updatedDocuments });
        
        // 3. Add audit log
        addDocumentNonBlocking(collection(requestRef, 'audit_logs'), {
            requestId: requestRef.id,
            userId: user.uid,
            userFullName: user.fullName || user.email,
            userAvatarUrl: user.avatarUrl,
            timestamp: new Date().toISOString(),
            action: 'DOCUMENT_DELETED',
            details: { filename: docToDelete.filename }
        });

        toast({ title: "Documento eliminado", description: `"${docToDelete.filename}" ha sido eliminado.` });
    } catch (error) {
        console.error("Error deleting document:", error);
        toast({ variant: "destructive", title: "Error al eliminar", description: "No se pudo eliminar el documento." });
    }
  };

  const handleCompleteTask = async (task: Task) => {
      if (!firestore || !user || !request || !template || !users) {
          toast({ variant: 'destructive', title: 'Error', description: 'No se puede completar la tarea.' });
          return;
      }
      try {
          await completeTaskAndProgressWorkflow(firestore, {
              task,
              request,
              template,
              currentUser: user,
              allUsers: users,
          });
          toast({ title: "¡Tarea Completada!", description: `La tarea "${task.name}" ha sido completada.` });
      } catch (error) {
          console.error("Error completing task:", error);
          toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la tarea.' });
      }
  };

  const isLoading = isUserLoading || isRequestLoading || areUsersLoading || isTemplateLoading || areAuditLogsLoading;

  if (isLoading) {
    return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
  }

  if (!request || !enrichedRequest) {
    if (!isRequestLoading && !request) notFound();
    return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
  }

  const activeStep = enrichedRequest.steps.find(s => s.status === 'Active');
  
  // Find the full task object for the active step
  const activeTask = activeStep?.taskId ? { ...activeStep, id: activeStep.taskId, requestTitle: request.title, requestId: request.id, requestOwnerId: request.submittedBy, createdAt: "" } as Task : null;
  const isCurrentUserAssignee = activeStep?.assigneeId === user?.uid;

  const getDisplayValue = (value: any, fieldId: string) => {
    const field = request.template?.fields.find((f: FormField) => f.id === fieldId);
    if (field?.type === 'file') {
        const document = request.documents.find(d => d.id === value);
        return document ? (
            <a href={document.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                <Paperclip className="h-4 w-4" />
                <span>{document.filename}</span>
            </a>
        ) : 'Archivo no encontrado';
    }
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    return String(value);
  }

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
                    <Badge variant={enrichedRequest.status === "Completed" ? "default" : enrichedRequest.status === "Rejected" ? "destructive" : "secondary"}
                        className={enrichedRequest.status === 'Completed' ? 'bg-green-600 text-white' : ''}>
                        {enrichedRequest.status}
                    </Badge>
                </div>
            </div>
            {activeTask && isCurrentUserAssignee && (
                <Button onClick={() => handleCompleteTask(activeTask)} className="ml-auto">
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Completar Tarea
                </Button>
            )}
        </header>

        <main className="grid flex-1 gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-3">
            <div className="md:col-span-2 space-y-8">
                <Card>
                    <CardHeader>
                        <CardTitle>Progreso del Flujo de Trabajo (To-Be)</CardTitle>
                        <CardDescription>El flujo de trabajo diseñado para esta solicitud.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <WorkflowStepper steps={enrichedRequest.steps} />
                    </CardContent>
                </Card>

                {activeStep && !activeStep.assignee && users && (
                    <AssigneeSuggester step={activeStep} request={request} availableUsers={users} />
                )}

                <Card>
                    <CardHeader>
                        <CardTitle>Descubrimiento de Procesos (As-Is)</CardTitle>
                        <CardDescription>Análisis del flujo de trabajo real, destacando cuellos de botella y desviaciones.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <ProcessDiscoveryChart request={enrichedRequest} />
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Comentarios</CardTitle>
                        <CardDescription>Discuta la solicitud con otros miembros del equipo.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                       {areCommentsLoading ? <Skeleton className="h-20 w-full" /> : <CommentList comments={comments || []} users={users || []} />}
                        <div className="flex items-start gap-3 pt-4 border-t">
                             <Avatar className="h-8 w-8">
                                <AvatarImage src={user?.avatarUrl} />
                                <AvatarFallback>{user?.fullName?.charAt(0) || 'U'}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 space-y-2">
                                <Textarea 
                                    placeholder="Escribe un comentario..." 
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    rows={2}
                                />
                                <Button onClick={handleAddComment} size="sm" disabled={!newComment.trim()}>
                                    <Send className="mr-2 h-4 w-4" />
                                    Enviar
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
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
                               const fieldLabel = request.template?.fields.find((f: FormField) => f.id === key)?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                               return (
                                <div key={key} className="flex justify-between items-start">
                                    <dt className="text-muted-foreground">{fieldLabel}</dt>
                                    <dd className="font-medium text-right">{getDisplayValue(value, key)}</dd>
                                </div>
                               )
                            })}
                        </dl>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Historial de Actividad</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <ActivityLog logs={auditLogs || []} />
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
                                    <li key={doc.id} className="flex items-center gap-2 group">
                                        <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center gap-2 text-sm font-medium text-primary hover:underline truncate">
                                            <Paperclip className="h-4 w-4 shrink-0" />
                                            <span className="truncate">{doc.filename}</span>
                                        </a>
                                        <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <Trash2 className="h-4 w-4"/>
                                                </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent>
                                                <AlertDialogHeader>
                                                    <AlertDialogTitle>¿Confirmar eliminación?</AlertDialogTitle>
                                                    <AlertDialogDescription>
                                                        Esta acción no se puede deshacer. Esto eliminará permanentemente el archivo "{doc.filename}".
                                                    </AlertDialogDescription>
                                                </AlertDialogHeader>
                                                <AlertDialogFooter>
                                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                                    <AlertDialogAction onClick={() => handleDeleteDocument(doc)} className="bg-destructive hover:bg-destructive/90">
                                                        Eliminar
                                                    </AlertDialogAction>
                                                </AlertDialogFooter>
                                            </AlertDialogContent>
                                        </AlertDialog>
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
