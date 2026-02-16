
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

async function inspectRelations() {
    console.log('--- USERS (Filtered) ---');
    const usersSnap = await db.collection('users').get();
    usersSnap.forEach(doc => {
        const data = doc.data();
        // Log users that look like director or have specific emails
        if (data.role === 'Director' || data.email?.includes('director') || data.email?.includes('patricia')) {
            console.log(`User UID: ${doc.id}, Email: ${data.email}, Role: ${data.role}`);
        }
    });

    console.log('\n--- EMPLOYEES (Filtered) ---');
    const empSnap = await db.collection('employees').get();
    empSnap.forEach(doc => {
        const data = doc.data();
        // Log employees with relevant IDs
        if (doc.id.includes('director') || data.userId?.includes('director') || data.email?.includes('director')) {
            console.log(`Emp ID: ${doc.id}, Name: ${data.fullName}, UserID: ${data.userId}, ManagerID: ${data.directManagerId}, Email: ${data.email}`);
        }
    });

    console.log('\n--- TASKS SAMPLE ---');
    const tasksSnap = await db.collection('tasks').limit(5).get();
    tasksSnap.forEach(doc => {
        const data = doc.data();
        console.log(`Task ID: ${doc.id}, AssignedTo: ${data.assignedTo}, Title: ${data.title}`);
    });
}

inspectRelations();
