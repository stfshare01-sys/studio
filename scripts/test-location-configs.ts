/**
 * 🧪 Script de Pruebas - Configuraciones Dinámicas de Ubicación
 * 
 * Este script prueba las 3 fases implementadas:
 * 1. Tolerancia de retardo dinámica por ubicación
 * 2. Reinicio de horas extras (día de descanso configurable)
 * 3. Días de beneficio empresa
 * 
 * Run: npx tsx scripts/test-location-configs.ts
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

// =============================================================================
// CONFIGURACIÓN DE UBICACIONES DE PRUEBA
// =============================================================================

const TEST_LOCATIONS = [
    {
        id: 'test-loc-tolerancia-5',
        name: 'Ubicación Test - Tolerancia 5 min',
        code: 'TEST-TOL5',
        type: 'oficina',
        toleranceMinutes: 5,
        overtimeResetDay: 'sunday',
        companyBenefitDays: ['12-24', '12-31'], // 24 y 31 de diciembre
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'test-loc-tolerancia-15',
        name: 'Ubicación Test - Tolerancia 15 min',
        code: 'TEST-TOL15',
        type: 'planta',
        toleranceMinutes: 15,
        overtimeResetDay: 'saturday',
        companyBenefitDays: ['01-01', '05-01'], // 1 de enero y 1 de mayo
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
    {
        id: 'test-loc-custom-reset',
        name: 'Ubicación Test - Reset Custom (Lunes)',
        code: 'TEST-CUSTOM',
        type: 'cedis',
        toleranceMinutes: 10,
        overtimeResetDay: 'custom',
        customOvertimeResetDay: 1, // Lunes
        companyBenefitDays: [],
        isActive: true,
        createdAt: NOW,
        updatedAt: NOW,
    },
];

// =============================================================================
// EMPLEADOS DE PRUEBA
// =============================================================================

const TEST_EMPLOYEES = [
    {
        id: 'test-emp-tol5',
        uid: 'test-emp-tol5',
        fullName: 'Ana García (Tolerancia 5 min)',
        email: 'ana.garcia.test@empresa.mx',
        department: 'Pruebas',
        positionTitle: 'Tester',
        locationId: 'test-loc-tolerancia-5',
        customShiftId: 'shift-oficina',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2024-01-01',
    },
    {
        id: 'test-emp-tol15',
        uid: 'test-emp-tol15',
        fullName: 'Carlos López (Tolerancia 15 min)',
        email: 'carlos.lopez.test@empresa.mx',
        department: 'Pruebas',
        positionTitle: 'Tester',
        locationId: 'test-loc-tolerancia-15',
        customShiftId: 'shift-oficina',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2024-01-01',
    },
    {
        id: 'test-emp-custom',
        uid: 'test-emp-custom',
        fullName: 'María Rodríguez (Reset Custom)',
        email: 'maria.rodriguez.test@empresa.mx',
        department: 'Pruebas',
        positionTitle: 'Tester',
        locationId: 'test-loc-custom-reset',
        customShiftId: 'shift-oficina',
        status: 'active',
        employmentType: 'full_time',
        shiftType: 'diurnal',
        hireDate: '2024-01-01',
    },
];

// =============================================================================
// FUNCIONES AUXILIARES
// =============================================================================

async function cleanupTestData() {
    console.log('🧹 Limpiando datos de prueba anteriores...\n');

    // Eliminar ubicaciones de prueba
    for (const loc of TEST_LOCATIONS) {
        try {
            await db.collection('locations').doc(loc.id).delete();
        } catch (e) { /* ignore */ }
    }

    // Eliminar empleados de prueba
    for (const emp of TEST_EMPLOYEES) {
        try {
            await db.collection('employees').doc(emp.id).delete();
            await admin.auth().deleteUser(emp.uid);
        } catch (e) { /* ignore */ }
    }

    // Eliminar registros de asistencia de prueba
    const attendanceSnap = await db.collection('attendance')
        .where('employeeId', 'in', TEST_EMPLOYEES.map(e => e.id))
        .get();
    for (const doc of attendanceSnap.docs) {
        await doc.ref.delete();
    }

    // Eliminar infracciones de prueba
    const tardinessSnap = await db.collection('tardiness_records')
        .where('employeeId', 'in', TEST_EMPLOYEES.map(e => e.id))
        .get();
    for (const doc of tardinessSnap.docs) {
        await doc.ref.delete();
    }

    const departuresSnap = await db.collection('early_departures')
        .where('employeeId', 'in', TEST_EMPLOYEES.map(e => e.id))
        .get();
    for (const doc of departuresSnap.docs) {
        await doc.ref.delete();
    }

    console.log('✅ Limpieza completada\n');
}

