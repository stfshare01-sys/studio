process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';

const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'studio-4943620722',
});
const db = admin.firestore();

async function audit() {
  const overrides = await db.collection('overtime_requests').get();
  let dh = 0;
  let th = 0;
  let reqh = 0;
  let apph = 0;
  
  let valid = 0;
  for(let doc of overrides.docs) {
    const data = doc.data();
    if(data.status === 'approved' || data.status === 'partial') {
      console.log(`Doc ${doc.id}: status=${data.status}, hrsReq=${data.hoursRequested}, hrsApp=${data.hoursApproved}, Dbl=${data.doubleHours}, Trp=${data.tripleHours}, date=${data.date}`);
      dh += (Number(data.doubleHours) || 0);
      th += (Number(data.tripleHours) || 0);
      reqh += (Number(data.hoursRequested) || 0);
      
      if (data.status === 'approved') {
        apph += (Number(data.hoursApproved) || Number(data.hoursRequested) || 0);
      } else {
        apph += (Number(data.hoursApproved) || 0);
      }
      valid++;
    }
  }
  
  console.log('--- SUMMARY ---');
  console.log(`Total valid docs (approved/partial): ${valid}`);
  console.log(`Sum of doubleHours + tripleHours: ${dh + th} (dh=${dh}, th=${th})`);
  console.log(`Sum of hoursApproved fallback logic (Team Mgmt): ${apph}`);
  console.log(`Sum of raw hoursRequested: ${reqh}`);
}

audit().catch(console.error);
