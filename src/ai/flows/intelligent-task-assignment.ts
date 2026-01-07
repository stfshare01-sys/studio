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
  availableUsers: z.array(
    z.object({
      userId: z.string().describe('The unique identifier of the user.'),
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
  prompt: `You are an AI assistant tasked with suggesting the best user to assign a task to.

  Consider the following task description:
  {{taskDescription}}

  And the following available users:
  {{#each availableUsers}}
  User ID: {{userId}}
  Skills: {{#each skills}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
  Current Workload: {{currentWorkload}}
  Past Performance: {{pastPerformance}}
  {{/each}}

  Based on their skills, workload and past performance, select the best user to assign the task to.
  Explain the reason for your suggestion.
  Return the user ID of the suggested user and the reason for your suggestion in the format specified by the output schema.`,
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
