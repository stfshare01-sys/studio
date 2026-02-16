
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

async function inspectLatestErrors() {
    console.log('Fetching latest import batch...');
    try {
        const snapshot = await db.collection('attendance_imports')
            .orderBy('uploadedAt', 'desc')
            .limit(1)
            .get();

        if (snapshot.empty) {
            console.log('No import batches found.');
            return;
        }

        const doc = snapshot.docs[0];
        const data = doc.data();

        console.log(`\nBatch ID: ${doc.id}`);
        // Handle potentially missing fields or different date formats
        const date = data.uploadedAt?.toDate?.() || data.uploadedAt;
        console.log(`Date: ${date}`);
        console.log(`Status: ${data.status}`);
        console.log(`Records: ${data.recordCount}`);
        console.log(`Success: ${data.successCount}`);
        console.log(`Errors: ${data.errorCount}`);

        if (data.errors && data.errors.length > 0) {
            console.log('\n--- First 10 Errors ---');
            data.errors.slice(0, 10).forEach((err: any) => {
                console.log(`Row ${err.row}: ${err.message}`);
            });

            // Check for common patterns
            const messages = data.errors.map((e: any) => e.message);
            const patterns: Record<string, number> = {};
            messages.forEach((msg: string) => {
                const key = msg.split(':')[0].substring(0, 50); // Group by first 50 chars
                patterns[key] = (patterns[key] || 0) + 1;
            });

            console.log('\n--- Error summary ---');
            Object.entries(patterns).forEach(([key, count]) => {
                console.log(`${count}x ${key}...`);
            });
        } else {
            console.log('No detailed errors found in the errors array.');
        }

    } catch (e) {
        console.error('Error:', e);
    }
}

inspectLatestErrors();
