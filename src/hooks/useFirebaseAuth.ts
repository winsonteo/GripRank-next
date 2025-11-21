'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/client';

export function useFirebaseAuth() {
  const { user, isSignedIn, isLoaded } = useUser();
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUserId, setLastUserId] = useState<string | null>(null);

  // Effect 1: Handle Firebase sign-in when Clerk is signed in
  useEffect(() => {
    async function authenticateWithFirebase() {
      // Wait for Clerk to load
      if (!isLoaded) return;

      // If not signed into Clerk, skip Firebase auth (sign-out handled separately)
      if (!isSignedIn) {
        return;
      }

      // If Firebase Auth not available, skip
      if (!firebaseAuth) {
        console.warn('Firebase Auth not initialized');
        return;
      }

      try {
        // Check if already signed into Firebase with the same user
        if (firebaseAuth.currentUser && firebaseAuth.currentUser.uid === user?.id) {
          console.log('✅ Already signed into Firebase:', firebaseAuth.currentUser.uid);
          setIsFirebaseAuthenticated(true);
          setLastUserId(user.id);
          return;
        }

        console.log('🔄 Fetching Firebase custom token...');

        // Get custom token from our API
        const response = await fetch('/api/auth/firebase-token');

        if (!response.ok) {
          // Server returns generic errors for security
          // Detailed diagnostics are in server logs only
          const errorData = await response.json().catch(() => ({
            error: 'Unknown error',
            code: 'UNKNOWN'
          }));

          // Log the error code for client-side debugging
          console.error('❌ Token fetch failed:', {
            status: response.status,
            code: errorData.code,
            error: errorData.error,
          });

          // Construct user-friendly error message
          const errorMsg = response.status === 401
            ? 'Authentication required. Please sign in again.'
            : 'Failed to authenticate with Firebase. Please try again.';

          throw new Error(errorMsg);
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
        setLastUserId(user?.id || null);
        setError(null);
      } catch (err) {
        console.error('❌ Firebase authentication error:', err);
        setError(err instanceof Error ? err.message : 'Authentication failed');
        setIsFirebaseAuthenticated(false);
      }
    }

    authenticateWithFirebase();
  }, [isLoaded, isSignedIn, user?.id]);

  // Effect 2: Handle Firebase sign-out when Clerk signs out or user switches accounts
  useEffect(() => {
    async function handleSignOut() {
      if (!firebaseAuth || !isLoaded) return;

      // Determine if we need to sign out:
      // 1. Clerk is not signed in (user logged out)
      // 2. User ID changed (account switch)
      const shouldSignOut = !isSignedIn || (lastUserId && user?.id && user.id !== lastUserId);

      if (shouldSignOut && firebaseAuth.currentUser) {
        try {
          await signOut(firebaseAuth);
          console.log('🔓 Signed out of Firebase');
          setIsFirebaseAuthenticated(false);
          setError(null);
        } catch (err) {
          console.error('❌ Firebase sign-out error:', err);
        }
      }

      // Update tracked user ID
      if (isSignedIn && user?.id) {
        setLastUserId(user.id);
      } else if (!isSignedIn) {
        setLastUserId(null);
      }
    }

    handleSignOut();
  }, [isLoaded, isSignedIn, user?.id, lastUserId]);

  return { isFirebaseAuthenticated, error };
}
