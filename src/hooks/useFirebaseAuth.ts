'use client';

import { useEffect, useState, useRef } from 'react';
import { useUser } from '@clerk/nextjs';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/client';

/**
 * useFirebaseAuth - Clerk ↔ Firebase Authentication Sync
 *
 * CRITICAL INVARIANTS (see CLAUDE.md Auth & Firestore Rules Design Contract):
 *
 * 1. If Clerk is signed out → Firebase must be signed out
 * 2. If Clerk is signed in as user X → Firebase must be user X (UID match)
 * 3. On user switch A→B: Firebase signs out A before signing in B
 * 4. At most one in-flight token request per user (no parallel requests)
 * 5. On error: Surface clear error, prefer no Firebase user over wrong user
 *
 * This hook prevents race conditions that cause:
 * - Judge attempts attributed to wrong user
 * - Firestore permission errors (wrong UID in claims)
 * - Stale authentication state after user switch
 */
export function useFirebaseAuth() {
  const { user, isSignedIn, isLoaded } = useUser();
  const [isFirebaseAuthenticated, setIsFirebaseAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // INVARIANT 4: Track in-flight operations to enable cancellation
  // Prevents parallel token requests for the same user
  const abortControllerRef = useRef<AbortController | null>(null);

  // Track last successfully authenticated user to detect switches
  // Used to enforce INVARIANT 3 (sign out before switching users)
  const lastAuthenticatedUserRef = useRef<string | null>(null);

  useEffect(() => {
    // INVARIANT ENFORCEMENT: Single unified effect handles all auth state changes
    // This prevents race conditions between separate sign-in/sign-out effects
    async function syncFirebaseAuth() {
      // Wait for Clerk to load (prevents premature sign-out)
      if (!isLoaded) return;

      // Check if Firebase Auth is available
      if (!firebaseAuth) {
        console.warn('Firebase Auth not initialized');
        setError('firebase-not-initialized');
        setIsFirebaseAuthenticated(false);
        return;
      }

      const currentClerkUserId = isSignedIn ? user?.id : null;
      const currentFirebaseUserId = firebaseAuth.currentUser?.uid || null;

      // ========================================================================
      // CASE 1: Clerk is signed out
      // INVARIANT 1: If Clerk signed out → Firebase must sign out
      // ========================================================================
      if (!isSignedIn) {
        // Cancel any in-flight token requests (INVARIANT 4)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        // Sign out Firebase if currently signed in
        if (currentFirebaseUserId) {
          try {
            await signOut(firebaseAuth);
            console.log('🔓 Firebase signed out (Clerk signed out)');
          } catch (err) {
            console.error('❌ Firebase sign-out error:', err);
          }
        }

        // Reset state (INVARIANT 5: prefer no user over wrong user)
        setIsFirebaseAuthenticated(false);
        setError(null);
        lastAuthenticatedUserRef.current = null;
        return;
      }

      // ========================================================================
      // CASE 2: Clerk is signed in
      // INVARIANT 2: Firebase UID must match Clerk user ID
      // ========================================================================
      const clerkUserId = currentClerkUserId!;

      // If already authenticated with correct user, skip re-authentication
      if (currentFirebaseUserId === clerkUserId) {
        console.log('✅ Firebase already authenticated as correct user:', clerkUserId);
        setIsFirebaseAuthenticated(true);
        setError(null);
        lastAuthenticatedUserRef.current = clerkUserId;
        return;
      }

      // ========================================================================
      // CASE 3: User switch detected
      // INVARIANT 3: Sign out old user before signing in new user
      // ========================================================================
      if (currentFirebaseUserId && currentFirebaseUserId !== clerkUserId) {
        console.log('🔄 User switch detected:', currentFirebaseUserId, '→', clerkUserId);

        // Cancel any in-flight requests for the old user (INVARIANT 4)
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
          abortControllerRef.current = null;
        }

        // Sign out old user before proceeding
        try {
          await signOut(firebaseAuth);
          console.log('🔓 Firebase signed out old user:', currentFirebaseUserId);
        } catch (err) {
          console.error('❌ Failed to sign out old user:', err);
          // Continue anyway - we'll try to sign in the new user
        }

        // Reset state
        setIsFirebaseAuthenticated(false);
        lastAuthenticatedUserRef.current = null;
      }

      // ========================================================================
      // CASE 4: Need to sign in to Firebase
      // INVARIANT 4: At most one in-flight request per user
      // ========================================================================

      // Cancel any existing in-flight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      // Create new AbortController for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        console.log('🔄 Fetching Firebase custom token for user:', clerkUserId);

        // Fetch custom token from API
        const response = await fetch('/api/auth/firebase-token', {
          signal: abortController.signal,
        });

        // Check if request was aborted (user switched during fetch)
        if (abortController.signal.aborted) {
          console.log('⚠️ Token request aborted (user switch or sign-out)');
          return;
        }

        if (!response.ok) {
          await response.json().catch(() => null); // Consume response body
          throw new Error(
            response.status === 401
              ? 'Authentication required. Please sign in again.'
              : 'Failed to authenticate with Firebase. Please try again.'
          );
        }

        const data = await response.json();

        // Double-check: Ensure we're still supposed to sign in this user
        // (user might have switched during the fetch)
        if (abortController.signal.aborted || user?.id !== clerkUserId) {
          console.log('⚠️ User changed during token fetch, ignoring token');
          return;
        }

        if (!data.token) {
          throw new Error('No token received from API');
        }

        console.log('🔐 Signing into Firebase with custom token...');

        // Sign in to Firebase
        const userCredential = await signInWithCustomToken(firebaseAuth, data.token);

        // Final verification: Ensure UID matches (INVARIANT 2)
        if (userCredential.user.uid !== clerkUserId) {
          throw new Error(
            `UID mismatch: Expected ${clerkUserId}, got ${userCredential.user.uid}`
          );
        }

        console.log('✅ Firebase authenticated successfully:', userCredential.user.uid);
        console.log('📝 User role:', data.role);

        // Update state only if request wasn't aborted
        if (!abortController.signal.aborted) {
          setIsFirebaseAuthenticated(true);
          setError(null);
          lastAuthenticatedUserRef.current = clerkUserId;
        }

      } catch (err) {
        // Ignore AbortError (expected when user switches)
        if (err instanceof Error && err.name === 'AbortError') {
          console.log('⚠️ Request aborted');
          return;
        }

        // INVARIANT 5: On error, surface error and ensure no wrong user is signed in
        console.error('❌ Firebase authentication error:', err);

        // If Firebase has wrong user signed in, sign out (prefer no user over wrong user)
        if (firebaseAuth.currentUser && firebaseAuth.currentUser.uid !== clerkUserId) {
          try {
            await signOut(firebaseAuth);
            console.log('🔓 Signed out Firebase due to error (wrong user)');
          } catch (signOutErr) {
            console.error('❌ Failed to sign out after error:', signOutErr);
          }
        }

        setError(err instanceof Error ? err.message : 'Authentication failed');
        setIsFirebaseAuthenticated(false);
        lastAuthenticatedUserRef.current = null;

      } finally {
        // Clear the abort controller if it's still the current one
        if (abortControllerRef.current === abortController) {
          abortControllerRef.current = null;
        }
      }
    }

    syncFirebaseAuth();

    // Cleanup function: abort any in-flight requests when effect re-runs
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [isLoaded, isSignedIn, user?.id]);

  return { isFirebaseAuthenticated, error };
}
