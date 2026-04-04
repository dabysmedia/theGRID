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

## Deploy to Railway

1. Create a new project on [Railway](https://railway.app)
2. Add a **PostgreSQL** service
3. Add a **GitHub Repo** service pointing to this repository
4. Railway will auto-detect Next.js and set `DATABASE_URL`
5. The build command (`prisma generate && next build`) handles everything

The app uses `output: "standalone"` in Next.js config for optimized Docker/Railway deployments.

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
