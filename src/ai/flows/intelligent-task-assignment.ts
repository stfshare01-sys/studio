'use server';

/**
 * @fileOverview This file defines a Genkit flow for intelligent task assignment.
 *
 * - intelligentTaskAssignment - A function that suggests the best user to assign a task to.
 * - IntelligentTaskAssignmentInput - The input type for the intelligentTaskAssignment function.
 * - IntelligentTaskAssignmentOutput - The return type for the intelligentTaskAssignment function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const IntelligentTaskAssignmentInputSchema = z.object({
  taskDescription: z.string().describe('The description of the task to be assigned.'),
  assigneeRole: z.string().optional().describe('The business role or department that should handle the task (e.g., "Finance", "Legal").'),
  availableUsers: z.array(
    z.object({
      userId: z.string().describe('The unique identifier of the user.'),
      fullName: z.string().describe("The user's full name."),
      department: z.string().describe("The user's department."),
      skills: z.array(z.string()).describe('The skills of the user.'),
      currentWorkload: z
        .number()
        .describe('The current workload of the user (e.g., number of tasks).'),
      pastPerformance: z
        .number()
        .describe('The past performance of the user (e.g., average task completion time).'),
    })
  ).describe('The list of available users to assign the task to.'),
});
export type IntelligentTaskAssignmentInput = z.infer<
  typeof IntelligentTaskAssignmentInputSchema
>;

const IntelligentTaskAssignmentOutputSchema = z.object({
  suggestedUserId: z.string().describe('The user ID of the suggested user to assign the task to.'),
  reason: z.string().describe('The reason for suggesting this user.'),
});
export type IntelligentTaskAssignmentOutput = z.infer<
  typeof IntelligentTaskAssignmentOutputSchema
>;

export async function intelligentTaskAssignment(
  input: IntelligentTaskAssignmentInput
): Promise<IntelligentTaskAssignmentOutput> {
  return intelligentTaskAssignmentFlow(input);
}

const prompt = ai.definePrompt({
  name: 'intelligentTaskAssignmentPrompt',
  input: {schema: IntelligentTaskAssignmentInputSchema},
  output: {schema: IntelligentTaskAssignmentOutputSchema},
  prompt: `You are an expert AI assistant for a workflow management system. Your primary function is to suggest the best user to assign a specific task to, based on a combination of factors.

  Analyze the following task:
  - Description: "{{taskDescription}}"
  - Required Role/Department: "{{assigneeRole}}"

  Here is the list of available users:
  {{#each availableUsers}}
  - User: {{fullName}} (ID: {{userId}})
    - Department: {{department}}
    - Skills: {{#if skills}}{{#each skills}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}{{else}}No skills listed{{/if}}
    - Current Workload: {{currentWorkload}} tasks
  {{/each}}

  Your decision process must follow these steps in order:
  1.  **Role/Department Matching (Primary Filter)**: First, identify users whose department or skills strongly match the "Required Role/Department". If the role is "Finance", users in the "Finance" department are the strongest candidates.
  2.  **Skill Matching**: From the filtered list, consider which user's skills are most relevant to the task description.
  3.  **Workload Balancing**: Among the best-matched users, give preference to the one with the lowest "Current Workload". Avoid assigning tasks to already overloaded users if a suitable alternative exists.

  Based on this analysis, select the single best user for the task.
  
  Your output must be a valid JSON object conforming to the output schema. In your 'reason', clearly and concisely explain *why* you chose that user, referencing the role, skills, and workload. For example: "Suggesting Jane Doe because she is in the Finance department, has 'Análisis Financiero' as a skill, and has a lower workload than other qualified candidates."`,
});

const intelligentTaskAssignmentFlow = ai.defineFlow(
  {
    name: 'intelligentTaskAssignmentFlow',
    inputSchema: IntelligentTaskAssignmentInputSchema,
    outputSchema: IntelligentTaskAssignmentOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
