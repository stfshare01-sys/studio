import * as admin from 'firebase-admin';
import { firebaseConfig } from '../src/firebase/config';

// Optionally connect to emulator if you are testing locally.
// If you want to run against production, ensure you have GOOGLE_APPLICATION_CREDENTIALS set.
// Uncomment these if you are testing locally:
// process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
// process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';

// Initialize Admin SDK
if (!admin.apps.length) {
    admin.initializeApp({ projectId: firebaseConfig.projectId });
}
const db = admin.firestore();

async function syncManagers() {
    console.log('Starting managerId sync from employees to users collection...');
    try {
        const employeesSnap = await db.collection('employees').get();
        const batch = db.batch();
        let count = 0;

        employeesSnap.docs.forEach((doc) => {
            const data = doc.data();
            if (data.directManagerId) {
                const userRef = db.collection('users').doc(doc.id);
                // Update the user document to have the exact managerId
                batch.update(userRef, { managerId: data.directManagerId });
                count++;
            }
        });

        if (count > 0) {
            await batch.commit();
            console.log(`Successfully synced ${count} managerIds to the users collection.`);
        } else {
            console.log('No employees with directManagerId found.');
        }

        process.exit(0);
    } catch (error) {
        console.error('Error syncing managers:', error);
        process.exit(1);
    }
}

syncManagers();
