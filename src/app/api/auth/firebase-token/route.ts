import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export async function GET() {
  try {
    // Step 1: Verify Clerk session
    console.log('[Firebase Token] Step 1: Verifying Clerk session...');
    let userId: string | null = null;

    try {
      const authResult = await auth();
      userId = authResult.userId;
    } catch (clerkError) {
      console.error('[Firebase Token] Clerk auth failed:', clerkError);
      return NextResponse.json(
        { error: 'Clerk authentication failed', details: String(clerkError) },
        { status: 401 }
      );
    }

    if (!userId) {
      console.warn('[Firebase Token] No Clerk user ID found');
      return NextResponse.json(
        { error: 'Unauthorized - No Clerk session' },
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
      console.error('[Firebase Token] Failed to initialize Admin DB:', dbError);
      return NextResponse.json(
        { error: 'Firebase Admin DB initialization failed', details: String(dbError) },
        { status: 500 }
      );
    }

    // Step 3: Lookup user role from Firestore
    console.log('[Firebase Token] Step 3: Looking up user role...');
    let roleDoc;
    try {
      roleDoc = await adminDb.collection('roles').doc(userId).get();
    } catch (firestoreError) {
      console.error('[Firebase Token] Firestore query failed:', firestoreError);
      return NextResponse.json(
        { error: 'Firestore role lookup failed', details: String(firestoreError) },
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
      console.error('[Firebase Token] Failed to initialize Admin Auth:', authError);
      return NextResponse.json(
        { error: 'Firebase Admin Auth initialization failed', details: String(authError) },
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
      console.error('[Firebase Token] Custom token creation failed:', tokenError);
      return NextResponse.json(
        { error: 'Custom token creation failed', details: String(tokenError) },
        { status: 500 }
      );
    }

    console.log('[Firebase Token] ✅ Token created successfully for user:', userId);
    return NextResponse.json({
      token: customToken,
      role,
    });
  } catch (error) {
    // Catch-all for unexpected errors
    console.error('[Firebase Token] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Unexpected error creating Firebase token',
        details: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}
