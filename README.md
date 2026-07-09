# theGRID

A mobile-first health and fitness tracker built with Next.js, PostgreSQL, and Prisma.

Track calories, steps, running, workouts, sleep, alcohol, and bowel movements with integrated statistics and performance metrics.

## Tech Stack

- **Next.js 15** (App Router, TypeScript)
- **PostgreSQL** + Prisma ORM
- **Tailwind CSS** + shadcn/ui
- **Recharts** for data visualization
- **PWA** — installable on mobile

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or hosted)

### Setup

```bash
# Install dependencies
npm install

# Copy env and configure your DATABASE_URL
cp .env.example .env

# Push schema to database
npm run db:push

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Database Commands

```bash
npm run db:migrate   # Create a new migration
npm run db:push      # Push schema changes (no migration)
npm run db:studio    # Open Prisma Studio GUI
```

## Deploy to Railway (SQLite + volume)

This app uses **SQLite on a persistent volume**, not Railway’s Postgres plugin.

1. Create a Railway project and add your **GitHub repo** (or use the included `Dockerfile`).
2. Add a **volume** and mount it at **`/data`** on the web service.
3. Set environment variables on the web service:
   - **`DATA_DIR=/data`** (recommended), or **`DATABASE_PATH=/data/thegrid.db`**
   - **Remove or unset `DATABASE_URL`** if Railway attached a Postgres plugin — a Postgres `DATABASE_URL` was overriding the SQLite file and made the DB look “empty” on every deploy.
4. On boot, `scripts/prod-entry.mjs` runs **`prisma db push`**, prepares **`public/uploads/*`** symlinks to **`/data/uploads/*`** so image uploads survive redeploys, and creates **Carlos** (PIN **1234**) if there are no users yet.

The app uses `output: "standalone"` in Next.js config for Docker/Railway.

## Google Health / Fitbit sync

Connect Fitbit (via Google Health API) from **Settings → Google Health / Fitbit**. Syncs steps, sleep, and weight into theGRID.

### Authorized redirect URI (Google Cloud Console)

Add this exact URI on your OAuth 2.0 Web client:

```
https://itslos.com/api/google-health/callback
```

For local dev, also add:

```
http://localhost:3000/api/google-health/callback
```

### Environment variables

| Variable | Required | Notes |
|----------|----------|--------|
| `GOOGLE_CLIENT_ID` | Yes | OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | OAuth client secret |
| `GOOGLE_REDIRECT_URI` | Required in prod | `https://itslos.com/api/google-health/callback` (must match Console exactly; also used as the public origin for post-auth redirects) |
| `APP_URL` | Optional fallback | `https://itslos.com` if redirect URI is unset |
| `GOOGLE_OAUTH_STATE_SECRET` | Optional | HMAC secret for OAuth `state`; defaults to client secret |

### Google Cloud checklist

1. Enable **Google Health API**
2. OAuth consent screen (External) + add yourself as a **test user** while in Testing
3. Data Access scopes:
   - `.../auth/googlehealth.activity_and_fitness.readonly`
   - `.../auth/googlehealth.sleep.readonly`
   - `.../auth/googlehealth.health_metrics_and_measurements.readonly`
4. Create **OAuth client → Web application** with the redirect URI above

### Automatic sync (steps + sleep + vitals)

Once a profile is connected, theGRID pulls Fitbit/Google Health data every **15 minutes**:

1. **In-process scheduler (primary)** — on Railway/`next start` production boot, `src/instrumentation.ts` starts a 15‑minute loop (no external cron required). Disable with `GOOGLE_HEALTH_SCHEDULER=0`.
2. **Dedicated endpoint** — `GET/POST /api/google-health/cron?secret=CRON_SECRET` (optional `days=3`, `weight=1`).
3. **GitHub Actions (backup)** — `.github/workflows/google-health-sync.yml` every 15 minutes. Repo secrets: `APP_URL=https://itslos.com`, `CRON_SECRET` (same as Railway).
4. **Notification cron** — if something already hits `/api/notifications/run`, that path also syncs Google Health.

Also set on Railway:

| Variable | Notes |
|----------|--------|
| `CRON_SECRET` | Shared secret for HTTP cron endpoints |
| `GOOGLE_HEALTH_SCHEDULER` | Optional; set to `0` to disable the in-process 15‑min loop |

## Project Structure

```
src/
├── app/              # Next.js App Router pages & API routes
│   ├── page.tsx      # Hub/overview dashboard
│   ├── calories/     # Calorie tracking
│   ├── steps/        # Step tracking
│   ├── running/      # Run logging
│   ├── workouts/     # Workout logging
│   ├── sleep/        # Sleep tracking
│   ├── goals/        # Goal management
│   ├── alcohol/      # Drink logging
│   ├── bowel/        # Bowel movement logging
│   └── api/          # REST API endpoints
├── components/       # React components
│   ├── ui/           # shadcn/ui primitives
│   ├── BottomNav.tsx
│   ├── HubDashboard.tsx
│   ├── DailySummaryCard.tsx
│   └── MiniChart.tsx
└── lib/
    ├── prisma.ts     # Database client
    └── utils.ts      # Shared utilities
```
