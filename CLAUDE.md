# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Git Workflow & Branch Management

**CRITICAL:** All coding work must be done on separate feature branches. Never work directly on `main`.

- **Create feature branches** for all new work: `git checkout -b feature/your-feature-name`
- **Commit frequently** with clear, imperative commit messages
- **Submit PRs** instead of pushing to main - PRs will be reviewed by Codex before merging
- **Do not interfere** with other branches or main branch during development
- **Always plan** and break work into smaller tasks before implementation
- **Seek approval** before implementing any significant changes

Example workflow:
```bash
git checkout -b feature/add-speed-scoring
# ... make changes ...
git add .
git commit -m "Add speed scoring logic"
git push -u origin feature/add-speed-scoring
# Submit PR for review
```

---

## Development Commands

```bash
# Development (uses Turbopack for fast refresh)
npm run dev              # → http://localhost:3000

# Production
npm run build            # Type-check, build optimized bundle
npm start                # Serve production build locally

# Quality
npm run lint             # Run ESLint checks
```

**Before committing significant changes:**
1. Run `npm run lint`
2. Run `npm run build` to catch type errors

---

## Architecture Overview

### Tech Stack

- **Next.js 15.5.4** with App Router (React 19, Server Components)
- **TypeScript 5** (strict mode, ES2017 target)
- **Clerk** - Primary user authentication
- **Firebase** - Firestore database + Admin SDK
- **Tailwind CSS 4** + shadcn/ui components
- **Framer Motion** - Animations
- **Turbopack** - Fast dev server

### Authentication Architecture (Dual-Layer)

This app uses a **hybrid authentication system**:

```
User Sign-in (Clerk) → Custom Token Bridge → Firebase Auth → Firestore Security Rules
```

**Flow:**
1. **Clerk handles user authentication** (`@clerk/nextjs`)
   - Middleware in `src/middleware.ts` protects routes
   - Protected routes: `/judge`, `/boulder/judge`, `/admin`, `/chief`

2. **Client-side Firebase authentication** (`useFirebaseAuth` hook)
   - Automatically runs on protected pages
   - Fetches custom Firebase token from `/api/auth/firebase-token`
   - Signs into Firebase using `signInWithCustomToken()`

3. **Server-side token generation** (`/api/auth/firebase-token`)
   - Validates Clerk session using `auth()` from `@clerk/nextjs/server`
   - Looks up user role from Firestore `roles/{clerkUserId}` collection
   - Creates Firebase custom token with claims: `{ role, clerkId }`

4. **Firestore security rules** (`firestore.rules`)
   - Read role from `request.auth.token.role` (NO database lookup)
   - Helper functions: `isJudge()`, `isAdminOrStaff()`
   - Permissions:
     - **Public:** Read all competition data
     - **Judge:** Create attempts (with validation)
     - **Staff/Admin:** Full CRUD on all collections

**Key files:**
- `src/middleware.ts` - Clerk route protection
- `src/hooks/useFirebaseAuth.ts` - Auto Firebase sign-in
- `src/app/api/auth/firebase-token/route.ts` - Token generation
- `src/lib/firebase/client.ts` - Firebase client setup
- `src/lib/firebase/admin.ts` - Firebase Admin SDK (singleton)
- `firestore.rules` - Role-based security

### Firebase Client Initialization (Hot Reload Handling)

**IMPORTANT:** Firebase client instances are cached in `globalThis` to survive Turbopack hot reloads.

```typescript
// From src/lib/firebase/client.ts
type FirebaseGlobal = typeof globalThis & {
  __FIREBASE_APP__?: FirebaseApp;
  __FIREBASE_AUTH__?: Auth;
  __FIREBASE_FIRESTORE__?: Firestore;
  __FIREBASE_PERSISTENCE_PROMISE__?: Promise<void>;
};
```

This prevents the error: `Firestore has already been started and its settings can no longer be changed.`

**Current state:**
- Firebase emulators are **disabled** (production Firebase in use)
- IndexedDB persistence **enabled** for offline judge scoring
- To re-enable emulators, uncomment lines 65-68 in `src/lib/firebase/client.ts`

### Firestore Data Model

**Primary collection:** `boulderComps` (boulder competitions)

```
boulderComps/{compId}
├── name, status, isDemo, updatedAt
│
├── categories/{categoryId}
│   ├── name, order, leaderboardNote
│   │
│   ├── routes/{routeId}              # Qualification routes
│   │   └── label, order, detailIndex
│   │
│   ├── finalRoutes/{routeId}         # Finals routes
│   │   └── label, order, detailIndex
│   │
│   └── details/{detailId}            # Groups/heats for qualification
│       └── label, order, detailIndex
│
├── athletes/{athleteId}
│   └── bib, name, team, categoryId, detailIndex
│
└── attempts/{attemptId}
    ├── compId, categoryId, athleteId, routeId
    ├── round: 'qualification' | 'final'
    ├── symbol: '1' | 'Z' | 'T'       # 1=attempt, Z=zone, T=top
    ├── stationId, enteredBy (Clerk userId)
    ├── clientAt (server timestamp)
    └── clientAtMs, offline
```

**Secondary collection:** `roles/{clerkUserId}`
- Stores user roles: `viewer | judge | staff | admin`
- Used for custom token claim generation

**Indexes required:** See `firestore.indexes.json`

### Real-Time Leaderboard Pattern

Leaderboards use **Firestore real-time listeners** (`onSnapshot`) for live updates:

```typescript
// Pattern from boulder/leaderboard
const unsubscribe = onSnapshot(query, (snapshot) => {
  // Process data
  // Calculate scores client-side
  // Update UI with token-based rendering to prevent race conditions
});
```