async function createTestLocations() {
    console.log('📍 Creando ubicaciones de prueba...\n');

    for (const loc of TEST_LOCATIONS) {
        await db.collection('locations').doc(loc.id).set(loc);
        console.log(`   ✅ ${loc.name} (Tolerancia: ${loc.toleranceMinutes} min, Reset: ${loc.overtimeResetDay})`);
    }

    console.log('\n');
}

async function createTestEmployees() {
    console.log('👥 Creando empleados de prueba...\n');

    for (const emp of TEST_EMPLOYEES) {
        // Crear usuario de autenticación
        try {
            await admin.auth().createUser({
                uid: emp.uid,
                email: emp.email,
                emailVerified: true,
                displayName: emp.fullName,
                password: 'prueba123',
            });
        } catch (e: any) {
            if (e.code !== 'auth/uid-already-exists') {
                console.error(`   ❌ Error creando auth user ${emp.email}:`, e.message);
            }
        }

        // Crear documento de empleado
        await db.collection('employees').doc(emp.id).set({
            ...emp,
            createdAt: NOW,
            updatedAt: NOW,
        });

        console.log(`   ✅ ${emp.fullName}`);
    }

    console.log('\n');
}

// =============================================================================
// PRUEBAS
// =============================================================================

async function testPhase1_ToleranceMinutes() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 FASE 1: Tolerancia de Retardo Dinámica');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    const today = new Date().toISOString().split('T')[0];

    // Caso 1: Empleado con tolerancia de 5 min - Llegada 09:04 (NO retardo)
    console.log('📋 Caso 1: Tolerancia 5 min - Llegada 09:04 (dentro de tolerancia)');
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol5',
        locationId: 'test-loc-tolerancia-5',
        date: today,
        checkIn: '09:04:00',
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado\n');

    await sleep(2000);

    // Caso 2: Empleado con tolerancia de 5 min - Llegada 09:06 (SÍ retardo de 1 min)
    console.log('📋 Caso 2: Tolerancia 5 min - Llegada 09:06 (1 min de retardo)');
    const yesterday = getDateOffset(-1);
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol5',
        locationId: 'test-loc-tolerancia-5',
        date: yesterday,
        checkIn: '09:06:00',
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado\n');

    await sleep(2000);

    // Caso 3: Empleado con tolerancia de 15 min - Llegada 09:14 (NO retardo)
    console.log('📋 Caso 3: Tolerancia 15 min - Llegada 09:14 (dentro de tolerancia)');
    const twoDaysAgo = getDateOffset(-2);
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol15',
        locationId: 'test-loc-tolerancia-15',
        date: twoDaysAgo,
        checkIn: '09:14:00',
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado\n');

    await sleep(2000);

    // Caso 4: Empleado con tolerancia de 15 min - Llegada 09:16 (SÍ retardo de 1 min)
    console.log('📋 Caso 4: Tolerancia 15 min - Llegada 09:16 (1 min de retardo)');
    const threeDaysAgo = getDateOffset(-3);
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol15',
        locationId: 'test-loc-tolerancia-15',
        date: threeDaysAgo,
        checkIn: '09:16:00',
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado\n');

    // Esperar a que los triggers procesen
    console.log('⏳ Esperando 5 segundos para que los triggers procesen...\n');
    await sleep(5000);

    // Verificar resultados
    console.log('📊 RESULTADOS FASE 1:\n');

    const tardiness5 = await db.collection('tardiness_records')
        .where('employeeId', '==', 'test-emp-tol5')
        .get();

    const tardiness15 = await db.collection('tardiness_records')
        .where('employeeId', '==', 'test-emp-tol15')
        .get();

    console.log(`   Empleado con tolerancia 5 min:`);
    console.log(`      - Retardos detectados: ${tardiness5.size}`);
    console.log(`      - Esperado: 1 (solo el de 09:06)`);
    tardiness5.forEach(doc => {
        const data = doc.data();
        console.log(`      - Fecha: ${data.date}, Minutos tarde: ${data.minutesLate}`);
    });

    console.log(`\n   Empleado con tolerancia 15 min:`);
    console.log(`      - Retardos detectados: ${tardiness15.size}`);
    console.log(`      - Esperado: 1 (solo el de 09:16)`);
    tardiness15.forEach(doc => {
        const data = doc.data();
        console.log(`      - Fecha: ${data.date}, Minutos tarde: ${data.minutesLate}`);
    });

    const phase1Pass = tardiness5.size === 1 && tardiness15.size === 1;
    console.log(`\n   ${phase1Pass ? '✅ FASE 1 APROBADA' : '❌ FASE 1 FALLIDA'}\n`);

    return phase1Pass;
}

