
import * as admin from 'firebase-admin';
import { firebaseConfig } from '../src/firebase/config';

if (!admin.apps.length) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    admin.initializeApp({ projectId: firebaseConfig.projectId });
}
const db = admin.firestore();

async function verify() {
    console.log('🔍 Verificando datos...');

    // 1. Period Closures
    const closuresSnapshot = await db.collection('period_closures').get();
    console.log(`✅ Cierres de Período encontrados: ${closuresSnapshot.size}`);
    closuresSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - Período: ${data.period}, Usuario: ${data.userId}, Fecha: ${data.closedAt}`);
    });

    // 2. Imports
    const importsSnapshot = await db.collection('attendance_imports').get();
    console.log(`✅ Imports encontrados: ${importsSnapshot.size}`);
    importsSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - Batch: ${data.id}, Período: ${data.period}, Registros: ${data.totalRecords}`);
    });

    // 3. Attendance Sample
    const attendanceSnapshot = await db.collection('attendance').limit(5).get();
    console.log(`✅ Muestra de Asistencias (Limit 5):`);
    attendanceSnapshot.forEach(doc => {
        const data = doc.data();
        console.log(`   - Emp: ${data.employeeName}, Fecha: ${data.date}, CheckIn: ${data.checkIn}, Valid: ${data.isValid}`);
    });

    // 4. Counts
    const attendanceCount = (await db.collection('attendance').count().get()).data().count;
    console.log(`Total Asistencias: ${attendanceCount}`);

    const otCount = (await db.collection('overtime_requests').count().get()).data().count;
    console.log(`Total Solicitudes OT: ${otCount}`);

    const incidenceCount = (await db.collection('incidences').count().get()).data().count;
    console.log(`Total Incidencias: ${incidenceCount}`);

}

verify().catch(console.error);
