

'use server';

import { Firestore, doc, collection, getDoc, runTransaction, writeBatch } from 'firebase/firestore';
import type { Task, Request, Template, User, WorkflowStepDefinition, Rule } from './types';
import { addDocumentNonBlocking, updateDocumentNonBlocking, setDocumentNonBlocking } from '@/firebase/non-blocking-updates';
import { intelligentTaskAssignment } from '@/ai/flows/intelligent-task-assignment';
import { addHours, isPast } from 'date-fns';

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
                        requestId: request.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'REQUEST_SUBMITTED' as any, // This should be a valid action
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
    
    // Create task documents atomically using writeBatch
    const batch = writeBatch(firestore);
    const stepsWithTasks: (WorkflowStepDefinition & { taskId: string })[] = [];

    for (const step of uniqueSteps) {
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
        batch.set(newTaskRef, taskData);
        stepsWithTasks.push({ ...step, taskId: newTaskRef.id });
    }

    // Commit all task creations atomically
    await batch.commit();

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
    const taskRef = doc(firestore, 'tasks', task.id);

    // 1. Update the corresponding step in the request document
    let updatedSteps = request.steps.map(s =>
        s.id === task.stepId ? { ...s, status: 'Completed', completedAt: now, outcome: outcome || null } : s
    );

    // 2. Execute core task completion atomically in a transaction
    await runTransaction(firestore, async (transaction) => {
        // Read phase - verify task hasn't changed
        const taskSnap = await transaction.get(taskRef);
        if (!taskSnap.exists() || taskSnap.data()?.status === 'Completed') {
            throw new Error('Task already completed or does not exist');
        }

        // Write phase - all writes must happen after reads
        // Update task status
        transaction.update(taskRef, { status: 'Completed', completedAt: now });

        // Create audit log
        const auditLogRef = doc(collection(requestRef, 'audit_logs'));
        transaction.set(auditLogRef, {
            requestId: request.id,
            userId: currentUser.id,
            userFullName: currentUser.fullName,
            userAvatarUrl: currentUser.avatarUrl,
            timestamp: now,
            action: 'STEP_COMPLETED',
            details: { stepName: task.name, outcome: outcome || 'Completado' }
        });

        // Handle rejection flow
        if (outcome === 'Rechazado') {
            transaction.update(requestRef, {
                status: 'Rejected',
                completedAt: now,
                updatedAt: now,
                steps: updatedSteps,
            });
            // Notification for rejection
            const notificationRef = doc(collection(firestore, 'users', request.submittedBy, 'notifications'));
            transaction.set(notificationRef, {
                title: 'Solicitud Rechazada',
                message: `Tu solicitud "${request.title}" ha sido rechazada.`,
                type: 'warning',
                read: false,
                createdAt: now,
                link: `/requests/${request.id}`,
            });
        }
    });

    // If rejected, stop workflow progression here
    if (outcome === 'Rechazado') {
        return;
    }

    const auditLogCollection = collection(requestRef, 'audit_logs');
    
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
                const waitBatch = writeBatch(firestore);
                waitBatch.update(requestRef, { steps: updatedSteps, updatedAt: now });
                await waitBatch.commit();
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
                // Complete workflow atomically with batch
                const completeBatch = writeBatch(firestore);
                completeBatch.update(requestRef, { status: 'Completed', completedAt: now, steps: updatedSteps, updatedAt: now });
                const notificationRef = doc(collection(firestore, 'users', request.submittedBy, 'notifications'));
                completeBatch.set(notificationRef, {
                    title: 'Solicitud Completada',
                    message: `Tu solicitud "${request.title}" ha sido completada.`,
                    type: 'success',
                    read: false,
                    createdAt: now,
                    link: `/requests/${request.id}`,
                });
                await completeBatch.commit();
                return;
            }
        }

        // Update request steps
        const updateBatch = writeBatch(firestore);
        updateBatch.update(requestRef, { steps: updatedSteps, updatedAt: now });
        await updateBatch.commit();

    } else {
        // No more steps defined, workflow is complete - use batch for atomicity
        const completeBatch = writeBatch(firestore);
        completeBatch.update(requestRef, {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps,
        });
        const notificationRef = doc(collection(firestore, 'users', request.submittedBy, 'notifications'));
        completeBatch.set(notificationRef, {
            title: 'Solicitud Completada',
            message: `Tu solicitud "${request.title}" ha sido completada.`,
            type: 'success',
            read: false,
            createdAt: now,
            link: `/requests/${request.id}`,
        });
        await completeBatch.commit();
    }
}

