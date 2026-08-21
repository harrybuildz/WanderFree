# WanderFree

A mobile app that organizes credit card benefits. Users add the cards they hold; the app surfaces every benefit attached to those cards (statement credits, multipliers, lounge access, insurance, etc.) and tracks redemptions against each benefit's cycle.

## Repository layout

```
WanderFree/
├── supabase/        Database schema (migrations), RLS policies.
│                    The catalog (issuers, card products, benefits, reward
│                    categories) is hand-curated — there is no extraction
│                    pipeline.
│
├── mobile/          Expo / React Native app. Reads + writes Supabase
│                    directly via supabase-js with TanStack Query +
│                    AsyncStorage caching.
│
├── admin-api/       Internal admin console server (Express + TS). Holds the
│                    service-role key; generic CRUD over the schema behind a
│                    Supabase Auth + allowlist gate. Localhost only.
│
├── admin-web/       Internal admin console UI (Vite + React). Renders itself
│                    from the API's table registry.
│
└── website/         Static marketing + support site, served on GitHub Pages
                     at wanderfreely.app. No build step.
```

## Architecture at a glance

```
                  ┌────────────────────────────┐
                  │ Supabase Postgres          │
                  │  catalog tables (manually  │
                  │   curated)                 │
                  │  portfolio-scoped tables   │
                  │   (RLS by membership)      │
                  └───┬────────────────────┬───┘
      anon key + RLS  │                    │  service role (bypasses RLS)
                      ↓                    ↓
       ┌────────────────────────┐   ┌────────────────────────┐
       │ mobile (Expo / RN)     │   │ admin-api (Express)     │
       │  TanStack Query+cache  │   │  Supabase Auth +        │
       │  Renders from cache,   │   │   allowlist gate        │
       │   refetches in bg      │   │  Audit log, cascade     │
       └────────────────────────┘   │   impact preview        │
                                    └───────────┬────────────┘
                                                ↑ bearer token
                                    ┌───────────┴────────────┐
                                    │ admin-web (Vite/React) │
                                    └────────────────────────┘
```

The mobile app and the admin console reach the same database along two
deliberately different paths. The app uses the anon key and RLS filters it down
to the caller's own portfolios. The console uses the service-role key, which
bypasses RLS entirely — necessary because catalog tables have no write policy at
all — so its own auth gate is the only thing standing in front of the data.

## Locked decisions

| Decision | Choice |
|----------|--------|
| Backend | Supabase (Postgres + Auth + RLS) |
| Mobile | Expo / React Native |
| Catalog source | Hand-curated in Supabase |
| Per-user scoping | Portfolios (shared via `portfolio_members`) — not direct user ownership |
| Read path | Supabase tables + RLS, no backend API |
| Mobile cache | TanStack Query + AsyncStorage persister |
| Catalog editing | `admin-api` + `admin-web` console (localhost), not Supabase Studio |
| Admin auth | Supabase Auth + `admin_users` allowlist, checked server-side |

See `supabase/README.md` and `mobile/README.md` for component-specific docs.

## Getting started

Each sub-project has its own toolchain. See:

- [`supabase/README.md`](./supabase/README.md) — schema migrations, RLS policies
- [`mobile/README.md`](./mobile/README.md) — Expo / RN, env vars, caching
- [`admin-api/README.md`](./admin-api/README.md) — admin server, auth gates, delete safety
- [`admin-web/README.md`](./admin-web/README.md) — admin UI
- [`website/README.md`](./website/README.md) — marketing site
