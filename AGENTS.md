<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Cursor Cloud specific instructions

Single Next.js 16 app (App Router) — health/fitness tracker "theGRID" — backed by a local SQLite file via Prisma. No external services are required to develop/run it. The AI Coach feature uses `@anthropic-ai/sdk` and only works if an Anthropic API key is configured; it is optional and not needed for core flows.

- Run the dev server with `npm run dev` (defined in `package.json`). It runs `prisma generate && prisma db push && next dev` and serves on `http://localhost:3000`.
- The dev DB is a local SQLite file at `prisma/dev.db` (gitignored, recreated on a fresh VM). The path is resolved by `prisma.config.ts` / `src/lib/db-path.ts`; it defaults to `prisma/dev.db` unless `DATABASE_PATH`/`DATA_DIR` are set. No `.env` is needed for dev despite the README mentioning `.env.example` (which does not exist in this repo).
- Non-obvious: `npm run dev` does NOT seed a user, so the profile screen can be empty on a fresh DB. Run `node scripts/ensure-default-user.mjs` once (after the DB exists) to create the default profile "Carlos" with PIN `1234`. Only the production entrypoint (`scripts/prod-entry.mjs`, used by `npm start`) seeds this automatically.
- Lint/test/build commands are the standard scripts in `package.json`: `npm run lint` (ESLint), `npm test` (Vitest, `vitest run`), `npm run build` (`prisma generate && next build`).
- Note: `npm run lint` currently reports pre-existing errors (e.g. `react-hooks/set-state-in-effect` in `src/context/UserContext.tsx`) and exits non-zero. This is the repo's baseline, not an environment problem.
- `npm start` / `scripts/prod-entry.mjs` is the production/Railway boot path (SQLite on a `/data` volume); do not use it for local development.
