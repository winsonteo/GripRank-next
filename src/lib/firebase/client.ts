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
  __FIREBASE_APP__?: FirebaseApp;
  __FIREBASE_AUTH__?: Auth;
  __FIREBASE_FIRESTORE__?: Firestore;
  __FIREBASE_PERSISTENCE_PROMISE__?: Promise<void>;
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let firestore: Firestore | null = null;
let persistencePromise: Promise<void> | null = null;

// Initialize Firebase only on client side
if (typeof window !== "undefined") {
  try {
    const firebaseConfig = resolveFirebaseConfig();
    const firebaseGlobal = globalThis as FirebaseGlobal;

    if (firebaseConfig) {
      // Get or initialize app - check global cache first
      if (firebaseGlobal.__FIREBASE_APP__) {
        app = firebaseGlobal.__FIREBASE_APP__;
      } else {
        app = getApps().length ? getApp() : initializeApp(firebaseConfig);
        firebaseGlobal.__FIREBASE_APP__ = app;
      }

      // Get Auth - check global cache first
      if (firebaseGlobal.__FIREBASE_AUTH__) {
        auth = firebaseGlobal.__FIREBASE_AUTH__;
      } else {
        auth = getAuth(app);
        firebaseGlobal.__FIREBASE_AUTH__ = auth;
      }

      // Get Firestore - check global cache first
      if (firebaseGlobal.__FIREBASE_FIRESTORE__) {
        firestore = firebaseGlobal.__FIREBASE_FIRESTORE__;
      } else {
        firestore = getFirestore(app);
        firebaseGlobal.__FIREBASE_FIRESTORE__ = firestore;
      }

      // Get persistence promise from global cache
      if (firebaseGlobal.__FIREBASE_PERSISTENCE_PROMISE__) {
        persistencePromise = firebaseGlobal.__FIREBASE_PERSISTENCE_PROMISE__;
      } else if (firestore) {
        initPersistence(firestore);
      }

      if (auth && firestore) {
        connectEmulators(auth, firestore);
      }
    }
  } catch (error) {
    // Silently ignore "already been started" errors during hot reload
    if (error instanceof Error && error.message.includes('already been started')) {
      // This is expected during development hot reloads - Firestore is already initialized
      // Just reuse the existing instances from global cache
      const firebaseGlobal = globalThis as FirebaseGlobal;
      app = firebaseGlobal.__FIREBASE_APP__ || null;
      auth = firebaseGlobal.__FIREBASE_AUTH__ || null;
      firestore = firebaseGlobal.__FIREBASE_FIRESTORE__ || null;
    } else {
      console.error("[firebase] Initialization error:", error);
      // Set to null to trigger fallback UI
      app = null;
      auth = null;
      firestore = null;
    }
  }
}

function initPersistence(db: Firestore) {
  const firebaseGlobal = globalThis as FirebaseGlobal;

  if (firebaseGlobal.__FIREBASE_PERSISTENCE_PROMISE__) {
    persistencePromise = firebaseGlobal.__FIREBASE_PERSISTENCE_PROMISE__;
    return;
  }

  persistencePromise = enableIndexedDbPersistence(db).catch((error) => {
    // Silently fail on persistence errors - this is not critical
    // Common errors: multiple tabs, private browsing, quota exceeded, already initialized
    if (error?.code !== 'failed-precondition' && process.env.NODE_ENV !== "production") {
      console.warn("[firebase] IndexedDB persistence not available:", error?.code || error?.message);
    }
    // failed-precondition = Firestore already started (hot reload), ignore silently
  });

  firebaseGlobal.__FIREBASE_PERSISTENCE_PROMISE__ = persistencePromise;
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
