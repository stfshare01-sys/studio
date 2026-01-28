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
// 3. PUESTOS (POSITIONS)
// =============================================================================

const POSITIONS = [
    // Dirección
    { id: 'pos-director-general', name: 'Director General', code: 'DG-001', department: 'Dirección', level: 1, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },

    // Gerencias
    { id: 'pos-gerente-rh', name: 'Gerente de Recursos Humanos', code: 'GRH-001', department: 'Recursos Humanos', level: 2, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-gerente-operaciones', name: 'Gerente de Operaciones', code: 'GOP-001', department: 'Operaciones', level: 2, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-gerente-admin', name: 'Gerente de Administración', code: 'GAD-001', department: 'Administración', level: 2, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-gerente-ti', name: 'Gerente de TI', code: 'GTI-001', department: 'Tecnología', level: 2, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },

    // Supervisores/Coordinadores
    { id: 'pos-coord-rh', name: 'Coordinador de RH', code: 'CRH-001', department: 'Recursos Humanos', level: 3, canApproveOvertime: false, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-super-almacen', name: 'Supervisor de Almacén', code: 'SAL-001', department: 'Operaciones', level: 3, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-super-tienda', name: 'Supervisor de Tienda', code: 'STI-001', department: 'Operaciones', level: 3, canApproveOvertime: true, canApproveIncidences: true, isActive: true, createdAt: NOW, updatedAt: NOW },

    // Analistas/Especialistas
    { id: 'pos-analista-rh', name: 'Analista de RH', code: 'ARH-001', department: 'Recursos Humanos', level: 4, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-contador', name: 'Contador', code: 'CNT-001', department: 'Administración', level: 4, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-desarrollador', name: 'Desarrollador de Software', code: 'DEV-001', department: 'Tecnología', level: 4, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },

    // Operativos
    { id: 'pos-almacenista', name: 'Almacenista', code: 'ALM-001', department: 'Operaciones', level: 5, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-vendedor', name: 'Vendedor', code: 'VEN-001', department: 'Operaciones', level: 5, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-auxiliar-admin', name: 'Auxiliar Administrativo', code: 'AUX-001', department: 'Administración', level: 5, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
    { id: 'pos-recepcion', name: 'Recepcionista', code: 'REC-001', department: 'Administración', level: 5, canApproveOvertime: false, canApproveIncidences: false, isActive: true, createdAt: NOW, updatedAt: NOW },
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

        // 3. Crear Puestos
        console.log('💼 Creando Puestos...');
        for (const pos of POSITIONS) {
            await db.collection('positions').doc(pos.id).set(pos);
        }
        console.log(`   ✅ ${POSITIONS.length} puestos creados\n`);

        // 4. Crear Turnos
        console.log('⏰ Creando Turnos...');
        for (const shift of SHIFTS) {
            await db.collection('custom_shifts').doc(shift.id).set(shift);
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

        // 6. Crear Plantillas
        console.log('📄 Creando Plantillas de Workflow...');
        for (const tpl of TEMPLATES) {
            await db.collection('templates').doc(tpl.id).set(tpl);
        }
        console.log(`   ✅ ${TEMPLATES.length} plantillas creadas\n`);

        // 7. Create Admin Test User
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
        console.log(`   • Roles:       ${ROLES.length}`);
        console.log(`   • Ubicaciones: ${LOCATIONS.length}`);
        console.log(`   • Puestos:     ${POSITIONS.length}`);
        console.log(`   • Turnos:      ${SHIFTS.length}`);
        console.log(`   • Empleados:   ${EMPLOYEES.length}`);
        console.log(`   • Plantillas:  ${TEMPLATES.length}`);
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
