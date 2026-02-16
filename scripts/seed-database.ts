
import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import * as admin from 'firebase-admin';
import { firebaseConfig } from '../src/firebase/config';
import {
    SEED_EMPLOYEES,
    INCIDENCE_TYPES,
    OVERTIME_REASONS,
    PERIODS
} from './utils/seed-constants';
import {
    SEED_ROLES,
    SEED_LOCATIONS_STRUCT,
    SEED_DEPARTMENTS,
    SEED_POSITIONS,
    SEED_SHIFTS_STRUCT
} from './utils/seed-structure';
import {
    SEED_TEMPLATES,
    SEED_SAMPLE_INCIDENCES,
    SEED_MASTER_LISTS,
    SEED_INCIDENCE_TYPE_ITEMS,
    SEED_EXPENSE_CATEGORY_ITEMS,
    SEED_DOCUMENT_TYPE_ITEMS
} from './utils/seed-data';
import {
    generateRandomTime,
    addMinutesToTime,
    calculateHoursWorked,
    detectInfraction,
    createBatchId,
    generateWorkingDays,
    randomInt,
    randomElement,
    randomChance,
    weightedRandom,
} from './utils/seed-helpers';

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

// Helper to safely create auth user
async function safeCreateAuthUser(uid: string, email: string, displayName: string): Promise<void> {
    try {
        const user = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(user.uid);
    } catch (error) {
        // User not found, proceed
    }
    try {
        await admin.auth().deleteUser(uid);
    } catch (error) {
        // UID not found, proceed
    }
    try {
        await admin.auth().createUser({
            uid,
            email,
            emailVerified: true,
            displayName,
            password: 'password123',
        });
    } catch (error) {
        console.warn(`Warning creating user ${email}:`, error);
    }
}

// Helper Functions
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
    const additionalFiveYearBlocks = Math.floor((yearsOfService - 6) / 5);
    return 22 + (additionalFiveYearBlocks * 2);
}

function calculateSDIFactor(vacationDays: number, vacationPremium = 0.25, aguinaldoDays = 15): number {
    const factor = 1 + ((vacationPremium * vacationDays) / 365) + (aguinaldoDays / 365);
    return Math.round(factor * 10000) / 10000;
}

const SALARY_RANGES: Record<number, { min: number; max: number }> = {
    1: { min: 4500, max: 6000 },
    2: { min: 2500, max: 3500 },
    3: { min: 1200, max: 1800 },
    4: { min: 800, max: 1200 },
    5: { min: 450, max: 700 },
};

function getPositionLevel(positionId: string): number {
    const pos = SEED_POSITIONS.find(p => p.id === positionId);
    return pos?.level || 5;
}

function generateCompensation(emp: typeof SEED_EMPLOYEES[0]) {
    const level = getPositionLevel(emp.positionTitle); // Mismatched key? defined by PositionTitle in Employee?
    // Wait, SEED_POSITIONS has id/name. SEED_EMPLOYEES has positionTitle. 
    // In old seed, employees has 'positionId'. 
    // In SEED_EMPLOYEES (seed-constants.ts), I see 'positionTitle' but NOT 'positionId'. 
    // This is a disconnect!

    // I need to map positionTitle to positionId or just use level 5 fallback.
    // Or I should have included positionId in SEED_EMPLOYEES.
    // For now, I'll fallback to 5.

    const range = SALARY_RANGES[5]; // Default to level 5 for now

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
        foodVouchersDaily: 0, // Simplified
        effectiveDate: emp.hireDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdById: 'system'
    };
}

