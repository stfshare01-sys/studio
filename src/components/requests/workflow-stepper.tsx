
"use client";

import { useState } from "react";
import type { EnrichedWorkflowStep, User, Request as RequestType, Task } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { CheckCircle2, Circle, CircleDot, Replace } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useUser, useFirestore } from "@/firebase";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { doc, collection } from "firebase/firestore";
import { updateDocumentNonBlocking, addDocumentNonBlocking } from "@/firebase/non-blocking-updates";


function ReassignTaskDialog({ task, request, allUsers, onReassign }: { task: Task, request: RequestType, allUsers: User[], onReassign: () => void }) {
    const [newAssigneeId, setNewAssigneeId] = useState<string | undefined>(undefined);
    const [isOpen, setIsOpen] = useState(false);
    const { toast } = useToast();
    const firestore = useFirestore();
    const { user: currentUser } = useUser();

    const handleConfirmReassignment = () => {
        if (!newAssigneeId || !firestore || !currentUser) {
            toast({ variant: 'destructive', title: 'Error', description: 'Por favor, seleccione un nuevo asignado.' });
            return;
        }

        const newAssignee = allUsers.find(u => u.id === newAssigneeId);
        if (!newAssignee) return;

        const taskRef = doc(firestore, 'tasks', task.id);
        const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
        const auditLogCollection = collection(requestRef, 'audit_logs');
        const now = new Date().toISOString();

        // 1. Update task document
        updateDocumentNonBlocking(taskRef, { assigneeId: newAssigneeId });

        // 2. Update request steps array
        const updatedSteps = request.steps.map(s => s.id === task.stepId ? { ...s, assigneeId: newAssigneeId } : s);
        updateDocumentNonBlocking(requestRef, { steps: updatedSteps });

        // 3. Add audit log
        addDocumentNonBlocking(auditLogCollection, {
            requestId: request.id,
            userId: currentUser.id,
            userFullName: currentUser.fullName,
            timestamp: now,
            action: 'STEP_ASSIGNEE_CHANGED',
            details: {
                stepName: task.name,
                assigneeName: newAssignee.fullName,
                reason: 'Reasignación manual por administrador.'
            }
        });

        // 4. Notify new assignee
        const notificationRef = collection(firestore, 'users', newAssigneeId, 'notifications');
        addDocumentNonBlocking(notificationRef, {
            title: 'Tarea Reasignada',
            message: `Se te ha reasignado la tarea "${task.name}" de la solicitud "${request.title}".`,
            type: 'task',
            read: false,
            createdAt: now,
            link: `/requests/${request.id}`
        });

        toast({ title: '¡Tarea Reasignada!', description: `"${task.name}" ha sido asignada a ${newAssignee.fullName}.` });
        setIsOpen(false);
        onReassign(); // Callback to trigger data refresh if needed
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
                    <Replace className="h-3 w-3" />
                    Reasignar
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Reasignar Tarea: {task.name}</DialogTitle>
                    <DialogDescription>Seleccione un nuevo usuario para esta tarea. El usuario actual es {allUsers.find(u => u.id === task.assigneeId)?.fullName || 'Nadie'}.</DialogDescription>
                </DialogHeader>
                <div className="py-4 space-y-2">
                    <Label htmlFor="new-assignee">Nuevo Asignado</Label>
                    <Select value={newAssigneeId} onValueChange={setNewAssigneeId}>
                        <SelectTrigger id="new-assignee">
                            <SelectValue placeholder="Seleccionar un usuario..." />
                        </SelectTrigger>
                        <SelectContent>
                            {allUsers.map(user => (
                                <SelectItem key={user.id} value={user.id}>{user.fullName} ({user.department})</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                <DialogFooter>
                    <DialogClose asChild><Button variant="ghost">Cancelar</Button></DialogClose>
                    <Button onClick={handleConfirmReassignment} disabled={!newAssigneeId}>Confirmar Reasignación</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export function WorkflowStepper({ steps, request, allUsers, onDataChange }: { steps: EnrichedWorkflowStep[], request: RequestType, allUsers: User[], onDataChange: () => void }) {
  const { user: currentUser } = useUser();
  const isAdmin = currentUser?.role === 'Admin';
  
  const getStatusIcon = (status: EnrichedWorkflowStep['status']) => {
    switch (status) {
      case 'Completed':
        return <CheckCircle2 className="h-6 w-6 text-primary" />;
      case 'Active':
        return <CircleDot className="h-6 w-6 text-accent-foreground animate-pulse" />;
      case 'Pending':
        return <Circle className="h-6 w-6 text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getStatusText = (step: EnrichedWorkflowStep) => {
    const task: Task | null = step.taskId ? { 
        id: step.taskId,
        requestTitle: request.title,
        requestId: request.id,
        requestOwnerId: request.submittedBy,
        stepId: step.id,
        name: step.name,
        status: step.status,
        assigneeId: step.assignee?.id || null,
        completedAt: step.completedAt,
        createdAt: request.createdAt, // This is an approximation
    } : null;

    switch (step.status) {
      case 'Completed':
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              {step.assignee?.avatarUrl && <AvatarImage src={step.assignee.avatarUrl} alt={step.assignee.fullName} />}
              <AvatarFallback>{step.assignee?.fullName.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>Completado por {step.assignee?.fullName} el {format(new Date(step.completedAt!), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
          </div>
        );
      case 'Active':
        return (
          <div className="flex items-center gap-2">
            {step.assignee ? (
              <>
                <Avatar className="h-5 w-5">
                  {step.assignee?.avatarUrl && <AvatarImage src={step.assignee.avatarUrl} alt={step.assignee.fullName} />}
                  <AvatarFallback>{step.assignee?.fullName.charAt(0)}</AvatarFallback>
                </Avatar>
                <span>Asignado a {step.assignee.fullName}</span>
                {isAdmin && task && <ReassignTaskDialog task={task} request={request} allUsers={allUsers} onReassign={onDataChange} />}
              </>
            ) : (
                <span>Pendiente de asignación</span>
            )}
          </div>
        );
      case 'Pending':
        return <span>No iniciado</span>;
      default:
        return null;
    }
  };

  return (
    <div className="relative">
      {steps.map((step, index) => (
        <div key={step.id} className="relative flex items-start pb-8">
          {index !== steps.length - 1 && (
            <div className="absolute left-3 top-1 h-full w-0.5 bg-border" />
          )}
          <div className="relative z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background">
            {getStatusIcon(step.status)}
          </div>
          <div className="ml-4 flex-1">
            <h4 className={cn("font-semibold", step.status === 'Pending' && 'text-muted-foreground')}>
              {step.name}
            </h4>
            <div className="mt-1 text-sm text-muted-foreground">
              {getStatusText(step)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