async function testPhase2_OvertimeResetDay() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 FASE 2: Reinicio de Horas Extras (Día de Descanso)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    console.log('📋 Creando registros de asistencia en diferentes días de la semana...\n');

    // Crear asistencias para la semana pasada (Lunes a Domingo)
    const lastWeek = getLastWeekDates();

    for (let i = 0; i < 7; i++) {
        const date = lastWeek[i];
        const dayName = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(date).getDay()];

        // Empleado con reset en Domingo (test-emp-tol5)
        await db.collection('attendance').add({
            employeeId: 'test-emp-tol5',
            locationId: 'test-loc-tolerancia-5',
            date,
            checkIn: '09:00:00',
            checkOut: '18:00:00',
            hoursWorked: 8,
            regularHours: 8,
            overtimeHours: 0,
            isValid: true,
            createdAt: NOW,
        });

        // Empleado con reset en Sábado (test-emp-tol15)
        await db.collection('attendance').add({
            employeeId: 'test-emp-tol15',
            locationId: 'test-loc-tolerancia-15',
            date,
            checkIn: '09:00:00',
            checkOut: '18:00:00',
            hoursWorked: 8,
            regularHours: 8,
            overtimeHours: 0,
            isValid: true,
            createdAt: NOW,
        });

        // Empleado con reset en Lunes (test-emp-custom)
        await db.collection('attendance').add({
            employeeId: 'test-emp-custom',
            locationId: 'test-loc-custom-reset',
            date,
            checkIn: '09:00:00',
            checkOut: '18:00:00',
            hoursWorked: 8,
            regularHours: 8,
            overtimeHours: 0,
            isValid: true,
            createdAt: NOW,
        });

        console.log(`   ✅ ${dayName} ${date}: 3 registros creados`);
    }

    console.log('\n📊 RESULTADOS FASE 2:\n');
    console.log('   ℹ️  Esta fase requiere ejecutar consolidación de prenómina manualmente');
    console.log('   ℹ️  Verifica en la UI que:');
    console.log('      - Empleado con reset Domingo: 1 día de descanso trabajado (Domingo)');
    console.log('      - Empleado con reset Sábado: 1 día de descanso trabajado (Sábado)');
    console.log('      - Empleado con reset Lunes: 1 día de descanso trabajado (Lunes)');
    console.log('\n   ⚠️  FASE 2 REQUIERE VERIFICACIÓN MANUAL\n');

    return true; // No podemos verificar automáticamente sin ejecutar consolidación
}

