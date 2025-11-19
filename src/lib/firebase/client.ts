'use client';

import type { FirebaseApp, FirebaseOptions } from "firebase/app";
import { initializeApp, getApps, getApp } from "firebase/app";
import type { Auth } from "firebase/auth";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import type { Firestore } from "firebase/firestore";
import {
  connectFirestoreEmulator,
  enableIndexedDbPersistence,
  getFirestore,
} from "firebase/firestore";

type FirebaseGlobal = typeof globalThis & {
  __FIREBASE_EMULATORS_CONNECTED__?: boolean;
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let persistencePromise: Promise<void> | null = null;

// Initialize Firebase only on client side
if (typeof window !== "undefined") {
  try {
    const firebaseConfig = resolveFirebaseConfig();

    if (firebaseConfig) {
      app = getApps().length ? getApp() : initializeApp(firebaseConfig);
      auth = getAuth(app);
      firestore = getFirestore(app);

      if (firestore) {
        initPersistence(firestore);
      }

      if (auth && firestore) {
        connectEmulators(auth, firestore);
      }
    }
  } catch (error) {
    console.error("[firebase] Initialization error:", error);
    // Set to null to trigger fallback UI
    app = null;
    auth = null;
    firestore = null;
  }
}

function initPersistence(db: Firestore) {
  if (persistencePromise) return;

  persistencePromise = enableIndexedDbPersistence(db).catch((error) => {
    // Silently fail on persistence errors - this is not critical
    // Common errors: multiple tabs, private browsing, quota exceeded, already initialized
    if (error?.code !== 'failed-precondition' && process.env.NODE_ENV !== "production") {
      console.warn("[firebase] IndexedDB persistence not available:", error?.code || error?.message);
    }
    // failed-precondition = Firestore already started (hot reload), ignore silently
  });
}

function connectEmulators(authInstance: Auth, firestoreInstance: Firestore) {
  if (window.location.hostname !== "localhost") return;
  const firebaseGlobal = globalThis as FirebaseGlobal;
  if (firebaseGlobal.__FIREBASE_EMULATORS_CONNECTED__) return;

  connectAuthEmulator(authInstance, "http://localhost:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(firestoreInstance, "localhost", 8080);
  firebaseGlobal.__FIREBASE_EMULATORS_CONNECTED__ = true;
}

function resolveFirebaseConfig(): FirebaseOptions | null {
  const requiredEntries = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = Object.entries(requiredEntries)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[firebase] Missing client configuration for: ${missing.join(", ")}`
      );
    }
    return null;
  }

  const config: FirebaseOptions = {
    apiKey: requiredEntries.apiKey!,
    authDomain: requiredEntries.authDomain!,
    projectId: requiredEntries.projectId!,
    storageBucket: requiredEntries.storageBucket!,
    messagingSenderId: requiredEntries.messagingSenderId!,
    appId: requiredEntries.appId!,
  };

  if (process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) {
    config.measurementId = process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID;
  }

  return config;
}

export { app, auth, firestore };
export const firestorePersistence = {
  enablePromise: () => persistencePromise,
};
