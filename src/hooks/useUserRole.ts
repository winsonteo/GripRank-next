'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { auth as firebaseAuth } from '@/lib/firebase/client';

/**
 * User roles in GripRank
 * Source: Firestore roles/{userId} collection → Firebase custom token claims
 */
export type UserRole = 'viewer' | 'judge' | 'staff' | 'admin';

/**
 * useUserRole - Get the current user's role from Firebase token claims
 *
 * ROLE SOURCE:
 * The role comes from Firebase custom token claims, set by /api/auth/firebase-token
 * when the user signs in. The claims are derived from Firestore roles/{userId}.
 *
 * ROLE HIERARCHY:
 * - viewer: Default role, read-only access
 * - judge: Can create attempts at judge stations
 * - staff: Judge + additional admin capabilities
 * - admin: Full access to all features
 *
 * RACE CONDITION PREVENTION:
 * Integrates with Clerk to avoid showing "access denied" while Firebase auth
 * is still in progress. If Clerk is signed in but Firebase user doesn't exist yet,
 * keeps loading=true to wait for useFirebaseAuth to complete.
 *
 * USAGE:
 * ```typescript
 * const { role, loading } = useUserRole();
 *
 * if (loading) return <Loading />;
 * if (role !== 'judge' && role !== 'staff' && role !== 'admin') {
 *   return <AccessDenied />;
 * }
 * ```
 */
export function useUserRole() {
  const { isSignedIn, isLoaded: clerkLoaded, user: clerkUser } = useUser();
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // CRITICAL: Reset state on any parameter change
    // Prevents stale role from previous user
    setRole(null);
    setLoading(true);

    // Wait for Clerk to load first
    if (!clerkLoaded) {
      return;
    }

    // If not signed into Clerk, user has no role
    if (!isSignedIn) {
      setRole(null);
      setLoading(false);
      return;
    }

    // Clerk is signed in - check Firebase
    if (!firebaseAuth) {
      console.warn('[useUserRole] Firebase Auth not initialized');
      setRole(null);
      setLoading(false);
      return;
    }

    // CRITICAL: Track if Firebase auth resolves within reasonable time
    // If useFirebaseAuth fails completely, we need to stop loading
    const timeoutId = setTimeout(() => {
      console.warn('[useUserRole] Firebase auth timeout - assuming no Firebase user');
      setRole(null);
      setLoading(false);
    }, 10000); // 10 second timeout

    // Listen to Firebase auth state changes
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      clearTimeout(timeoutId); // Cancel timeout once auth resolves

      if (!user) {
        // No Firebase user yet, but Clerk is signed in
        // This means useFirebaseAuth is still in progress OR failed
        console.log('[useUserRole] No Firebase user yet');
        setRole(null);
        // Set loading=false after a brief wait to handle permanent failures
        // The parent should check both loading and isFirebaseAuthenticated
        setTimeout(() => {
          setLoading(false);
        }, 2000);
        return;
      }

      try {
        // Get the ID token result which contains custom claims
        const idTokenResult = await user.getIdTokenResult();

        console.log('[useUserRole] Firebase token claims:', {
          uid: user.uid,
          claims: idTokenResult.claims,
          role: idTokenResult.claims.role
        });

        // Extract role from custom claims (set by /api/auth/firebase-token)
        // Default to 'viewer' if no role is set
        const userRole = (idTokenResult.claims.role as UserRole) || 'viewer';

        console.log('[useUserRole] Resolved role:', userRole);
        setRole(userRole);
        setLoading(false);
      } catch (error) {
        console.error('[useUserRole] Error getting user role:', error);
        // On error, default to viewer (most restrictive)
        setRole('viewer');
        setLoading(false);
      }
    });

    // Cleanup subscription and timeout
    return () => {
      clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [clerkLoaded, isSignedIn, clerkUser?.id]); // Add clerkUser?.id to reset on user switch

  return { role, loading };
}

/**
 * Helper: Check if a role is allowed for judge pages
 *
 * ALLOWED ROLES: judge, staff, admin
 * DENIED ROLES: viewer, null (not signed in)
 */
export function isJudgeRole(role: UserRole | null): boolean {
  return role === 'judge' || role === 'staff' || role === 'admin';
}

/**
 * Helper: Check if a role is allowed for chief judge / staff pages
 *
 * ALLOWED ROLES: staff, admin
 * DENIED ROLES: viewer, judge, null (not signed in)
 */
export function isStaffRole(role: UserRole | null): boolean {
  return role === 'staff' || role === 'admin';
}
