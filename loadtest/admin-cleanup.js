// loadtest/admin-cleanup.js
import admin from 'firebase-admin';

admin.initializeApp();
const db = admin.firestore();

// ENV with sensible defaults
const COMP_ID = process.env.TEST_COMP_ID || 'test-open-2025';

// Match test docs created by our load tests:
// - IDs starting with "lt-" or "lt-admin-"
// - or docs tagged with _source: 'admin-loadtest' / 'admin-write-once'
const ATTEMPTS_COL = `boulderComps/${COMP_ID}/attempts`;
const BATCH_SIZE = 300;

function isTestDoc(doc) {
  const id = doc.id || '';
  const data = doc.data() || {};
  const source = data._source || '';
  return (
    id.startsWith('lt-') ||
    id.startsWith('lt-admin-') ||
    source === 'admin-loadtest' ||
    source === 'admin-write-once'
  );
}

async function collectTargets() {
  const out = [];
  let last = null;
  while (true) {
    let q = db.collection(ATTEMPTS_COL).orderBy(admin.firestore.FieldPath.documentId()).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    for (const doc of snap.docs) {
      if (isTestDoc(doc)) out.push(doc.ref);
    }
    last = snap.docs[snap.docs.length - 1].id;
    if (snap.size < 1000) break;
  }
  return out;
}

async function deleteInBatches(refs) {
  let deleted = 0;
  for (let i = 0; i < refs.length; i += BATCH_SIZE) {
    const batch = db.batch();
    const slice = refs.slice(i, i + BATCH_SIZE);
    slice.forEach(ref => batch.delete(ref));
    await batch.commit();
    deleted += slice.length;
    console.log(`Deleted ${deleted}/${refs.length} ...`);
  }
  return deleted;
}

(async () => {
  console.log(`Scanning ${ATTEMPTS_COL} for test docs...`);
  const targets = await collectTargets();
  if (targets.length === 0) {
    console.log('Nothing to delete. ✅');
    process.exit(0);
  }

  console.log(`Found ${targets.length} test docs to delete.`);
  const reallyDelete = process.argv.includes('--delete');

  if (!reallyDelete) {
    console.log('DRY RUN — showing the first 10 doc paths:');
    targets.slice(0, 10).forEach(ref => console.log('  ', ref.path));
    console.log('\nTo delete them, run again with the --delete flag:');
    console.log('  node loadtest/admin-cleanup.js --delete');
    process.exit(0);
  }

  const count = await deleteInBatches(targets);
  console.log(`Done. Deleted ${count} docs. ✅`);
  process.exit(0);
})().catch(err => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});