**Scoring calculation:**
- Client-side scoring in `src/lib/boulder/scoring.ts`
- Boulder: Top (25 pts - 0.1/attempt) + Zone (10 pts - 0.1/attempt)
- Sort by: Points → Tops → Zones → Name

### Offline-First Judge Interface

Judge pages support **offline scoring** with:
- IndexedDB persistence (`enableIndexedDbPersistence`)
- Server timestamps for conflict resolution
- Client-side timestamps (`clientAtMs`) for ordering
- QR code scanning (BarcodeDetector API + jsQR fallback)

---

## Code Organization

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout with ClerkProvider
│   ├── page.tsx                      # Landing page (client component)
│   ├── globals.css                   # Global styles, CSS variables
│   │
│   ├── api/
│   │   ├── contact/route.ts          # Nodemailer + Zoho SMTP
│   │   └── auth/
│   │       └── firebase-token/route.ts  # Clerk→Firebase bridge
│   │
│   ├── boulder/
│   │   ├── judge/page.tsx            # Judge scoring UI (protected)
│   │   └── leaderboard/page.tsx      # Live leaderboard (public)
│   │
│   ├── about/page.tsx
│   ├── contact/page.tsx
│   ├── judge/page.tsx
│   └── organisers/page.tsx
│
├── components/
│   ├── ui/                           # shadcn/ui components
│   ├── Container.tsx
│   └── Header.tsx
│
├── lib/
│   ├── firebase/
│   │   ├── client.ts                 # Client Firebase init (with caching)
│   │   └── admin.ts                  # Admin SDK singleton
│   ├── boulder/
│   │   └── scoring.ts                # Boulder scoring logic
│   └── utils.ts                      # cn() and helpers
│
├── hooks/
│   └── useFirebaseAuth.ts            # Auto Firebase sign-in
│
└── middleware.ts                     # Clerk auth middleware
```

---

## Environment Variables

Required in `.env.local`:

```bash
# Firebase Client (public)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Clerk (public key is public, secret is server-only)
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Firebase Admin SDK (server-only, CRITICAL SECRETS)
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=           # Auto-formatted with newlines

# Email (Zoho SMTP, server-only)
ZOHO_SMTP_HOST=smtp.zoho.com
ZOHO_SMTP_PORT=465
ZOHO_SMTP_SECURE=true
ZOHO_SMTP_USER=contact@griprank.com
ZOHO_SMTP_PASS=
CONTACT_TO=contact@griprank.com
```

**Production:** Set these in Vercel project settings.

---

## Critical Domain Rules

**This is a live competition scoring app.** Changes to scoring, judging, or leaderboards are high-risk.

### Scoring & Judge Flows

- **NEVER** modify scoring formulas without explicit approval
- **NEVER** change data structures for attempts/athletes without migration plan
- **ALWAYS** consider:
  - Offline/poor network conditions
  - Accidental mis-taps (large touch targets on judge UI)
  - Clear feedback after saving scores
  - Data loss prevention

**Files requiring extra care:**
- `src/app/boulder/**` (judge pages, leaderboards)
- `src/lib/boulder/scoring.ts` (scoring logic)
- `firestore.rules` (security rules)
- Any real-time listener code (`onSnapshot`)

### Load Testing

- `loadtest/` directory contains Firestore load testing scripts
- **NEVER** include load test code in production builds
- Keep test code clearly separated from app logic

---

## Common Patterns

### Creating a New Protected Page

1. Add route in `src/app/your-route/page.tsx`
2. Add to protected routes in `src/middleware.ts`:
   ```typescript
   const isProtectedRoute = createRouteMatcher([
     '/your-route(.*)',  // Add this
     // ... existing routes
   ]);
   ```
3. Add `useFirebaseAuth()` hook at top of component:
   ```typescript
   'use client'

   import { useFirebaseAuth } from '@/hooks/useFirebaseAuth'

   export default function YourPage() {
     useFirebaseAuth()  // Auto Firebase sign-in
     // ...
   }
   ```

### Real-Time Data Fetching

```typescript
'use client'

import { useEffect, useState } from 'react'
import { collection, query, onSnapshot } from 'firebase/firestore'
import { firestore } from '@/lib/firebase/client'

export default function LiveData() {
  const [data, setData] = useState([])

  useEffect(() => {
    if (!firestore) return

    const q = query(collection(firestore, 'your-collection'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setData(items)
    })

    return () => unsubscribe()
  }, [])

  // ... render data
}
```

### Adding a New Role

1. Create/update Firestore document:
   ```
   roles/{clerkUserId}
   ├── role: "new-role"
   ```

2. Update `firestore.rules`:
   ```javascript
   function isNewRole() {
     return hasAnyRole(['new-role', 'staff', 'admin']);
   }
   ```

3. User must sign out/in to get new token with updated role

4. Deploy rules:
   ```bash
   npx firebase deploy --only firestore:rules --project climbing-scoring-app-v1
   ```

---

## Firebase Deployment

```bash
# Deploy Firestore rules only
npx firebase deploy --only firestore:rules --project climbing-scoring-app-v1

# Deploy Firestore indexes
npx firebase deploy --only firestore:indexes --project climbing-scoring-app-v1
```

---

## Additional Resources

- **AGENTS.md** - Comprehensive AI assistant guidelines (coding style, conventions, testing)
- **firestore.rules** - Complete security rules with role-based access
- **firestore.indexes.json** - Required composite indexes
- **components.json** - shadcn/ui configuration

For coding style, formatting, and general development practices, refer to **AGENTS.md**.
