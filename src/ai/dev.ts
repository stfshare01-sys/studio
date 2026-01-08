'use server';
import { config } from 'dotenv';
config();

import '@/ai/flows/intelligent-task-assignment.ts';
import '@/ai/flows/process-simulation.ts';
import '@/ai/flows/process-generation.ts';
