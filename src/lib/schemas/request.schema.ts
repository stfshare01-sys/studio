import { z } from 'zod';

/**
 * Request Schema - Validation for workflow request submissions
 */

// Dynamic form field value schema
export const formFieldValueSchema = z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.date(),
    z.array(z.string()),
    z.null(),
]);

// Request submission schema
export const submitRequestSchema = z.object({
    templateId: z.string().min(1, 'El template es requerido'),
    formData: z.record(z.string(), formFieldValueSchema),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    notes: z.string().max(1000, 'Las notas no pueden exceder 1000 caracteres').optional(),
});

// Task completion schema
export const completeTaskSchema = z.object({
    taskId: z.string().min(1, 'El ID de tarea es requerido'),
    outcome: z.string().optional(),
    formData: z.record(z.string(), formFieldValueSchema).optional(),
    comments: z.string().max(2000, 'Los comentarios no pueden exceder 2000 caracteres').optional(),
});

// Comment schema
export const addCommentSchema = z.object({
    requestId: z.string().min(1, 'El ID de solicitud es requerido'),
    content: z.string()
        .min(1, 'El comentario no puede estar vacío')
        .max(2000, 'El comentario no puede exceder 2000 caracteres'),
    isInternal: z.boolean().optional().default(false),
});

// Type exports
export type FormFieldValue = z.infer<typeof formFieldValueSchema>;
export type SubmitRequestData = z.infer<typeof submitRequestSchema>;
export type CompleteTaskData = z.infer<typeof completeTaskSchema>;
export type AddCommentData = z.infer<typeof addCommentSchema>;
