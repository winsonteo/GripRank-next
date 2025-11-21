# GripRank – Agents Instructions

This file is for AI/code assistants working on this repository.  
When in doubt, **ask for clarification before making risky changes**, especially around scoring and live competition flows.

---

## Project Overview

- Framework: **Next.js App Router** in `src/app`.
- Language: **TypeScript everywhere**.
- Domain: Competition scoring and live results for climbing (boulder, speed; lead in development).
- Key areas:
  - `src/app/**` – Routes and pages (e.g. `src/app/boulder/judge/page.tsx`).
  - `src/components` and `src/components/ui` – Shared UI components.
  - `src/lib` – Core helpers (Firebase client, scoring logic, utilities).
  - `public/` – Static assets.
  - Root configs – `next.config.ts`, `eslint.config.mjs`, Tailwind/PostCSS configs, Firebase rules/indexes.
  - `loadtest/` – Load testing scripts for Firestore (these **must not** be included in production deploys).

**Primary goal:** Keep the app **reliable and predictable during live competitions**. Any change that could affect judging, scoring, or leaderboards is high-risk and must be done carefully.

---

## How to Run the Project

Use **npm** for commands.

- Development server (Turbopack):
  - `npm run dev`  → http://localhost:3000
- Production build:
  - `npm run build`
- Serve production build locally:
  - `npm start`
- Lint:
  - `npm run lint`

When you make non-trivial changes, you should usually run:

1. `npm run lint`
2. `npm run build` (to catch type and lint issues in CI-style conditions)

If a command is slow or risky (e.g. `npm run build` on a huge change), **propose it to the user** instead of running it automatically.

---

## Coding Style & Conventions

### General

- Use **TypeScript** for all new files and types.
- Prefer **functional React components with hooks**.
- Use `"use client"` only when necessary (e.g. browser APIs, event handlers with state).
- Keep components focused and reasonably small; extract helpers when they grow.

### Formatting & Naming

- Indentation: **2 spaces**.
- **No semicolons**, matching existing files.
- Strings: **double quotes** unless template literals improve readability.
- Components / `.tsx` files: **PascalCase** (e.g. `JudgeHeader.tsx`).
- Shared utilities / helpers: **camelCase** (e.g. `cn`, `resolveFirebaseConfig`).
- Styling:
  - Prefer **Tailwind utility classes**.
  - Keep custom CSS minimal and centralised in `src/app/globals.css`.

### Next.js App Router Boundaries

- Routes live in `src/app/**` with `page.tsx` and co-located UI.
- API routes live under `src/app/api/**`.
- Keep server/client separation clear:
  - Server components by default.
  - Client components only with `"use client"` and when browser-only behaviour is needed.
- For data fetching, prefer server-side logic (RSC, route handlers) and keep client-side data fetching as simple as possible.

---

## Domain-Specific Guidelines (GripRank)

- **Scoring and judge flows are critical.**
  - Files under `src/app/boulder/**`, `src/app/speed/**`, and core scoring helpers in `src/lib/**` should be changed conservatively.
  - Do **not** change scoring formulas or data structures unless explicitly asked.
  - When touching judge pages (e.g. `boulder/judge`), always think about:
    - Offline/poor network conditions.
    - Minimising accidental mis-taps or data loss.
    - Clear feedback after saving scores.

- **Live leaderboards:**
  - Avoid heavy computations on the client if it risks jank or delays during comps.
  - Ensure any polling / real-time logic won’t overload Firestore.

- **Load testing:**
  - `loadtest/` is for synthetic traffic against Firestore.
  - Do not wire load-test code into production routes or builds.
  - Keep any test or load code clearly separated from app logic.

If unsure whether a change might affect live competition stability, **ask the user first**.

---

## Testing & Validation

There is no full test suite yet. For now, correctness relies on:

- `npm run lint`
- `npm run build`
- Manual testing of key flows, especially:
  - Judge entry (boulder/speed).
  - Leaderboards / results display.
  - Contact form and any email-sending logic.

When you add tests:

- Colocate them with the feature, e.g. `src/lib/__tests__/scoring.test.ts`.
- Name tests after the feature and scenario (e.g. `computeBoulderScore – tops vs zones`).
- Prefer straightforward, readable tests that reflect real competition scenarios.

When proposing changes, **tell the user which flows they should manually test**.

---

## Commits & Pull Requests

Changes are usually committed manually by the user, but you should shape your work so it fits into small, clear commits:

- Scope: keep each change focused on one feature/fix.
- Suggested commit message style (imperative, short):
  - `Add QR scanning to boulder judge page`
  - `Fix contact form error handling`
  - `Improve speed leaderboard loading state`
- For UI changes, include notes for:
  - What changed visually.
  - Any new edge cases handled.
- For risky changes (scoring, auth, Firestore rules), summarise:
  - Data shapes touched.
  - Migration or deployment steps if needed.

When summarising your work to the user, include:

1. Files touched and why.
2. Any breaking or behaviour-changing updates.
3. Manual test steps they should run.

---

## Security & Configuration

- Environment variables:
  - `NEXT_PUBLIC_FIREBASE_*` for client Firebase config.
  - `ZOHO_SMTP_*` and `CONTACT_TO` for the contact API.
- **Never** commit env values or secrets; assume they live in `.env.local` and Vercel project settings.
- Development should default to **Firebase emulators** on `localhost`:
  - Firestore: 8080
  - Auth: 9099  
  (See `src/lib/firebase/client.ts` for current config and keep it consistent.)
- Avoid pointing local development directly at production Firebase projects unless explicitly instructed.

Security expectations:

- Do not introduce public write endpoints or open access to judge/admin actions without explicit guidance.
- Be careful with any logging:
  - Avoid logging secrets, tokens, or full request bodies that could include personal data.
- If you edit Firebase rules or anything under `security` / `rules`:
  - Explain the impact clearly.
  - Default to **least privilege**.

---

## Behaviour Expectations for AI / Agents

When you work on this repo:

1. **Read this file first** and follow its constraints.
2. **Explain changes in plain English**, suitable for a non-developer owner:
   - What was the problem?
   - What did you change?
   - What are the risks / edge cases?
3. Prefer **small, incremental changes** over big refactors.
4. **Ask before**:
   - Installing new dependencies.
   - Modifying CI, deployment, or Firebase security rules.
   - Introducing new architectural patterns.
5. When reviewing code (`/review`):
   - Prioritise:
     - Potential runtime errors.
     - Type errors.
     - Security issues.
     - Things that could break live competitions.
   - Offer concrete suggestions and, when asked, propose minimal, safe fixes.

If you are unsure or context is missing, **ask clarifying questions instead of guessing**.