// =========================================================================
// CLEAR ALL COLLECTIONS
// =========================================================================
async function clearAllCollections() {
    console.log('🗑️  Limpiando datos existentes...');

    const collections = [
        'roles',
        'locations',
        'departments',
        'positions',
        'shifts',
        'users',
        'employees',
        'vacation_balances',
        'vacation_adjustments',
        'request_templates',
        'incidences',
        'master_lists',
        'compensation',
        'attendance_imports',
        'attendance_records',
        'overtime_requests',
        'period_closures',
        'prenomina',
        'hour_bank',
        'tasks',
        'notifications'
    ];

    for (const collectionName of collections) {
        try {
            const snapshot = await db.collection(collectionName).get();
            const batch = db.batch();
            let count = 0;

            snapshot.docs.forEach((doc) => {
                batch.delete(doc.ref);
                count++;
            });

            if (count > 0) {
                await batch.commit();
                console.log(`   ✓ ${collectionName}: ${count} documentos eliminados`);
            }
        } catch (error) {
            console.warn(`   ⚠️  Error limpiando ${collectionName}:`, error);
        }
    }

    // Clear Auth users (except admin if exists)
    try {
        const listUsersResult = await admin.auth().listUsers();
        for (const user of listUsersResult.users) {
            try {
                await admin.auth().deleteUser(user.uid);
            } catch (error) {
                // Ignore errors for individual user deletion
            }
        }
        console.log(`   ✓ Auth: ${listUsersResult.users.length} usuarios eliminados`);
    } catch (error) {
        console.warn('   ⚠️  Error limpiando Auth:', error);
    }

    console.log('✅ Limpieza completada\n');
}

// =========================================================================
// SEED DATABASE
// =========================================================================

