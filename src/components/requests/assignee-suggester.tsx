"use client";

import { useState } from "react";
import type { User, EnrichedWorkflowStep, Request } from "@/lib/types";
import { intelligentTaskAssignment } from "@/ai/flows/intelligent-task-assignment";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Bot, Loader2, UserPlus, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useFirestore } from "@/firebase";
import { doc } from "firebase/firestore";
import { updateDocumentNonBlocking } from "@/firebase/non-blocking-updates";

type Suggestion = {
  suggestedUserId: string;
  reason: string;
};

export function AssigneeSuggester({
  step,
  request,
  availableUsers,
}: {
  step: EnrichedWorkflowStep;
  request: Request;
  availableUsers: User[];
}) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const { toast } = useToast();
  const firestore = useFirestore();

  const handleSuggest = async () => {
    setIsLoading(true);
    setSuggestion(null);
    try {
      const result = await intelligentTaskAssignment({
        taskDescription: `Assign the task: "${step.name}" for the request "${request.title}"`,
        availableUsers: availableUsers.map((u) => ({
          userId: u.id,
          skills: u.skills ?? [],
          currentWorkload: u.currentWorkload ?? 0,
          pastPerformance: 5, // Mocked for demonstration
        })),
      });
      setSuggestion(result);
    } catch (error) {
      console.error("AI suggestion failed:", error);
      setIsOpen(false);
      toast({
        variant: "destructive",
        title: "Error",
        description: "No se pudo obtener la sugerencia de la IA. Por favor, inténtelo de nuevo.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAssign = () => {
    if (!suggestion || !suggestedUser || !firestore || !step.taskId) {
        toast({ variant: 'destructive', title: 'Error', description: 'No se puede asignar la tarea.' });
        return;
    }

    const taskRef = doc(firestore, 'tasks', step.taskId);
    updateDocumentNonBlocking(taskRef, { assigneeId: suggestedUser.id });

    // Also update the step in the request subcollection for consistency
    const requestStepRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
    const updatedSteps = request.steps.map(s => 
        s.id === step.id ? { ...s, assigneeId: suggestedUser.id } : s
    );
    updateDocumentNonBlocking(requestStepRef, { steps: updatedSteps });

    setIsOpen(false);
    toast({
        title: "¡Tarea Asignada!",
        description: `${suggestedUser?.fullName} ha sido asignado a "${step.name}".`,
    });
  }

  const suggestedUser = suggestion
    ? availableUsers.find((u) => u.id === suggestion.suggestedUserId)
    : null;

  return (
    <Card className="bg-primary/5 border-primary/20">
      <CardHeader>
        <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
                <CardTitle>Asignación Inteligente</CardTitle>
                <CardDescription>
                La IA puede ayudarte a encontrar a la persona adecuada para esta tarea.
                </CardDescription>
            </div>
        </div>
      </CardHeader>
      <CardContent>
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button onClick={handleSuggest} className="w-full">
              <Bot className="mr-2 h-4 w-4" />
              Sugerir Asignado con IA
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sugerencia de Asignado por IA</DialogTitle>
              <DialogDescription>
                Para la tarea: <span className="font-semibold">{step.name}</span>
              </DialogDescription>
            </DialogHeader>
            {isLoading && (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="ml-4 text-muted-foreground">Analizando datos de usuario...</p>
              </div>
            )}
            {suggestion && suggestedUser && (
              <div className="space-y-4 py-4">
                 <div className="flex items-center gap-4 rounded-lg border p-4">
                    <Avatar className="h-12 w-12">
                        <AvatarImage src={suggestedUser.avatarUrl} alt={suggestedUser.fullName} />
                        <AvatarFallback>{suggestedUser.fullName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <div className="font-bold text-lg">{suggestedUser.fullName}</div>
                        <div className="text-sm text-muted-foreground">{suggestedUser.email}</div>
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold mb-2">Razonamiento:</h4>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">{suggestion.reason}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="ghost" onClick={() => setIsOpen(false)}>Cancelar</Button>
              <Button onClick={handleAssign} disabled={!suggestion || isLoading}>
                <UserPlus className="mr-2 h-4 w-4" />
                Asignar a {suggestedUser?.fullName.split(' ')[0]}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
