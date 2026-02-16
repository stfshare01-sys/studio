
const admin = require('firebase-admin');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-4943620722-1724d'
    });
}

const db = admin.firestore();

async function diagnose() {
    console.log('--- GLOBAL DIAGNOSSTIC START ---');

    // Check all attendance
    const attendanceCount = await db.collection('attendance').count().get();
    console.log(`Total attendance records: ${attendanceCount.data().count}`);

    // Sample years
    const periods = [
        { start: '2025-01-01', end: '2025-12-31', label: 'Year 2025' },
        { start: '2026-01-01', end: '2026-12-31', label: 'Year 2026' }
    ];

    for (const p of periods) {
        const snap = await db.collection('attendance')
            .where('date', '>=', p.start)
            .where('date', '<=', p.end)
            .limit(1)
            .get();
        console.log(`${p.label}: At least one record found? ${!snap.empty}`);
        if (!snap.empty) {
            console.log(`- Sample date from ${p.label}: ${snap.docs[0].data().date}`);
        }
    }

    // Check prenomina
    const prenominaSnap = await db.collection('prenomina').orderBy('periodStart').get();
    console.log(`Total Prenomina records: ${prenominaSnap.size}`);
    prenominaSnap.forEach(doc => {
        const d = doc.data();
        console.log(`- Prenomina [${doc.id}]: ${d.periodStart} to ${d.periodEnd} (${d.periodType}) ${d.employeeName}`);
    });

    console.log('--- GLOBAL DIAGNOSSTIC END ---');
}

diagnose().catch(console.error);