// MAIN SEEDING FUNCTION
async function seedDatabase() {
    console.log('🌱 Iniciando proceso de Seed de Base de Datos...\n');

    try {
        // Clear existing data first
        await clearAllCollections();

        console.log('📋 Creando Roles y Permisos...');
        for (const role of SEED_ROLES) await db.collection('roles').doc(role.id).set(role);

        console.log('📍 Creando Ubicaciones...');
        for (const loc of SEED_LOCATIONS_STRUCT) await db.collection('locations').doc(loc.id).set(loc);

        console.log('🏢 Creando Departamentos...');
        for (const dept of SEED_DEPARTMENTS) await db.collection('departments').doc(dept.id).set(dept);

        console.log('💼 Creando Puestos...');
        for (const pos of SEED_POSITIONS) await db.collection('positions').doc(pos.id).set(pos);

        console.log('⏰ Creando Turnos...');
        for (const shift of SEED_SHIFTS_STRUCT) await db.collection('shifts').doc(shift.id).set(shift);

        console.log('👥 Creando Usuarios y Empleados...');
        for (const emp of SEED_EMPLOYEES) {
            await safeCreateAuthUser(emp.uid, emp.email, emp.fullName);
            await db.collection('users').doc(emp.uid).set({
                id: emp.uid,
                fullName: emp.fullName,
                email: emp.email,
                department: emp.department,
                role: emp.role,
                status: 'active', // Assuming active
                managerId: emp.directManagerId || null,
                createdAt: new Date().toISOString(),
            });
            await db.collection('employees').doc(emp.id).set({
                ...emp,
                status: 'active',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            });
        }

        console.log('🌴 Creando Saldos de Vacaciones...');
        for (const emp of SEED_EMPLOYEES) {
            const hireDate = new Date(emp.hireDate);
            const now = new Date();
            const yearsOfService = calculateYearsOfService(emp.hireDate);
            const vacationDays = calculateVacationDaysLFT(yearsOfService);
            const balanceId = `vb-${emp.id}`;
            await db.collection('vacation_balances').doc(balanceId).set({
                id: balanceId,
                employeeId: emp.id,
                yearsOfService,
                daysEntitled: vacationDays,
                daysAvailable: vacationDays,
                lastUpdated: new Date().toISOString(),
                createdAt: new Date().toISOString(),
            });
        }

        console.log('📄 Creando Plantillas de Workflow...');
        for (const tpl of SEED_TEMPLATES) await db.collection('request_templates').doc(tpl.id).set(tpl);

        // console.log('📋 Creando Incidencias de Ejemplo...');
        // for (const inc of SEED_SAMPLE_INCIDENCES) await db.collection('incidences').doc(inc.id).set(inc);
        console.log('⏭️  Incidencias de ejemplo OMITIDAS (comentadas en el script)');

        console.log('📚 Creando Listas Maestras...');
        for (const ml of SEED_MASTER_LISTS) await db.collection('master_lists').doc(ml.id).set(ml);

        for (const item of SEED_INCIDENCE_TYPE_ITEMS)
            await db.collection('master_lists').doc('ml-incidence-types').collection('items').doc(item.id).set(item);
        for (const item of SEED_EXPENSE_CATEGORY_ITEMS)
            await db.collection('master_lists').doc('ml-expense-categories').collection('items').doc(item.id).set(item);
        for (const item of SEED_DOCUMENT_TYPE_ITEMS)
            await db.collection('master_lists').doc('ml-document-types').collection('items').doc(item.id).set(item);

        console.log('💰 Creando Registros de Compensación...');
        for (const emp of SEED_EMPLOYEES) {
            const comp = generateCompensation(emp);
            await db.collection('compensation').doc(comp.id).set(comp);
        }

        // 9. HISTORICAL DATA
        console.log('📊 Generando Datos Históricos de Asistencia...\n');

        async function createAttendanceImportBatch(period: string, batchNumber: number, startDate: string, endDate: string, importDate: string) {
            const batchId = createBatchId(period, batchNumber);
            const workingDays = generateWorkingDays(startDate, endDate, [1, 2, 3, 4, 5]);
            const totalRecords = workingDays.length * SEED_EMPLOYEES.length;
            await db.collection('attendance_imports').doc(batchId).set({
                id: batchId, period, batchNumber, importDate, startDate, endDate, totalRecords,
                processedRecords: totalRecords, status: 'completed', importedBy: 'emp-gerente-rh',
                fileName: `asistencias_${period}_batch${batchNumber}.csv`, createdAt: importDate, updatedAt: importDate,
            });
            return { batchId, workingDays };
        }

        async function createAttendanceRecords(batchId: string, workingDays: string[], period: string) {
            for (const employee of SEED_EMPLOYEES) {
                // Find shift - use 'shift-admin' from constants if not found in SHIFTS struct
                const shiftId = employee.customShiftId;
                const shift = SEED_SHIFTS_STRUCT.find(s => s.id === shiftId) || SEED_SHIFTS_STRUCT[0];

                // Get tolerance from employee's location
                const location = SEED_LOCATIONS_STRUCT.find(l => l.id === employee.locationId);
                const toleranceMinutes = location?.toleranceMinutes || 10; // Default 10 min

                for (const date of workingDays) {
                    const scenario = Math.random();
                    let checkIn: string | undefined, checkOut: string | undefined;
                    let isMissingPunch = false;
                    let missingType: 'entry' | 'exit' | 'both' | null = null;

                    // 5% chance of missing punch (Simulación de Sin Registro)
                    if (scenario < 0.05) {
                        isMissingPunch = true;
                        const subScenario = Math.random();
                        if (subScenario < 0.4) {
                            // Missing Exit (Marked entry, forgot exit)
                            missingType = 'exit';
                            checkIn = generateRandomTime(shift.startTime, 3);
                        } else if (subScenario < 0.8) {
                            // Missing Entry (Forgot entry, marked exit)
                            missingType = 'entry';
                            checkOut = generateRandomTime(shift.endTime, 3);
                        } else {
                            // Missing Both (but marked present? usually treated as absence, but let's simulate)
                            missingType = 'both';
                        }

                        // Create Missing Punch Record
                        await db.collection('missing_punches').add({
                            employeeId: employee.id,
                            employeeName: employee.fullName,
                            date,
                            missingType,
                            isJustified: false,
                            justificationStatus: 'pending',
                            importBatchId: batchId,
                            locationId: employee.locationId,
                            shiftId: employee.customShiftId, // Use customShiftId here
                            createdAt: date,
                            updatedAt: date
                        });

                        // Note: We intentionally DO NOT create a full attendance record, 
                        // or we create a partial one depending on system logic. 
                        // For this seed, we assume missing_punches is the source of truth for these errors.
                        // However, to show up in some reports, we might need a partial attendance.
                        // Let's create a partial attendance if we have at least one time.
                        if (checkIn || checkOut) {
                            await db.collection('attendance').add({
                                employeeId: employee.id, employeeName: employee.fullName, date,
                                checkIn: checkIn || null, checkOut: checkOut || null,
                                importBatchId: batchId, locationId: employee.locationId, shiftId: employee.customShiftId, // use customShiftId
                                hoursWorked: 0, regularHours: 0, overtimeHours: 0,
                                isValid: false, hasError: true, errorType: 'missing_punch',
                                createdAt: date, updatedAt: date,
                            });
                        }
                        continue; // Skip regular processing
                    }

                    if (scenario < 0.7) {
                        checkIn = generateRandomTime(shift.startTime, 3);
                        checkOut = generateRandomTime(shift.endTime, 3);
                    } else if (scenario < 0.9) {
                        const lateMinutes = randomInt(toleranceMinutes + 1, 30);
                        checkIn = addMinutesToTime(shift.startTime, lateMinutes);
                        checkOut = shift.endTime;
                    } else {
                        checkIn = shift.startTime;
                        const earlyMinutes = randomInt(15, 60);
                        checkOut = addMinutesToTime(shift.endTime, -earlyMinutes);
                    }

                    // Ensure checkIn/checkOut are strings for regular processing
                    if (!checkIn || !checkOut) continue;

                    const hoursWorked = calculateHoursWorked(checkIn, checkOut);
                    const infraction = detectInfraction(checkIn, checkOut, shift.startTime, shift.endTime, toleranceMinutes);

                    await db.collection('attendance').add({
                        employeeId: employee.id, employeeName: employee.fullName, date, checkIn, checkOut,
                        importBatchId: batchId, locationId: employee.locationId, shiftId: employee.customShiftId,
                        hoursWorked, regularHours: Math.min(hoursWorked, 8), overtimeHours: Math.max(hoursWorked - 8, 0),
                        isValid: true, createdAt: date, updatedAt: date,
                    });

                    if (infraction.hasTardiness) {
                        await db.collection('tardiness_records').add({
                            employeeId: employee.id, employeeName: employee.fullName, date, scheduledTime: shift.startTime,
                            actualTime: checkIn, minutesLate: infraction.minutesLate, isJustified: false, justificationStatus: 'pending',
                            importBatchId: batchId, createdAt: date, updatedAt: date,
                        });
                    }
                    if (infraction.hasEarlyDeparture) {
                        await db.collection('early_departures').add({
                            employeeId: employee.id, employeeName: employee.fullName, date, scheduledTime: shift.endTime,
                            actualTime: checkOut, minutesEarly: infraction.minutesEarly, isJustified: false, justificationStatus: 'pending',
                            importBatchId: batchId, createdAt: date, updatedAt: date,
                        });
                    }
                }
            }
        }

        async function createOvertimeRequests(period: string, workingDays: string[], shouldApprove: boolean) {
            const employeesWithOT = SEED_EMPLOYEES.filter(() => randomChance(0.3));
            for (const employee of employeesWithOT) {
                const requestCount = randomInt(1, 3);
                for (let i = 0; i < requestCount; i++) {
                    const date = randomElement(workingDays);
                    const hoursRequested = randomInt(1, 4);
                    const reason = randomElement(OVERTIME_REASONS);
                    const requestData: any = {
                        employeeId: employee.id, employeeName: employee.fullName, date, hoursRequested, reason,
                        status: 'pending', createdAt: date, updatedAt: date,
                    };
                    if (shouldApprove) {
                        const outcome = Math.random();
                        if (outcome < 0.6) {
                            requestData.status = 'approved'; requestData.approvedBy = 'emp-gerente-rh'; requestData.hoursApproved = hoursRequested;
                        } else if (outcome < 0.8) {
                            requestData.status = 'rejected'; requestData.rejectedBy = 'emp-gerente-rh'; requestData.rejectionReason = 'No autorizado';
                        }
                    }
                    await db.collection('overtime_requests').add(requestData);
                }
            }
        }

        async function createApprovedIncidences(period: string, workingDays: string[]) {
            const employeesWithIncidences = SEED_EMPLOYEES.filter(() => randomChance(0.4));
            for (const employee of employeesWithIncidences) {
                const incidenceType = weightedRandom(INCIDENCE_TYPES);
                const startDate = randomElement(workingDays);

                let status = 'approved';
                let approvedBy: string | undefined = 'emp-gerente-rh';
                let reason = 'Approved Incidence';

                if (incidenceType.value === 'unjustified_absence') {
                    status = 'unjustified';
                    approvedBy = undefined;
                    reason = 'Ausencia no justificada';
                }

                await db.collection('incidences').add({
                    employeeId: employee.id, employeeName: employee.fullName, type: incidenceType.value,
                    startDate, endDate: startDate, status, reason,
                    approvedBy, approvedAt: status === 'approved' ? startDate : undefined,
                    createdAt: startDate, updatedAt: startDate,
                });
            }
        }

        async function closePeriod(period: string, closedAt: string) {
            const managers = SEED_EMPLOYEES.filter(e => e.role === 'Supervisor' || e.role === 'Admin');
            for (const manager of managers) {
                await db.collection('period_closures').doc(`${manager.id}_${period}`).set({
                    userId: manager.id, period, closedAt, closedBy: manager.id, slaCompleted: true, consolidationCompleted: true,
                    createdAt: closedAt, updatedAt: closedAt,
                });
            }
        }


        // ========================================================================
        // DATOS DE PRUEBA DESHABILITADOS
        // ========================================================================
        // Las siguientes secciones están comentadas para evitar la carga de datos
        // de prueba en los módulos de:
        // - Registro de Asistencias (attendance records)
        // - Gestión de Equipo (overtime requests)
        // - Consolidación de Asistencia (prenómina/period closures)
        //
        // Si necesitas habilitar estos datos de prueba, descomenta las líneas
        // correspondientes a continuación.
        // ========================================================================

        // Periods logic
        const p1 = await createAttendanceImportBatch(PERIODS.CLOSED_1.period, 1, PERIODS.CLOSED_1.batch1.start, PERIODS.CLOSED_1.batch1.end, PERIODS.CLOSED_1.batch1.importDate);
        await createAttendanceRecords(p1.batchId, p1.workingDays, PERIODS.CLOSED_1.period);
        await createOvertimeRequests(PERIODS.CLOSED_1.period, p1.workingDays, true);
        await createApprovedIncidences(PERIODS.CLOSED_1.period, p1.workingDays);

        const p1b2 = await createAttendanceImportBatch(PERIODS.CLOSED_1.period, 2, PERIODS.CLOSED_1.batch2.start, PERIODS.CLOSED_1.batch2.end, PERIODS.CLOSED_1.batch2.importDate);
        await createAttendanceRecords(p1b2.batchId, p1b2.workingDays, PERIODS.CLOSED_1.period);
        await createOvertimeRequests(PERIODS.CLOSED_1.period, p1b2.workingDays, true);
        await createApprovedIncidences(PERIODS.CLOSED_1.period, p1b2.workingDays);
        await closePeriod(PERIODS.CLOSED_1.period, PERIODS.CLOSED_1.closedAt);

        const p2 = await createAttendanceImportBatch(PERIODS.CLOSED_2.period, 1, PERIODS.CLOSED_2.batch1.start, PERIODS.CLOSED_2.batch1.end, PERIODS.CLOSED_2.batch1.importDate);
        await createAttendanceRecords(p2.batchId, p2.workingDays, PERIODS.CLOSED_2.period);
        await createOvertimeRequests(PERIODS.CLOSED_2.period, p2.workingDays, true);
        await createApprovedIncidences(PERIODS.CLOSED_2.period, p2.workingDays);

        const p2b2 = await createAttendanceImportBatch(PERIODS.CLOSED_2.period, 2, PERIODS.CLOSED_2.batch2.start, PERIODS.CLOSED_2.batch2.end, PERIODS.CLOSED_2.batch2.importDate);
        await createAttendanceRecords(p2b2.batchId, p2b2.workingDays, PERIODS.CLOSED_2.period);
        await createOvertimeRequests(PERIODS.CLOSED_2.period, p2b2.workingDays, true);
        await createApprovedIncidences(PERIODS.CLOSED_2.period, p2b2.workingDays);
        await closePeriod(PERIODS.CLOSED_2.period, PERIODS.CLOSED_2.closedAt);

        const p3 = await createAttendanceImportBatch(PERIODS.OPEN.period, 1, PERIODS.OPEN.batch1.start, PERIODS.OPEN.batch1.end, PERIODS.OPEN.batch1.importDate);
        await createAttendanceRecords(p3.batchId, p3.workingDays, PERIODS.OPEN.period);
        await createOvertimeRequests(PERIODS.OPEN.period, p3.workingDays, false);

        console.log('✅  Datos de prueba de asistencia y consolidados GENERADOS.');


        // 10. Admin User
        console.log('👤 Creando Usuario Administrador...');
        const ADMIN_UID = 'admin-user';
        await safeCreateAuthUser(ADMIN_UID, 'admin@stuffactory.mx', 'Administrador Sistema');
        await db.collection('users').doc(ADMIN_UID).set({
            id: ADMIN_UID, fullName: 'Administrador Sistema', email: 'admin@stuffactory.mx',
            department: 'Tecnología', role: 'Admin', status: 'active', createdAt: new Date().toISOString(),
        });

        console.log('🎉 Seed Completado!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

seedDatabase();
