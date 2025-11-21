'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { signInWithCustomToken } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/client';

export function useFirebaseAuth() {
  const { isSignedIn, isLoaded } = useUser();
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function authenticateWithFirebase() {
      // Wait for Clerk to load
      if (!isLoaded) return;

      // If not signed into Clerk, skip Firebase auth
      if (!isSignedIn) {
        setIsFirebaseAuthenticated(false);
        return;
      }

      // If Firebase Auth not available, skip
      if (!firebaseAuth) {
        console.warn('Firebase Auth not initialized');
        return;
      }

      try {
        // Check if already signed into Firebase
        if (firebaseAuth.currentUser) {
          console.log('✅ Already signed into Firebase:', firebaseAuth.currentUser.uid);
          setIsFirebaseAuthenticated(true);
          return;
        }

        console.log('🔄 Fetching Firebase custom token...');

        // Get custom token from our API
        const response = await fetch('/api/auth/firebase-token');

        if (!response.ok) {
          throw new Error(`Failed to get Firebase token: ${response.status}`);
        }

        const data = await response.json();
        console.log('📝 Token received, role:', data.role);

        if (!data.token) {
          throw new Error('No token received from API');
        }

        // Sign into Firebase with custom token
        console.log('🔐 Signing into Firebase...');
        const userCredential = await signInWithCustomToken(firebaseAuth, data.token);
        console.log('✅ Firebase sign-in successful:', userCredential.user.uid);

        setIsFirebaseAuthenticated(true);
        setError(null);
      } catch (err) {
        console.error('❌ Firebase authentication error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setIsFirebaseAuthenticated(false);
      }
    }

    authenticateWithFirebase();
  }, [isLoaded, isSignedIn]);

  return { isFirebaseAuthenticated, error };
}
