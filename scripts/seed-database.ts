/**
 * 🌱 Seed Database Script
 * 
 * Creates comprehensive demo data for FlowMaster Studio:
 * - Roles and Permissions
 * - Locations
 * - Positions (Puestos)
 * - Shifts (Turnos)  
 * - Users
 * - Employees with hierarchical relationships
 * - Workflow Templates (Vacations, Reimbursements, etc.)
 * 
 * Run: npx tsx scripts/seed-database.ts
 */

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, connectAuthEmulator } from 'firebase/auth';
import * as admin from 'firebase-admin';
import { firebaseConfig } from '../src/firebase/config';

// Initialize Admin SDK
if (!admin.apps.length) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    admin.initializeApp({ projectId: firebaseConfig.projectId });
}
const db = admin.firestore();

// Initialize Client SDK
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

const NOW = new Date().toISOString();

// Helper to safely create auth user (deletes existing user with same email)
async function safeCreateAuthUser(uid: string, email: string, displayName: string): Promise<void> {
    // First, delete any existing user with this email
    try {
        const existingUser = await admin.auth().getUserByEmail(email);
        console.log(`   🗑️  Eliminando usuario existente: ${email} (${existingUser.uid})`);
        await admin.auth().deleteUser(existingUser.uid);
    } catch {
        // User doesn't exist, that's fine
    }

    // Now create the new user
    await admin.auth().createUser({
        uid,
        email,
        emailVerified: true,
        displayName,
        password: 'prueba123',
    });
}


// =============================================================================
// 1. ROLES Y PERMISOS
// =============================================================================

const ROLES = [
    {
        id: 'role-admin',
        name: 'Administrador',
        description: 'Acceso total al sistema',
        isSystemRole: true,
        permissions: [
            { module: 'dashboard', level: 'write' },
            { module: 'requests', level: 'write' },
            { module: 'templates', level: 'write' },
            { module: 'master_lists', level: 'write' },
            { module: 'reports', level: 'write' },
            { module: 'process_mining', level: 'write' },
            { module: 'integrations', level: 'write' },
            { module: 'admin_users', level: 'write' },
            { module: 'admin_roles', level: 'write' },
            { module: 'hcm_employees', level: 'write' },
            { module: 'hcm_attendance', level: 'write' },
            { module: 'hcm_incidences', level: 'write' },
            { module: 'hcm_prenomina', level: 'write' },
            { module: 'hcm_calendar', level: 'write' },
            { module: 'hcm_org_chart', level: 'write' },
            { module: 'hcm_talent_grid', level: 'write' },
        ],
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'role-hr-manager',
        name: 'Gerente de RH',
        description: 'Gestión completa de Capital Humano',
        isSystemRole: true,
        permissions: [
            { module: 'dashboard', level: 'read' },
            { module: 'requests', level: 'write' },
            { module: 'hcm_employees', level: 'write' },
            { module: 'hcm_attendance', level: 'write' },
            { module: 'hcm_incidences', level: 'write' },
            { module: 'hcm_prenomina', level: 'write' },
            { module: 'hcm_calendar', level: 'write' },
            { module: 'hcm_org_chart', level: 'read' },
            { module: 'hcm_talent_grid', level: 'write' },
        ],
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'role-supervisor',
        name: 'Supervisor',
        description: 'Aprobación de incidencias de su equipo',
        isSystemRole: false,
        permissions: [
            { module: 'dashboard', level: 'read' },
            { module: 'requests', level: 'write' },
            { module: 'hcm_employees', level: 'read' },
            { module: 'hcm_incidences', level: 'write' },
            { module: 'hcm_calendar', level: 'read' },
        ],
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'role-employee',
        name: 'Colaborador',
        description: 'Acceso básico para empleados',
        isSystemRole: true,
        permissions: [
            { module: 'dashboard', level: 'read' },
            { module: 'requests', level: 'write' },
            { module: 'hcm_calendar', level: 'read' },
        ],
        createdAt: NOW,
        updatedAt: NOW,
    },
];

// =============================================================================
// 2. UBICACIONES
// =============================================================================

