
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
            updateDocumentNonBlocking(taskRef, { status: 'Active' });

            try {
                const suggestion = await intelligentTaskAssignment({
                    taskDescription: `Asignar la tarea: "${stepDef.name}" para la solicitud "${request.title}"`,
                    assigneeRole: stepDef.assigneeRole || '',
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
                    updateDocumentNonBlocking(taskRef, { assigneeId: suggestion.suggestedUserId });

                    const stepIndex = updatedSteps.findIndex(s => s.id === stepDef.id);
                    if(stepIndex !== -1) {
                        updatedSteps[stepIndex].assigneeId = suggestion.suggestedUserId;
                        updatedSteps[stepIndex].status = 'Active';
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
    }
}


export async function completeTaskAndProgressWorkflow({
    firestore,
    task,
    request,
    template,
    currentUser,
    allUsers,
}: CompleteTaskParams): Promise<void> {
    const now = new Date().toISOString();
    const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
    const auditLogCollection = collection(requestRef, 'audit_logs');
    const taskRef = doc(firestore, 'tasks', task.id);

    // 1. Update the completed task
    updateDocumentNonBlocking(taskRef, { status: 'Completed', completedAt: now });

    // 2. Update step in the request document
    let updatedSteps = request.steps.map(s =>
        s.id === task.stepId ? { ...s, status: 'Completed', completedAt: now } : s
    );
    updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });

    // 3. Add audit log for task completion
    addDocumentNonBlocking(auditLogCollection, {
        requestId: request.id,
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        userAvatarUrl: currentUser.avatarUrl,
        timestamp: now,
        action: 'STEP_COMPLETED',
        details: { stepName: task.name }
    });
    
    const findNextSteps = (currentStepId: string): { nextSteps: WorkflowStepDefinition[], precedingGatewayId?: string } => {
        const currentStepIndex = template.steps.findIndex(s => s.id === currentStepId);
        if (currentStepIndex === -1) return { nextSteps: [] };

        const currentStep = template.steps[currentStepIndex];

        // Check if the current step is a parallel gateway (join)
        if (currentStep.type === 'gateway-parallel') {
            // This is a join gateway, find what comes after it
            const stepAfterJoin = template.steps[currentStepIndex + 1];
            return stepAfterJoin ? { nextSteps: [stepAfterJoin] } : { nextSteps: [] };
        }

        const nextStep = template.steps[currentStepIndex + 1];
        if (!nextStep) return { nextSteps: [] };

        if (nextStep.type === 'gateway-parallel') {
            // This is a split gateway, find all steps after it until the next gateway
            const parallelSteps: WorkflowStepDefinition[] = [];
            for (let i = currentStepIndex + 2; i < template.steps.length; i++) {
                const step = template.steps[i];
                if (step.type.includes('gateway')) {
                    break;
                }
                parallelSteps.push(step);
            }
            return { nextSteps: parallelSteps, precedingGatewayId: nextStep.id };
        }

        return { nextSteps: [nextStep] };
    }

    const { nextSteps } = findNextSteps(task.stepId);

    if (nextSteps.length > 0) {
        // This is where we need to check for parallel gateway joins
        const precedingStepsAreComplete = async (step: WorkflowStepDefinition): Promise<boolean> => {
            const stepIndex = template.steps.findIndex(s => s.id === step.id);
            if (stepIndex === 0) return true;

            const prevStep = template.steps[stepIndex - 1];
            if (prevStep.type === 'gateway-parallel') { // This step is after a join gateway
                const gatewayIndex = stepIndex - 1;
                let parallelBranchStartIndex = -1;
                
                // Find the corresponding split gateway
                for (let i = gatewayIndex - 1; i >= 0; i--) {
                    if (template.steps[i].type === 'gateway-parallel') {
                        parallelBranchStartIndex = i + 1;
                        break;
                    }
                }
                
                if (parallelBranchStartIndex !== -1) {
                    const parallelSteps = template.steps.slice(parallelBranchStartIndex, gatewayIndex);
                    const parallelStepIds = new Set(parallelSteps.map(s => s.id));
                    const completedParallelSteps = updatedSteps.filter(s => parallelStepIds.has(s.id) && s.status === 'Completed');
                    return completedParallelSteps.length === parallelSteps.length;
                }
            }
            // Default sequential logic
            return updatedSteps.find(s => s.id === prevStep.id)?.status === 'Completed';
        };

        const allPrerequisitesMet = await Promise.all(nextSteps.map(step => precedingStepsAreComplete(step)));
        
        if (allPrerequisitesMet.every(Boolean)) {
            await activateAndAssignTasks(firestore, nextSteps, request, allUsers, updatedSteps, auditLogCollection);
            // After assignment, save the final state of steps
            updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: new Date().toISOString() });
        }

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
