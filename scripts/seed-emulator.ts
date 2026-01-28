/**
 * Seed Data Script for Firebase Emulator
 *
 * This script populates the emulator with coherent test data including:
 * - Departments (with hierarchy)
 * - Positions (with salary ranges and approval permissions)
 * - Employees (with manager relationships)
 * - Compensation records
 * - Incidences in various states
 * - Attendance records
 * - Master Lists
 *
 * Run with: npx ts-node scripts/seed-emulator.ts
 *
 * Make sure the emulator is running first:
 * firebase emulators:start
 */

import * as admin from 'firebase-admin';

// Initialize with emulator settings
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';

admin.initializeApp({
    projectId: 'demo-project'
});

const db = admin.firestore();
const auth = admin.auth();

// =========================================================================
// HELPER FUNCTIONS
// =========================================================================

function generateId(): string {
    return db.collection('_').doc().id;
}

function formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
}

function addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function subtractDays(date: Date, days: number): Date {
    return addDays(date, -days);
}

function calculateYearsOfService(hireDate: string): number {
    const hire = new Date(hireDate);
    const today = new Date();
    let years = today.getFullYear() - hire.getFullYear();
    const monthDiff = today.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < hire.getDate())) {
        years--;
    }
    return Math.max(0, years);
}

function calculateVacationDays(yearsOfService: number): number {
    if (yearsOfService < 1) return 0;
    if (yearsOfService <= 5) return 12 + ((yearsOfService - 1) * 2);
    if (yearsOfService <= 10) return 20 + ((yearsOfService - 5) * 2);
    if (yearsOfService <= 15) return 32;
    if (yearsOfService <= 20) return 34;
    if (yearsOfService <= 25) return 36;
    if (yearsOfService <= 30) return 38;
    return 40;
}

