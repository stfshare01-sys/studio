

'use server';

import { Firestore, doc, collection, getDoc } from 'firebase/firestore';
import type { Task, Request, Template, User, WorkflowStepDefinition, Rule } from './types';
import { addDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { intelligentTaskAssignment } from '@/ai/flows/intelligent-task-assignment';
import { addHours } from 'date-fns';

interface EvaluateRulesParams {
    firestore: Firestore;
    formData: Record<string, any>;
    request: Partial<Request> & { id: string, title: string, submittedBy: string };
    template: Template;
    allUsers: User[];
}

/**
 * Evaluates rules and executes their actions.
 * @returns A list of new step definitions to be added to the process.
 */
export async function evaluateAndExecuteRules({
    firestore,
    formData,
    request,
    template,
    allUsers,
}: EvaluateRulesParams): Promise<WorkflowStepDefinition[]> {
    const stepsToAdd: WorkflowStepDefinition[] = [];

    if (!template.rules) return stepsToAdd;

    for (const rule of template.rules) {
        const fieldValue = formData[rule.condition.fieldId];
        let conditionMet = false;

        if (fieldValue !== undefined && fieldValue !== null) {
            const ruleValue = rule.condition.value;
            switch (rule.condition.operator) {
                case '>':
                case '<':
                case '>=':
                case '<=':
                    const numFieldValue = parseFloat(fieldValue);
                    const numRuleValue = parseFloat(ruleValue);
                    if (!isNaN(numFieldValue) && !isNaN(numRuleValue)) {
                        if (rule.condition.operator === '>' && numFieldValue > numRuleValue) conditionMet = true;
                        if (rule.condition.operator === '<' && numFieldValue < numRuleValue) conditionMet = true;
                        if (rule.condition.operator === '>=' && numFieldValue >= numRuleValue) conditionMet = true;
                        if (rule.condition.operator === '<=' && numFieldValue <= numRuleValue) conditionMet = true;
                    }
                    break;
                case '==':
                case 'is': // Treat 'is' as strict equality
                    if (fieldValue == ruleValue) conditionMet = true;
                    break;
                case '!=':
                case 'is_not': // Treat 'is_not' as strict inequality
                    if (fieldValue != ruleValue) conditionMet = true;
                    break;
                case 'contains':
                    if (typeof fieldValue === 'string' && fieldValue.includes(ruleValue)) conditionMet = true;
                    break;
                case 'not_contains':
                    if (typeof fieldValue === 'string' && !fieldValue.includes(ruleValue)) conditionMet = true;
                    break;
            }
        }
        
        if (conditionMet) {
            const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
            const auditLogCollection = collection(requestRef, 'audit_logs');
            const now = new Date().toISOString();

            switch (rule.action.type) {
                case 'REQUIRE_ADDITIONAL_STEP':
                    const stepToAdd = template.steps.find(s => s.id === rule.action.stepId);
                    if (stepToAdd) {
                        stepsToAdd.push(stepToAdd);
                    }
                    break;
                case 'ASSIGN_USER':
                    // This action is better handled post-step creation
                    break;
                case 'CHANGE_REQUEST_PRIORITY':
                    updateDocumentNonBlocking(requestRef, { priority: rule.action.priority });
                     addDocumentNonBlocking(auditLogCollection, {
                        requestId: request.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'AUDIT_LOG_ENTRY' as any, // This should be a valid action
                        details: { message: `La prioridad de la solicitud cambió a "${rule.action.priority}" por una regla de negocio.` }
                    });
                    break;
                case 'SEND_NOTIFICATION':
                    let targetUsers: User[] = [];
                    if (rule.action.target === 'submitter') {
                        const submitter = allUsers.find(u => u.id === request.submittedBy);
                        if (submitter) targetUsers.push(submitter);
                    } else {
                        targetUsers = allUsers.filter(u => u.role === rule.action.target);
                    }

                    for (const targetUser of targetUsers) {
                        const notificationRef = collection(firestore, 'users', targetUser.id, 'notifications');
                        addDocumentNonBlocking(notificationRef, {
                            title: 'Notificación de Proceso',
                            message: rule.action.message.replace('{{request.title}}', request.title),
                            type: 'info', read: false, createdAt: now, link: `/requests/${request.id}`,
                        });
                    }
                    break;
            }
        }
    }

    return Array.from(new Map(stepsToAdd.map(s => [s.id, s])).values());
}


/**
 * Sets up the initial steps and tasks for a new request, evaluating rules.
 */
export async function evaluateAndAddInitialSteps(
    formData: Record<string, any>,
    template: Template,
    requestId: string,
    requestOwnerId: string,
    createdAt: string,
    firestore: Firestore,
    allUsers: User[],
): Promise<{ finalSteps: WorkflowStepDefinition[], stepsWithTasks: (WorkflowStepDefinition & { taskId: string })[] }> {
    
    const additionalSteps = await evaluateAndExecuteRules({
        firestore, formData, allUsers,
        request: { id: requestId, title: `${template.name} - ${new Date(createdAt).toLocaleDateString('es-ES')}`, submittedBy: requestOwnerId },
        template
    });
    
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

// ... Rest of the file
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
    const now = new Date();

    for (const stepDef of tasksToActivate) {
        const stepInRequest = request.steps.find(s => s.id === stepDef.id);
        if (stepInRequest && stepInRequest.taskId) {
            const taskRef = doc(firestore, 'tasks', stepInRequest.taskId);
            
            // Mark task as active
            let taskUpdates: Record<string, any> = { 
                status: 'Active',
                activatedAt: now.toISOString() 
            };

            // Calculate SLA expiration if defined
            if (stepDef.slaHours) {
                taskUpdates.slaExpiresAt = addHours(now, stepDef.slaHours).toISOString();
            }

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
    
    // Add audit log for task completion
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
    
    // *** DYNAMIC RULE EVALUATION ***
    const dynamicallyAddedSteps = await evaluateAndExecuteRules({
        firestore,
        formData: request.formData,
        request,
        template,
        allUsers,
    });

    if (dynamicallyAddedSteps.length > 0) {
        const newStepsWithTasksPromises = dynamicallyAddedSteps.map(async (step) => {
            if (!updatedSteps.some(s => s.id === step.id)) { // Prevent duplicates
                const newTaskRef = doc(collection(firestore, 'tasks'));
                const newTaskData = {
                    id: newTaskRef.id,
                    requestId: request.id,
                    requestTitle: request.title,
                    requestOwnerId: request.submittedBy,
                    stepId: step.id,
                    name: step.name,
                    status: 'Pending',
                    assigneeId: null,
                    completedAt: null,
                    createdAt: now,
                };
                setDocumentNonBlocking(newTaskRef, newTaskData, {});
                return {
                    id: step.id,
                    name: step.name,
                    status: 'Pending',
                    assigneeId: null,
                    completedAt: null,
                    taskId: newTaskRef.id,
                };
            }
            return null;
        });

        const newStepsWithTasks = (await Promise.all(newStepsWithTasksPromises)).filter(Boolean) as Request['steps'];
        updatedSteps = [...updatedSteps, ...newStepsWithTasks];
    }
    
    // 4. Find the next step(s) in the workflow
    const findNextSteps = (currentStepId: string): WorkflowStepDefinition[] => {
        const currentStepDefinition = template.steps.find(s => s.id === currentStepId);
        const currentStepIndex = template.steps.findIndex(s => s.id === currentStepId);
        if (currentStepIndex === -1) return [];
        
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
        }
        
        if (currentStepDefinition?.type === 'gateway-parallel') {
            const isSplitGateway = template.steps[currentStepIndex + 1] && template.steps[currentStepIndex + 1].type !== 'gateway-parallel';
            if (isSplitGateway) {
                const parallelSteps: WorkflowStepDefinition[] = [];
                let i = currentStepIndex + 1;
                while(i < template.steps.length) {
                    const step = template.steps[i];
                    if (step.type === 'gateway-parallel') break;
                    parallelSteps.push(step);
                    i++;
                }
                return parallelSteps;
            }
        }

        const nextStepInSequence = template.steps[currentStepIndex + 1];
        if (nextStepInSequence) {
            return [nextStepInSequence];
        }

        return [];
    };

    // Helper to check if all branches leading to a join gateway are complete
    const checkJoinCondition = (joinGatewayStepId: string): boolean => {
        const joinIndex = template.steps.findIndex(s => s.id === joinGatewayStepId);
        if (joinIndex <= 0) return true;

        let splitGatewayIndex = -1;
        for (let i = joinIndex - 1; i >= 0; i--) {
            if (template.steps[i].type === 'gateway-parallel') {
                splitGatewayIndex = i;
                break;
            }
        }

        if (splitGatewayIndex !== -1) {
            const parallelBranchSteps = template.steps.slice(splitGatewayIndex + 1, joinIndex);
            const parallelStepIds = new Set(parallelBranchSteps.map(s => s.id));
            
            const completedCount = updatedSteps.filter(s => parallelStepIds.has(s.id) && s.status === 'Completed').length;
            return completedCount === parallelBranchSteps.length;
        }
        
        return true; // Not a join gateway, proceed.
    };

    const nextSteps = findNextSteps(task.stepId);

    if (nextSteps.length > 0) {
        let finalNextSteps = nextSteps;

        if (nextSteps.length === 1 && nextSteps[0].type === 'gateway-parallel') {
             if (!checkJoinCondition(nextSteps[0].id)) {
                // Not all branches are complete, just update the state and wait.
                updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });
                return;
             }
             // All branches complete, find the step after the join gateway.
             const joinGatewayIndex = template.steps.findIndex(s => s.id === nextSteps[0].id);
             const stepAfterJoin = template.steps[joinGatewayIndex + 1];
             finalNextSteps = stepAfterJoin ? [stepAfterJoin] : [];
        }
        
        if (finalNextSteps.length > 0) {
            await activateAndAssignTasks(firestore, finalNextSteps, request, allUsers, updatedSteps, auditLogCollection);
        } else {
            // This is the end of a branch or the entire workflow. Check if all tasks are done.
            const activeOrPendingTasks = updatedSteps.some(s => s.status === 'Active' || s.status === 'Pending');
            if (!activeOrPendingTasks) {
                 updateDocumentNonBlocking(requestRef, { status: 'Completed', completedAt: now });
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
        // No more steps defined, workflow is complete.
        updateDocumentNonBlocking(requestRef, {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps,
        });

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

interface HandleEscalationParams {
    firestore: Firestore;
    task: Task;
    allUsers: User[];
}

export async function handleTaskEscalation({ firestore, task, allUsers }: HandleEscalationParams) {
    console.log(`Handling escalation for overdue task: ${task.id}`);
    
    // Mark task as escalated to prevent re-triggering
    const taskRef = doc(firestore, 'tasks', task.id);
    updateDocumentNonBlocking(taskRef, { isEscalated: true });

    // Fetch the request to get the templateId
    const requestRef = doc(firestore, 'users', task.requestOwnerId, 'requests', task.requestId);
    const requestSnap = await getDoc(requestRef);
    if (!requestSnap.exists()) {
        console.error(`Escalation failed: Request ${task.requestId} not found.`);
        return;
    }
    const requestData = requestSnap.data() as Request;

    // Fetch the template to get the step definition and policy
    const templateRef = doc(firestore, 'request_templates', requestData.templateId);
    const templateSnap = await getDoc(templateRef);
    if (!templateSnap.exists()) {
        console.error(`Escalation failed: Template ${requestData.templateId} not found.`);
        return;
    }
    const templateData = templateSnap.data() as Template;
    const stepDef = templateData.steps.find(s => s.id === task.stepId);
    if (!stepDef?.escalationPolicy) {
        console.log(`No escalation policy for step ${task.name}. Defaulting to notify assignee.`);
    }

    const policy = stepDef?.escalationPolicy;
    const now = new Date().toISOString();
    const auditLogCollection = collection(requestRef, 'audit_logs');
    
    // --- Execute Escalation Action ---
    if (policy?.action === 'REASSIGN' && policy.targetRole) {
        console.log(`Reassigning task ${task.id} to role: ${policy.targetRole}`);
        try {
            const suggestion = await intelligentTaskAssignment({
                taskDescription: `Reasignar tarea vencida: "${task.name}"`,
                assigneeRole: policy.targetRole,
                availableUsers: allUsers.map(u => ({ userId: u.id, fullName: u.fullName, department: u.department, skills: u.skills ?? [], currentWorkload: u.currentWorkload ?? 0, pastPerformance: 5 })),
            });
            
            if (suggestion.suggestedUserId) {
                const newAssignee = allUsers.find(u => u.id === suggestion.suggestedUserId);
                updateDocumentNonBlocking(taskRef, { assigneeId: suggestion.suggestedUserId });

                // Update steps array in request
                const updatedSteps = requestData.steps.map(s => s.id === task.stepId ? { ...s, assigneeId: suggestion.suggestedUserId } : s);
                updateDocumentNonBlocking(requestRef, { steps: updatedSteps });

                addDocumentNonBlocking(auditLogCollection, {
                    requestId: requestData.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'AUDIT_LOG_ENTRY' as any,
                    details: { message: `Tarea "${task.name}" reasignada a ${newAssignee?.fullName} debido a vencimiento de SLA.` }
                });
                
                // Notify new assignee
                const notificationRef = collection(firestore, 'users', suggestion.suggestedUserId, 'notifications');
                addDocumentNonBlocking(notificationRef, {
                    title: 'Tarea Urgente Reasignada', message: `Se te ha reasignado la tarea vencida "${task.name}".`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${requestData.id}`,
                });
            }
        } catch (error) {
            console.error("Reassignment failed:", error);
        }

    } else { // Default action is NOTIFY
        console.log(`Notifying for overdue task: ${task.id}`);
        const targets = policy?.notify || ['assignee'];
        
        for (const target of targets) {
            let userToNotify: User | undefined;
            if (target === 'assignee') {
                userToNotify = allUsers.find(u => u.id === task.assigneeId);
            } else if (target === 'manager') {
                const assignee = allUsers.find(u => u.id === task.assigneeId);
                userToNotify = allUsers.find(u => u.id === assignee?.managerId);
            }
            
            if (userToNotify) {
                const notificationRef = collection(firestore, 'users', userToNotify.id, 'notifications');
                addDocumentNonBlocking(notificationRef, {
                    title: 'Tarea Vencida',
                    message: `La tarea "${task.name}" para la solicitud "${task.requestTitle}" ha superado su SLA.`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${requestData.id}`,
                });
                addDocumentNonBlocking(auditLogCollection, {
                    requestId: requestData.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'AUDIT_LOG_ENTRY' as any,
                    details: { message: `Notificación de SLA vencido enviada a ${userToNotify.fullName}.` }
                });
            }
        }
    }
}
