# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

theGRID — a mobile-first health/fitness tracker (Next.js 16 App Router, TypeScript). Tracks calories, steps, running, workouts, sleep, alcohol, bowel movements, habits, recovery/injuries, fasting, peptides, and journal entries, with an AI Coach feature. PWA, installable on mobile.

## Commands

```bash
npm run dev          # prisma generate && prisma db push && next dev — serves http://localhost:3000
npm run build         # prisma generate && next build
npm run lint          # ESLint
npm test              # vitest run
npx vitest run src/lib/__tests__/work-cycle.test.ts   # run a single test file
npm run db:push        # push Prisma schema changes without a migration
npm run db:migrate      # create a new Prisma migration
npm run db:studio       # Prisma Studio GUI
```

`npm run lint` currently reports pre-existing errors (e.g. `react-hooks/set-state-in-effect` in `src/context/UserContext.tsx`) and exits non-zero — this is the repo's baseline, not something to fix incidentally.

Local dev needs no `.env`: the DB defaults to the local SQLite file `prisma/dev.db` (gitignored). `npm run dev` does **not** seed a user — run `node scripts/ensure-default-user.mjs` once to create the default profile "Carlos" (PIN `1234`). Only `npm start` (`scripts/prod-entry.mjs`, the Railway boot path) seeds automatically — don't use it for local dev.

## Architecture

**Database**: Prisma schema at `prisma/schema.prisma`, SQLite via `@prisma/adapter-better-sqlite3`. Almost every model is scoped by an optional `userId` (multi-profile app, not multi-tenant auth — see below). The generated client lives at `src/generated/prisma` (custom `output` in the generator block), imported as `@/generated/prisma/client`.

- DB file path resolution is centralized in `src/lib/db-path.ts` (and duplicated for the Prisma CLI in `prisma.config.ts`, since the CLI can't import app code). `DATABASE_PATH`/`DATA_DIR` override the default `prisma/dev.db`; in production these point at a Railway volume and must win over a stray Postgres `DATABASE_URL`.
- `src/lib/prisma.ts` caches the client on `globalThis` for dev HMR, but validates the cached client actually has newer model delegates (`clientHasRecoveryModels`) and bumps `PRISMA_CLIENT_CACHE_REV` when the schema changes — bump that constant if you add new models and see stale-client errors in dev.
- `src/instrumentation.ts` starts the Google Health sync scheduler, but **only in production** (`NODE_ENV === "production"`) — it's a no-op during `next dev` by design.

**Auth model**: No sessions/passwords beyond a PIN. The client stores the active profile in `localStorage` (`theGRID_activeUser`) via `UserContext` (`src/context/UserContext.tsx`) and sends it as the `x-user-id` header on every API call. Use `apiFetch` (`src/lib/api-fetch.ts`) instead of raw `fetch` from client components so this header is attached automatically. On the server, API routes resolve/validate the user with `resolveUserId(req)` from `src/lib/current-user.ts`, which throws a `UserError` (with an HTTP status) for missing/unknown users — catch and translate that in route handlers rather than reinventing 401/404 handling.

**Routes**: `src/app/*` — one directory per tracker (calories, steps, running, workouts, sleep, alcohol, bowel, goals, habits, journal, fasting, coach, agents, more) mirrored by `src/app/api/*` REST endpoints. `src/lib/*` holds domain logic per tracker (e.g. `src/lib/workouts`, `src/lib/coach`, `src/lib/google-health`, `src/lib/notifications`, `src/lib/anatomy-health`) — check for an existing lib module before adding logic inline in a route or component.

**AI Coach** (`src/app/coach`, `src/app/api/coach`, `src/lib/coach`): uses `@anthropic-ai/sdk` server-side only, optional (skips gracefully without an API key). Model picker keys live in `src/lib/coach/models.ts`; conversations/messages persist via `CoachConversation`/`CoachMessage` models, including JSON-encoded attachments.

**Agent export API** (`src/app/api/agent`, `src/lib/agent`): a separate, read-oriented public-ish API surface for exporting a user's data (`export-profile.ts`, `period-rollups.ts`, `serialize.ts`, `public-routes.ts`, `timezone.ts`) — distinct from the AI Coach.

**Google Health / Fitbit sync** (`src/lib/google-health`): OAuth tokens stored in `GoogleHealthConnection`; syncs steps, sleep, and vitals (`VitalDailyEntry`, `HeartRateSample`) every 15 minutes via three redundant paths — the in-process scheduler (prod only, disable with `GOOGLE_HEALTH_SCHEDULER=0`), the `/api/google-health/cron` endpoint, and a GitHub Actions workflow backup. Local dev intentionally does not run this loop.

**Notifications** (`src/lib/notifications`, `NotificationPreference`/`NotificationLog` models): per-user/per-type toggles with idempotency via `NotificationLog` keyed on `(userId, type, fireDay)` in the user's local timezone — a 5-minute cron must never double-send a daily reminder.

**Work-cycle scheduling**: users can opt into a repeating shift rotation (`User.workCycleEnabled`, `workCycleAnchorDate`, `workCyclePatternJson`) instead of a Mon–Sun week for workout goals/load; logic in `src/lib/work-cycle.ts`.

**Date/time convention**: many daily-aggregate rows (steps, vitals, heart-rate samples) use a "tracking day" that runs 5am→5am local time rather than midnight-aligned, stored as UTC-noon (see comments in `prisma/schema.prisma` on `StepEntry.hourlyJson` and `HeartRateSample.date`). Check `src/lib/steps-day.ts` and `src/lib/dateStorage.ts` before writing new date-bucketing logic.

**Hub dashboard motion** (`src/components/hub/HubRingBay.tsx`, `HubExpandPanels.tsx`, `src/components/WeeklyHero.tsx`, `src/components/calories/CaloriesExpandShell*`): the expand/collapse animation behavior is deliberately specified and easy to regress — see `.cursor/rules/hub-expand-motion.mdc` before touching ring expand/collapse, the protocol/training rail, or shared-element morphs in this area. Key rules: siblings fade/scale away while the active ring slides via absolute `left`/transform (never `justify-content`); one `ProgressRing` instance morphs in place (never remount a second copy); expand panels use `HubCollapse`/`HubPresence`, not a center-morph, for the protocol/training rail; never `return null` to hide siblings (respawns animations) — keep mounted and use `HubCollapse`.

**Testing**: Vitest, `environment: "node"`, `@` alias resolves to `src/`. Existing tests in `src/lib/__tests__/` are plain unit tests of `src/lib/*` modules (no component/integration tests currently) — follow that pattern for new lib logic.

## Deployment

Railway, SQLite-on-volume (not Railway's Postgres plugin) via `Dockerfile` and `output: "standalone"`. `scripts/prod-entry.mjs` runs `prisma db push`, symlinks `public/uploads/*` to the volume, and seeds the default user on boot. See `README.md` for the full Railway/Google Health OAuth setup if you need to touch deployment or Google Health config.
