/**
 * Constantes para el Script de Seeding
 * Define la estructura organizacional y datos base
 */

import type { EmployeeSeedData } from './seed-types';

// =============================================================================
// ESTRUCTURA ORGANIZACIONAL (10 EMPLEADOS)
// =============================================================================

export const SEED_EMPLOYEES: EmployeeSeedData[] = [
    // NIVEL 1: DIRECTOR (1)
    {
        id: 'emp-director',
        uid: 'emp-director',
        fullName: 'Ricardo Mendoza García',
        email: 'ricardo.mendoza@empresa.mx',
        department: 'Dirección General',
        departmentId: 'dept-direccion',
        positionTitle: 'Director General',
        positionId: 'pos-director-general',
        role: 'Admin',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2020-01-15',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1980-05-20',
        rfc_curp: 'MEGR800520HDF 123456789012345678',
        nss: '12345678901'
    },

    // NIVEL 2: GERENTE (1)
    {
        id: 'emp-gerente-rh',
        uid: 'emp-gerente-rh',
        fullName: 'Patricia Ramírez Luna',
        email: 'patricia.ramirez@empresa.mx',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Gerente de RH',
        positionId: 'pos-gerente-rh',
        role: 'Supervisor',
        directManagerId: 'emp-director',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2020-03-01',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1985-08-10',
        rfc_curp: 'RALP850810MDF 987654321098765432',
        nss: '09876543210'
    },

    // NIVEL 3: COORDINADORES (2)
    {
        id: 'emp-coord-rh',
        uid: 'emp-coord-rh',
        fullName: 'Ana Gabriela Soto Martínez',
        email: 'ana.soto@empresa.mx',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Coordinador de RH',
        positionId: 'pos-coord-rh',
        role: 'Supervisor',
        directManagerId: 'emp-gerente-rh',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2021-06-15',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1990-03-12',
        rfc_curp: 'SOMA900312MDF 112233445566778899',
        nss: '11223344556'
    },
    {
        id: 'emp-coord-ops',
        uid: 'emp-coord-ops',
        fullName: 'Miguel Ángel Rojas Hernández',
        email: 'miguel.rojas@empresa.mx',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Supervisor de Almacén',
        positionId: 'pos-super-almacen',
        role: 'Supervisor',
        directManagerId: 'emp-gerente-rh',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-matutino',
        hireDate: '2021-08-01',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1988-11-05',
        rfc_curp: 'ROHM881105HDF 998877665544332211',
        nss: '22334455667'
    },

    // NIVEL 4: EMPLEADOS RH (3)
    {
        id: 'emp-analista-rh-1',
        uid: 'emp-analista-rh-1',
        fullName: 'Sandra López Gutiérrez',
        email: 'sandra.lopez@empresa.mx',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Analista de RH',
        positionId: 'pos-analista-rh',
        role: 'Employee',
        directManagerId: 'emp-coord-rh',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2022-02-01',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1995-01-25',
        rfc_curp: 'LOGS950125MDF 334455667788990011',
        nss: '33445566778'
    },
    {
        id: 'emp-analista-rh-2',
        uid: 'emp-analista-rh-2',
        fullName: 'Roberto Guzmán Pérez',
        email: 'roberto.guzman@empresa.mx',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Analista de RH',
        positionId: 'pos-analista-rh',
        role: 'Employee',
        directManagerId: 'emp-coord-rh',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2022-04-15',
        employmentType: 'probation',
        shiftType: 'diurnal',
        birthDate: '1998-07-30',
        rfc_curp: 'GUPR980730HDF 445566778899001122',
        nss: '44556677889'
    },
    {
        id: 'emp-analista-rh-3',
        uid: 'emp-analista-rh-3',
        fullName: 'Gabriela Estrada Morales',
        email: 'gabriela.estrada@empresa.mx',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Analista de RH',
        positionId: 'pos-analista-rh',
        role: 'Employee',
        directManagerId: 'emp-coord-rh',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-admin',
        hireDate: '2022-07-01',
        employmentType: 'contract',
        shiftType: 'diurnal',
        birthDate: '1993-09-15',
        rfc_curp: 'ESMG930915MDF 556677889900112233',
        nss: '55667788990'
    },

    // NIVEL 4: EMPLEADOS OPERACIONES (3)
    {
        id: 'emp-ops-1',
        uid: 'emp-ops-1',
        fullName: 'José Luis Ríos Vega',
        email: 'jose.rios@empresa.mx',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Almacenista',
        positionId: 'pos-almacenista',
        role: 'Employee',
        directManagerId: 'emp-coord-ops',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-matutino',
        hireDate: '2023-01-10',
        employmentType: 'permanent',
        shiftType: 'diurnal',
        birthDate: '1996-02-28',
        rfc_curp: 'RIVJ960228HDF 667788990011223344',
        nss: '66778899001'
    },
    {
        id: 'emp-ops-2',
        uid: 'emp-ops-2',
        fullName: 'Pedro Vázquez Torres',
        email: 'pedro.vazquez@empresa.mx',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Almacenista',
        positionId: 'pos-almacenista',
        role: 'Employee',
        directManagerId: 'emp-coord-ops',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-vespertino',
        hireDate: '2023-03-15',
        employmentType: 'permanent',
        shiftType: 'mixed',
        birthDate: '1992-12-10',
        rfc_curp: 'VATP921210HDF 778899001122334455',
        nss: '77889900112'
    },
    {
        id: 'emp-ops-3',
        uid: 'emp-ops-3',
        fullName: 'Daniela Jiménez Ramírez',
        email: 'daniela.jimenez@empresa.mx',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Almacenista',
        positionId: 'pos-almacenista',
        role: 'Employee',
        directManagerId: 'emp-coord-ops',
        locationId: 'loc-cdmx-matriz',
        shiftId: 'shift-matutino',
        hireDate: '2023-05-20',
        employmentType: 'probation',
        shiftType: 'diurnal',
        birthDate: '2000-05-05',
        rfc_curp: 'JIRD000505MDF 889900112233445566',
        nss: '88990011223'
    },
];

