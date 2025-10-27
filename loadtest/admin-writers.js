// loadtest/admin-writers.js
import admin from 'firebase-admin';
import { readFileSync } from 'fs';

admin.initializeApp();

const db = admin.firestore();

const COMP_ID = process.env.TEST_COMP_ID || 'test-open-2025';
const CAT_ID  = process.env.TEST_CAT_ID  || 'mens-open';
const ATHLETE_ID = process.env.TEST_ATHLETE_ID || 'athlete-demo';
const ROUTE_ID   = process.env.TEST_ROUTE_ID   || 'B1';

const NUM_JUDGES = 6;            // simulate 6 judges
const TEST_DURATION_MS = 20 * 60 * 1000; // 20 minutes
const AVG_INTERVAL_MS = 7000;    // average interval between writes per judge

const sleep = ms => new Promise(r => setTimeout(r, ms));
const jitter = base => Math.max(500, base * (0.6 + Math.random() * 0.8));

async function judgeLoop(id) {
  const start = Date.now();
  let count = 0;
  while (Date.now() - start < TEST_DURATION_MS) {
    const docId = `lt-${id}-${Date.now()}`;
    const ref = db.doc(`boulderComps/${COMP_ID}/attempts/${docId}`);
    const top = Math.random() < 0.5;
    const zone = top ? true : Math.random() < 0.6;
    await ref.set({
      compId: COMP_ID,
      categoryId: CAT_ID,
      athleteId: ATHLETE_ID,
      routeId: ROUTE_ID,
      attemptIndex: Math.floor(Math.random() * 5) + 1,
      top,
      zone,
      symbol: top ? 'T' : (zone ? 'Z' : '1'),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      judgeId: `J${id}`,
      _source: 'admin-loadtest'
    }).catch(e => console.error('Judge', id, 'error:', e.code || e.message));
    count++;
    await sleep(jitter(AVG_INTERVAL_MS));
  }
  console.log(`Judge ${id} done (${count} writes)`);
}

async function main() {
  console.log(`Starting ${NUM_JUDGES} simulated judges for ${(TEST_DURATION_MS/60000)} mins...`);
  await Promise.all(Array.from({ length: NUM_JUDGES }, (_, i) => judgeLoop(i + 1)));
  console.log('All judges complete');
  process.exit(0);
}

main();

