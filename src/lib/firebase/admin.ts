import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';

let adminApp: App | undefined;
let adminAuthInstance: Auth | undefined;
let adminDbInstance: Firestore | undefined;

function getAdminApp(): App {
  // Return existing app if already initialized
  if (adminApp) {
    return adminApp;
  }

  // Check if any Firebase Admin apps exist
  const existingApps = getApps();
  if (existingApps.length > 0) {
    adminApp = existingApps[0];
    return adminApp;
  }

  // Initialize new app
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing Firebase Admin SDK environment variables');
  }

  // Replace escaped newlines in private key
  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  adminApp = initializeApp({
    credential: cert({
      projectId,
      clientEmail,
      privateKey: formattedPrivateKey,
    }),
  });

  return adminApp;
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