interface HandleEscalationParams {
    firestore: Firestore;
    task: Task;
    currentUser: User;
    allUsers: User[];
}

export async function handleTaskEscalation({ firestore, task, currentUser, allUsers }: HandleEscalationParams) {
    console.log(`Handling escalation for overdue task: ${task.id}`);

    const taskRef = doc(firestore, 'tasks', task.id);
    const requestRef = doc(firestore, 'users', task.requestOwnerId, 'requests', task.requestId);

    // Use transaction to atomically check and mark task as escalated (prevents race conditions)
    let requestData: Request | null = null;
    let templateData: Template | null = null;

    try {
        await runTransaction(firestore, async (transaction) => {
            // Read phase
            const taskSnap = await transaction.get(taskRef);
            if (!taskSnap.exists()) {
                throw new Error(`Task ${task.id} not found`);
            }
            if (taskSnap.data()?.isEscalated) {
                throw new Error(`Task ${task.id} already escalated`);
            }

            const requestSnap = await transaction.get(requestRef);
            if (!requestSnap.exists()) {
                throw new Error(`Request ${task.requestId} not found`);
            }
            requestData = requestSnap.data() as Request;

            const templateRef = doc(firestore, 'request_templates', requestData.templateId);
            const templateSnap = await transaction.get(templateRef);
            if (!templateSnap.exists()) {
                throw new Error(`Template ${requestData.templateId} not found`);
            }
            templateData = templateSnap.data() as Template;

            // Write phase - mark task as escalated
            transaction.update(taskRef, { isEscalated: true });
        });
    } catch (error) {
        console.error(`Escalation failed:`, error);
        return;
    }

    if (!requestData || !templateData) {
        return;
    }
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

                // Use batch for atomic reassignment
                const reassignBatch = writeBatch(firestore);

                // Update task assignee
                reassignBatch.update(taskRef, { assigneeId: suggestion.suggestedUserId });

                // Update steps array in request
                const updatedSteps = requestData.steps.map(s => s.id === task.stepId ? { ...s, assigneeId: suggestion.suggestedUserId } : s);
                reassignBatch.update(requestRef, { steps: updatedSteps });

                // Add audit log
                const auditLogRef = doc(auditLogCollection);
                reassignBatch.set(auditLogRef, {
                    requestId: requestData.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'STEP_ASSIGNEE_CHANGED',
                    details: { message: `Tarea "${task.name}" reasignada a ${newAssignee?.fullName} debido a vencimiento de SLA.` }
                });

                // Notify new assignee
                const notificationRef = doc(collection(firestore, 'users', suggestion.suggestedUserId, 'notifications'));
                reassignBatch.set(notificationRef, {
                    title: 'Tarea Urgente Reasignada', message: `Se te ha reasignado la tarea vencida "${task.name}".`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${requestData.id}`,
                });

                await reassignBatch.commit();
            }
        } catch (error) {
            console.error("Reassignment failed:", error);
        }

    } else { // Default action is NOTIFY
        console.log(`Notifying for overdue task: ${task.id}`);
        const targets = policy?.notify || ['assignee'];

        // Use batch to send all notifications atomically
        const notifyBatch = writeBatch(firestore);
        let hasNotifications = false;

        for (const target of targets) {
            let userToNotify: User | undefined;
            if (target === 'assignee') {
                userToNotify = allUsers.find(u => u.id === task.assigneeId);
            } else if (target === 'manager') {
                const assignee = allUsers.find(u => u.id === task.assigneeId);
                userToNotify = allUsers.find(u => u.id === assignee?.managerId);
            }

            if (userToNotify) {
                hasNotifications = true;
                const notificationRef = doc(collection(firestore, 'users', userToNotify.id, 'notifications'));
                notifyBatch.set(notificationRef, {
                    title: 'Tarea Vencida',
                    message: `La tarea "${task.name}" para la solicitud "${task.requestTitle}" ha superado su SLA.`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${requestData.id}`,
                });
                const auditLogRef = doc(auditLogCollection);
                notifyBatch.set(auditLogRef, {
                    requestId: requestData.id, userId: 'system', userFullName: 'FlowMaster AI', timestamp: now, action: 'STEP_ASSIGNEE_CHANGED',
                    details: { message: `Notificación de SLA vencido enviada a ${userToNotify.fullName}.` }
                });
            }
        }

        if (hasNotifications) {
            await notifyBatch.commit();
        }
    }
}
