# Speed Migration Plan

## Data model snapshot (legacy `/public/speed`)
- Root collection `speedCompetitions` with fields such as `name`, `status` (`open`/`completed`/`archived`/`deleted`), `createdAt`, `timingPrecision` (`ms3` default, `ms2` allowed), `falseStartRule` (`IFSC` default, `TOLERANT` option), and lock/archival flags.
- Subcollection `categories/{categoryId}` stores `name`, `order` and houses the rest of the data:
  - `athletes`: documents keyed by athlete id (often provided/imported), fields `name`, `team`, optional `order` (used for start list ordering).
  - `startlist`: collection of heats `{ heatIndex, laneA, laneB }` shown in the public start list; judge also reads a fallback doc `finals/startlist` (`laneA[]`, `laneB[]`) or legacy `qualifierStartlist` collection.
  - `qualifierResults`: per-athlete docs containing `runA` and `runB` objects `{ status: "TIME"|"FS"|"DNS"|"DNF", ms?: number }`, plus `updatedAt`. With `falseStartRule: "IFSC"`, a `runA` false start auto-sets `runB` to DNS.
  - `computed/qualifierStandings`: materialized standings `{ items: [{ aid, name, team, bestMs, secondMs, rank }], version, updatedAt }` used for seeding.
  - `finals/meta`: doc with `size` (2/4/8/16), `seeds` (`{ seed, aid }[]`), `seedRule: "best-time-of-two"`, `seedVersion`, `generator`, `seedDebug`, `createdAt`, optional `allowWinnerRun`. Rounds live under `finals/meta/rounds/{roundId}/matches` where each match has `{ matchIndex, athleteA, athleteB, laneA {status, ms?}, laneB {status, ms?}, winner: "A"|"B"|null, allowWinnerRun? }`. Round ids include `R16`, `QF`, `SF`, `F` (with `matchIndex` 1 = Small Final, 2 = Big Final).
- Qualifier ranking: fastest `bestMs`, then `secondMs`, then name; all no-time entries (FS/DNS/DNF) share the last rank.
- Finals/overall logic: bracket display follows stored matches; overall ranking groups by elimination stage (winner → big final loser → small final winner/loser or SF exits by time → QF exits by time → R16 exits → qual-only by time using cumulative time arrays as tiebreakers).

## Proposed Next.js route structure
- `/speed` → public Speed landing/listing page showing available competitions (matches Boulder styling and card layout), linking into the leaderboard.
- `/speed/leaderboard` → public viewer with comp/category selectors (mirrors Boulder leaderboard shell) and tabs for Qualifiers, Finals bracket, and Overall; uses the legacy ranking logic above.
- `/speed/startlist` (and shareable `/speed/startlist?comp=…&cat=…`) → read-only public start list view aligned with current `startlist.html`.
- `/speed/judge` → protected judge pad (Clerk + Firebase token) for entering qualifier results and viewing finals; uses judge passcode flow like Boulder.
- `/speed/admin` → protected staff/admin console for managing comps/categories, start lists, imports, finals generation, and clears; reuse Boulder admin patterns.
- API routes under `/api/speed/*` as needed for passcode/token bridges or exports (follow existing `/api/judge-passcode` style if required).

## V1 implementation scope (minimum viable parity)
- Public: competition listing + leaderboard with qualifier, finals bracket, and overall ranking views; honour timing precision, false start handling, FS/DNS/DNF statuses, and live Firestore updates.
- Start list: read-only page consuming `startlist` collection (fallbacks supported) with print-friendly styling consistent with the new design system.
- Data/types: introduce `src/lib/speed` types and helpers for qualifier sorting, finals outcome ranking, time formatting, and status handling mirroring legacy logic.
- UI: use existing Container/Header/Button/Card/Table patterns from Boulder; match spacing, typography, and background treatments already in the app.
- Auth: gate judge/admin routes via existing Clerk + Firebase role model (reuse `useJudgePasscodeSession`/`useUserRole` patterns).
- Out of scope for this pass: export-to-PDF tooling, user invitations/role assignment flows, or new Firestore structures (use existing collections/doc shapes).
