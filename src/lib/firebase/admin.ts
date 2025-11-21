import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;
let adminAuthInstance: Auth | undefined;
let adminDbInstance: Firestore | undefined;

function getAdminApp(): App {
  // Return existing app if already initialized
  if (adminApp) {
    console.log('[Firebase Admin] Using existing app instance');
    return adminApp;
  }

  // Check if any Firebase Admin apps exist
  const existingApps = getApps();
  if (existingApps.length > 0) {
    console.log('[Firebase Admin] Using existing Firebase app');
    adminApp = existingApps[0];
    return adminApp;
  }

  // Initialize new app
  console.log('[Firebase Admin] Initializing new Firebase Admin app...');

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  // Validate environment variables
  const missingVars: string[] = [];
  if (!projectId) missingVars.push('FIREBASE_ADMIN_PROJECT_ID');
  if (!clientEmail) missingVars.push('FIREBASE_ADMIN_CLIENT_EMAIL');
  if (!privateKey) missingVars.push('FIREBASE_ADMIN_PRIVATE_KEY');

  if (missingVars.length > 0) {
    const errorMsg = `Missing Firebase Admin SDK environment variables: ${missingVars.join(', ')}`;
    console.error('[Firebase Admin] ' + errorMsg);
    throw new Error(errorMsg);
  }

  // TypeScript type assertion after validation
  // We've already checked that these are not undefined above
  const validatedProjectId = projectId!;
  const validatedClientEmail = clientEmail!;
  const validatedPrivateKey = privateKey!;

  // Validate private key format
  if (!validatedPrivateKey.includes('BEGIN PRIVATE KEY')) {
    const errorMsg = 'FIREBASE_ADMIN_PRIVATE_KEY is not in correct format (missing BEGIN PRIVATE KEY)';
    console.error('[Firebase Admin] ' + errorMsg);
    throw new Error(errorMsg);
  }

  try {
    // Replace escaped newlines in private key
    const formattedPrivateKey = validatedPrivateKey.replace(/\\n/g, '\n');

    adminApp = initializeApp({
      credential: cert({
        projectId: validatedProjectId,
        clientEmail: validatedClientEmail,
        privateKey: formattedPrivateKey,
      }),
    });

    console.log('[Firebase Admin] ✅ Firebase Admin app initialized successfully');
    return adminApp;
  } catch (error) {
    console.error('[Firebase Admin] Failed to initialize app:', error);
    throw new Error(`Failed to initialize Firebase Admin app: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function getAdminAuth(): Auth {
  if (!adminAuthInstance) {
    adminAuthInstance = getAuth(getAdminApp());
  }
  return adminAuthInstance;
}

export function getAdminDb(): Firestore {
  if (!adminDbInstance) {
    adminDbInstance = getFirestore(getAdminApp());
  }
  return adminDbInstance;
}
