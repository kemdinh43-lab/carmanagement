# Angel One Travel Ops

Internal operations pilot for Angel One Travel.

## Stack

- Next.js
- TypeScript
- Tailwind CSS
- Supabase/PostgreSQL schema
- Vitest for business rules

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Supabase

Copy `.env.example` to `.env.local` and fill:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Then run the SQL in `supabase/migrations/0001_core.sql` against your Supabase project. The app currently keeps the operations workflow in local demo mode, but Supabase client/types/auth are wired so database-backed repositories can replace localStorage module by module.

Auth page: `http://localhost:3000/auth`

## Current Scope

- Demo control tower dashboard
- Dispatch order table with separated operational, payment, and invoice statuses
- Deterministic vehicle, driver, assignment, order, and payment data
- Pure business rules for overlap conflict and payment status
- Supabase SQL migration draft in `supabase/migrations/0001_core.sql`

## Research

See `../research/open-source-study.md` and `../research/architecture.md`.
