import { z } from 'zod';

/**
 * Employee Schema - Validation for employee forms
 * Extracted from /hcm/employees/new/page.tsx for reuse
 */

// Base personal info schema
export const employeePersonalInfoSchema = z.object({
    fullName: z.string()
        .min(2, 'El nombre debe tener al menos 2 caracteres')
        .max(100, 'El nombre no puede exceder 100 caracteres'),
    email: z.string()
        .email('Correo electrónico inválido')
        .max(255, 'El correo no puede exceder 255 caracteres'),
});

// Department and position schema
export const employeePositionSchema = z.object({
    department: z.string().min(1, 'El departamento es requerido'),
    positionTitle: z.string().min(1, 'El puesto es requerido'),
    employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern'], {
        errorMap: () => ({ message: 'Selecciona un tipo de contrato válido' })
    }),
    shiftType: z.enum(['diurnal', 'nocturnal', 'mixed'], {
        errorMap: () => ({ message: 'Selecciona un turno válido' })
    }),
    hireDate: z.date({ required_error: 'La fecha de ingreso es requerida' }),
});

// Legal/fiscal info schema (optional fields with validation)
export const employeeFiscalSchema = z.object({
    rfc: z.string()
        .regex(/^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/, 'RFC inválido (formato: XAXX010101000)')
        .optional()
        .or(z.literal('')),
    curp: z.string()
        .regex(/^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/, 'CURP inválido (18 caracteres)')
        .optional()
        .or(z.literal('')),
    nss: z.string()
        .regex(/^[0-9]{11}$/, 'NSS debe tener 11 dígitos')
        .optional()
        .or(z.literal('')),
});

// Combined full employee schema for creation
export const createEmployeeSchema = employeePersonalInfoSchema
    .merge(employeePositionSchema)
    .merge(employeeFiscalSchema);

// Schema for updating an existing employee (all fields optional)
export const updateEmployeeSchema = createEmployeeSchema.partial();

// Type exports for TypeScript inference
export type EmployeePersonalInfo = z.infer<typeof employeePersonalInfoSchema>;
export type EmployeePosition = z.infer<typeof employeePositionSchema>;
export type EmployeeFiscal = z.infer<typeof employeeFiscalSchema>;
export type CreateEmployeeData = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeData = z.infer<typeof updateEmployeeSchema>;
