'use client';

import { useEffect, useState } from 'react';
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
  const [role, setRole] = useState<UserRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check if Firebase Auth is available
    if (!firebaseAuth) {
      console.warn('Firebase Auth not initialized');
      setRole(null);
      setLoading(false);
      return;
    }

    // Listen to Firebase auth state changes
    const unsubscribe = firebaseAuth.onAuthStateChanged(async (user) => {
      if (!user) {
        // User not signed in → no role
        setRole(null);
        setLoading(false);
        return;
      }

      try {
        // Get the ID token result which contains custom claims
        const idTokenResult = await user.getIdTokenResult();

        // Extract role from custom claims (set by /api/auth/firebase-token)
        // Default to 'viewer' if no role is set
        const userRole = (idTokenResult.claims.role as UserRole) || 'viewer';

        setRole(userRole);
        setLoading(false);
      } catch (error) {
        console.error('Error getting user role:', error);
        // On error, default to viewer (most restrictive)
        setRole('viewer');
        setLoading(false);
      }
    });

    // Cleanup subscription
    return () => unsubscribe();
  }, []);

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
