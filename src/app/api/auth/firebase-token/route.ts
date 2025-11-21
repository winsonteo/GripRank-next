import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export async function GET() {
  try {
    // Verify Clerk session
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized - No Clerk session' },
        { status: 401 }
      );
    }

    // Lookup user role from Firestore
    const adminDb = getAdminDb();
    const roleDoc = await adminDb.collection('roles').doc(userId).get();

    let role = 'viewer'; // Default role
    if (roleDoc.exists) {
      const data = roleDoc.data();
      role = data?.role || 'viewer';
    }

    // Create Firebase custom token with role claim
    const adminAuth = getAdminAuth();
    const customToken = await adminAuth.createCustomToken(userId, {
      role,
      clerkId: userId,
    });

    return NextResponse.json({
      token: customToken,
      role,
    });
  } catch (error) {
    console.error('Error creating Firebase token:', error);
    return NextResponse.json(
      { error: 'Failed to create Firebase token' },
      { status: 500 }
    );
  }
}
