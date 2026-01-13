

'use server';

import { Firestore, doc, collection, query, where, getDocs } from 'firebase/firestore';
import type { Task, Request, Template, User, WorkflowStepDefinition } from './types';
import { addDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
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

/**
 * Evaluates rules based on form data to determine if additional steps are needed.
 * This can be used at request creation or during the workflow.
 * @returns A list of step definitions that should be part of the process.
 */
export async function evaluateAndAddInitialSteps(
    formData: Record<string, any>,
    template: Template,
    requestId: string,
    requestOwnerId: string,
    createdAt: string,
    firestore: Firestore
): Promise<{ finalSteps: WorkflowStepDefinition[], stepsWithTasks: (WorkflowStepDefinition & { taskId: string })[] }> {
    const additionalSteps = template.rules?.reduce((acc, rule) => {
        if (rule.condition.type !== 'form' || rule.action.type !== 'REQUIRE_ADDITIONAL_STEP') {
            return acc;
        }

        const fieldValue = formData[rule.condition.fieldId];
        let conditionMet = false;
        if (fieldValue !== undefined) {
            const val = parseFloat(fieldValue);
            const ruleVal = parseFloat(rule.condition.value);
            switch (rule.condition.operator) {
                case '>': if (val > ruleVal) conditionMet = true; break;
                case '<': if (val < ruleVal) conditionMet = true; break;
                case '==': if (val == ruleVal) conditionMet = true; break;
                case '!=': if (val != ruleVal) conditionMet = true; break;
                case '>=': if (val >= ruleVal) conditionMet = true; break;
                case '<=': if (val <= ruleVal) conditionMet = true; break;
            }
        }

        if (conditionMet) {
            const stepToAdd = template.steps.find(s => s.id === rule.action.stepId);
            if (stepToAdd && !acc.some(s => s.id === stepToAdd.id)) {
                acc.push(stepToAdd);
            }
        }
        return acc;
    }, [] as WorkflowStepDefinition[]) || [];

    const finalSteps = [...template.steps, ...additionalSteps];
    const uniqueSteps = Array.from(new Map(finalSteps.map(s => [s.id, s])).values());
    
    // Create task documents for all steps that will be part of this request
    const taskCreationPromises = uniqueSteps.map(async (step) => {
        const tasksCollection = collection(firestore, 'tasks');
        const newTaskRef = doc(tasksCollection);
        const taskData = {
            id: newTaskRef.id,
            requestId: requestId,
            requestTitle: `${template.name} - ${new Date(createdAt).toLocaleDateString('es-ES')}`,
            requestOwnerId: requestOwnerId,
            stepId: step.id,
            name: step.name,
            status: 'Pending', // All tasks start as pending
            assigneeId: null,
            completedAt: null,
            createdAt: createdAt,
        };
        setDocumentNonBlocking(newTaskRef, taskData, {});
        return { ...step, taskId: newTaskRef.id };
    });

    const stepsWithTasks = await Promise.all(taskCreationPromises);
    
    return { finalSteps: uniqueSteps, stepsWithTasks };
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
             // If no rule matches (e.g. "Approved" outcome with no specific rule), fall through to sequential logic.
        }

        // B) Parallel Gateway (Split) Logic
        const nextStepInSequence = template.steps[currentStepIndex + 1];
        if (nextStepInSequence && nextStepInSequence.type === 'gateway-parallel') {
            const parallelGatewayIndex = currentStepIndex + 1;
            
            // This is a "join" gateway if there are multiple incoming paths.
            // But for a split, we look ahead.
            let isSplitGateway = true; // Assume it's a split unless proven otherwise.
            // A simple heuristic: if the previous step wasn't a gateway, this is likely a split.
            if(currentStepIndex > 0 && template.steps[currentStepIndex].type.includes('gateway')) {
                isSplitGateway = false;
            }

            if (isSplitGateway) {
                const parallelSteps: WorkflowStepDefinition[] = [];
                // Find all steps that are part of the parallel branches until a join gateway is found
                let i = parallelGatewayIndex + 1;
                while(i < template.steps.length) {
                    const step = template.steps[i];
                    if (step.type === 'gateway-parallel') break; // Found the join gateway
                    parallelSteps.push(step);
                    i++;
                }
                return parallelSteps;
            }
        }

        // C) Default Sequential Logic
        if (nextStepInSequence) {
            return [nextStepInSequence];
        }

        return [];
    };

    const nextSteps = findNextSteps(task.stepId);

    // 5. Check for Parallel Gateway (Join) condition
    const checkJoinCondition = (joinGatewayStep: WorkflowStepDefinition): boolean => {
         const joinIndex = template.steps.findIndex(s => s.id === joinGatewayStep.id);
         if (joinIndex <= 0) return true;

         // Find the corresponding split gateway by looking backwards
         let splitGatewayIndex = -1;
         for (let i = joinIndex - 1; i >= 0; i--) {
            if (template.steps[i].type === 'gateway-parallel') {
                splitGatewayIndex = i;
                break;
            }
         }

         if (splitGatewayIndex !== -1) {
             // Get all steps between split and join gateways
             const parallelBranchSteps = template.steps.slice(splitGatewayIndex + 1, joinIndex);
             const parallelStepIds = new Set(parallelBranchSteps.map(s => s.id));
             
             // Check if all steps in the parallel branches are completed in the *current* request state
             const completedCount = updatedSteps.filter(s => parallelStepIds.has(s.id) && s.status === 'Completed').length;
             return completedCount === parallelBranchSteps.length;
         }
         
         return true; // Not a well-formed join condition, proceed
    }


    if (nextSteps.length > 0) {
        let finalNextSteps = nextSteps;

        // If the single next step is a join gateway, check condition
        if (nextSteps.length === 1 && nextSteps[0].type === 'gateway-parallel') {
             if (!checkJoinCondition(nextSteps[0])) {
                // Not all parallel tasks are done, so we wait. Just save the current state.
                updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });
                return;
             }
             // If join condition is met, find the actual step *after* the join gateway
             const joinGatewayIndex = template.steps.findIndex(s => s.id === nextSteps[0].id);
             const stepAfterJoin = template.steps[joinGatewayIndex + 1];
             finalNextSteps = stepAfterJoin ? [stepAfterJoin] : [];
        }
        
        if (finalNextSteps.length > 0) {
            await activateAndAssignTasks(firestore, finalNextSteps, request, allUsers, updatedSteps, auditLogCollection);
        } else {
             // This was the last step in a branch or the workflow
            // Check if this completion finishes the entire request
            const activeOrPendingTasks = updatedSteps.some(s => s.status === 'Active' || s.status === 'Pending');
            if (!activeOrPendingTasks) {
                 updateDocumentNonBlocking(requestRef, { status: 'Completed', completedAt: now });
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
        
        updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });

    } else {
        // No more steps found, this was the last step in the workflow
        updateDocumentNonBlocking(requestRef, {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps,
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
