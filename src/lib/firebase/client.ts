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

const firebaseConfig: FirebaseOptions = {
  apiKey: requiredEnv("NEXT_PUBLIC_FIREBASE_API_KEY"),
  authDomain: requiredEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
  projectId: requiredEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
  storageBucket: requiredEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: requiredEnv("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
  appId: requiredEnv("NEXT_PUBLIC_FIREBASE_APP_ID"),
  ...(process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
    ? { measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID }
    : {}),
};

type FirebaseGlobal = typeof globalThis & {
  __FIREBASE_EMULATORS_CONNECTED__?: boolean;
};

const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);
const firestore: Firestore = getFirestore(app);

let persistencePromise: Promise<void> | null = null;

if (typeof window !== "undefined") {
  initPersistence(firestore);
  connectEmulators(auth, firestore);
}

function initPersistence(db: Firestore) {
  if (persistencePromise) return;

  persistencePromise = enableIndexedDbPersistence(db).catch((error) => {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[firebase] Failed to enable IndexedDB persistence", error);
    }
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

function requiredEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export { app, auth, firestore };
export const firestorePersistence = {
  enablePromise: () => persistencePromise,
};