function calculateSDIFactor(vacationDays: number, vacationPremium = 0.25, aguinaldoDays = 15): number {
    const factor = 1 + ((vacationPremium * vacationDays) / 365) + (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000;
}

// =========================================================================
// SEED DATA DEFINITIONS
// =========================================================================

const NOW = new Date();
const NOW_ISO = NOW.toISOString();

// Departments
const DEPARTMENTS = [
    {
        id: 'dept-direccion',
        name: 'Direccion General',
        code: 'DG',
        description: 'Alta direccion y estrategia corporativa',
        parentDepartmentId: null,
        costCenter: 'CC-100',
        budget: 5000000,
        budgetPeriod: 'annual' as const,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'dept-rh',
        name: 'Recursos Humanos',
        code: 'RH',
        description: 'Gestion de capital humano y nomina',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-200',
        budget: 1500000,
        budgetPeriod: 'annual' as const,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'dept-operaciones',
        name: 'Operaciones',
        code: 'OPS',
        description: 'Operacion y logistica',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-300',
        budget: 3000000,
        budgetPeriod: 'annual' as const,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'dept-finanzas',
        name: 'Finanzas',
        code: 'FIN',
        description: 'Contabilidad, tesoreria y finanzas',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-400',
        budget: 1000000,
        budgetPeriod: 'annual' as const,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'dept-ti',
        name: 'Tecnologias de Informacion',
        code: 'TI',
        description: 'Sistemas, desarrollo y soporte tecnico',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-500',
        budget: 2000000,
        budgetPeriod: 'annual' as const,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    }
];

// Positions
const POSITIONS = [
    {
        id: 'pos-director',
        name: 'Director General',
        code: 'DG-01',
        department: 'Direccion General',
        departmentId: 'dept-direccion',
        level: 1,
        salaryMin: 150000,
        salaryMax: 250000,
        canApproveOvertime: true,
        canApproveIncidences: true,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-gerente-rh',
        name: 'Gerente de Recursos Humanos',
        code: 'RH-01',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        level: 2,
        salaryMin: 60000,
        salaryMax: 90000,
        canApproveOvertime: true,
        canApproveIncidences: true,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-coord-nomina',
        name: 'Coordinador de Nomina',
        code: 'RH-02',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        level: 3,
        salaryMin: 35000,
        salaryMax: 50000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-analista-rh',
        name: 'Analista de RH',
        code: 'RH-03',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        level: 4,
        salaryMin: 20000,
        salaryMax: 30000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-gerente-ops',
        name: 'Gerente de Operaciones',
        code: 'OPS-01',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        level: 2,
        salaryMin: 70000,
        salaryMax: 100000,
        canApproveOvertime: true,
        canApproveIncidences: true,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-supervisor-ops',
        name: 'Supervisor de Operaciones',
        code: 'OPS-02',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        level: 3,
        salaryMin: 30000,
        salaryMax: 45000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-operador',
        name: 'Operador',
        code: 'OPS-03',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        level: 5,
        salaryMin: 10000,
        salaryMax: 15000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-gerente-ti',
        name: 'Gerente de TI',
        code: 'TI-01',
        department: 'Tecnologias de Informacion',
        departmentId: 'dept-ti',
        level: 2,
        salaryMin: 65000,
        salaryMax: 95000,
        canApproveOvertime: true,
        canApproveIncidences: true,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-desarrollador',
        name: 'Desarrollador de Software',
        code: 'TI-02',
        department: 'Tecnologias de Informacion',
        departmentId: 'dept-ti',
        level: 4,
        salaryMin: 35000,
        salaryMax: 55000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'pos-contador',
        name: 'Contador',
        code: 'FIN-01',
        department: 'Finanzas',
        departmentId: 'dept-finanzas',
        level: 3,
        salaryMin: 25000,
        salaryMax: 40000,
        canApproveOvertime: false,
        canApproveIncidences: false,
        isActive: true,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    }
];

// Employees with realistic hierarchy
const EMPLOYEES = [
    // Director General - Top level
    {
        id: 'emp-director',
        email: 'director@empresa.com',
        fullName: 'Carlos Martinez Lopez',
        department: 'Direccion General',
        departmentId: 'dept-direccion',
        positionTitle: 'Director General',
        positionId: 'pos-director',
        role: 'Admin',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 8)), // 8 years
        managerId: null,
        costCenter: 'CC-100',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Gerente de RH - Reports to Director
    {
        id: 'emp-gerente-rh',
        email: 'gerente.rh@empresa.com',
        fullName: 'Ana Garcia Hernandez',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Gerente de Recursos Humanos',
        positionId: 'pos-gerente-rh',
        role: 'HRManager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 5)), // 5 years
        managerId: 'emp-director',
        costCenter: 'CC-200',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Coordinador de Nomina - Reports to Gerente RH
    {
        id: 'emp-coord-nomina',
        email: 'nomina@empresa.com',
        fullName: 'Roberto Sanchez Perez',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Coordinador de Nomina',
        positionId: 'pos-coord-nomina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 3)), // 3 years
        managerId: 'emp-gerente-rh',
        costCenter: 'CC-200',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Analista RH - Reports to Gerente RH
    {
        id: 'emp-analista-rh',
        email: 'analista.rh@empresa.com',
        fullName: 'Laura Torres Rodriguez',
        department: 'Recursos Humanos',
        departmentId: 'dept-rh',
        positionTitle: 'Analista de RH',
        positionId: 'pos-analista-rh',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 2)), // 2 years
        managerId: 'emp-gerente-rh',
        costCenter: 'CC-200',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Gerente de Operaciones - Reports to Director
    {
        id: 'emp-gerente-ops',
        email: 'gerente.ops@empresa.com',
        fullName: 'Miguel Rodriguez Gomez',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Gerente de Operaciones',
        positionId: 'pos-gerente-ops',
        role: 'Manager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 6)), // 6 years
        managerId: 'emp-director',
        costCenter: 'CC-300',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Supervisor Ops - Reports to Gerente Ops
    {
        id: 'emp-supervisor-ops',
        email: 'supervisor.ops@empresa.com',
        fullName: 'Fernando Ramirez Cruz',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Supervisor de Operaciones',
        positionId: 'pos-supervisor-ops',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'mixed',
        hireDate: formatDate(subtractDays(NOW, 365 * 4)), // 4 years
        managerId: 'emp-gerente-ops',
        costCenter: 'CC-300',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Operadores - Report to Supervisor
    {
        id: 'emp-operador-1',
        email: 'operador1@empresa.com',
        fullName: 'Jose Luis Mendez Flores',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Operador',
        positionId: 'pos-operador',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 1 + 180)), // 1.5 years
        managerId: 'emp-supervisor-ops',
        costCenter: 'CC-300',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'emp-operador-2',
        email: 'operador2@empresa.com',
        fullName: 'Maria Elena Vargas Ruiz',
        department: 'Operaciones',
        departmentId: 'dept-operaciones',
        positionTitle: 'Operador',
        positionId: 'pos-operador',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'nocturnal',
        hireDate: formatDate(subtractDays(NOW, 365 + 90)), // 1.25 years
        managerId: 'emp-supervisor-ops',
        costCenter: 'CC-300',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Gerente de TI - Reports to Director
    {
        id: 'emp-gerente-ti',
        email: 'gerente.ti@empresa.com',
        fullName: 'Ricardo Navarro Diaz',
        department: 'Tecnologias de Informacion',
        departmentId: 'dept-ti',
        positionTitle: 'Gerente de TI',
        positionId: 'pos-gerente-ti',
        role: 'Manager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 4)), // 4 years
        managerId: 'emp-director',
        costCenter: 'CC-500',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Desarrolladores - Report to Gerente TI
    {
        id: 'emp-dev-1',
        email: 'dev1@empresa.com',
        fullName: 'Sofia Morales Ortiz',
        department: 'Tecnologias de Informacion',
        departmentId: 'dept-ti',
        positionTitle: 'Desarrollador de Software',
        positionId: 'pos-desarrollador',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 2 + 180)), // 2.5 years
        managerId: 'emp-gerente-ti',
        costCenter: 'CC-500',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'emp-dev-2',
        email: 'dev2@empresa.com',
        fullName: 'Daniel Castro Mendoza',
        department: 'Tecnologias de Informacion',
        departmentId: 'dept-ti',
        positionTitle: 'Desarrollador de Software',
        positionId: 'pos-desarrollador',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 + 60)), // 1.2 years
        managerId: 'emp-gerente-ti',
        costCenter: 'CC-500',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Contador - Reports to Director (Finanzas has no separate manager)
    {
        id: 'emp-contador',
        email: 'contador@empresa.com',
        fullName: 'Patricia Jimenez Luna',
        department: 'Finanzas',
        departmentId: 'dept-finanzas',
        positionTitle: 'Contador',
        positionId: 'pos-contador',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: formatDate(subtractDays(NOW, 365 * 3)), // 3 years
        managerId: 'emp-director',
        costCenter: 'CC-400',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    }
];