const LOCATIONS = [
    {
        id: 'loc-corporativo-gdl',
        name: 'Corporativo Guadalajara',
        code: 'CORP-GDL',
        type: 'corporativo',
        address: 'Av. Américas 1500, Col. Providencia',
        city: 'Guadalajara',
        state: 'Jalisco',
        overtimeResetDay: 'sunday',
        toleranceMinutes: 10,
        useVirtualCheckIn: true,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'loc-cedis-gdl',
        name: 'CEDIS Guadalajara',
        code: 'CEDIS-GDL',
        type: 'cedis',
        address: 'Periférico Sur 8500, Zona Industrial',
        city: 'Tlajomulco',
        state: 'Jalisco',
        overtimeResetDay: 'sunday',
        toleranceMinutes: 5,
        useVirtualCheckIn: false,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'loc-tienda-centro',
        name: 'Tienda Centro',
        code: 'T-001',
        type: 'tienda',
        address: 'Av. Juárez 200, Centro',
        city: 'Guadalajara',
        state: 'Jalisco',
        overtimeResetDay: 'saturday',
        toleranceMinutes: 5,
        useVirtualCheckIn: false,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
];

// =============================================================================
// 2.5 DEPARTAMENTOS
// =============================================================================

const DEPARTMENTS = [
    {
        id: 'dept-direccion',
        name: 'Dirección General',
        code: 'DIR',
        description: 'Dirección ejecutiva de la empresa',
        managerId: 'emp-director-general',
        parentDepartmentId: null,
        costCenter: 'CC-100',
        budget: 500000,
        budgetPeriod: 'annual',
        locationId: 'loc-corporativo-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'dept-rh',
        name: 'Recursos Humanos',
        code: 'RH',
        description: 'Gestión de Capital Humano',
        managerId: 'emp-gerente-rh',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-200',
        budget: 150000,
        budgetPeriod: 'annual',
        locationId: 'loc-corporativo-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'dept-operaciones',
        name: 'Operaciones',
        code: 'OPS',
        description: 'Operaciones y logística',
        managerId: 'emp-gerente-operaciones',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-300',
        budget: 300000,
        budgetPeriod: 'annual',
        locationId: 'loc-cedis-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'dept-administracion',
        name: 'Administración',
        code: 'ADM',
        description: 'Administración y finanzas',
        managerId: 'emp-gerente-admin',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-400',
        budget: 200000,
        budgetPeriod: 'annual',
        locationId: 'loc-corporativo-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
    {
        id: 'dept-tecnologia',
        name: 'Tecnología',
        code: 'TI',
        description: 'Sistemas y tecnología de información',
        managerId: 'emp-gerente-ti',
        parentDepartmentId: 'dept-direccion',
        costCenter: 'CC-500',
        budget: 250000,
        budgetPeriod: 'annual',
        locationId: 'loc-corporativo-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'admin-user',
    },
];

// =============================================================================
// 3. PUESTOS (POSITIONS)
// =============================================================================

const POSITIONS = [

    // Dirección
    {
        id: 'pos-director-general', name: 'Director General', code: 'DG-001',
        department: 'Dirección', departmentId: 'dept-direccion', level: 1,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 500000, purchases: 500000, travel: 200000, contracts: 500000, vacationDays: 30, overtimeHours: 50, headcount: 10 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },

    // Gerencias
    {
        id: 'pos-gerente-rh', name: 'Gerente de Recursos Humanos', code: 'GRH-001',
        department: 'Recursos Humanos', departmentId: 'dept-rh', level: 2,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 100000, purchases: 50000, travel: 50000, contracts: 100000, vacationDays: 15, overtimeHours: 20, headcount: 3 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-gerente-operaciones', name: 'Gerente de Operaciones', code: 'GOP-001',
        department: 'Operaciones', departmentId: 'dept-operaciones', level: 2,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 100000, purchases: 75000, travel: 30000, contracts: 50000, vacationDays: 15, overtimeHours: 30, headcount: 5 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-gerente-admin', name: 'Gerente de Administración', code: 'GAD-001',
        department: 'Administración', departmentId: 'dept-administracion', level: 2,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 150000, purchases: 100000, travel: 50000, contracts: 150000, vacationDays: 15, overtimeHours: 15, headcount: 3 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-gerente-ti', name: 'Gerente de TI', code: 'GTI-001',
        department: 'Tecnología', departmentId: 'dept-tecnologia', level: 2,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 100000, purchases: 200000, travel: 40000, contracts: 100000, vacationDays: 15, overtimeHours: 25, headcount: 2 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },

    // Supervisores/Coordinadores
    {
        id: 'pos-coord-rh', name: 'Coordinador de RH', code: 'CRH-001',
        department: 'Recursos Humanos', departmentId: 'dept-rh', level: 3,
        canApproveOvertime: false, canApproveIncidences: true,
        approvalLimits: { expenses: 25000, purchases: 10000, travel: 10000, vacationDays: 10, overtimeHours: 9 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-super-almacen', name: 'Supervisor de Almacén', code: 'SAL-001',
        department: 'Operaciones', departmentId: 'dept-operaciones', level: 3,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 15000, purchases: 5000, vacationDays: 5, overtimeHours: 15 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-super-tienda', name: 'Supervisor de Tienda', code: 'STI-001',
        department: 'Operaciones', departmentId: 'dept-operaciones', level: 3,
        canApproveOvertime: true, canApproveIncidences: true,
        approvalLimits: { expenses: 10000, purchases: 3000, vacationDays: 5, overtimeHours: 10 },
        isActive: true, createdAt: NOW, updatedAt: NOW
    },

    // Analistas/Especialistas
    {
        id: 'pos-analista-rh', name: 'Analista de RH', code: 'ARH-001',
        department: 'Recursos Humanos', departmentId: 'dept-rh', level: 4,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-contador', name: 'Contador', code: 'CNT-001',
        department: 'Administración', departmentId: 'dept-administracion', level: 4,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-desarrollador', name: 'Desarrollador de Software', code: 'DEV-001',
        department: 'Tecnología', departmentId: 'dept-tecnologia', level: 4,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },

    // Operativos
    {
        id: 'pos-almacenista', name: 'Almacenista', code: 'ALM-001',
        department: 'Operaciones', departmentId: 'dept-operaciones', level: 5,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-vendedor', name: 'Vendedor', code: 'VEN-001',
        department: 'Operaciones', departmentId: 'dept-operaciones', level: 5,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-auxiliar-admin', name: 'Auxiliar Administrativo', code: 'AUX-001',
        department: 'Administración', departmentId: 'dept-administracion', level: 5,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
    {
        id: 'pos-recepcion', name: 'Recepcionista', code: 'REC-001',
        department: 'Administración', departmentId: 'dept-administracion', level: 5,
        canApproveOvertime: false, canApproveIncidences: false,
        isActive: true, createdAt: NOW, updatedAt: NOW
    },
];

// =============================================================================
// 4. TURNOS (SHIFTS)
// =============================================================================

const SHIFTS = [
    {
        id: 'shift-oficina',
        name: 'Turno Oficina',
        code: 'OFI-01',
        type: 'diurnal',
        startTime: '09:00',
        endTime: '18:00',
        breakStartTime: '14:00',
        breakEndTime: '15:00',
        breakMinutes: 60,
        workDays: [1, 2, 3, 4, 5], // Lunes a Viernes
        restDays: [0, 6], // Domingo y Sábado
        dailyHours: 8,
        weeklyHours: 40,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'shift-almacen-matutino',
        name: 'Turno Almacén Matutino',
        code: 'ALM-MAT',
        type: 'diurnal',
        startTime: '06:00',
        endTime: '14:00',
        breakMinutes: 30,
        workDays: [1, 2, 3, 4, 5, 6], // Lunes a Sábado
        restDays: [0], // Domingo
        dailyHours: 8,
        weeklyHours: 48,
        locationId: 'loc-cedis-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'shift-almacen-vespertino',
        name: 'Turno Almacén Vespertino',
        code: 'ALM-VES',
        type: 'mixed',
        startTime: '14:00',
        endTime: '22:00',
        breakMinutes: 30,
        workDays: [1, 2, 3, 4, 5, 6],
        restDays: [0],
        dailyHours: 8,
        weeklyHours: 48,
        locationId: 'loc-cedis-gdl',
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'shift-tienda',
        name: 'Turno Tienda',
        code: 'TIE-01',
        type: 'diurnal',
        startTime: '10:00',
        endTime: '19:00',
        breakMinutes: 60,
        workDays: [1, 2, 3, 4, 5, 6],
        restDays: [0],
        dailyHours: 8,
        weeklyHours: 48,
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
];

// =============================================================================
// 5. USUARIOS Y EMPLEADOS (CON JERARQUÍA)
// =============================================================================

const EMPLOYEES = [
    // === DIRECCIÓN ===
    {
        id: 'emp-director',
        uid: 'emp-director',
        fullName: 'Ricardo Mendoza García',
        email: 'ricardo.mendoza@empresa.mx',
        department: 'Dirección',
        positionTitle: 'Director General',
        positionId: 'pos-director-general',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Admin',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2015-01-15',
        directManagerId: null, // Top of hierarchy
        performanceRating: 5,
        potentialRating: 5,
    },

    // === GERENTES (Reportan a Director) ===
    {
        id: 'emp-gerente-rh',
        uid: 'emp-gerente-rh',
        fullName: 'Patricia Ramírez Luna',
        email: 'patricia.ramirez@empresa.mx',
        department: 'Recursos Humanos',
        positionTitle: 'Gerente de Recursos Humanos',
        positionId: 'pos-gerente-rh',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'HRManager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2017-03-01',
        directManagerId: 'emp-director',
        performanceRating: 4,
        potentialRating: 5,
    },
    {
        id: 'emp-gerente-ops',
        uid: 'emp-gerente-ops',
        fullName: 'Jorge Luis Hernández Vega',
        email: 'jorge.hernandez@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Gerente de Operaciones',
        positionId: 'pos-gerente-operaciones',
        locationId: 'loc-cedis-gdl',
        customShiftId: 'shift-oficina',
        role: 'Manager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2016-06-15',
        directManagerId: 'emp-director',
        performanceRating: 4,
        potentialRating: 4,
    },
    {
        id: 'emp-gerente-admin',
        uid: 'emp-gerente-admin',
        fullName: 'María Elena Torres Díaz',
        email: 'maria.torres@empresa.mx',
        department: 'Administración',
        positionTitle: 'Gerente de Administración',
        positionId: 'pos-gerente-admin',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Manager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2018-02-01',
        directManagerId: 'emp-director',
        performanceRating: 5,
        potentialRating: 4,
    },
    {
        id: 'emp-gerente-ti',
        uid: 'emp-gerente-ti',
        fullName: 'Carlos Alberto Navarro Ruiz',
        email: 'carlos.navarro@empresa.mx',
        department: 'Tecnología',
        positionTitle: 'Gerente de TI',
        positionId: 'pos-gerente-ti',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Manager',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2019-08-01',
        directManagerId: 'emp-director',
        performanceRating: 4,
        potentialRating: 5,
    },

    // === COORDINADORES/SUPERVISORES (Reportan a Gerentes) ===
    {
        id: 'emp-coord-rh',
        uid: 'emp-coord-rh',
        fullName: 'Ana Gabriela Soto Martínez',
        email: 'ana.soto@empresa.mx',
        department: 'Recursos Humanos',
        positionTitle: 'Coordinador de RH',
        positionId: 'pos-coord-rh',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2020-01-15',
        directManagerId: 'emp-gerente-rh',
        performanceRating: 4,
        potentialRating: 4,
    },
    {
        id: 'emp-super-almacen',
        uid: 'emp-super-almacen',
        fullName: 'Miguel Ángel Rojas Vargas',
        email: 'miguel.rojas@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Supervisor de Almacén',
        positionId: 'pos-super-almacen',
        locationId: 'loc-cedis-gdl',
        customShiftId: 'shift-almacen-matutino',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2019-04-01',
        directManagerId: 'emp-gerente-ops',
        performanceRating: 3,
        potentialRating: 4,
    },
    {
        id: 'emp-super-tienda',
        uid: 'emp-super-tienda',
        fullName: 'Laura Cecilia Moreno Castro',
        email: 'laura.moreno@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Supervisor de Tienda',
        positionId: 'pos-super-tienda',
        locationId: 'loc-tienda-centro',
        customShiftId: 'shift-tienda',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2021-02-01',
        directManagerId: 'emp-gerente-ops',
        performanceRating: 4,
        potentialRating: 3,
    },

    // === ANALISTAS/ESPECIALISTAS ===
    {
        id: 'emp-analista-rh',
        uid: 'emp-analista-rh',
        fullName: 'Sandra Patricia López Aguilar',
        email: 'sandra.lopez@empresa.mx',
        department: 'Recursos Humanos',
        positionTitle: 'Analista de RH',
        positionId: 'pos-analista-rh',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2022-06-01',
        directManagerId: 'emp-coord-rh',
        performanceRating: 3,
        potentialRating: 4,
    },
    {
        id: 'emp-contador',
        uid: 'emp-contador',
        fullName: 'Roberto Carlos Guzmán Pérez',
        email: 'roberto.guzman@empresa.mx',
        department: 'Administración',
        positionTitle: 'Contador',
        positionId: 'pos-contador',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2020-03-15',
        directManagerId: 'emp-gerente-admin',
        performanceRating: 4,
        potentialRating: 3,
    },
    {
        id: 'emp-desarrollador',
        uid: 'emp-desarrollador',
        fullName: 'Fernando Alejandro Cruz Ortiz',
        email: 'fernando.cruz@empresa.mx',
        department: 'Tecnología',
        positionTitle: 'Desarrollador de Software',
        positionId: 'pos-desarrollador',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2023-01-10',
        directManagerId: 'emp-gerente-ti',
        onboardingStatus: 'day_90',
        performanceRating: 3,
        potentialRating: 5,
    },

    // === OPERATIVOS ===
    {
        id: 'emp-almacenista-1',
        uid: 'emp-almacenista-1',
        fullName: 'José Manuel Ríos Delgado',
        email: 'jose.rios@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Almacenista',
        positionId: 'pos-almacenista',
        locationId: 'loc-cedis-gdl',
        customShiftId: 'shift-almacen-matutino',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2021-07-01',
        directManagerId: 'emp-super-almacen',
        performanceRating: 3,
        potentialRating: 3,
    },
    {
        id: 'emp-almacenista-2',
        uid: 'emp-almacenista-2',
        fullName: 'Pedro Enrique Vázquez Flores',
        email: 'pedro.vazquez@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Almacenista',
        positionId: 'pos-almacenista',
        locationId: 'loc-cedis-gdl',
        customShiftId: 'shift-almacen-vespertino',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'mixed',
        hireDate: '2022-03-15',
        directManagerId: 'emp-super-almacen',
        performanceRating: 2,
        potentialRating: 3,
    },
    {
        id: 'emp-vendedor-1',
        uid: 'emp-vendedor-1',
        fullName: 'Daniela Fernanda Jiménez Ruiz',
        email: 'daniela.jimenez@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Vendedor',
        positionId: 'pos-vendedor',
        locationId: 'loc-tienda-centro',
        customShiftId: 'shift-tienda',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2023-02-01',
        directManagerId: 'emp-super-tienda',
        onboardingStatus: 'day_60',
        performanceRating: 3,
        potentialRating: 4,
    },
    {
        id: 'emp-vendedor-2',
        uid: 'emp-vendedor-2',
        fullName: 'Andrés Felipe Salazar Mendoza',
        email: 'andres.salazar@empresa.mx',
        department: 'Operaciones',
        positionTitle: 'Vendedor',
        positionId: 'pos-vendedor',
        locationId: 'loc-tienda-centro',
        customShiftId: 'shift-tienda',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2022-09-01',
        directManagerId: 'emp-super-tienda',
        performanceRating: 4,
        potentialRating: 3,
    },
    {
        id: 'emp-auxiliar',
        uid: 'emp-auxiliar',
        fullName: 'Gabriela Ivonne Estrada Luna',
        email: 'gabriela.estrada@empresa.mx',
        department: 'Administración',
        positionTitle: 'Auxiliar Administrativo',
        positionId: 'pos-auxiliar-admin',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2023-04-01',
        directManagerId: 'emp-gerente-admin',
        onboardingStatus: 'day_30',
        performanceRating: 3,
        potentialRating: 4,
    },
    {
        id: 'emp-recepcion',
        uid: 'emp-recepcion',
        fullName: 'Mariana Guadalupe Ortega Sánchez',
        email: 'mariana.ortega@empresa.mx',
        department: 'Administración',
        positionTitle: 'Recepcionista',
        positionId: 'pos-recepcion',
        locationId: 'loc-corporativo-gdl',
        customShiftId: 'shift-oficina',
        role: 'Member',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2021-11-15',
        directManagerId: 'emp-gerente-admin',
        performanceRating: 4,
        potentialRating: 3,
    },
];

// =============================================================================
// 6. PLANTILLAS DE WORKFLOW
// =============================================================================

const TEMPLATES = [
    // Solicitud de Vacaciones
    {
        id: 'tpl-vacaciones',
        name: 'Solicitud de Vacaciones',
        description: 'Proceso para solicitar días de vacaciones con aprobación del jefe directo y RH.',
        fields: [
            { id: 'fecha_inicio', label: 'Fecha de Inicio', type: 'date', required: true },
            { id: 'fecha_fin', label: 'Fecha de Fin', type: 'date', required: true },
            { id: 'dias_totales', label: 'Días Totales', type: 'number', readOnly: true },
            { id: 'motivo', label: 'Motivo', type: 'textarea', placeholder: 'Describa el motivo de sus vacaciones...' },
            { id: 'contacto_emergencia', label: 'Contacto de Emergencia', type: 'text' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 48, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-2', name: 'Validación RH', type: 'task', assigneeRole: 'HRManager', slaHours: 24 },
        ],
        rules: [],
    },
    // Solicitud de Reembolso
    {
        id: 'tpl-reembolso',
        name: 'Solicitud de Reembolso',
        description: 'Proceso para solicitar reembolso de gastos con comprobantes.',
        fields: [
            { id: 'tipo_gasto', label: 'Tipo de Gasto', type: 'select', options: ['Transporte', 'Alimentación', 'Hospedaje', 'Material de Oficina', 'Otro'], required: true },
            { id: 'monto', label: 'Monto Total (MXN)', type: 'number', required: true },
            { id: 'fecha_gasto', label: 'Fecha del Gasto', type: 'date', required: true },
            { id: 'descripcion', label: 'Descripción', type: 'textarea', required: true },
            { id: 'comprobantes', label: 'Comprobantes', type: 'file' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 72, outcomes: ['Aprobar', 'Rechazar', 'Solicitar más información'] },
            { id: 'step-2', name: 'Revisión Contabilidad', type: 'task', assigneeRole: 'Admin', slaHours: 48 },
        ],
        rules: [],
    },
    // Permiso de Ausencia
    {
        id: 'tpl-permiso-ausencia',
        name: 'Permiso de Ausencia',
        description: 'Solicitud de permiso para ausencia justificada (cita médica, trámite personal, etc.).',
        fields: [
            { id: 'tipo_permiso', label: 'Tipo de Permiso', type: 'select', options: ['Cita Médica', 'Trámite Personal', 'Asunto Familiar', 'Otro'], required: true },
            { id: 'fecha', label: 'Fecha', type: 'date', required: true },
            { id: 'hora_salida', label: 'Hora de Salida', type: 'text', placeholder: 'Ej: 10:00' },
            { id: 'hora_regreso', label: 'Hora de Regreso', type: 'text', placeholder: 'Ej: 14:00' },
            { id: 'justificacion', label: 'Justificación', type: 'textarea', required: true },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Directo', type: 'task', assigneeRole: 'Manager', slaHours: 24, outcomes: ['Aprobar', 'Rechazar'] },
        ],
        rules: [],
    },
    // Alta de Proveedor
    {
        id: 'tpl-alta-proveedor',
        name: 'Alta de Proveedor',
        description: 'Proceso para dar de alta un nuevo proveedor en el sistema.',
        fields: [
            { id: 'razon_social', label: 'Razón Social', type: 'text', required: true },
            { id: 'rfc', label: 'RFC', type: 'text', required: true },
            { id: 'direccion', label: 'Dirección Fiscal', type: 'textarea', required: true },
            { id: 'contacto_nombre', label: 'Nombre de Contacto', type: 'text', required: true },
            { id: 'contacto_email', label: 'Email de Contacto', type: 'email', required: true },
            { id: 'contacto_telefono', label: 'Teléfono', type: 'text' },
            { id: 'tipo_servicio', label: 'Tipo de Servicio', type: 'select', options: ['Materiales', 'Servicios', 'Logística', 'Tecnología', 'Otro'], required: true },
        ],
        steps: [
            { id: 'step-1', name: 'Revisión Compras', type: 'task', assigneeRole: 'Member', slaHours: 48 },
            { id: 'step-2', name: 'Aprobación Gerente', type: 'task', assigneeRole: 'Manager', slaHours: 72, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-3', name: 'Registro en Sistema', type: 'task', assigneeRole: 'Admin', slaHours: 24 },
        ],
        rules: [],
    },
    // Requisición de Compra
    {
        id: 'tpl-requisicion',
        name: 'Requisición de Compra',
        description: 'Solicitud de compra de materiales o servicios.',
        fields: [
            { id: 'departamento', label: 'Departamento Solicitante', type: 'select', options: ['Operaciones', 'Administración', 'Recursos Humanos', 'Tecnología', 'Dirección'], required: true },
            { id: 'descripcion_items', label: 'Descripción de lo Solicitado', type: 'textarea', required: true },
            { id: 'cantidad', label: 'Cantidad', type: 'number', required: true },
            { id: 'urgencia', label: 'Urgencia', type: 'select', options: ['Baja', 'Media', 'Alta', 'Crítica'], required: true },
            { id: 'justificacion', label: 'Justificación', type: 'textarea', required: true },
            { id: 'proveedor_sugerido', label: 'Proveedor Sugerido (opcional)', type: 'text' },
        ],
        steps: [
            { id: 'step-1', name: 'Aprobación Jefe Área', type: 'task', assigneeRole: 'Manager', slaHours: 48, outcomes: ['Aprobar', 'Rechazar'] },
            { id: 'step-2', name: 'Cotización Compras', type: 'task', assigneeRole: 'Member', slaHours: 72 },
            { id: 'step-3', name: 'Aprobación Final', type: 'task', assigneeRole: 'Admin', slaHours: 48, outcomes: ['Autorizar', 'Rechazar'] },
        ],
        rules: [],
    },
];

// =============================================================================
// 7. INCIDENCIAS DE EJEMPLO
// =============================================================================

// Calculate dates relative to NOW for sample incidences
const today = new Date();
const formatDate = (d: Date) => d.toISOString().split('T')[0];

const SAMPLE_INCIDENCES = [
    // Pendiente - Vacaciones
    {
        id: 'inc-pending-vacation-1',
        employeeId: 'emp-desarrollador',
        employeeName: 'Luis Mendoza García',
        type: 'vacation',
        startDate: formatDate(new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)), // +14 days
        endDate: formatDate(new Date(today.getTime() + 18 * 24 * 60 * 60 * 1000)), // +18 days
        totalDays: 5,
        isPaid: true,
        status: 'pending',
        notes: 'Vacaciones familiares programadas',
        createdAt: NOW,
        updatedAt: NOW,
    },
    // Pendiente - Permiso Personal
    {
        id: 'inc-pending-personal-1',
        employeeId: 'emp-vendedor-1',
        employeeName: 'Carmen Morales López',
        type: 'personal_leave',
        startDate: formatDate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)), // +7 days
        endDate: formatDate(new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)), // +7 days
        totalDays: 1,
        isPaid: false,
        status: 'pending',
        notes: 'Cita médica',
        createdAt: NOW,
        updatedAt: NOW,
    },
    // Aprobada - Vacaciones
    {
        id: 'inc-approved-vacation-1',
        employeeId: 'emp-analista-rh',
        employeeName: 'Andrea Romero Sánchez',
        type: 'vacation',
        startDate: formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)), // -7 days
        endDate: formatDate(new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000)), // -3 days
        totalDays: 5,
        isPaid: true,
        status: 'approved',
        approvedById: 'emp-coord-rh',
        approvedByName: 'Elena Vargas Mendoza',
        approvedAt: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Viaje familiar',
        createdAt: new Date(today.getTime() - 21 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(today.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // Aprobada - Incapacidad
    {
        id: 'inc-approved-sick-1',
        employeeId: 'emp-almacenista-1',
        employeeName: 'Pedro García Hernández',
        type: 'sick_leave',
        startDate: formatDate(new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000)), // -10 days
        endDate: formatDate(new Date(today.getTime() - 8 * 24 * 60 * 60 * 1000)), // -8 days
        totalDays: 3,
        isPaid: true,
        status: 'approved',
        approvedById: 'emp-super-almacen',
        approvedByName: 'Roberto Díaz Villa',
        approvedAt: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        notes: 'Incapacidad por enfermedad respiratoria',
        createdAt: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // Rechazada - Vacaciones
    {
        id: 'inc-rejected-vacation-1',
        employeeId: 'emp-contador',
        employeeName: 'Ricardo Flores Torres',
        type: 'vacation',
        startDate: formatDate(new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000)), // +3 days
        endDate: formatDate(new Date(today.getTime() + 10 * 24 * 60 * 60 * 1000)), // +10 days
        totalDays: 8,
        isPaid: true,
        status: 'rejected',
        approvedById: 'emp-gerente-admin',
        approvedByName: 'Fernando Gutiérrez Ramos',
        approvedAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        rejectionReason: 'Coincide con cierre fiscal mensual. Favor de reprogramar para la siguiente semana.',
        notes: 'Vacaciones de descanso',
        createdAt: new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    // Pendiente - Vacaciones (Gerente)
    {
        id: 'inc-pending-vacation-2',
        employeeId: 'emp-gerente-ti',
        employeeName: 'Carlos Ramírez Ortiz',
        type: 'vacation',
        startDate: formatDate(new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000)), // +30 days
        endDate: formatDate(new Date(today.getTime() + 37 * 24 * 60 * 60 * 1000)), // +37 days
        totalDays: 8,
        isPaid: true,
        status: 'pending',
        notes: 'Vacaciones anuales programadas',
        createdAt: NOW,
        updatedAt: NOW,
    },
];

// =============================================================================
// 8. LISTAS MAESTRAS (MASTER LISTS)
// =============================================================================

const MASTER_LISTS = [
    {
        id: 'ml-incidence-types',
        name: 'Tipos de Incidencia',
        description: 'Catálogo de tipos de incidencia para solicitudes',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'isPaid', label: 'Con Goce', type: 'boolean' },
            { id: 'maxDays', label: 'Días Máximos', type: 'number' }
        ],
        primaryKey: 'id',
        createdAt: NOW,
        updatedAt: NOW
    },
    {
        id: 'ml-expense-categories',
        name: 'Categorías de Gasto',
        description: 'Categorías para solicitudes de reembolso',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'requiresReceipt', label: 'Requiere Factura', type: 'boolean' },
            { id: 'maxAmount', label: 'Monto Máximo', type: 'number' }
        ],
        primaryKey: 'id',
        createdAt: NOW,
        updatedAt: NOW
    },
    {
        id: 'ml-document-types',
        name: 'Tipos de Documento',
        description: 'Catálogo de documentos para expediente digital',
        fields: [
            { id: 'id', label: 'ID', type: 'text' },
            { id: 'name', label: 'Nombre', type: 'text' },
            { id: 'required', label: 'Obligatorio', type: 'boolean' }
        ],
        primaryKey: 'id',
        createdAt: NOW,
        updatedAt: NOW
    }
];

