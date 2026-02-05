/**
 * Script de Datos de Prueba para Auto-Justificación
 * 
 * Este script crea datos de prueba para verificar el funcionamiento
 * de la auto-justificación de retardos mediante incidencias aprobadas.
 */

import { initializeApp } from 'firebase/app';
import {
    getFirestore,
    collection,
    addDoc,
    doc,
    setDoc,
    Timestamp
} from 'firebase/firestore';

// Configuración del emulador
const firebaseConfig = {
    projectId: 'demo-app',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Conectar al emulador
if (typeof window === 'undefined') {
    const { connectFirestoreEmulator } = require('firebase/firestore');
    connectFirestoreEmulator(db, 'localhost', 8080);
}

async function createTestData() {
    console.log('🚀 Iniciando creación de datos de prueba...\n');

    try {
        // 1. Crear empleado de prueba
        const employeeId = 'test-employee-autojustify';
        const employeeData = {
            id: employeeId,
            fullName: 'Juan Pérez Test',
            email: 'juan.perez.test@stuffactory.com',
            status: 'active',
            department: 'Tecnología',
            positionTitle: 'Desarrollador',
            shiftType: 'diurnal',
            directManagerId: 'test-manager-001',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'employees', employeeId), employeeData);
        console.log('✅ Empleado de prueba creado:', employeeData.fullName);

        // 2. Crear usuario asociado (para notificaciones)
        const userData = {
            id: employeeId,
            email: employeeData.email,
            displayName: employeeData.fullName,
            role: 'Employee',
            createdAt: new Date().toISOString()
        };

        await setDoc(doc(db, 'users', employeeId), userData);
        console.log('✅ Usuario de prueba creado:', userData.email);

        // 3. Crear incidencia aprobada (permiso para hoy)
        const today = new Date();
        const todayStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

        const incidenceData = {
            employeeId: employeeId,
            employeeName: employeeData.fullName,
            type: 'personal_leave',
            startDate: todayStr,
            endDate: todayStr,
            status: 'approved',
            reason: 'Permiso personal de prueba',
            approvedBy: 'test-manager-001',
            approvedByName: 'Manager Test',
            approvedAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const incidenceRef = await addDoc(collection(db, 'incidences'), incidenceData);
        console.log('✅ Incidencia aprobada creada:', incidenceRef.id);
        console.log('   Tipo:', incidenceData.type);
        console.log('   Fecha:', incidenceData.startDate);

        // 4. Crear retardo para el mismo día (para auto-justificación)
        const tardinessData = {
            employeeId: employeeId,
            employeeName: employeeData.fullName,
            date: todayStr,
            scheduledTime: '09:00',
            actualTime: '09:45',
            minutesLate: 45,
            isJustified: false,
            justificationStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const tardinessRef = await addDoc(collection(db, 'tardiness_records'), tardinessData);
        console.log('✅ Retardo creado:', tardinessRef.id);
        console.log('   Minutos tarde:', tardinessData.minutesLate);
        console.log('   Estado:', tardinessData.justificationStatus);

        // 5. Crear salida temprana para el mismo día (para auto-justificación)
        const earlyDepartureData = {
            employeeId: employeeId,
            employeeName: employeeData.fullName,
            date: todayStr,
            scheduledTime: '18:00',
            actualTime: '17:30',
            minutesEarly: 30,
            isJustified: false,
            justificationStatus: 'pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const departureRef = await addDoc(collection(db, 'early_departures'), earlyDepartureData);
        console.log('✅ Salida temprana creada:', departureRef.id);
        console.log('   Minutos antes:', earlyDepartureData.minutesEarly);
        console.log('   Estado:', earlyDepartureData.justificationStatus);

        console.log('\n🎉 Datos de prueba creados exitosamente!\n');
        console.log('📝 Resumen:');
        console.log('   - Empleado ID:', employeeId);
        console.log('   - Incidencia ID:', incidenceRef.id);
        console.log('   - Retardo ID:', tardinessRef.id);
        console.log('   - Salida Temprana ID:', departureRef.id);
        console.log('   - Fecha:', todayStr);
        console.log('\n🔍 Para probar la auto-justificación:');
        console.log('   1. Ejecuta la función autoJustifyFromIncidences() con estos IDs');
        console.log('   2. Verifica que el retardo y la salida temprana se marquen como justificados');
        console.log('   3. Verifica que se creen notificaciones en users/' + employeeId + '/notifications');

        return {
            employeeId,
            incidenceId: incidenceRef.id,
            tardinessId: tardinessRef.id,
            departureId: departureRef.id,
            date: todayStr
        };

    } catch (error) {
        console.error('❌ Error creando datos de prueba:', error);
        throw error;
    }
}

// Ejecutar si se llama directamente
if (require.main === module) {
    createTestData()
        .then((result) => {
            console.log('\n✅ Script completado exitosamente');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Script falló:', error);
            process.exit(1);
        });
}

export { createTestData };
