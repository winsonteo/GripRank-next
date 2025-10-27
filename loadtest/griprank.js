import http from 'k6/http';
import { sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';

// --------- ENV ---------
const PROJECT_ID = __ENV.FIREBASE_PROJECT_ID;
const API_KEY    = __ENV.FIREBASE_API_KEY;
const COMP_ID    = __ENV.TEST_COMP_ID || 'test-open-2025';
const CAT_ID     = __ENV.TEST_CAT_ID  || 'mens-open';
const ATHLETE_ID = __ENV.TEST_ATHLETE_ID || 'athlete-demo';
const ROUTE_ID   = __ENV.TEST_ROUTE_ID   || 'B1';
const JUDGE_EMAIL    = __ENV.JUDGE_EMAIL;
const JUDGE_PASSWORD = __ENV.JUDGE_PASSWORD;

// Rates & durations (can be overridden by env)
const LEADERBOARD_RPS      = parseInt(__ENV.LEADERBOARD_RPS || '5', 10);
const LEADERBOARD_DURATION = __ENV.LEADERBOARD_DURATION || '30s';
const JUDGE_RATE           = parseInt(__ENV.JUDGE_RATE || '1', 10);
const JUDGE_DURATION       = __ENV.JUDGE_DURATION || '30s';

// --------- K6 OPTIONS / THRESHOLDS ---------
export const options = {
  scenarios: {
    leaderboard: {
      executor: 'constant-arrival-rate',
      rate: LEADERBOARD_RPS,
      timeUnit: '1s',
      duration: LEADERBOARD_DURATION,
      preAllocatedVUs: Math.max(20, LEADERBOARD_RPS * 2),
      maxVUs: Math.max(100, LEADERBOARD_RPS * 4),
      exec: 'leaderboard',
      tags: { scenario: 'leaderboard' },
    },
    judge: {
      executor: 'constant-arrival-rate',
      rate: JUDGE_RATE,
      timeUnit: '1s',
      duration: JUDGE_DURATION,
      preAllocatedVUs: Math.max(10, JUDGE_RATE * 2),
      maxVUs: Math.max(50, JUDGE_RATE * 4),
      exec: 'judge',
      tags: { scenario: 'judge' },
    },
  },
  thresholds: {
    // global http failures under 1%
    http_req_failed: ['rate<0.01'],
    // custom latency targets
    leaderboard_latency: ['p(95)<400'],
    judge_latency: ['p(95)<500'],
    // retry rate for judge writes should be small
    judge_retries: ['rate<=0.01'],
  },
};

// --------- METRICS ---------
const leaderboardLatency = new Trend('leaderboard_latency');
const judgeLatency       = new Trend('judge_latency');
const judgeRetries       = new Counter('judge_retries');

// --------- HELPERS ---------
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Sign in with email/password to get an ID token (for secured rules)
function getIdToken() {
  const url = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${API_KEY}`;
  const payload = JSON.stringify({
    email: JUDGE_EMAIL,
    password: JUDGE_PASSWORD,
    returnSecureToken: true,
  });
  const res = http.post(url, payload, {
    headers: { 'Content-Type': 'application/json' },
    tags: { endpoint: 'auth' },
  });
  if (res.status !== 200) {
    throw new Error(`Auth failed: ${res.status} ${res.body}`);
  }
  const body = JSON.parse(res.body);
  return body.idToken;
}

// Build standard headers
function headers(idToken) {
  const h = { 'Content-Type': 'application/json' };
  if (idToken) h['Authorization'] = `Bearer ${idToken}`;
  return h;
}

// --------- SETUP ---------
export function setup() {
  if (!PROJECT_ID || !API_KEY || !JUDGE_EMAIL || !JUDGE_PASSWORD) {
    throw new Error('Missing required env vars. Ensure FIREBASE_PROJECT_ID, FIREBASE_API_KEY, JUDGE_EMAIL, JUDGE_PASSWORD are set.');
  }
  const idToken = getIdToken();
  return { idToken };
}

// --------- LEADERBOARD SCENARIO ---------
// Simulate leaderboard polling via Firestore REST runQuery under the comp parent.
// Query attempts for the category, ordered by timestamp desc, limited.
export function leaderboard(data) {
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:runQuery`;
  const body = {
    parent: `projects/${PROJECT_ID}/databases/(default)/documents/boulderComps/${COMP_ID}`,
    structuredQuery: {
      from: [{ collectionId: 'attempts' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'categoryId' },
          op: 'EQUAL',
          value: { stringValue: CAT_ID },
        },
      },
      orderBy: [{ field: { fieldPath: 'createdAt' }, direction: 'DESCENDING' }],
      limit: 20,
    },
  };

  const t0 = Date.now();
  const res = http.post(url, JSON.stringify(body), {
    headers: headers(data.idToken),
    tags: { endpoint: 'leaderboard-runQuery' },
  });
  const dt = Date.now() - t0;
  leaderboardLatency.add(dt);

  // Optional: small think time
  sleep(0.1);
}

// --------- JUDGE SCENARIO ---------
// Simulate a judge writing an attempt into: boulderComps/{comp}/attempts/{doc}
// Document id starts with lt- so we can clean them up later.
export function judge(data) {
  const docId = `lt-${Date.now()}-${__VU}-${__ITER}`;
  const url = `${FIRESTORE_BASE}/boulderComps/${COMP_ID}/attempts?documentId=${docId}`;

  const attemptIndex = Math.floor(Math.random() * 5) + 1;
  const top  = Math.random() < 0.5;
  const zone = top ? true : Math.random() < 0.6;

  const body = {
    fields: {
      compId:      { stringValue: COMP_ID },
      categoryId:  { stringValue: CAT_ID },
      athleteId:   { stringValue: ATHLETE_ID },
      routeId:     { stringValue: ROUTE_ID },
      attemptIndex:{ integerValue: String(attemptIndex) },
      top:         { booleanValue: top },
      zone:        { booleanValue: zone },
      createdAt:   { timestampValue: new Date().toISOString() },
    },
  };

  // One retry on failure
  let res, dt;
  for (let attempt = 0; attempt < 2; attempt++) {
    const t0 = Date.now();
    res = http.post(url, JSON.stringify(body), {
      headers: headers(data.idToken),
      tags: { endpoint: 'judge-write' },
    });
    dt = Date.now() - t0;

    if (res.status >= 200 && res.status < 300) break;
    judgeRetries.add(1);
    sleep(0.2); // brief backoff
  }
  judgeLatency.add(dt);

  // Optional think time
  sleep(0.05);
}

// (No teardown; you can delete lt-* docs later in console)