const INCIDENCE_TYPE_ITEMS = [
    { id: 'vacation', name: 'Vacaciones', isPaid: true, maxDays: 40 },
    { id: 'sick_leave', name: 'Incapacidad', isPaid: true, maxDays: 365 },
    { id: 'personal_leave', name: 'Permiso Personal', isPaid: false, maxDays: 3 },
    { id: 'maternity', name: 'Maternidad', isPaid: true, maxDays: 84 },
    { id: 'paternity', name: 'Paternidad', isPaid: true, maxDays: 5 },
    { id: 'bereavement', name: 'Duelo', isPaid: true, maxDays: 3 },
    { id: 'unjustified_absence', name: 'Falta Injustificada', isPaid: false, maxDays: 1 }
];

const EXPENSE_CATEGORY_ITEMS = [
    { id: 'transport', name: 'Transporte', requiresReceipt: false, maxAmount: 5000 },
    { id: 'food', name: 'Alimentación', requiresReceipt: true, maxAmount: 1500 },
    { id: 'lodging', name: 'Hospedaje', requiresReceipt: true, maxAmount: 5000 },
    { id: 'supplies', name: 'Insumos', requiresReceipt: true, maxAmount: 3000 },
    { id: 'services', name: 'Servicios', requiresReceipt: true, maxAmount: 10000 },
    { id: 'other', name: 'Otros', requiresReceipt: true, maxAmount: 2000 }
];

