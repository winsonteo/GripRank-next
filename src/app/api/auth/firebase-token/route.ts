import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

/**
 * Firebase Custom Token Endpoint
 *
 * This endpoint bridges Clerk authentication with Firebase by:
 * 1. Verifying the user's Clerk session
 * 2. Looking up their role from Firestore
 * 3. Minting a Firebase custom token with role claims
 *
 * SECURITY CONTRACT:
 * - Server logs are detailed (step name, errors, stack traces) for debugging
 * - Client responses are ALWAYS generic (no stack traces, no internal error details)
 * - No sensitive data (secrets, env vars, internal paths) ever reaches the client
 *
 * DEBUGGING IN PRODUCTION:
 * When this endpoint returns a 500 error, check your Vercel/server logs for:
 * - "[Firebase Token] Step X:" - Shows which step failed (1-5)
 * - "[Firebase Token] Clerk auth failed" - Clerk session invalid/expired
 * - "[Firebase Token] Failed to initialize Admin DB" - Firebase Admin SDK env vars missing/malformed
 * - "[Firebase Token] Firestore query failed" - Network or permissions issue
 * - "[Firebase Token] Failed to initialize Admin Auth" - Firebase Admin SDK issue
 * - "[Firebase Token] Custom token creation failed" - Token minting failure (check service account permissions)
 * - "[Firebase Admin] Missing Firebase Admin SDK environment variables" - Check FIREBASE_ADMIN_* env vars
 * - "[Firebase Admin] FIREBASE_ADMIN_PRIVATE_KEY is not in correct format" - Key needs proper newlines
 *
 * The client will only see: { error: "Internal error", code: "FIREBASE_TOKEN_ERROR" }
 */
export async function GET() {
  try {
    // Step 1: Verify Clerk session
    console.log('[Firebase Token] Step 1: Verifying Clerk session...');
    let userId: string | null = null;

    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch (clerkError) {
      // Log detailed error server-side for debugging
      console.error('[Firebase Token] Clerk auth failed:', clerkError);
      // Return generic error to client (don't leak Clerk internals)
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    if (!userId) {
      console.warn('[Firebase Token] No Clerk user ID found');
      return NextResponse.json(
        { error: 'Unauthorized', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    console.log('[Firebase Token] Clerk user ID:', userId);

    // Step 2: Initialize Firebase Admin DB
    console.log('[Firebase Token] Step 2: Initializing Firebase Admin DB...');
    let adminDb;
    try {
      adminDb = getAdminDb();
    } catch (dbError) {
      // Log full error details server-side (stack trace, env var issues, etc.)
      console.error('[Firebase Token] Failed to initialize Admin DB:', dbError);
      // Client gets generic error only (no internal details)
      return NextResponse.json(
        { error: 'Internal error', code: 'FIREBASE_TOKEN_ERROR' },
        { status: 500 }
      );
    }

    // Step 3: Lookup user role from Firestore
    console.log('[Firebase Token] Step 3: Looking up user role...');
    let roleDoc;
    try {
      roleDoc = await adminDb.collection('roles').doc(userId).get();
    } catch (firestoreError) {
      // Log Firestore-specific errors (network, permissions, etc.)
      console.error('[Firebase Token] Firestore query failed:', firestoreError);
      // Client gets generic error (don't expose Firestore structure)
      return NextResponse.json(
        { error: 'Internal error', code: 'FIREBASE_TOKEN_ERROR' },
        { status: 500 }
      );
    }

    let role = 'viewer'; // Default role
    if (roleDoc.exists) {
      const data = roleDoc.data();
      role = data?.role || 'viewer';
    }
    console.log('[Firebase Token] User role:', role);

    // Step 4: Initialize Firebase Admin Auth
    console.log('[Firebase Token] Step 4: Initializing Firebase Admin Auth...');
    let adminAuth;
    try {
      adminAuth = getAdminAuth();
    } catch (authError) {
      // Log admin auth errors (credentials, initialization issues)
      console.error('[Firebase Token] Failed to initialize Admin Auth:', authError);
      // Generic error to client
      return NextResponse.json(
        { error: 'Internal error', code: 'FIREBASE_TOKEN_ERROR' },
        { status: 500 }
      );
    }

    // Step 5: Create Firebase custom token with role claim
    console.log('[Firebase Token] Step 5: Creating custom token...');
    let customToken;
    try {
      customToken = await adminAuth.createCustomToken(userId, {
        role,
        clerkId: userId,
      });
    } catch (tokenError) {
      // Log token creation errors (service account permissions, quota limits, etc.)
      console.error('[Firebase Token] Custom token creation failed:', tokenError);
      // Generic error to client
      return NextResponse.json(
        { error: 'Internal error', code: 'FIREBASE_TOKEN_ERROR' },
        { status: 500 }
      );
    }

    console.log('[Firebase Token] ✅ Token created successfully for user:', userId);
    return NextResponse.json({
      token: customToken,
      role,
    });
  } catch (error) {
    // Catch-all for unexpected errors outside the step handlers
    // This should rarely happen, but ensures we never expose internal details
    console.error('[Firebase Token] Unexpected error:', error);
    console.error('[Firebase Token] Stack trace:', error instanceof Error ? error.stack : 'No stack');

    // SECURITY: Never send stack traces or internal error messages to client
    // The detailed logs above are only visible in server logs (Vercel, etc.)
    return NextResponse.json(
      { error: 'Internal error', code: 'FIREBASE_TOKEN_ERROR' },
      { status: 500 }
    );
  }
}
