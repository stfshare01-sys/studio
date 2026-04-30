import * as z from 'zod';

export const employeeSchema = z.object({
    fullName: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
    email: z.string().email('Correo electrónico inválido'),
    positionId: z.string().min(1, 'El puesto es requerido'),
    employmentType: z.enum(['full_time', 'part_time', 'contractor', 'intern']),
    shiftId: z.string().min(1, 'El turno es requerido'),
    locationId: z.string().min(1, 'La ubicación es requerida'),
    hireDate: z.date({ required_error: 'La fecha de ingreso es requerida' }),
    managerId: z.string().optional(),
    rfc: z.string().min(12, 'RFC inválido').max(13, 'RFC inválido').optional().or(z.literal('')),
    curp: z.string().length(18, 'CURP debe tener 18 caracteres').optional().or(z.literal('')),
    nss: z.string().length(11, 'NSS debe tener 11 dígitos').optional().or(z.literal('')),
    allowTimeForTime: z.boolean().optional(),
    employeeId: z.string().optional().or(z.literal('')),
    legalEntity: z.string().optional(),
    avatarFile: z.any().optional(),
    homeOfficeDays: z.array(z.number()).optional(),
    workMode: z.enum(['office', 'hybrid', 'remote', 'field']).optional(),
});

export type EmployeeFormValues = z.infer<typeof employeeSchema>;
