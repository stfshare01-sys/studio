
import { initializeApp } from 'firebase/app';
import { getFunctions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import { getAuth, signInWithCredential, connectAuthEmulator, GoogleAuthProvider, signInWithCustomToken } from 'firebase/auth';
import * as admin from 'firebase-admin';
import { firebaseConfig } from '../src/firebase/config';

// 1. Initialize Admin SDK (to fallback setup)
if (!admin.apps.length) {
    process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
    admin.initializeApp({
        projectId: firebaseConfig.projectId
    });
}
const db = admin.firestore();

// 2. Initialize Client SDK (to call function)
const app = initializeApp(firebaseConfig);
const functions = getFunctions(app, 'us-central1');
const auth = getAuth(app);

// Connect to Emulators
connectFunctionsEmulator(functions, '127.0.0.1', 5001);
connectAuthEmulator(auth, 'http://127.0.0.1:9099');

async function runTest() {
    console.log('🚀 Starting Integration Test: Employee Import...');

    const TEST_UID = 'test-admin-user';

    try {
        // A. Setup Test User in Firestore (Mocking Admin Role)
        console.log('👤 Setting up Test User (Admin)...');
        await db.collection('users').doc(TEST_UID).set({
            fullName: 'Test Admin',
            email: 'admin@stuffactory.mx',
            role: 'Admin', // Required by verifyRole
            createdAt: new Date().toISOString()
        });

        // B. Create Auth User & Get Token
        try {
            await admin.auth().deleteUser(TEST_UID);
        } catch { }
        await admin.auth().createUser({
            uid: TEST_UID,
            email: 'admin@stuffactory.mx',
            emailVerified: true
        });

        const customToken = await admin.auth().createCustomToken(TEST_UID);
        await signInWithCustomToken(auth, customToken);
        console.log('✅ Signed in as Admin');

        // C. Define 5 Dummy Employees
        const dummyEmployees = [
            { fullName: 'SpongeBob SquarePants', email: 'spongebob@bikini.bottom', department: 'Kitchen', positionTitle: 'Chef', hireDate: '1999-05-01', employmentType: 'full_time' },
            { fullName: 'Patrick Star', email: 'patrick@bikini.bottom', department: 'Unemployed', positionTitle: 'Consultant', hireDate: '1999-05-01', employmentType: 'part_time' },
            { fullName: 'Squidward Tentacles', email: 'squidward@bikini.bottom', department: 'Front Desk', positionTitle: 'Cashier', hireDate: '1999-05-01', employmentType: 'full_time' },
            { fullName: 'Mr. Krabs', email: 'krabs@bikini.bottom', department: 'Management', positionTitle: 'Owner', hireDate: '1999-05-01', employmentType: 'full_time' },
            { fullName: 'Sandy Cheeks', email: 'sandy@bikini.bottom', department: 'Science', positionTitle: 'Researcher', hireDate: '2000-01-01', employmentType: 'contractor' }
        ];

        // D. Call Cloud Function
        console.log('📞 Calling processEmployeeImport...');
        const importFn = httpsCallable(functions, 'processEmployeeImport');
        const result: any = await importFn({
            rows: dummyEmployees,
            filename: 'bikini_bottom_staff.csv'
        });

        console.log('📥 Function Result:', result.data);

        if (!result.data.success) {
            throw new Error(`Import failed: ${JSON.stringify(result.data.errors)}`);
        }

        // E. Verify Data in Firestore
        console.log('🔍 Verifying Firestore Data...');
        const employeesSnap = await db.collection('employees').get();
        const createdEmployees = employeesSnap.docs.filter(d => d.data().email.includes('@bikini.bottom'));

        console.log(`✅ Found ${createdEmployees.length} employees from test data.`);

        createdEmployees.forEach(doc => {
            const data = doc.data();
            console.log(`   - ${data.fullName} (${data.email}) | Salary Field: ${data.salaryDaily || 'UNDEFINED (GOOD)'}`);
            if (data.salaryDaily) {
                console.error('   ❌ FAILED: Salary field detected!');
                process.exit(1);
            }
        });

        console.log('🎉 TEST PASSED: Employees imported successfully without monetary data.');
        process.exit(0);

    } catch (error) {
        console.error('❌ TEST FAILED:', error);
        process.exit(1);
    }
}

runTest();
