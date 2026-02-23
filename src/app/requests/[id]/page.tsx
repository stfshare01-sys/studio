

'use client';

import SiteLayout from "@/components/site-layout";
import { notFound, useParams } from "next/navigation";
import { useCollection, useDoc, useFirestore, useMemoFirebase, useUser, useStorage } from "@/firebase";
import { doc, collection, query, serverTimestamp, orderBy, updateDoc, collectionGroup, where, getDocs, limit, getDoc } from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import type { Request as RequestType, EnrichedRequest, User, EnrichedWorkflowStep, Template, Comment as CommentType, EnrichedComment, AuditLog, FormField, Document as DocumentType, Task, WorkflowStepDefinition, TableColumnDefinition } from "@/lib/types";
import DOMPurify from 'dompurify';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, User as UserIcon, Paperclip, Send, Trash2, CheckCircle, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { WorkflowStepper } from "@/components/requests/workflow-stepper";
import { AssigneeSuggester } from "@/components/requests/assignee-suggester";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState, useCallback } from "react";
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
import { usePermissions } from "@/hooks/use-permissions";

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
    const { isAdmin } = usePermissions();
    const { toast } = useToast();

    const [requestRef, setRequestRef] = useState<any>(null);
    const [newComment, setNewComment] = useState("");

    useEffect(() => {
        async function findRequestRef() {
            if (isUserLoading || !firestore || !user) return;

            // 1. Try to find the request under the current user's path (most common case for submitters)
            let userSpecificSnap = await getDoc(doc(firestore, 'users', user.uid, 'requests', id));

            if (userSpecificSnap.exists()) {
                setRequestRef(userSpecificSnap.ref);
                return;
            }

            // 2. If not found and user is admin, search across all requests using a collection group query.
            if (isAdmin) {
                const requestsCollectionGroup = collectionGroup(firestore, 'requests');
                const q = query(requestsCollectionGroup, where('id', '==', id), limit(1));
                const querySnapshot = await getDocs(q);

                if (!querySnapshot.empty) {
                    setRequestRef(querySnapshot.docs[0].ref);
                    return;
                }
            }

            // 3. Fallback for managers - check if a task in this request is assigned to their direct reports
            const myTeamIds = (await getDocs(query(collection(firestore, 'users'), where('managerId', '==', user.uid)))).docs.map(d => d.id);
            if (myTeamIds.length > 0) {
                const tasksInRequestQuery = query(collection(firestore, 'tasks'), where('requestId', '==', id), where('assigneeId', 'in', myTeamIds));
                const tasksSnapshot = await getDocs(tasksInRequestQuery);
                if (!tasksSnapshot.empty) {
                    const requestsCollectionGroup = collectionGroup(firestore, 'requests');
                    const q = query(requestsCollectionGroup, where('id', '==', id), limit(1));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        setRequestRef(querySnapshot.docs[0].ref);
                        return;
                    }
                }
            }

            setRequestRef(null);
        }
        findRequestRef();
    }, [firestore, user, id, isUserLoading, isAdmin]);


    const { data: request, isLoading: isRequestLoading, forceRefetch } = useDoc<RequestType>(requestRef);

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
        if (request && template && user && users) {
            const userList = users || [user];
            const submittedByUser = userList.find(u => u.id === request.submittedBy) ?? { id: request.submittedBy, fullName: "Usuario Desconocido", email: "", department: "", role: "Member", status: 'active' };
            const enrichedSteps: EnrichedWorkflowStep[] = request.steps.map(s => {
                const assignee = userList.find(u => u.id === s.assigneeId);
                return {
                    ...s,
                    assignee: assignee ?? (s.assigneeId ? { id: s.assigneeId, fullName: "Usuario Asignado", email: "", department: "", role: "Member", status: 'active' } : null),
                }
            });
            setEnrichedRequest({ ...request, template, submittedBy: submittedByUser, steps: enrichedSteps });
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
            const fileRef = ref(storage, docToDelete.storagePath);
            await deleteObject(fileRef);

            const updatedDocuments = request.documents.filter(d => d.id !== docToDelete.id);
            await updateDoc(requestRef, { documents: updatedDocuments });

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

    const handleCompleteTask = async (task: Task, outcome?: string) => {
        if (!firestore || !user || !request || !template || !users) {
            toast({ variant: 'destructive', title: 'Error', description: 'No se puede completar la tarea.' });
            return;
        }
        try {
            await completeTaskAndProgressWorkflow({
                firestore,
                task,
                request,
                template,
                currentUser: user as User,
                allUsers: users,
                outcome
            });
            toast({ title: "¡Tarea Completada!", description: `La tarea "${task.name}" ha sido completada.` });
        } catch (error) {
            console.error("Error completing task:", error);
            toast({ variant: 'destructive', title: 'Error', description: 'No se pudo completar la tarea.' });
        }
    };

    const isLoading = isUserLoading || !requestRef || isRequestLoading || areUsersLoading || isTemplateLoading || areAuditLogsLoading;

    if (isLoading && !request) {
        return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
    }

    if (!request || !enrichedRequest || !template) {
        if (!isRequestLoading && !request) notFound();
        return <SiteLayout><RequestDetailSkeleton /></SiteLayout>;
    }

    const activeStep = enrichedRequest.steps.find(s => s.status === 'Active');

    const activeTask = activeStep?.taskId ? { ...activeStep, stepId: activeStep.id, assigneeId: activeStep.assignee?.id || null, id: activeStep.taskId, requestTitle: request.title, requestId: request.id, requestOwnerId: request.submittedBy, createdAt: "" } as Task : null;
    const activeStepDefinition = activeTask ? template.steps.find(s => s.id === activeTask.stepId) : null;

    const isDecisionTask = activeStepDefinition?.outcomes && activeStepDefinition.outcomes.length > 0;
    const isCurrentUserAssignee = activeStep?.assignee?.id === user?.uid;

    const getDisplayValue = (value: any, fieldId: string) => {
        const field = template?.fields.find((f: FormField) => f.id === fieldId);

        // Handle file type
        if (field?.type === 'file') {
            const document = request.documents.find(d => d.id === value);
            return document ? (
                <a href={document.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <Paperclip className="h-4 w-4" />
                    <span>{document.filename}</span>
                </a>
            ) : 'Archivo no encontrado';
        }

        // Handle table type
        if (field?.type === 'table' && Array.isArray(value)) {
            const columns = (field.tableColumns || []) as TableColumnDefinition[];
            if (value.length === 0) return <span className="text-muted-foreground text-sm">Sin datos</span>;
            return (
                <div className="w-full overflow-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                {columns.map(col => (
                                    <TableHead key={col.id}>{col.name}</TableHead>
                                ))}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {value.map((row: Record<string, any>, idx: number) => (
                                <TableRow key={idx}>
                                    {columns.map(col => (
                                        <TableCell key={col.id}>{row[col.id] ?? '-'}</TableCell>
                                    ))}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            );
        }

        // Handle user-identity type
        if (field?.type === 'user-identity' && typeof value === 'object' && value !== null) {
            return (
                <div className="space-y-1 text-sm">
                    {value.fullName && <div><span className="text-muted-foreground">Nombre:</span> {value.fullName}</div>}
                    {value.email && <div><span className="text-muted-foreground">Email:</span> {value.email}</div>}
                    {value.phone && <div><span className="text-muted-foreground">Teléfono:</span> {value.phone}</div>}
                    {value.department && <div><span className="text-muted-foreground">Departamento:</span> {value.department}</div>}
                </div>
            );
        }

        // Handle html type
        if (field?.type === 'html' && typeof value === 'string') {
            const sanitizedHtml = DOMPurify.sanitize(value);
            return (
                <div
                    className="prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
                />
            );
        }

        // Handle boolean
        if (typeof value === 'boolean') return value ? 'Sí' : 'No';

        // Handle arrays (for select multiple, etc.)
        if (Array.isArray(value)) return value.join(', ');

        // Default: convert to string
        return String(value);
    }

    const renderActionButtons = () => {
        if (!activeTask || !isCurrentUserAssignee) return null;

        if (isDecisionTask) {
            return (
                <div className="ml-auto flex items-center gap-2">
                    <span className="text-sm font-medium text-muted-foreground">Decisión requerida:</span>
                    {activeStepDefinition?.outcomes?.map(outcome => (
                        <Button
                            key={outcome}
                            variant={outcome.toLowerCase() === 'rechazado' ? 'destructive' : 'outline'}
                            onClick={() => handleCompleteTask(activeTask, outcome)}
                        >
                            {outcome}
                        </Button>
                    ))}
                </div>
            );
        }

        return (
            <Button onClick={() => handleCompleteTask(activeTask, 'Completado')} className="ml-auto">
                <CheckCircle className="mr-2 h-4 w-4" />
                Completar Tarea
            </Button>
        );
    };

    return (
        <SiteLayout>
            <div className="flex flex-1 flex-col">
                <header className="flex items-center p-4 sm:p-6">
                    <Button variant="outline" size="icon" className="border-blue-500 text-blue-600 hover:bg-blue-50 hover:text-blue-700" asChild>
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
                    {renderActionButtons()}
                </header>

                <main className="grid flex-1 gap-4 p-4 pt-0 sm:gap-8 sm:p-6 sm:pt-0 md:grid-cols-3">
                    <div className="md:col-span-2 space-y-8">
                        <Card>
                            <CardHeader>
                                <CardTitle>Progreso del Flujo de Trabajo (To-Be)</CardTitle>
                                <CardDescription>El flujo de trabajo diseñado para esta solicitud.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <WorkflowStepper steps={enrichedRequest.steps} request={request} allUsers={users || []} onDataChange={forceRefetch} />
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
                                <dl className="grid gap-3">
                                    {Object.entries(enrichedRequest.formData).map(([key, value]) => {
                                        const field = template?.fields.find((f: FormField) => f.id === key);
                                        const fieldLabel = field?.label || key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                                        const isComplexType = field?.type === 'table' || field?.type === 'html' || field?.type === 'user-identity';

                                        if (isComplexType) {
                                            return (
                                                <div key={key} className="space-y-2">
                                                    <dt className="text-muted-foreground font-medium">{fieldLabel}</dt>
                                                    <dd>{getDisplayValue(value, key)}</dd>
                                                </div>
                                            );
                                        }

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
                                                            <Trash2 className="h-4 w-4" />
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
