/**
 * Script de Prueba - Detección Automática de Infracciones
 * 
 * Este script crea datos de prueba para verificar que el trigger
 * onAttendanceCreated detecta correctamente retardos y salidas tempranas.
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, getDocs, query, where } from 'firebase/firestore';

// Configuración del emulador
const firebaseConfig = {
    apiKey: "demo-key",
    projectId: "demo-project"
};

const app = initializeApp(firebaseConfig);
const firestore = getFirestore(app);

// Conectar al emulador
if (typeof window === 'undefined') {
    const { connectFirestoreEmulator } = require('firebase/firestore');
    connectFirestoreEmulator(firestore, 'localhost', 8080);
}

async function createTestData() {
    console.log('🚀 Iniciando creación de datos de prueba...\n');

    // 1. Crear empleado de prueba
    console.log('1️⃣ Creando empleado de prueba...');
    const employeeRef = await addDoc(collection(firestore, 'employees'), {
        email: 'test.employee@example.com',
        fullName: 'Juan Pérez',
        department: 'IT',
        positionTitle: 'Developer',
        employmentType: 'full_time',
        shiftType: 'diurnal', // 09:00 - 18:00
        hireDate: '2024-01-01T00:00:00.000Z',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    });
    console.log(`   ✅ Empleado creado: ${employeeRef.id}\n`);

    // 2. Crear registros de asistencia con infracciones
    const today = new Date().toISOString().split('T')[0];

    console.log('2️⃣ Creando registros de asistencia...\n');

    // Caso 1: Retardo de 25 minutos (09:25 vs 09:00)
    console.log('   📋 Caso 1: Retardo de 25 minutos');
    await addDoc(collection(firestore, 'attendance'), {
        employeeId: employeeRef.id,
        date: today,
        checkIn: '09:25:00',
        checkOut: '18:00:00',
        hoursWorked: 8.42,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: new Date().toISOString()
    });
    console.log('   ✅ Registro creado (debería generar retardo de 15 min después de tolerancia)\n');

    // Esperar 2 segundos para que el trigger procese
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Caso 2: Salida temprana de 40 minutos (17:20 vs 18:00)
    console.log('   📋 Caso 2: Salida temprana de 40 minutos');
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    await addDoc(collection(firestore, 'attendance'), {
        employeeId: employeeRef.id,
        date: yesterdayStr,
        checkIn: '09:00:00',
        checkOut: '17:20:00',
        hoursWorked: 7.67,
        regularHours: 7.67,
        overtimeHours: 0,
        isValid: true,
        createdAt: new Date().toISOString()
    });
    console.log('   ✅ Registro creado (debería generar salida temprana de 30 min después de tolerancia)\n');

    // Esperar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Caso 3: Asistencia normal (sin infracciones)
    console.log('   📋 Caso 3: Asistencia normal');
    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = twoDaysAgo.toISOString().split('T')[0];

    await addDoc(collection(firestore, 'attendance'), {
        employeeId: employeeRef.id,
        date: twoDaysAgoStr,
        checkIn: '09:00:00',
        checkOut: '18:00:00',
        hoursWorked: 8,
        regularHours: 8,
        overtimeHours: 0,
        isValid: true,
        createdAt: new Date().toISOString()
    });
    console.log('   ✅ Registro creado (NO debería generar infracciones)\n');

    // Esperar 3 segundos para que todos los triggers procesen
    console.log('⏳ Esperando 3 segundos para que los triggers procesen...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // 3. Verificar resultados
    console.log('3️⃣ Verificando resultados...\n');

    // Verificar retardos
    const tardinessQuery = query(
        collection(firestore, 'tardiness_records'),
        where('employeeId', '==', employeeRef.id)
    );
    const tardinessSnap = await getDocs(tardinessQuery);
    console.log(`   📊 Retardos detectados: ${tardinessSnap.size}`);
    tardinessSnap.forEach(doc => {
        const data = doc.data();
        console.log(`      - Fecha: ${data.date}, Minutos: ${data.minutesLate}, Estado: ${data.justificationStatus}`);
    });

    // Verificar salidas tempranas
    const departuresQuery = query(
        collection(firestore, 'early_departures'),
        where('employeeId', '==', employeeRef.id)
    );
    const departuresSnap = await getDocs(departuresQuery);
    console.log(`\n   📊 Salidas tempranas detectadas: ${departuresSnap.size}`);
    departuresSnap.forEach(doc => {
        const data = doc.data();
        console.log(`      - Fecha: ${data.date}, Minutos: ${data.minutesEarly}, Estado: ${data.justificationStatus}`);
    });

    console.log('\n✅ Prueba completada!\n');
    console.log('📋 Resumen esperado:');
    console.log('   - 1 retardo de 15 minutos (25 - 10 tolerancia)');
    console.log('   - 1 salida temprana de 30 minutos (40 - 10 tolerancia)');
    console.log('   - 0 infracciones para el tercer registro\n');
}

// Ejecutar
createTestData()
    .then(() => {
        console.log('🎉 Script completado exitosamente');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ Error:', error);
        process.exit(1);
    });
