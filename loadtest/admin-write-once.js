// loadtest/admin-write-once.js
import admin from 'firebase-admin';

// Uses GOOGLE_APPLICATION_CREDENTIALS env var you set earlier
admin.initializeApp();

const db = admin.firestore();

// Pull IDs from your existing env (with defaults matching your setup)
const PROJECT_ID   = process.env.FIREBASE_PROJECT_ID || 'climbing-scoring-app-v1';
const COMP_ID      = process.env.TEST_COMP_ID || 'test-open-2025';
const CAT_ID       = process.env.TEST_CAT_ID  || 'mens-open';
const ATHLETE_ID   = process.env.TEST_ATHLETE_ID || 'athlete-demo';
const ROUTE_ID     = process.env.TEST_ROUTE_ID   || 'B1';

async function main() {
  const docId = `lt-admin-${Date.now()}`;
  const ref = db.doc(`boulderComps/${COMP_ID}/attempts/${docId}`);
  await ref.set({
    compId: COMP_ID,
    categoryId: CAT_ID,
    athleteId: ATHLETE_ID,
    routeId: ROUTE_ID,
    attemptIndex: 1,
    top: true,
    zone: true,
    symbol: 'T',                 // matches your rules’ expected field
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    _source: 'admin-write-once', // tag so you can identify it
  });
  console.log('Wrote doc:', ref.path);
  process.exit(0);
}

main().catch(err => {
  console.error('Write failed:', err);
  process.exit(1);
});