// Generate compensation records based on employees
function generateCompensation(employee: typeof EMPLOYEES[0], position: typeof POSITIONS[0]) {
    const salaryDaily = Math.round((position.salaryMin + position.salaryMax) / 2 / 30);
    const salaryMonthly = salaryDaily * 30;
    const yearsOfService = calculateYearsOfService(employee.hireDate);
    const vacationDays = calculateVacationDays(yearsOfService);
    const sdiFactor = calculateSDIFactor(vacationDays);
    const sdiBase = Math.round(salaryDaily * sdiFactor * 100) / 100;

    return {
        id: `comp-${employee.id}`,
        employeeId: employee.id,
        salaryDaily,
        salaryMonthly,
        sdiBase,
        sdiFactor,
        vacationDays,
        vacationPremium: 0.25,
        aguinaldoDays: 15,
        savingsFundPercentage: 0.13,
        foodVouchersDaily: position.level <= 3 ? 100 : 0,
        effectiveDate: employee.hireDate,
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO,
        createdById: 'system'
    };
}

// Generate incidences
const INCIDENCES = [
    // Pending vacation request
    {
        id: 'inc-pending-1',
        employeeId: 'emp-dev-1',
        employeeName: 'Sofia Morales Ortiz',
        type: 'vacation',
        startDate: formatDate(addDays(NOW, 14)),
        endDate: formatDate(addDays(NOW, 18)),
        totalDays: 5,
        status: 'pending',
        isPaid: true,
        notes: 'Vacaciones de descanso',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Pending sick leave
    {
        id: 'inc-pending-2',
        employeeId: 'emp-operador-1',
        employeeName: 'Jose Luis Mendez Flores',
        type: 'sick_leave',
        startDate: formatDate(addDays(NOW, 2)),
        endDate: formatDate(addDays(NOW, 4)),
        totalDays: 3,
        status: 'pending',
        isPaid: true,
        notes: 'Cita medica programada',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Pending personal leave
    {
        id: 'inc-pending-3',
        employeeId: 'emp-coord-nomina',
        employeeName: 'Roberto Sanchez Perez',
        type: 'personal_leave',
        startDate: formatDate(addDays(NOW, 7)),
        endDate: formatDate(addDays(NOW, 7)),
        totalDays: 1,
        status: 'pending',
        isPaid: false,
        notes: 'Asunto personal urgente',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    // Approved vacations (past)
    {
        id: 'inc-approved-1',
        employeeId: 'emp-gerente-rh',
        employeeName: 'Ana Garcia Hernandez',
        type: 'vacation',
        startDate: formatDate(subtractDays(NOW, 30)),
        endDate: formatDate(subtractDays(NOW, 25)),
        totalDays: 6,
        status: 'approved',
        isPaid: true,
        approvedById: 'emp-director',
        approvedByName: 'Carlos Martinez Lopez',
        approvedAt: subtractDays(NOW, 35).toISOString(),
        notes: 'Vacaciones de fin de ano',
        createdAt: subtractDays(NOW, 40).toISOString(),
        updatedAt: subtractDays(NOW, 35).toISOString()
    },
    // Approved vacation (future - scheduled)
    {
        id: 'inc-approved-2',
        employeeId: 'emp-dev-2',
        employeeName: 'Daniel Castro Mendoza',
        type: 'vacation',
        startDate: formatDate(addDays(NOW, 30)),
        endDate: formatDate(addDays(NOW, 35)),
        totalDays: 6,
        status: 'approved',
        isPaid: true,
        approvedById: 'emp-gerente-ti',
        approvedByName: 'Ricardo Navarro Diaz',
        approvedAt: subtractDays(NOW, 10).toISOString(),
        notes: 'Vacaciones programadas',
        createdAt: subtractDays(NOW, 15).toISOString(),
        updatedAt: subtractDays(NOW, 10).toISOString()
    },
    // Approved sick leave (past)
    {
        id: 'inc-approved-3',
        employeeId: 'emp-operador-2',
        employeeName: 'Maria Elena Vargas Ruiz',
        type: 'sick_leave',
        startDate: formatDate(subtractDays(NOW, 15)),
        endDate: formatDate(subtractDays(NOW, 13)),
        totalDays: 3,
        status: 'approved',
        isPaid: true,
        imssReference: 'IMSS-2024-001234',
        imssPercentage: 60,
        approvedById: 'emp-gerente-rh',
        approvedByName: 'Ana Garcia Hernandez',
        approvedAt: subtractDays(NOW, 16).toISOString(),
        createdAt: subtractDays(NOW, 16).toISOString(),
        updatedAt: subtractDays(NOW, 16).toISOString()
    },
    // Rejected vacation request
    {
        id: 'inc-rejected-1',
        employeeId: 'emp-supervisor-ops',
        employeeName: 'Fernando Ramirez Cruz',
        type: 'vacation',
        startDate: formatDate(subtractDays(NOW, 5)),
        endDate: formatDate(subtractDays(NOW, 1)),
        totalDays: 5,
        status: 'rejected',
        isPaid: true,
        rejectionReason: 'Periodo de cierre contable. Por favor solicitar en otra fecha.',
        approvedById: 'emp-gerente-ops',
        approvedByName: 'Miguel Rodriguez Gomez',
        approvedAt: subtractDays(NOW, 10).toISOString(),
        createdAt: subtractDays(NOW, 12).toISOString(),
        updatedAt: subtractDays(NOW, 10).toISOString()
    },
    // Rejected - dates conflict
    {
        id: 'inc-rejected-2',
        employeeId: 'emp-analista-rh',
        employeeName: 'Laura Torres Rodriguez',
        type: 'personal_leave',
        startDate: formatDate(subtractDays(NOW, 20)),
        endDate: formatDate(subtractDays(NOW, 20)),
        totalDays: 1,
        status: 'rejected',
        isPaid: false,
        rejectionReason: 'Ya existe otra solicitud aprobada para esa fecha.',
        approvedById: 'emp-gerente-rh',
        approvedByName: 'Ana Garcia Hernandez',
        approvedAt: subtractDays(NOW, 22).toISOString(),
        createdAt: subtractDays(NOW, 25).toISOString(),
        updatedAt: subtractDays(NOW, 22).toISOString()
    }
];

// Master Lists
const MASTER_LISTS = [
    {
        id: 'ml-incidence-types',
        name: 'Tipos de Incidencia',
        description: 'Catalogo de tipos de incidencia para solicitudes',
        fields: [
            { id: 'id', name: 'ID', type: 'text' },
            { id: 'name', name: 'Nombre', type: 'text' },
            { id: 'isPaid', name: 'Con Goce', type: 'boolean' }
        ],
        primaryKey: 'id',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    },
    {
        id: 'ml-expense-categories',
        name: 'Categorias de Gasto',
        description: 'Categorias para solicitudes de reembolso',
        fields: [
            { id: 'id', name: 'ID', type: 'text' },
            { id: 'name', name: 'Nombre', type: 'text' },
            { id: 'requiresReceipt', name: 'Requiere Factura', type: 'boolean' }
        ],
        primaryKey: 'id',
        createdAt: NOW_ISO,
        updatedAt: NOW_ISO
    }
];

const INCIDENCE_TYPE_ITEMS = [
    { id: 'vacation', name: 'Vacaciones', isPaid: true },
    { id: 'sick_leave', name: 'Incapacidad', isPaid: true },
    { id: 'personal_leave', name: 'Permiso Personal', isPaid: false },
    { id: 'maternity', name: 'Maternidad', isPaid: true },
    { id: 'paternity', name: 'Paternidad', isPaid: true },
    { id: 'bereavement', name: 'Duelo', isPaid: true },
    { id: 'unjustified_absence', name: 'Falta Injustificada', isPaid: false }
];

const EXPENSE_CATEGORY_ITEMS = [
    { id: 'transport', name: 'Transporte', requiresReceipt: false },
    { id: 'food', name: 'Alimentacion', requiresReceipt: true },
    { id: 'lodging', name: 'Hospedaje', requiresReceipt: true },
    { id: 'supplies', name: 'Insumos', requiresReceipt: true },
    { id: 'services', name: 'Servicios', requiresReceipt: true },
    { id: 'other', name: 'Otros', requiresReceipt: true }
];

// Attendance records for past 2 weeks
function generateAttendance(employee: typeof EMPLOYEES[0]): any[] {
    const records: any[] = [];
    const shiftHours = employee.shiftType === 'diurnal' ? 8 : employee.shiftType === 'nocturnal' ? 7 : 7.5;

    for (let i = 14; i >= 1; i--) {
        const date = subtractDays(NOW, i);
        const dayOfWeek = date.getDay();

        // Skip weekends
        if (dayOfWeek === 0 || dayOfWeek === 6) continue;

        // Random attendance data
        const checkIn = employee.shiftType === 'nocturnal' ? '20:00:00' : '08:00:00';
        const regularCheckOut = employee.shiftType === 'nocturnal' ? '03:00:00' : '17:00:00';

        // Occasionally add overtime
        const hasOvertime = Math.random() > 0.7;
        const overtimeHours = hasOvertime ? Math.floor(Math.random() * 3) + 1 : 0;

        const checkOutHour = parseInt(regularCheckOut.split(':')[0]) + overtimeHours;
        const checkOut = `${checkOutHour.toString().padStart(2, '0')}:00:00`;

        records.push({
            id: `att-${employee.id}-${formatDate(date)}`,
            employeeId: employee.id,
            date: formatDate(date),
            checkIn,
            checkOut,
            hoursWorked: shiftHours + overtimeHours,
            regularHours: shiftHours,
            overtimeHours,
            overtimeType: overtimeHours > 0 ? 'double' : null,
            isValid: true,
            createdAt: date.toISOString(),
            updatedAt: date.toISOString()
        });
    }

    return records;
}

// =========================================================================
// MAIN SEED FUNCTION
// =========================================================================

async function seedEmulator() {
    console.log('='.repeat(60));
    console.log('Starting seed data import to Firebase Emulator');
    console.log('='.repeat(60));

    try {
        // Create auth users for key employees
        console.log('\n[1/8] Creating auth users...');
        const authUsers = [
            { uid: 'emp-director', email: 'director@empresa.com', password: 'test123456', displayName: 'Carlos Martinez Lopez' },
            { uid: 'emp-gerente-rh', email: 'gerente.rh@empresa.com', password: 'test123456', displayName: 'Ana Garcia Hernandez' },
            { uid: 'emp-gerente-ops', email: 'gerente.ops@empresa.com', password: 'test123456', displayName: 'Miguel Rodriguez Gomez' },
            { uid: 'emp-gerente-ti', email: 'gerente.ti@empresa.com', password: 'test123456', displayName: 'Ricardo Navarro Diaz' },
            { uid: 'emp-dev-1', email: 'dev1@empresa.com', password: 'test123456', displayName: 'Sofia Morales Ortiz' }
        ];

        for (const u of authUsers) {
            try {
                await auth.createUser({
                    uid: u.uid,
                    email: u.email,
                    password: u.password,
                    displayName: u.displayName,
                    emailVerified: true
                });
                console.log(`  Created user: ${u.email}`);
            } catch (e: any) {
                if (e.code === 'auth/uid-already-exists') {
                    console.log(`  User already exists: ${u.email}`);
                } else {
                    throw e;
                }
            }
        }

        // Seed departments
        console.log('\n[2/8] Seeding departments...');
        const batch1 = db.batch();
        for (const dept of DEPARTMENTS) {
            const ref = db.collection('departments').doc(dept.id);
            batch1.set(ref, dept);
        }
        await batch1.commit();
        console.log(`  Created ${DEPARTMENTS.length} departments`);

        // Update departments with manager IDs
        console.log('\n[3/8] Updating department managers...');
        await db.collection('departments').doc('dept-rh').update({ managerId: 'emp-gerente-rh' });
        await db.collection('departments').doc('dept-operaciones').update({ managerId: 'emp-gerente-ops' });
        await db.collection('departments').doc('dept-ti').update({ managerId: 'emp-gerente-ti' });
        await db.collection('departments').doc('dept-direccion').update({ managerId: 'emp-director' });
        console.log('  Updated 4 department managers');

        // Seed positions
        console.log('\n[4/8] Seeding positions...');
        const batch2 = db.batch();
        for (const pos of POSITIONS) {
            const ref = db.collection('positions').doc(pos.id);
            batch2.set(ref, pos);
        }
        await batch2.commit();
        console.log(`  Created ${POSITIONS.length} positions`);

        // Seed employees and users
        console.log('\n[5/8] Seeding employees and users...');
        const batch3 = db.batch();
        for (const emp of EMPLOYEES) {
            // Create employee record
            const empRef = db.collection('employees').doc(emp.id);
            batch3.set(empRef, emp);

            // Create user record (for auth integration)
            const userRef = db.collection('users').doc(emp.id);
            batch3.set(userRef, {
                id: emp.id,
                email: emp.email,
                fullName: emp.fullName,
                department: emp.department,
                departmentId: emp.departmentId,
                role: emp.role,
                status: emp.status,
                managerId: emp.managerId,
                createdAt: NOW_ISO,
                updatedAt: NOW_ISO
            });
        }
        await batch3.commit();
        console.log(`  Created ${EMPLOYEES.length} employees and users`);

        // Seed compensation records
        console.log('\n[6/8] Seeding compensation records...');
        const batch4 = db.batch();
        for (const emp of EMPLOYEES) {
            const pos = POSITIONS.find(p => p.id === emp.positionId)!;
            const comp = generateCompensation(emp, pos);
            const ref = db.collection('compensation').doc(comp.id);
            batch4.set(ref, comp);
        }
        await batch4.commit();
        console.log(`  Created ${EMPLOYEES.length} compensation records`);

        // Seed incidences
        console.log('\n[7/8] Seeding incidences...');
        const batch5 = db.batch();
        for (const inc of INCIDENCES) {
            const ref = db.collection('incidences').doc(inc.id);
            batch5.set(ref, inc);
        }
        await batch5.commit();
        console.log(`  Created ${INCIDENCES.length} incidences (3 pending, 3 approved, 2 rejected)`);

        // Seed master lists
        console.log('\n[8/8] Seeding master lists...');
        const batch6 = db.batch();

        // Create master list definitions
        for (const ml of MASTER_LISTS) {
            const ref = db.collection('master_lists').doc(ml.id);
            batch6.set(ref, ml);
        }

        // Create incidence type items
        for (const item of INCIDENCE_TYPE_ITEMS) {
            const ref = db.collection('master_lists').doc('ml-incidence-types')
                .collection('items').doc(item.id);
            batch6.set(ref, item);
        }

        // Create expense category items
        for (const item of EXPENSE_CATEGORY_ITEMS) {
            const ref = db.collection('master_lists').doc('ml-expense-categories')
                .collection('items').doc(item.id);
            batch6.set(ref, item);
        }

        await batch6.commit();
        console.log(`  Created ${MASTER_LISTS.length} master lists with items`);

        // Generate some attendance records
        console.log('\n[Bonus] Seeding sample attendance records...');
        let attendanceCount = 0;
        for (const emp of EMPLOYEES.slice(0, 5)) { // First 5 employees
            const records = generateAttendance(emp);
            const attBatch = db.batch();
            for (const rec of records) {
                const ref = db.collection('attendance').doc(rec.id);
                attBatch.set(ref, rec);
                attendanceCount++;
            }
            await attBatch.commit();
        }
        console.log(`  Created ${attendanceCount} attendance records`);

        console.log('\n' + '='.repeat(60));
        console.log('Seed data import completed successfully!');
        console.log('='.repeat(60));
        console.log('\nTest accounts available:');
        console.log('  - director@empresa.com (Admin)');
        console.log('  - gerente.rh@empresa.com (HRManager)');
        console.log('  - gerente.ops@empresa.com (Manager)');
        console.log('  - gerente.ti@empresa.com (Manager)');
        console.log('  - dev1@empresa.com (Member)');
        console.log('\nPassword for all accounts: test123456');

    } catch (error) {
        console.error('Error seeding data:', error);
        process.exit(1);
    }

    process.exit(0);
}

// Run the seed function
seedEmulator();
