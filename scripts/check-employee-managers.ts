
import * as admin from 'firebase-admin';

// Initialize admin SDK for emulator
process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = 'localhost:9099';
process.env.GCLOUD_PROJECT = 'studio-4943620722-1724d';

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'studio-4943620722-1724d'
    });
}

const db = admin.firestore();

async function checkManagers() {
    console.log('Checking employees for Direct Manager ID...');
    const snapshot = await db.collection('employees').limit(20).get();

    if (snapshot.empty) {
        console.log('No employees found.');
        return;
    }

    let withManager = 0;
    let withoutManager = 0;

    snapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.directManagerId) {
            console.log(`[OK] ${data.fullName} -> Manager: ${data.directManagerId}`);
            withManager++;
        } else {
            console.warn(`[MISSING] ${data.fullName} has NO directManagerId`);
            withoutManager++;
        }
    });

    console.log('\n--- Summary ---');
    console.log(`With Manager: ${withManager}`);
    console.log(`Without Manager: ${withoutManager}`);
}

checkManagers();
