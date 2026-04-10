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
4. On boot, `scripts/prod-entry.mjs` runs **`prisma db push`**, symlinks **`public/uploads/journal`** to **`/data/uploads/journal`** so image uploads survive redeploys, and creates **Carlos** (PIN **1234**) if there are no users yet.

The app uses `output: "standalone"` in Next.js config for Docker/Railway.

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
