
'use server';

import { Firestore, doc, collection } from 'firebase/firestore';
import type { Task, Request, Template, User } from './types';
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

/**
 * Completes a task and progresses the workflow to the next step.
 * This function handles:
 * 1. Updating the completed task's status.
 * 2. Updating the corresponding step in the parent request.
 * 3. Logging the completion in the audit trail.
 * 4. Finding and activating the next task in the sequence.
 * 5. Intelligently assigning the new active task.
 * 6. Sending a notification to the newly assigned user.
 */
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
    const updatedSteps = request.steps.map(s =>
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

    // 4. Find the next step
    const currentStepIndex = template.steps.findIndex(s => s.id === task.stepId);
    const nextStepDefinition = template.steps[currentStepIndex + 1];

    if (nextStepDefinition) {
        // Find the corresponding step and task in the live request
        const nextStepInRequest = request.steps.find(s => s.id === nextStepDefinition.id);
        if (nextStepInRequest && nextStepInRequest.taskId) {
            const nextTaskRef = doc(firestore, 'tasks', nextStepInRequest.taskId);

            // 5. Activate the next task
            updateDocumentNonBlocking(nextTaskRef, { status: 'Active' });

            // 6. Intelligently assign the new active task
            try {
                const suggestion = await intelligentTaskAssignment({
                    taskDescription: `Asignar la tarea: "${nextStepDefinition.name}" para la solicitud "${request.title}"`,
                    assigneeRole: nextStepDefinition.assigneeRole || '',
                    availableUsers: allUsers.map(u => ({
                        userId: u.id,
                        fullName: u.fullName,
                        department: u.department,
                        skills: u.skills ?? [],
                        currentWorkload: u.currentWorkload ?? 0,
                        pastPerformance: 5, // Mocked
                    })),
                });

                if (suggestion.suggestedUserId) {
                    const assignee = allUsers.find(u => u.id === suggestion.suggestedUserId);
                    
                    // Update task with assignee
                    updateDocumentNonBlocking(nextTaskRef, { assigneeId: suggestion.suggestedUserId });
                    
                    // Update step in request with assignee
                    const stepsWithNewAssignee = updatedSteps.map(s =>
                        s.id === nextStepDefinition.id ? { ...s, status: 'Active', assigneeId: suggestion.suggestedUserId } : s
                    );
                    updateDocumentNonBlocking(requestRef, { steps: stepsWithNewAssignee, updatedAt: new Date().toISOString() });

                    // Add audit log for assignment
                    addDocumentNonBlocking(auditLogCollection, {
                        requestId: request.id,
                        userId: 'system',
                        userFullName: 'FlowMaster AI',
                        timestamp: new Date().toISOString(),
                        action: 'STEP_ASSIGNEE_CHANGED',
                        details: {
                            stepName: nextStepDefinition.name,
                            assigneeName: assignee?.fullName || 'Desconocido',
                            reason: suggestion.reason,
                        }
                    });

                    // 7. Send notification to the new assignee
                    const notificationRef = collection(firestore, 'users', suggestion.suggestedUserId, 'notifications');
                    addDocumentNonBlocking(notificationRef, {
                        title: 'Nueva Tarea Asignada',
                        message: `Se te ha asignado la tarea "${nextStepDefinition.name}" para la solicitud "${request.title}".`,
                        type: 'task',
                        read: false,
                        createdAt: new Date().toISOString(),
                        link: `/requests/${request.id}`,
                    });
                }
            } catch (error) {
                console.error("Error during automatic task assignment and notification:", error);
            }
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
