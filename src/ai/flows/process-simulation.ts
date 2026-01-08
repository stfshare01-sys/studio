'use server';

/**
 * @fileOverview This file defines a Genkit flow for "what-if" process simulation.
 *
 * - processSimulation - A function that predicts the impact of a proposed change to a workflow.
 * - ProcessSimulationInput - The input type for the processSimulation function.
 * - ProcessSimulationOutput - The return type for the processSimulation function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ProcessSimulationInputSchema = z.object({
  template: z.object({
    name: z.string(),
    description: z.string(),
    steps: z.array(z.object({ name: z.string() })),
    rules: z.array(z.object({
        condition: z.string(),
        action: z.string(),
    })),
  }).describe('The business process template to be analyzed.'),
  proposedChange: z.string().describe('The proposed change to the process, described in natural language. For example, "Add a legal review step" or "Automate the data entry step".'),
  historicalData: z.object({
    avgCycleTimeHours: z.number().describe('The current average cycle time for the entire process in hours.'),
    avgStepCompletionTime: z.record(z.string(), z.number()).describe('A map of step names to their average completion time in hours.'),
  }).describe('Historical performance data for the current process.'),
});
export type ProcessSimulationInput = z.infer<typeof ProcessSimulationInputSchema>;

const ProcessSimulationOutputSchema = z.object({
  predictedImpact: z.object({
    cycleTimeChange: z.string().describe('Predicted change in cycle time (e.g., "+8 hours", "-10%").'),
    costImpact: z.string().describe('Predicted impact on operational costs (e.g., "Minimal increase", "Significant savings").'),
    bottleneckAnalysis: z.string().describe('Analysis of how the change might create or resolve bottlenecks.'),
  }),
  recommendations: z.string().describe('Actionable recommendations or alternative suggestions to consider.'),
  confidenceScore: z.number().min(0).max(1).describe('The AI\'s confidence in its prediction, from 0.0 to 1.0.'),
});
export type ProcessSimulationOutput = z.infer<typeof ProcessSimulationOutputSchema>;


export async function processSimulation(input: ProcessSimulationInput): Promise<ProcessSimulationOutput> {
  return processSimulationFlow(input);
}


const prompt = ai.definePrompt({
  name: 'processSimulationPrompt',
  input: { schema: ProcessSimulationInputSchema },
  output: { schema: ProcessSimulationOutputSchema },
  prompt: `You are a world-class business process optimization consultant.
  Your task is to perform a "what-if" analysis on a business process based on a proposed change.

  Analyze the following process template:
  - Name: {{{template.name}}}
  - Description: {{{template.description}}}
  - Steps: {{#each template.steps}}{{name}}{{#unless @last}}, {{/unless}}{{/each}}
  - Rules: {{#each template.rules}}IF {{condition}} THEN {{action}}; {{/each}}

  Current historical performance:
  - Average Cycle Time: {{{historicalData.avgCycleTimeHours}}} hours.
  - Average time per step:
    {{#each historicalData.avgStepCompletionTime}}
    - {{@key}}: {{this}} hours
    {{/each}}

  The user proposes the following change:
  "{{{proposedChange}}}"

  Based on this information, predict the impact of the change. Be realistic and consider how adding steps, reassigning resources, or automation could affect the overall flow.
  Provide a concise but insightful analysis, including predicted cycle time changes, cost impacts, and potential new bottlenecks.
  Offer recommendations and a confidence score for your prediction. Structure your response according to the output schema.`,
});

const processSimulationFlow = ai.defineFlow(
  {
    name: 'processSimulationFlow',
    inputSchema: ProcessSimulationInputSchema,
    outputSchema: ProcessSimulationOutputSchema,
  },
  async input => {
    const { output } = await prompt(input);
    return output!;
  }
);