async function testPhase3_CompanyBenefitDays() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🧪 FASE 3: Días de Beneficio Empresa');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

    // Caso 1: Retardo en día de beneficio (NO debe generar infracción)
    console.log('📋 Caso 1: Retardo en día de beneficio (24 de diciembre)');
    const dec24 = '2024-12-24';
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol5',
        locationId: 'test-loc-tolerancia-5',
        date: dec24,
        checkIn: '09:30:00', // 30 min tarde
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado (NO debería generar retardo)\n');

    await sleep(2000);

    // Caso 2: Salida temprana en día de beneficio (NO debe generar infracción)
    console.log('📋 Caso 2: Salida temprana en día de beneficio (31 de diciembre)');
    const dec31 = '2024-12-31';
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol5',
        locationId: 'test-loc-tolerancia-5',
        date: dec31,
        checkIn: '09:00:00',
        checkOut: '17:00:00', // 1 hora antes
        hoursWorked: 7,
        regularHours: 7,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado (NO debería generar salida temprana)\n');

    await sleep(2000);

    // Caso 3: Retardo en día normal (SÍ debe generar infracción)
    console.log('📋 Caso 3: Retardo en día normal (25 de diciembre)');
    const dec25 = '2024-12-25';
    await db.collection('attendance').add({
        employeeId: 'test-emp-tol5',
        locationId: 'test-loc-tolerancia-5',
        date: dec25,
        checkIn: '09:30:00', // 30 min tarde
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: NOW,
    });
    console.log('   ✅ Registro creado (SÍ debería generar retardo)\n');

    // Esperar a que los triggers procesen
    console.log('⏳ Esperando 5 segundos para que los triggers procesen...\n');
    await sleep(5000);

    // Verificar resultados
    console.log('📊 RESULTADOS FASE 3:\n');

    const tardinessInBenefitDay = await db.collection('tardiness_records')
        .where('employeeId', '==', 'test-emp-tol5')
        .where('date', '==', dec24)
        .get();

    const departureInBenefitDay = await db.collection('early_departures')
        .where('employeeId', '==', 'test-emp-tol5')
        .where('date', '==', dec31)
        .get();

    const tardinessInNormalDay = await db.collection('tardiness_records')
        .where('employeeId', '==', 'test-emp-tol5')
        .where('date', '==', dec25)
        .get();

    console.log(`   Retardo en día de beneficio (24-dic):`);
    console.log(`      - Infracciones detectadas: ${tardinessInBenefitDay.size}`);
    console.log(`      - Esperado: 0`);

    console.log(`\n   Salida temprana en día de beneficio (31-dic):`);
    console.log(`      - Infracciones detectadas: ${departureInBenefitDay.size}`);
    console.log(`      - Esperado: 0`);

    console.log(`\n   Retardo en día normal (25-dic):`);
    console.log(`      - Infracciones detectadas: ${tardinessInNormalDay.size}`);
    console.log(`      - Esperado: 1`);

    const phase3Pass = tardinessInBenefitDay.size === 0 &&
        departureInBenefitDay.size === 0 &&
        tardinessInNormalDay.size === 1;

    console.log(`\n   ${phase3Pass ? '✅ FASE 3 APROBADA' : '❌ FASE 3 FALLIDA'}\n`);

    return phase3Pass;
}

// =============================================================================
// UTILIDADES
// =============================================================================

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getDateOffset(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date.toISOString().split('T')[0];
}

function getLastWeekDates(): string[] {
    const dates: string[] = [];
    const today = new Date();

    // Obtener el lunes de la semana pasada
    const lastMonday = new Date(today);
    lastMonday.setDate(today.getDate() - today.getDay() - 6); // -6 para ir a la semana pasada

    for (let i = 0; i < 7; i++) {
        const date = new Date(lastMonday);
        date.setDate(lastMonday.getDate() + i);
        dates.push(date.toISOString().split('T')[0]);
    }

    return dates;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    console.log('\n');
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  🧪 PRUEBAS DE CONFIGURACIONES DINÁMICAS DE UBICACIÓN       ║');
    console.log('╚══════════════════════════════════════════════════════════════╝');
    console.log('\n');

    try {
        // Limpieza
        await cleanupTestData();

        // Configuración
        await createTestLocations();
        await createTestEmployees();

        // Ejecutar pruebas
        const phase1Pass = await testPhase1_ToleranceMinutes();
        const phase2Pass = await testPhase2_OvertimeResetDay();
        const phase3Pass = await testPhase3_CompanyBenefitDays();

        // Resumen final
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('📋 RESUMEN FINAL');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
        console.log(`   Fase 1 (Tolerancia): ${phase1Pass ? '✅ APROBADA' : '❌ FALLIDA'}`);
        console.log(`   Fase 2 (Reset HE): ${phase2Pass ? '⚠️  VERIFICACIÓN MANUAL' : '❌ FALLIDA'}`);
        console.log(`   Fase 3 (Beneficios): ${phase3Pass ? '✅ APROBADA' : '❌ FALLIDA'}`);

        const allPass = phase1Pass && phase3Pass;
        console.log(`\n   ${allPass ? '🎉 TODAS LAS PRUEBAS AUTOMÁTICAS APROBADAS' : '⚠️  ALGUNAS PRUEBAS FALLARON'}\n`);

        console.log('📝 NOTAS:');
        console.log('   - Fase 2 requiere ejecutar consolidación de prenómina en la UI');
        console.log('   - Los datos de prueba permanecen en el emulador para inspección');
        console.log('   - Ejecuta este script nuevamente para limpiar y re-probar\n');

    } catch (error) {
        console.error('\n❌ Error durante las pruebas:', error);
        process.exit(1);
    }
}

// Ejecutar
main()
    .then(() => {
        console.log('✅ Script completado\n');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error fatal:', error);
        process.exit(1);
    });