const DOCUMENT_TYPE_ITEMS = [
    { id: 'ine', name: 'INE / IFE', required: true },
    { id: 'curp', name: 'CURP', required: true },
    { id: 'rfc', name: 'Constancia RFC', required: true },
    { id: 'nss', name: 'Número de Seguro Social', required: true },
    { id: 'comprobante_domicilio', name: 'Comprobante de Domicilio', required: true },
    { id: 'acta_nacimiento', name: 'Acta de Nacimiento', required: false },
    { id: 'comprobante_estudios', name: 'Comprobante de Estudios', required: false },
    { id: 'carta_recomendacion', name: 'Carta de Recomendación', required: false },
    { id: 'contrato_firmado', name: 'Contrato Firmado', required: true },
    { id: 'estado_cuenta', name: 'Estado de Cuenta Bancario', required: true }
];

// =============================================================================
// 9. HELPER FUNCTIONS FOR DATA GENERATION
// =============================================================================

function subtractDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() - days);
    return result;
}

function calculateYearsOfService(hireDate: string): number {
    const hire = new Date(hireDate);
    const now = new Date();
    let years = now.getFullYear() - hire.getFullYear();
    const monthDiff = now.getMonth() - hire.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < hire.getDate())) {
        years--;
    }
    return Math.max(0, years);
}

