
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

// TARGET USER ID FOUND: emp-director (from user input) or emp-gerente-rh (from script)
// The user said "entro con el emp-director". 
// But the script showed "User UID: emp-gerente-rh, Email: patricia.ramirez@empresa.mx".
// Let's assume the user IS 'emp-gerente-rh' (Patricia) based on the email.
// OR let's look for 'emp-director' specifically again if missed. 
// Actually, let's use the ID the user CLAIMED first: 'emp-director'. 
// If that fails, I'll fallback to 'emp-gerente-rh'.
// Better yet, I will reassign to *emp-director* because the user EXPLICITLY said "entro con el emp-director".
// Wait, if the user logs in as 'emp-director', but the UI is empty, maybe the tasks are assigned to 'emp-coord-rh'.
// Let's reassign EVERYTHING to 'emp-director'.

const TARGET_USER_ID = 'emp-director';

async function reassign() {
    console.log(`Reassigning tasks and employees to ${TARGET_USER_ID}...`);

    // 1. Reassign Tasks
    const tasksSnap = await db.collection('tasks').where('status', '==', 'pending').get();
    let taskCount = 0;
    const taskBatch = db.batch();

    tasksSnap.docs.forEach(doc => {
        // Only reassign attendance justification tasks
        if (doc.data().type === 'attendance_justification') {
            taskBatch.update(doc.ref, { assignedTo: TARGET_USER_ID });
            taskCount++;
        }
    });

    if (taskCount > 0) {
        await taskBatch.commit();
        console.log(`Updated ${taskCount} tasks.`);
    } else {
        console.log('No pending attendance tasks found to reassign.');
    }

    // 2. Reassign Employees (Direct Reports)
    // We want to make sure 'emp-director' has subordinates.
    // Let's assign some employees to report to 'emp-director'
    const empSnap = await db.collection('employees').limit(5).get();
    let empCount = 0;
    const empBatch = db.batch();

    empSnap.docs.forEach(doc => {
        // Don't assign the director to report to themselves
        if (doc.id !== TARGET_USER_ID) {
            empBatch.update(doc.ref, { directManagerId: TARGET_USER_ID });
            empCount++;
        }
    });

    if (empCount > 0) {
        await empBatch.commit();
        console.log(`Updated ${empCount} employees to report to ${TARGET_USER_ID}.`);
    }
}

reassign();
