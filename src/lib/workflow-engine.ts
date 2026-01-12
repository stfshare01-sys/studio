

'use server';

import { Firestore, doc, collection, query, where, getDocs } from 'firebase/firestore';
import type { Task, Request, Template, User, WorkflowStepDefinition } from './types';
import { addDocumentNonBlocking, updateDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { intelligentTaskAssignment } from '@/ai/flows/intelligent-task-assignment';

interface CompleteTaskParams {
    firestore: Firestore;
    task: Task;
    request: Request;
    template: Template;
    currentUser: User;
    allUsers: User[];
    outcome?: string; // For decision gateways
}


async function activateAndAssignTasks(
    firestore: Firestore,
    tasksToActivate: WorkflowStepDefinition[],
    request: Request,
    allUsers: User[],
    updatedSteps: Request['steps'],
    auditLogCollection: any
) {
    for (const stepDef of tasksToActivate) {
        const stepInRequest = request.steps.find(s => s.id === stepDef.id);
        if (stepInRequest && stepInRequest.taskId) {
            const taskRef = doc(firestore, 'tasks', stepInRequest.taskId);
            
            // Mark task as active
            let taskUpdates: Record<string, any> = { status: 'Active' };

            // Find step index in updatedSteps to modify it
            const stepIndex = updatedSteps.findIndex(s => s.id === stepDef.id);
            if (stepIndex !== -1) {
                updatedSteps[stepIndex].status = 'Active';
            }

            // Perform intelligent assignment if a role is defined
            if (stepDef.assigneeRole) {
                try {
                    const suggestion = await intelligentTaskAssignment({
                        taskDescription: `Asignar la tarea: "${stepDef.name}" para la solicitud "${request.title}"`,
                        assigneeRole: stepDef.assigneeRole,
                        availableUsers: allUsers.map(u => ({
                            userId: u.id,
                            fullName: u.fullName,
                            department: u.department,
                            skills: u.skills ?? [],
                            currentWorkload: u.currentWorkload ?? 0,
                            pastPerformance: 5,
                        })),
                    });

                    if (suggestion.suggestedUserId) {
                        const assignee = allUsers.find(u => u.id === suggestion.suggestedUserId);
                        taskUpdates.assigneeId = suggestion.suggestedUserId;

                        if (stepIndex !== -1) {
                            updatedSteps[stepIndex].assigneeId = suggestion.suggestedUserId;
                        }

                        addDocumentNonBlocking(auditLogCollection, {
                            requestId: request.id,
                            userId: 'system',
                            userFullName: 'FlowMaster AI',
                            timestamp: new Date().toISOString(),
                            action: 'STEP_ASSIGNEE_CHANGED',
                            details: {
                                stepName: stepDef.name,
                                assigneeName: assignee?.fullName || 'Desconocido',
                                reason: suggestion.reason,
                            }
                        });

                        const notificationRef = collection(firestore, 'users', suggestion.suggestedUserId, 'notifications');
                        addDocumentNonBlocking(notificationRef, {
                            title: 'Nueva Tarea Asignada',
                            message: `Se te ha asignado la tarea "${stepDef.name}" para la solicitud "${request.title}".`,
                            type: 'task',
                            read: false,
                            createdAt: new Date().toISOString(),
                            link: `/requests/${request.id}`,
                        });
                    }
                } catch (error) {
                    console.error("Error during automatic task assignment:", error);
                }
            }
             // Apply all updates to the task
            updateDocumentNonBlocking(taskRef, taskUpdates);
        }
    }
}


export async function completeTaskAndProgressWorkflow({
    firestore,
    task,
    request,
    template,
    currentUser,
    allUsers,
    outcome
}: CompleteTaskParams): Promise<void> {
    const now = new Date().toISOString();
    const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
    const auditLogCollection = collection(requestRef, 'audit_logs');
    const taskRef = doc(firestore, 'tasks', task.id);

    // 1. Update the completed task in /tasks collection
    updateDocumentNonBlocking(taskRef, { status: 'Completed', completedAt: now });

    // 2. Update the corresponding step in the request document
    let updatedSteps = request.steps.map(s =>
        s.id === task.stepId ? { ...s, status: 'Completed', completedAt: now, outcome: outcome || null } : s
    );

    // 3. Add audit log for task completion
    addDocumentNonBlocking(auditLogCollection, {
        requestId: request.id,
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        userAvatarUrl: currentUser.avatarUrl,
        timestamp: now,
        action: 'STEP_COMPLETED',
        details: { stepName: task.name, outcome: outcome || 'Completado' }
    });
    
    // Handle "Rechazado" outcome for exclusive gateways
    if (outcome === 'Rechazado') {
        updateDocumentNonBlocking(requestRef, {
            status: 'Rejected',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps, // Save the completed "rejection" step
        });
        // Notify submitter of rejection
        const submitterNotificationRef = collection(firestore, 'users', request.submittedBy, 'notifications');
        addDocumentNonBlocking(submitterNotificationRef, {
            title: 'Solicitud Rechazada',
            message: `Tu solicitud "${request.title}" ha sido rechazada.`,
            type: 'warning',
            read: false,
            createdAt: now,
            link: `/requests/${request.id}`,
        });
        return; // Stop the workflow
    }

    // 4. Find the next step(s) in the workflow
    const findNextSteps = (currentStepId: string): WorkflowStepDefinition[] => {
        const currentStepDefinition = template.steps.find(s => s.id === currentStepId);
        const currentStepIndex = template.steps.findIndex(s => s.id === currentStepId);
        if (currentStepIndex === -1) return [];
        
        // A) Exclusive Gateway Logic: Use rules to find the next step
        if (currentStepDefinition?.outcomes && currentStepDefinition.outcomes.length > 0) {
            const rule = template.rules.find(r => 
                r.condition.type === 'outcome' &&
                r.condition.fieldId === currentStepId &&
                r.condition.value === outcome
            );
            if (rule && rule.action.type === 'ROUTE_TO_STEP') {
                const nextStep = template.steps.find(s => s.id === rule.action.stepId);
                return nextStep ? [nextStep] : [];
            }
            // Default path if no rule matches
             const nextStepInSequence = template.steps[currentStepIndex + 1];
             if(nextStepInSequence && !nextStepInSequence.type.includes('gateway')) return [nextStepInSequence];
             return [];
        }

        // B) Parallel Gateway (Split) Logic
        const nextStepInSequence = template.steps[currentStepIndex + 1];
        if (nextStepInSequence && nextStepInSequence.type === 'gateway-parallel') {
            const parallelGatewayIndex = currentStepIndex + 1;
            const parallelSteps: WorkflowStepDefinition[] = [];
            
            // Find all steps that are part of the parallel branches
            // This assumes branches are defined sequentially after the split gateway
            let i = parallelGatewayIndex + 1;
            while(i < template.steps.length && !template.steps[i].type.includes('gateway')) {
                parallelSteps.push(template.steps[i]);
                i++;
            }
            return parallelSteps;
        }

        // C) Default Sequential Logic
        if (nextStepInSequence) {
             // If next step is a gateway, don't return it directly, logic will handle it on next iteration.
            if(nextStepInSequence.type.includes('gateway')) return [nextStepInSequence];
            return [nextStepInSequence];
        }

        return [];
    };

    const nextSteps = findNextSteps(task.stepId);

    // 5. Check for Parallel Gateway (Join) condition
    const checkJoinCondition = (step: WorkflowStepDefinition): boolean => {
         const stepIndex = template.steps.findIndex(s => s.id === step.id);
         if (stepIndex <= 0) return true; // Not a join or first step

         const prevStepDef = template.steps[stepIndex - 1];
         if (prevStepDef && prevStepDef.type === 'gateway-parallel') {
             // This is a join gateway. Find the corresponding split gateway.
             let splitGatewayIndex = -1;
             for (let i = stepIndex - 2; i >= 0; i--) {
                if (template.steps[i].type === 'gateway-parallel') {
                    splitGatewayIndex = i;
                    break;
                }
             }

             if (splitGatewayIndex !== -1) {
                 // Get all steps between split and join gateways
                 const parallelBranchSteps = template.steps.slice(splitGatewayIndex + 1, stepIndex - 1);
                 const parallelStepIds = new Set(parallelBranchSteps.map(s => s.id));
                 
                 // Check if all steps in the parallel branches are completed
                 const completedCount = updatedSteps.filter(s => parallelStepIds.has(s.id) && s.status === 'Completed').length;
                 return completedCount === parallelBranchSteps.length;
             }
         }
         return true; // Not a join condition, proceed
    }


    if (nextSteps.length > 0) {
        // If there's a single next step, check if it's a join.
        if (nextSteps.length === 1 && nextSteps[0].type === 'gateway-parallel') {
             if (!checkJoinCondition(nextSteps[0])) {
                // Not all parallel tasks are done, so we wait. Just save the current state.
                updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });
                return;
             }
             // If join condition is met, find the actual step *after* the join gateway
             const joinGatewayIndex = template.steps.findIndex(s => s.id === nextSteps[0].id);
             const stepAfterJoin = template.steps[joinGatewayIndex + 1];
             if (stepAfterJoin) {
                 await activateAndAssignTasks(firestore, [stepAfterJoin], request, allUsers, updatedSteps, auditLogCollection);
             }
        } else {
            // Activate all next steps (for parallel split or single step)
            await activateAndAssignTasks(firestore, nextSteps, request, allUsers, updatedSteps, auditLogCollection);
        }

        updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });

    } else {
        // This was the last step, so complete the request
        updateDocumentNonBlocking(requestRef, {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
        });

        // Notify the original submitter that their request is complete
        const submitterNotificationRef = collection(firestore, 'users', request.submittedBy, 'notifications');
        addDocumentNonBlocking(submitterNotificationRef, {
            title: 'Solicitud Completada',
            message: `Tu solicitud "${request.title}" ha sido completada.`,
            type: 'success',
            read: false,
            createdAt: now,
            link: `/requests/${request.id}`,
        });
    }
}