function calculateVacationDaysLFT(yearsOfService: number): number {
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

// Salary ranges by position level
const SALARY_RANGES: Record<number, { min: number; max: number }> = {
    1: { min: 4500, max: 6000 },   // Director
    2: { min: 2500, max: 3500 },   // Gerente
    3: { min: 1200, max: 1800 },   // Coordinador/Supervisor
    4: { min: 800, max: 1200 },    // Analista/Especialista
    5: { min: 450, max: 700 },     // Operativo
};

function getPositionLevel(positionId: string): number {
    const pos = POSITIONS.find(p => p.id === positionId);
    return pos?.level || 5;
}

function generateCompensation(emp: typeof EMPLOYEES[0]) {
    const level = getPositionLevel(emp.positionId);
    const range = SALARY_RANGES[level] || SALARY_RANGES[5];
    const salaryDaily = Math.round((range.min + range.max) / 2);
    const yearsOfService = calculateYearsOfService(emp.hireDate);
    const vacationDays = calculateVacationDaysLFT(yearsOfService);
    const sdiFactor = calculateSDIFactor(vacationDays);
    const sdiBase = Math.round(salaryDaily * sdiFactor * 100) / 100;

    return {
        id: `comp-${emp.id}`,
        employeeId: emp.id,
        salaryDaily,
        salaryMonthly: salaryDaily * 30,
        sdiBase,
        sdiFactor,
        vacationDays,
        vacationPremium: 0.25,
        aguinaldoDays: 15,
        savingsFundPercentage: 0.13,
        foodVouchersDaily: level <= 3 ? 100 : 0,
        effectiveDate: emp.hireDate,
        createdAt: NOW,
        updatedAt: NOW,
        createdById: 'system'
    };
}

function generateAttendanceRecords(emp: typeof EMPLOYEES[0]): any[] {
    const records: any[] = [];
    const shift = SHIFTS.find(s => s.id === emp.customShiftId) || SHIFTS[0];
    const dailyHours = shift.dailyHours || 8;

    // Generate 2 weeks of attendance (10 work days)
    for (let i = 14; i >= 1; i--) {
        const date = subtractDays(new Date(), i);
        const dayOfWeek = date.getDay();

        // Skip rest days based on shift
        if (shift.restDays?.includes(dayOfWeek)) continue;

        // Random variations
        const isLate = Math.random() > 0.85; // 15% late
        const hasOvertime = Math.random() > 0.75; // 25% overtime
        const overtimeHours = hasOvertime ? Math.floor(Math.random() * 3) + 1 : 0;

        const checkInMinutes = isLate ? Math.floor(Math.random() * 20) + 5 : 0;
        const [startHour, startMin] = shift.startTime.split(':').map(Number);
        const checkInHour = startHour + Math.floor((startMin + checkInMinutes) / 60);
        const checkInMinute = (startMin + checkInMinutes) % 60;

        const [endHour] = shift.endTime.split(':').map(Number);
        const checkOutHour = endHour + overtimeHours;

        records.push({
            id: `att-${emp.id}-${formatDate(date)}`,
            employeeId: emp.id,
            employeeName: emp.fullName,
            date: formatDate(date),
            checkIn: `${checkInHour.toString().padStart(2, '0')}:${checkInMinute.toString().padStart(2, '0')}:00`,
            checkOut: `${checkOutHour.toString().padStart(2, '0')}:00:00`,
            hoursWorked: dailyHours + overtimeHours - (checkInMinutes > 15 ? 0.5 : 0),
            regularHours: dailyHours,
            overtimeHours,
            overtimeType: overtimeHours > 0 ? 'double' : null,
            isLate,
            minutesLate: isLate ? checkInMinutes : 0,
            isValid: true,
            shiftId: emp.customShiftId,
            locationId: emp.locationId,
            createdAt: date.toISOString(),
            updatedAt: date.toISOString()
        });
    }

    return records;
}

// =============================================================================
// MAIN SEEDING FUNCTION
// =============================================================================

async function seedDatabase() {
    console.log('🌱 Iniciando proceso de Seed de Base de Datos...\n');

    try {
        // 1. Crear Roles
        console.log('📋 Creando Roles y Permisos...');
        for (const role of ROLES) {
            await db.collection('roles').doc(role.id).set(role);
        }
        console.log(`   ✅ ${ROLES.length} roles creados\n`);

        // 2. Crear Ubicaciones
        console.log('📍 Creando Ubicaciones...');
        for (const loc of LOCATIONS) {
            await db.collection('locations').doc(loc.id).set(loc);
        }
        console.log(`   ✅ ${LOCATIONS.length} ubicaciones creadas\n`);

        // 2.5 Crear Departamentos
        console.log('🏢 Creando Departamentos...');
        for (const dept of DEPARTMENTS) {
            await db.collection('departments').doc(dept.id).set(dept);
        }
        console.log(`   ✅ ${DEPARTMENTS.length} departamentos creados\n`);

        // 3. Crear Puestos
        console.log('💼 Creando Puestos...');
        for (const pos of POSITIONS) {
            await db.collection('positions').doc(pos.id).set(pos);
        }
        console.log(`   ✅ ${POSITIONS.length} puestos creados\n`);

        // 4. Crear Turnos
        console.log('⏰ Creando Turnos...');
        for (const shift of SHIFTS) {
            await db.collection('shifts').doc(shift.id).set(shift);
        }
        console.log(`   ✅ ${SHIFTS.length} turnos creados\n`);

        // 5. Crear Usuarios y Empleados
        console.log('👥 Creando Usuarios y Empleados...');
        for (const emp of EMPLOYEES) {
            // Safely create auth user (handles existing users)
            await safeCreateAuthUser(emp.uid, emp.email, emp.fullName);

            // Create User document
            await db.collection('users').doc(emp.uid).set({
                id: emp.uid,
                fullName: emp.fullName,
                email: emp.email,
                department: emp.department,
                role: emp.role,
                status: emp.status,
                managerId: emp.directManagerId || null,
                createdAt: NOW,
            });

            // Create Employee document
            await db.collection('employees').doc(emp.id).set({
                ...emp,
                createdAt: NOW,
                updatedAt: NOW,
            });
        }
        console.log(`   ✅ ${EMPLOYEES.length} usuarios/empleados creados\n`);

        // 5.5 Crear Saldos de Vacaciones
        console.log('🌴 Creando Saldos de Vacaciones...');
        let vacationBalanceCount = 0;
        for (const emp of EMPLOYEES) {
            const hireDate = new Date(emp.hireDate);
            const now = new Date();
            const yearsOfService = Math.floor((now.getTime() - hireDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));

            // Calculate vacation days according to LFT 2023 reform
            let vacationDays = 12; // Base for first year
            if (yearsOfService >= 1 && yearsOfService <= 5) {
                // Years 1-5: 12 + 2 per year after first
                vacationDays = 12 + (yearsOfService - 1) * 2;
            } else if (yearsOfService >= 6 && yearsOfService <= 10) {
                // Years 6-10: 22 days
                vacationDays = 22;
            } else if (yearsOfService >= 11 && yearsOfService <= 15) {
                // Years 11-15: 24 days
                vacationDays = 24;
            } else if (yearsOfService >= 16 && yearsOfService <= 20) {
                // Years 16-20: 26 days
                vacationDays = 26;
            } else if (yearsOfService >= 21) {
                // 21+ years: 28-40 days (capped at 40)
                vacationDays = Math.min(28 + Math.floor((yearsOfService - 21) / 5) * 2, 40);
            }

            const periodStart = new Date(now.getFullYear(), hireDate.getMonth(), hireDate.getDate());
            if (periodStart > now) {
                periodStart.setFullYear(periodStart.getFullYear() - 1);
            }
            const periodEnd = new Date(periodStart);
            periodEnd.setFullYear(periodEnd.getFullYear() + 1);
            periodEnd.setDate(periodEnd.getDate() - 1);

            const balanceId = `vb-${emp.id}`;
            const vacationBalance = {
                id: balanceId,
                employeeId: emp.id,
                periodStart: periodStart.toISOString().split('T')[0],
                periodEnd: periodEnd.toISOString().split('T')[0],
                daysEntitled: vacationDays,
                yearsOfService: yearsOfService,
                daysTaken: 0,
                daysScheduled: 0,
                daysAvailable: vacationDays,
                vacationPremiumPaid: false,
                movements: [{
                    id: 'mov-initial',
                    date: NOW,
                    type: 'reset',
                    days: vacationDays,
                    description: `Saldo inicial - ${yearsOfService} años de antigüedad`,
                }],
                lastUpdated: NOW,
                createdAt: NOW,
            };

            await db.collection('vacation_balances').doc(balanceId).set(vacationBalance);
            vacationBalanceCount++;
        }
        console.log(`   ✅ ${vacationBalanceCount} saldos de vacaciones creados\n`);

        // 6. Crear Plantillas
        console.log('📄 Creando Plantillas de Workflow...');
        for (const tpl of TEMPLATES) {
            await db.collection('request_templates').doc(tpl.id).set(tpl);
        }
        console.log(`   ✅ ${TEMPLATES.length} plantillas creadas\n`);

        // 6.5 Crear Incidencias de Ejemplo
        console.log('📋 Creando Incidencias de Ejemplo...');
        for (const inc of SAMPLE_INCIDENCES) {
            await db.collection('incidences').doc(inc.id).set(inc);
        }
        console.log(`   ✅ ${SAMPLE_INCIDENCES.length} incidencias de ejemplo creadas\n`);

        // 7. Crear Listas Maestras con Items
        console.log('📚 Creando Listas Maestras...');
        for (const ml of MASTER_LISTS) {
            await db.collection('master_lists').doc(ml.id).set(ml);
        }
        // Add items to incidence types list
        for (const item of INCIDENCE_TYPE_ITEMS) {
            await db.collection('master_lists').doc('ml-incidence-types')
                .collection('items').doc(item.id).set(item);
        }
        // Add items to expense categories list
        for (const item of EXPENSE_CATEGORY_ITEMS) {
            await db.collection('master_lists').doc('ml-expense-categories')
                .collection('items').doc(item.id).set(item);
        }
        // Add items to document types list
        for (const item of DOCUMENT_TYPE_ITEMS) {
            await db.collection('master_lists').doc('ml-document-types')
                .collection('items').doc(item.id).set(item);
        }
        const totalItems = INCIDENCE_TYPE_ITEMS.length + EXPENSE_CATEGORY_ITEMS.length + DOCUMENT_TYPE_ITEMS.length;
        console.log(`   ✅ ${MASTER_LISTS.length} listas maestras con ${totalItems} items creadas\n`);

        // 8. Crear Registros de Compensación
        console.log('💰 Creando Registros de Compensación...');
        let compensationCount = 0;
        for (const emp of EMPLOYEES) {
            const comp = generateCompensation(emp);
            await db.collection('compensation').doc(comp.id).set(comp);
            compensationCount++;
        }
        console.log(`   ✅ ${compensationCount} registros de compensación creados\n`);

        // 9. Crear Registros de Asistencia y Gestión de Equipo
        console.log('📅 Creando Registros de Asistencia y Gestión de Equipo...');
        let attendanceCount = 0;
        let tardinessCount = 0;
        let departureCount = 0;
        let overtimeCount = 0;

        for (const emp of EMPLOYEES) {
            const records = generateAttendanceRecords(emp);

            // Managers who needs specific issues for testing
            const targetManagers = [
                'emp-gerente-ti', // Carlos Alberto Navarro Ruiz
                'emp-gerente-ops', // Jorge Luis Hernández Vega
                'emp-gerente-admin', // María Elena Torres Díaz
                'emp-gerente-rh' // Patricia Ramírez Luna
            ];

            const isTarget = targetManagers.includes(emp.id);

            for (const rec of records) {
                // Force issues for target managers on some days
                if (isTarget) {
                    const random = Math.random();
                    // 30% chance of being modified if not already late/overtime
                    if (random > 0.7) {
                        if (!rec.isLate && random > 0.8) {
                            rec.isLate = true;
                            rec.minutesLate = Math.floor(Math.random() * 45) + 15; // 15-60 min late
                            rec.checkIn = '09:45:00'; // Approximate
                        }
                        if (random > 0.9) {
                            rec.overtimeHours = 2;
                            rec.overtimeType = 'double';
                            rec.checkOut = '20:00:00';
                        }
                    }
                }

                await db.collection('attendance').doc(rec.id).set(rec);
                attendanceCount++;

                // 9.1 Tardiness Records
                if (rec.isLate && rec.minutesLate > 0) {
                    const tardinessId = `tard-${rec.id}`;
                    await db.collection('tardiness_records').doc(tardinessId).set({
                        id: tardinessId,
                        employeeId: rec.employeeId,
                        employeeName: rec.employeeName, // Including name for display
                        date: rec.date,
                        scheduledTime: rec.checkIn.split(':').map((v: any, i: number) => i === 1 ? (parseInt(v) - Math.floor(rec.minutesLate % 60)).toString().padStart(2, '0') : v).join(':'), // Approximate
                        actualTime: rec.checkIn,
                        minutesLate: rec.minutesLate,
                        isJustified: false,
                        createdAt: rec.createdAt,
                        updatedAt: rec.updatedAt
                    });
                    tardinessCount++;
                }

                // 9.2 Early Departure Records (simulate based on random chance or checkOut time)
                // If checkOut is before shift end (e.g., 18:00)
                // For simulation allow some early departures
                if (Math.random() > 0.95 || (isTarget && Math.random() > 0.85)) {
                    // Force an early departure
                    const departureId = `dep-${rec.id}`;
                    const minutesEarly = Math.floor(Math.random() * 60) + 15;
                    const scheduledEnd = '18:00';
                    const actualEnd = '17:00'; // Simplified

                    await db.collection('early_departures').doc(departureId).set({
                        id: departureId,
                        employeeId: rec.employeeId,
                        employeeName: rec.employeeName,
                        date: rec.date,
                        scheduledEndTime: scheduledEnd,
                        actualEndTime: actualEnd,
                        minutesEarly: minutesEarly,
                        isJustified: false,
                        createdAt: rec.createdAt,
                        updatedAt: rec.updatedAt
                    });
                    departureCount++;
                }

                // 9.3 Overtime Requests
                if (rec.overtimeHours > 0) {
                    const overtimeId = `ot-${rec.id}`;
                    // Approve some requests (approx 20%) to test flows
                    const isApproved = isTarget && Math.random() > 0.8;

                    await db.collection('overtime_requests').doc(overtimeId).set({
                        id: overtimeId,
                        employeeId: rec.employeeId,
                        employeeName: rec.employeeName,
                        date: rec.date,
                        hoursRequested: rec.overtimeHours,
                        reason: 'Cierre de mes y proyectos urgentes',
                        status: isApproved ? 'approved' : 'pending',
                        hoursApproved: isApproved ? rec.overtimeHours : null,
                        doubleHours: isApproved ? rec.overtimeHours : null,
                        tripleHours: isApproved ? 0 : null,
                        paymentMethod: 'paid',
                        approvedBy: isApproved ? 'emp-director' : null,
                        approvedAt: isApproved ? rec.updatedAt : null,
                        createdAt: rec.createdAt,
                        updatedAt: rec.updatedAt
                    });
                    overtimeCount++;
                }
            }
        }

        // 9.5 Crear Bolsas de Horas (Hour Banks)
        console.log('⏳ Creando Bolsas de Horas...');
        let hourBankCount = 0;
        for (const emp of EMPLOYEES) {
            // Mock random balance for managers
            const isManager = emp.role === 'Manager' || emp.role === 'HRManager';
            const balance = isManager ? Math.floor(Math.random() * 600) - 300 : 0; // -300 to +300 mins

            const hourBank: any = {
                id: emp.id,
                employeeId: emp.id,
                employeeName: emp.fullName,
                balanceMinutes: balance,
                totalDebtAccumulated: balance > 0 ? balance : 0,
                totalCompensated: 0,
                createdAt: NOW,
                updatedAt: NOW
            };

            await db.collection('hour_banks').doc(emp.id).set(hourBank);
            hourBankCount++;
        }
        console.log(`   ✅ ${hourBankCount} bolsas de horas creadas`);
        console.log(`   ✅ ${attendanceCount} registros de asistencia creados`);
        console.log(`   ✅ ${tardinessCount} registros de retardos creados`);
        console.log(`   ✅ ${departureCount} registros de salidas tempranas creados`);
        console.log(`   ✅ ${overtimeCount} solicitudes de horas extras creadas\n`);

        // 10. Create Admin Test User
        console.log('👤 Creando Usuario Administrador de Prueba...');
        const ADMIN_UID = 'admin-user';
        await safeCreateAuthUser(ADMIN_UID, 'admin@stuffactory.mx', 'Administrador Sistema');
        await db.collection('users').doc(ADMIN_UID).set({
            id: ADMIN_UID,
            fullName: 'Administrador Sistema',
            email: 'admin@stuffactory.mx',
            department: 'Tecnología',
            role: 'Admin',
            status: 'active',
            createdAt: NOW,
        });
        console.log('   ✅ Usuario admin@stuffactory.mx creado\n');

        // Summary
        console.log('═══════════════════════════════════════════════════════════');
        console.log('🎉 ¡SEED COMPLETADO EXITOSAMENTE!');
        console.log('═══════════════════════════════════════════════════════════');
        console.log('\n📊 RESUMEN:');
        console.log(`   • Roles:         ${ROLES.length}`);
        console.log(`   • Ubicaciones:   ${LOCATIONS.length}`);
        console.log(`   • Departamentos: ${DEPARTMENTS.length}`);
        console.log(`   • Puestos:       ${POSITIONS.length}`);
        console.log(`   • Turnos:        ${SHIFTS.length}`);
        console.log(`   • Empleados:     ${EMPLOYEES.length}`);
        console.log(`   • Vacaciones:    ${vacationBalanceCount} saldos`);
        console.log(`   • Incidencias:   ${SAMPLE_INCIDENCES.length}`);
        console.log(`   • Plantillas:    ${TEMPLATES.length}`);
        console.log(`   • Listas Maestras: ${MASTER_LISTS.length} (con ${totalItems} items)`);
        console.log(`   • Compensación:  ${compensationCount} registros`);
        console.log(`   • Asistencia:    ${attendanceCount} registros`);
        console.log('\n🔐 CREDENCIALES:');
        console.log('   Email: admin@stuffactory.mx');
        console.log('   (Use Firebase Auth Emulator para login)\n');
        console.log('📊 JERARQUÍA ORGANIZACIONAL:');
        console.log('   Director General');
        console.log('   └── Gerente RH');
        console.log('   │   └── Coordinador RH');
        console.log('   │       └── Analista RH');
        console.log('   └── Gerente Operaciones');
        console.log('   │   └── Supervisor Almacén');
        console.log('   │   │   └── Almacenistas (2)');
        console.log('   │   └── Supervisor Tienda');
        console.log('   │       └── Vendedores (2)');
        console.log('   └── Gerente Administración');
        console.log('   │   └── Contador');
        console.log('   │   └── Auxiliar Administrativo');
        console.log('   │   └── Recepcionista');
        console.log('   └── Gerente TI');
        console.log('       └── Desarrollador');
        console.log('\n');

        process.exit(0);
    } catch (error) {
        console.error('❌ Error en seed:', error);
        process.exit(1);
    }
}

seedDatabase();
