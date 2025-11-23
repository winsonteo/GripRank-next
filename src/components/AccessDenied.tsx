'use client';

import Link from 'next/link';
import { SignInButton, UserButton } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';

interface AccessDeniedProps {
  /**
   * The page/feature that requires higher permissions
   * e.g., "Judge Panel", "Admin Dashboard"
   */
  feature?: string;

  /**
   * Optional custom message
   */
  message?: string;
}

/**
 * AccessDenied - Generic access denied screen for unauthorized users
 *
 * Shows when a user tries to access a page/feature they don't have permission for.
 * Used for role-based access control (e.g., judge-only pages).
 */
export default function AccessDenied({
  feature = 'this page',
  message
}: AccessDeniedProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link href="/" className="text-xl font-bold">
            GripRank
          </Link>
          <UserButton afterSignOutUrl="/" />
        </div>
      </header>

      {/* Access Denied Message */}
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="rounded-lg border border-red-200 bg-red-50 p-8 text-center">
          {/* Icon */}
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          {/* Title */}
          <h1 className="mb-2 text-2xl font-bold text-gray-900">
            No access to {feature}
          </h1>

          {/* Message */}
          <p className="mb-6 text-gray-700">
            {message || (
              <>
                This page is only for event judges and staff.
                <br />
                If you believe this is a mistake, please contact the event organiser.
              </>
            )}
          </p>

          {/* Action */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/"
              className="inline-block rounded-md bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-700"
            >
              Return to Home
            </Link>
            <SignInButton afterSignInUrl={pathname || '/'}>
              <button
                type="button"
                className="inline-block rounded-md border border-blue-600 px-6 py-2 font-medium text-blue-700 hover:bg-blue-50"
              >
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </main>
    </div>
  );
}
