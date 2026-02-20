
/**
 * Workflow Engine
 * 
 * Handles workflow progression, task assignment, and rule evaluation.
 * 
 * NOTE: This file uses the client-side Firebase SDK for compatibility
 * with the existing architecture. For sensitive operations requiring
 * true server-side execution, Cloud Functions should be used instead.
 */

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
        let conditionMet = false;

        // Only evaluate form-based rules here. Outcome rules are handled during task completion.
        if (rule.condition.type === 'form') {
            const fieldValue = formData[rule.condition.fieldId];
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
                    case 'is':
                        if (fieldValue == ruleValue) conditionMet = true;
                        break;
                    case '!=':
                    case 'is_not':
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
        }

        if (conditionMet) {
            const requestRef = doc(firestore, 'users', request.submittedBy, 'requests', request.id);
            const auditLogCollection = collection(requestRef, 'audit_logs');
            const now = new Date().toISOString();

            const action = rule.action;
            switch (action.type) {
                case 'REQUIRE_ADDITIONAL_STEP':
                    const stepToAdd = template.steps.find(s => s.id === action.stepId);
                    if (stepToAdd) {
                        stepsToAdd.push(stepToAdd);
                    }
                    break;
                case 'CHANGE_REQUEST_PRIORITY':
                    updateDocumentNonBlocking(requestRef, { priority: action.priority });
                    addDocumentNonBlocking(auditLogCollection, {
                        requestId: request.id, userId: 'system', userFullName: 'STUFFACTORY AI', timestamp: now, action: 'REQUEST_SUBMITTED' as any, // This should be a valid action
                        details: { message: `La prioridad de la solicitud cambió a "${action.priority}" por una regla de negocio.` }
                    });
                    break;
                case 'SEND_NOTIFICATION':
                    let targetUsers: User[] = [];
                    if (action.target === 'submitter') {
                        const submitter = allUsers.find(u => u.id === request.submittedBy);
                        if (submitter) targetUsers.push(submitter);
                    } else {
                        targetUsers = allUsers.filter(u => u.role === action.target);
                    }

                    for (const targetUser of targetUsers) {
                        const notificationRef = collection(firestore, 'users', targetUser.id, 'notifications');
                        addDocumentNonBlocking(notificationRef, {
                            title: 'Notificación de Proceso',
                            message: action.message.replace('{{request.title}}', request.title),
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
            status: 'Pending',
            assigneeId: null,
            completedAt: null,
            createdAt: createdAt,
        };
        batch.set(newTaskRef, taskData);
        stepsWithTasks.push({ ...step, taskId: newTaskRef.id });
    }

    await batch.commit();

    return { finalSteps: uniqueSteps, stepsWithTasks };
}

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

            let taskUpdates: Record<string, any> = {
                status: 'Active',
                activatedAt: now.toISOString()
            };

            if (stepDef.slaHours) {
                taskUpdates.slaExpiresAt = addHours(now, stepDef.slaHours).toISOString();
            }

            const stepIndex = updatedSteps.findIndex(s => s.id === stepDef.id);
            if (stepIndex !== -1) {
                updatedSteps[stepIndex].status = 'Active';
            }

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
                            userFullName: 'STUFFACTORY AI',
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
    const auditLogCollection = collection(requestRef, 'audit_logs');

    let updatedSteps = request.steps.map(s =>
        s.id === task.stepId ? { ...s, status: 'Completed' as const, completedAt: now, outcome: outcome || null } : s
    );

    updateDocumentNonBlocking(taskRef, { status: 'Completed', completedAt: now });
    addDocumentNonBlocking(auditLogCollection, {
        requestId: request.id,
        userId: currentUser.id,
        userFullName: currentUser.fullName,
        userAvatarUrl: currentUser.avatarUrl,
        timestamp: now,
        action: 'STEP_COMPLETED',
        details: { stepName: task.name, outcome: outcome || 'Completado' }
    });

    if (outcome === 'Rechazado') {
        updateDocumentNonBlocking(requestRef, {
            status: 'Rejected',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps,
        });
        const notificationRef = collection(firestore, 'users', request.submittedBy, 'notifications');
        addDocumentNonBlocking(notificationRef, {
            title: 'Solicitud Rechazada',
            message: `Tu solicitud "${request.title}" ha sido rechazada.`,
            type: 'warning',
            read: false,
            createdAt: now,
            link: `/requests/${request.id}`,
        });
        return;
    }

    // Find the next step(s) in the workflow
    const findNextSteps = (currentStepId: string): WorkflowStepDefinition[] => {
        const currentStepDefinition = template.steps.find(s => s.id === currentStepId);
        const currentStepIndex = template.steps.findIndex(s => s.id === currentStepId);
        if (currentStepIndex === -1) return [];

        let possibleNextSteps: WorkflowStepDefinition[] = [];

        // Rule-based routing for decision tasks
        if (currentStepDefinition?.outcomes && currentStepDefinition.outcomes.length > 0) {
            const rule = template.rules.find(r =>
                r.condition.type === 'outcome' &&
                r.condition.fieldId === currentStepId &&
                r.condition.value === outcome
            );
            if (rule && rule.action.type === 'ROUTE_TO_STEP') {
                const nextStep = template.steps.find(s => s.id === (rule.action as any).stepId);
                if (nextStep) possibleNextSteps = [nextStep];
            }
        }

        // Default sequential logic if no outcome routing matched
        if (possibleNextSteps.length === 0) {
            const nextStepInSequence = template.steps[currentStepIndex + 1];
            if (nextStepInSequence) {
                possibleNextSteps = [nextStepInSequence];
            }
        }

        // --- JOIN GATEWAY SYNCHRONIZATION LOGIC ---
        // If any of the possible next steps is a Join Gateway (e.g. parallel-join),
        // we must check if ALL incoming paths to that step are also 'Completed'.
        // If not, we withhold returning that step so it doesn't activate yet.
        return possibleNextSteps.filter(nextStep => {
            // Check if step is a join type or explicitly requires synchronization
            if (nextStep.type === 'gateway-parallel-join' || nextStep.type === 'gateway-inclusive-join') {
                // Find all steps that route to this Join step
                const incomingStepsIds = template.rules
                    .filter(r => r.action.type === 'ROUTE_TO_STEP' && (r.action as any).stepId === nextStep.id)
                    .map(r => r.condition.fieldId);

                // Also check implicit sequential incoming steps (the step immediately before it in the array)
                const nextStepIndex = template.steps.findIndex(s => s.id === nextStep.id);
                if (nextStepIndex > 0) {
                    incomingStepsIds.push(template.steps[nextStepIndex - 1].id);
                }

                const uniqueIncomingIds = Array.from(new Set(incomingStepsIds));

                // Verify if all these incoming steps in the current request are 'Completed'
                const allPrerequisitesMet = uniqueIncomingIds.every(incomingId => {
                    // Current task doesn't reflect as 'Completed' in the request.steps array yet in memory during this loop
                    if (incomingId === task.stepId) return true;

                    const stepInReq = updatedSteps.find(s => s.id === incomingId);
                    // If the step exists in the request but is not completed, we are missing a branch
                    if (stepInReq && stepInReq.status !== 'Completed') return false;
                    return true;
                });

                if (!allPrerequisitesMet) {
                    console.log(`[Workflow Engine] Join gateway ${nextStep.id} paused. Waiting for other parallel branches to complete.`);
                    return false; // Exclude this step from activation
                }
            }
            return true; // Keep step
        });
    };

    const nextSteps = findNextSteps(task.stepId);

    if (nextSteps.length > 0) {
        await activateAndAssignTasks(firestore, nextSteps, request, allUsers, updatedSteps, auditLogCollection);
        updateDocumentNonBlocking(requestRef, { steps: updatedSteps, updatedAt: now });

    } else {
        // No more steps defined, workflow is complete
        updateDocumentNonBlocking(requestRef, {
            status: 'Completed',
            completedAt: now,
            updatedAt: now,
            steps: updatedSteps,
        });
        const notificationRef = collection(firestore, 'users', request.submittedBy, 'notifications');
        addDocumentNonBlocking(notificationRef, {
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
    currentUser: User;
    allUsers: User[];
}

export async function handleTaskEscalation({ firestore, task, currentUser, allUsers }: HandleEscalationParams) {
    console.log(`Handling escalation for overdue task: ${task.id}`);

    const taskRef = doc(firestore, 'tasks', task.id);
    const requestRef = doc(firestore, 'users', task.requestOwnerId, 'requests', task.requestId);

    let requestData: Request | null = null;
    let templateData: Template | null = null;

    try {
        await runTransaction(firestore, async (transaction) => {
            const taskSnap = await transaction.get(taskRef);
            if (!taskSnap.exists() || taskSnap.data()?.isEscalated) {
                throw new Error(`Task ${task.id} already escalated or does not exist`);
            }

            const requestSnap = await transaction.get(requestRef);
            if (!requestSnap.exists()) throw new Error(`Request ${task.requestId} not found`);
            requestData = requestSnap.data() as Request;

            const templateRef = doc(firestore, 'request_templates', requestData.templateId);
            const templateSnap = await transaction.get(templateRef);
            if (!templateSnap.exists()) throw new Error(`Template ${requestData.templateId} not found`);
            templateData = templateSnap.data() as Template;

            transaction.update(taskRef, { isEscalated: true });
        });
    } catch (error) {
        console.error(`Escalation pre-check failed:`, error);
        return;
    }

    if (!requestData || !templateData) return;
    const reqData = requestData as Request;
    const tmplData = templateData as Template;

    const stepDef = tmplData.steps.find(s => s.id === task.stepId);
    const policy = stepDef?.escalationPolicy;
    const now = new Date().toISOString();
    const auditLogCollection = collection(requestRef, 'audit_logs');

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
                const updatedSteps = reqData.steps.map(s => s.id === task.stepId ? { ...s, assigneeId: suggestion.suggestedUserId } : s);

                const batch = writeBatch(firestore);
                batch.update(taskRef, { assigneeId: suggestion.suggestedUserId });
                batch.update(requestRef, { steps: updatedSteps });

                const auditLogRef = doc(auditLogCollection);
                batch.set(auditLogRef, {
                    requestId: reqData.id, userId: 'system', userFullName: 'STUFFACTORY AI', timestamp: now, action: 'STEP_ASSIGNEE_CHANGED',
                    details: { message: `Tarea "${task.name}" reasignada a ${newAssignee?.fullName} debido a vencimiento de SLA.` }
                });

                const notificationRef = doc(collection(firestore, 'users', suggestion.suggestedUserId, 'notifications'));
                batch.set(notificationRef, {
                    title: 'Tarea Urgente Reasignada', message: `Se te ha reasignado la tarea vencida "${task.name}".`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${reqData.id}`,
                });

                await batch.commit();
            }
        } catch (error) {
            console.error("Reassignment failed:", error);
        }
    } else { // Default action is NOTIFY
        console.log(`Notifying for overdue task: ${task.id}`);
        const targets = policy?.notify || ['assignee'];
        const batch = writeBatch(firestore);

        for (const target of targets) {
            let userToNotify: User | undefined;
            if (target === 'assignee') userToNotify = allUsers.find(u => u.id === task.assigneeId);
            else if (target === 'manager') {
                const assignee = allUsers.find(u => u.id === task.assigneeId);
                userToNotify = allUsers.find(u => u.id === assignee?.managerId);
            }

            if (userToNotify) {
                const notificationRef = doc(collection(firestore, 'users', userToNotify.id, 'notifications'));
                batch.set(notificationRef, {
                    title: 'Tarea Vencida',
                    message: `La tarea "${task.name}" para la solicitud "${task.requestTitle}" ha superado su SLA.`,
                    type: 'warning', read: false, createdAt: now, link: `/requests/${reqData.id}`,
                });
            }
        }
        await batch.commit();
    }
}
