'use server';

/**
 * @fileOverview This file defines a Genkit flow for generating a business process draft from a natural language description.
 *
 * - generateProcessFromDescription - A function that creates a process structure.
 * - GenerateProcessInput - The input type for the function.
 * - GenerateProcessOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const GenerateProcessInputSchema = z.string().describe('A natural language description of a business process.');
export type GenerateProcessInput = z.infer<typeof GenerateProcessInputSchema>;


export const GenerateProcessOutputSchema = z.object({
  name: z.string().describe('A short, descriptive name for the process template.'),
  description: z.string().describe('A brief description of what this process is for.'),
  fields: z.array(
    z.object({
      id: z.string().describe('A unique identifier for the field (e.g., "field-amount").'),
      label: z.string().describe('A user-friendly label for the form field (e.g., "Invoice Amount").'),
      type: z.enum(['text', 'textarea', 'date', 'number']).describe('The data type of the form field.'),
    })
  ).describe('The form fields required to initiate the process.'),
  pools: z.array(
      z.object({
          id: z.string(),
          name: z.string().describe('Name of the department or main participant (e.g., "Finance Department").'),
          lanes: z.array(z.object({
              id: z.string(),
              name: z.string().describe('Name of the specific role or actor within the pool (e.g., "Accounts Payable").'),
              steps: z.array(z.object({
                  id: z.string(),
                  name: z.string().describe('The name of the workflow step (e.g., "Review Invoice").'),
                  type: z.enum(['task', 'gateway-exclusive', 'gateway-parallel']).describe('The BPMN type of the step.'),
              }))
          }))
      })
  ).describe('The BPMN pools and lanes structure.'),
  rules: z.array(
    z.object({
        condition: z.object({
            fieldId: z.string().describe('The ID of the field from the "fields" array to check.'),
            operator: z.enum(['>', '<', '==', '!=', '>=', '<=']).describe('The comparison operator.'),
            value: z.string().describe('The value to compare against.'),
        }),
        action: z.object({
            type: z.literal('REQUIRE_ADDITIONAL_STEP').describe('The type of action to perform.'),
            stepId: z.string().describe('The ID of the step to be added if the condition is met.'),
        })
    })
  ).describe('The business logic rules that define conditional paths in the workflow.')
});

export type GenerateProcessOutput = z.infer<typeof GenerateProcessOutputSchema>;

export async function generateProcessFromDescription(input: GenerateProcessInput): Promise<GenerateProcessOutput> {
    return generateProcessFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateProcessPrompt',
  input: { schema: GenerateProcessInputSchema },
  output: { schema: GenerateProcessOutputSchema },
  prompt: `You are an expert BPMN process analyst. Your task is to interpret a user's natural language description of a process and convert it into a structured JSON object that represents a complete process template.

User's process description:
"{{{input}}}"

Based on the description, perform the following actions:
1.  **Infer a Template Name and Description**: Create a concise name and a short description for the process.
2.  **Identify Form Fields**: Determine the necessary data inputs to start the process. For each input, define a field with an ID, a label, and a type (text, textarea, date, number). For example, "invoice amount" should become a 'number' field.
3.  **Structure Pools and Lanes**: Identify the different departments, roles, or actors involved. Group them into "Pools" (e.g., "Sales Dept") and "Lanes" (e.g., "Sales Rep", "Sales Manager").
4.  **Define Workflow Steps**: Extract all sequential or conditional activities. Assign each step an ID, a name, and a BPMN type ('task' for a standard activity, 'gateway-exclusive' for a decision point). Place each step within the correct lane.
5.  **Derive Business Rules**: If the description contains conditional logic (e.g., "if the amount is over $5,000"), create a rule. A rule must have a 'condition' (referencing a fieldId, an operator, and a value) and an 'action' (which, for now, is always to require an additional step, referencing a stepId). Ensure the steps mentioned in rules are also defined in the pools/lanes structure.

Generate unique, descriptive IDs for all fields, pools, lanes, and steps (e.g., 'field-amount', 'pool-finance', 'lane-manager', 'step-approval').

Produce a single, valid JSON object that strictly conforms to the output schema.`,
});


const generateProcessFlow = ai.defineFlow(
  {
    name: 'generateProcessFlow',
    inputSchema: GenerateProcessInputSchema,
    outputSchema: GenerateProcessOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
