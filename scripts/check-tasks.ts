
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

async function checkTasks() {
    console.log('Checking recent tasks...');
    const snapshot = await db.collection('tasks')
        .orderBy('createdAt', 'desc')
        .limit(10)
        .get();

    if (snapshot.empty) {
        console.log('No tasks found in the collection.');
        return;
    }

    console.log(`Found ${snapshot.size} recent tasks:`);
    snapshot.docs.forEach(doc => {
        const data = doc.data();
        console.log(`\nID: ${doc.id}`);
        console.log(`Title: ${data.title}`);
        console.log(`Type: ${data.type}`);
        console.log(`Assigned To: ${data.assignedTo}`);
        console.log(`Status: ${data.status}`);
        console.log(`Created At: ${data.createdAt}`);
    });
}

async function checkUser(userId: string) {
    console.log(`\nChecking user properties for ID: ${userId}`);
    const doc = await db.collection('users').doc(userId).get();
    if (!doc.exists) {
        console.log('User NOT FOUND in "users" collection.');
    } else {
        console.log('User FOUND:', doc.data());
    }

    // Check if there is an employee linked
    const empSnap = await db.collection('employees').where('userId', '==', userId).get();
    if (empSnap.empty) {
        console.log('No Employee record linked to this User ID.');
    } else {
        console.log(`Linked Employee ID: ${empSnap.docs[0].id}`);
    }
}

checkTasks().then(() => {
    // If tasks exist, check the assignee user
    // We'll see the assignee ID in the output
});
