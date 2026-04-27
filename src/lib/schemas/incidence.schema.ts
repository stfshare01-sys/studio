import { z } from 'zod';

/**
 * Incidence Schema - Validation for leave/absence requests
 */

export const incidenceTypeSchema = z.enum([
    'vacation',
    'sick_leave',
    'personal_leave',
    'maternity',
    'paternity',
    'bereavement',
    'marriage',
    'adoption',
    'unpaid_leave',
    'civic_duty',
    'half_day_family',
    'unjustified_absence',
    'abandono_empleo',
    'home_office'
], {
    errorMap: () => ({ message: 'Selecciona un tipo de incidencia válido' })
});

// Base incidence request schema
export const createIncidenceSchema = z.object({
    type: incidenceTypeSchema,
    startDate: z.date({ required_error: 'La fecha de inicio es requerida' }),
    endDate: z.date({ required_error: 'La fecha de fin es requerida' }),
    notes: z.string().max(500, 'Las notas no pueden exceder 500 caracteres').optional(),
    imssReference: z.string().max(50, 'La referencia IMSS no puede exceder 50 caracteres').optional(),
}).refine(
    (data) => data.endDate >= data.startDate,
    {
        message: 'La fecha de fin debe ser igual o posterior a la fecha de inicio',
        path: ['endDate'],
    }
);

// Approval/rejection schema (for HR managers)
export const processIncidenceSchema = z.object({
    status: z.enum(['approved', 'rejected'], {
        errorMap: () => ({ message: 'Debe aprobar o rechazar la solicitud' })
    }),
    rejectionReason: z.string().max(500).optional(),
}).refine(
    (data) => data.status !== 'rejected' || (data.rejectionReason && data.rejectionReason.length > 0),
    {
        message: 'Debe proporcionar una razón para el rechazo',
        path: ['rejectionReason'],
    }
);

// Type exports
export type IncidenceType = z.infer<typeof incidenceTypeSchema>;
export type CreateIncidenceData = z.infer<typeof createIncidenceSchema>;
export type ProcessIncidenceData = z.infer<typeof processIncidenceSchema>;