// =============================================================================
// TURNOS
// =============================================================================

export const SEED_SHIFTS = [
    {
        id: 'shift-admin',
        name: 'Administrativo',
        startTime: '09:00',
        endTime: '18:00',
        workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
        toleranceMinutes: 10,
    },
    {
        id: 'shift-matutino',
        name: 'Matutino',
        startTime: '07:00',
        endTime: '15:00',
        workDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado
        toleranceMinutes: 5,
    },
    {
        id: 'shift-vespertino',
        name: 'Vespertino',
        startTime: '15:00',
        endTime: '23:00',
        workDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado
        toleranceMinutes: 5,
    },
];

// =============================================================================
// UBICACIONES
// =============================================================================

export const SEED_LOCATIONS = [
    {
        id: 'loc-cdmx-matriz',
        name: 'CDMX - Matriz',
        code: 'CDMX-001',
        type: 'oficina',
        address: 'Av. Insurgentes Sur 1234, CDMX',
        toleranceMinutes: 10,
        overtimeResetDay: 'sunday',
        companyBenefitDays: ['12-24', '12-31', '01-01'],
        isActive: true,
    },
];

// =============================================================================
// TIPOS DE INCIDENCIAS
// =============================================================================

export const INCIDENCE_TYPES = [
    { value: 'personal_leave', label: 'Permiso Personal', probability: 0.4 },
    { value: 'medical_leave', label: 'Permiso Médico', probability: 0.3 },
    { value: 'vacation', label: 'Vacaciones', probability: 0.15 },
    { value: 'bereavement_leave', label: 'Permiso por Duelo', probability: 0.1 },
    { value: 'paternity_leave', label: 'Permiso de Paternidad', probability: 0.05 },
] as const;

// =============================================================================
// RAZONES DE HORAS EXTRA
// =============================================================================

export const OVERTIME_REASONS = [
    'Cierre de mes - proyectos urgentes',
    'Entrega de reportes trimestrales',
    'Atención de incidencias críticas',
    'Inventario de fin de período',
    'Capacitación fuera de horario',
    'Soporte a otras áreas',
    'Reuniones con clientes',
    'Implementación de sistema nuevo',
];

// =============================================================================
// CONFIGURACIÓN DE PERÍODOS
// =============================================================================

export const PERIODS = {
    CLOSED_1: {
        period: '2025-12',
        batch1: { start: '2025-12-01', end: '2025-12-15', importDate: '2025-12-16T10:00:00Z' },
        batch2: { start: '2025-12-16', end: '2025-12-31', importDate: '2026-01-02T09:00:00Z' },
        closedAt: '2026-01-05T16:00:00Z',
    },
    CLOSED_2: {
        period: '2026-01',
        batch1: { start: '2026-01-01', end: '2026-01-15', importDate: '2026-01-16T10:00:00Z' },
        batch2: { start: '2026-01-16', end: '2026-01-31', importDate: '2026-02-01T09:00:00Z' },
        closedAt: '2026-02-03T16:00:00Z',
    },
    OPEN: {
        period: '2026-02',
        batch1: { start: '2026-02-01', end: '2026-02-05', importDate: '2026-02-05T10:00:00Z' },
    },
} as const;
