"use client";

import type { WorkflowStep } from "@/lib/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CheckCircle2, Circle, CircleDot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export function WorkflowStepper({ steps }: { steps: WorkflowStep[] }) {
  const getStatusIcon = (status: WorkflowStep['status']) => {
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

  const getStatusText = (step: WorkflowStep) => {
    switch (step.status) {
      case 'Completed':
        return (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              {step.assignee?.avatarUrl && <AvatarImage src={step.assignee.avatarUrl} alt={step.assignee.name} />}
              <AvatarFallback>{step.assignee?.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>Completado por {step.assignee?.name} el {format(new Date(step.completedAt!), "d 'de' MMMM 'de' yyyy", { locale: es })}</span>
          </div>
        );
      case 'Active':
        return step.assignee ? (
          <div className="flex items-center gap-2">
            <Avatar className="h-5 w-5">
              {step.assignee?.avatarUrl && <AvatarImage src={step.assignee.avatarUrl} alt={step.assignee.name} />}
              <AvatarFallback>{step.assignee?.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <span>Asignado a {step.assignee.name}</span>
          </div>
        ) : (
          <span>Pendiente de asignación</span>
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
