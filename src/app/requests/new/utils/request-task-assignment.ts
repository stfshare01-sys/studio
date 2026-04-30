'use client';

import { doc, collection } from 'firebase/firestore';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase';
import { intelligentTaskAssignment } from '@/ai/flows/intelligent-task-assignment';
import type { User } from '@/types/auth.types';
import type { Template } from "@/types/workflow.types";

export async function assignInitialTask(
    request: any,
    template: Template,
    users: User[],
    firestore: any,
): Promise<void> {
    if (!users || users.length === 0) {
        console.warn("No users available for auto-assignment.");
        return;
    }

    const firstStep = request.steps[0];
    const firstStepDefinition = template.steps.find((s: any) => s.id === firstStep.id);
    const firstTaskRef = doc(firestore, 'tasks', firstStep.taskId);

    if (!firstStepDefinition || !firstStepDefinition.assigneeRole) {
        console.log("First step has no defined assignee role. Skipping auto-assignment.");
        return;
    }

    try {
        const suggestion = await intelligentTaskAssignment({
            taskDescription: `Asignar la tarea inicial: "${firstStep.name}" para la solicitud "${request.title}"`,
            assigneeRole: firstStepDefinition.assigneeRole,
            availableUsers: users.map(u => ({
                userId: u.id,
                fullName: u.fullName,
                department: u.department,
                skills: u.skills ?? [],
                currentWorkload: u.currentWorkload ?? 0,
                pastPerformance: 5,
            }))
        });

        if (suggestion.suggestedUserId) {
            const assignee = users.find(u => u.id === suggestion.suggestedUserId);

            updateDocumentNonBlocking(firstTaskRef, { assigneeId: suggestion.suggestedUserId });

            const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
            const updatedSteps = request.steps.map((s: any) =>
                s.id === firstStep.id ? { ...s, assigneeId: suggestion.suggestedUserId } : s
            );
            updateDocumentNonBlocking(requestRef, { steps: updatedSteps });

            const auditLogCollection = collection(requestRef, 'audit_logs');
            addDocumentNonBlocking(auditLogCollection, {
                requestId: request.id,
                userId: 'system',
                userFullName: 'STUFFACTORY AI',
                timestamp: new Date().toISOString(),
                action: 'STEP_ASSIGNEE_CHANGED',
                details: {
                    stepName: firstStep.name,
                    assigneeName: assignee?.fullName || suggestion.suggestedUserId,
                    reason: suggestion.reason
                }
            });
            console.log(`Task '${firstStep.name}' auto-assigned to ${assignee?.fullName}. Reason: ${suggestion.reason}`);
        }
    } catch (error) {
        console.error("Error during automatic task assignment:", error);
    }
}
