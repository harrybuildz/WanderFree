# admin-api

Internal admin console server. Holds the Supabase **service-role key** and
exposes generic CRUD over the WanderFreely schema to an allowlisted operator.

> **This process bypasses Row Level Security.** That is the point — the catalog
> tables are `SELECT`-only to `authenticated`, so no client key can write them —
> but it means the key must never reach a browser, and this server must never be
> exposed casually. It is currently intended for **localhost only**; see
> [Deploying](#deploying-later) before putting it anywhere else.

## Why a server at all

The mobile app talks to Postgres directly with the anon key and lets RLS do the
filtering. That works because every per-user table is gated by
`is_portfolio_member()` / `can_access_user_card()`. Catalog tables have no write
policy at all — writes are expected to come from the service role. So an admin
tool cannot be a pure client-side app: something server-side has to hold the
privileged key.

## Setup

```bash
cd admin-api
nvm use                 # Node 20, per .nvmrc
npm install
cp .env.example .env    # then fill it in
npm run dev             # http://localhost:4000
```

Then apply the migration that backs the allowlist and audit log, and add
yourself:

```bash
cd ../supabase && supabase db push
```

```sql
-- In Supabase Studio's SQL editor. The email must match a Supabase Auth user.
insert into public.admin_users (email, display_name)
values ('you@example.com', 'Your Name');
```

## Auth

Two independent gates, both required:

1. **A valid Supabase Auth session.** The SPA signs in with the anon key and
   sends the access token as `Authorization: Bearer …`. The server verifies it
   against the Auth server (not by local decode), so a signed-out or revoked
   session stops working immediately.
2. **An active row in `public.admin_users`.** Checked with the service-role
   client, because that table has RLS on with no policies — nothing but the
   service role can read it.

Gate 1 alone is meaningless: every beta user has a valid session. Gate 2 is only
consulted for an identity the Auth server vouched for.

To revoke someone, set `is_active = false` (keeps the audit trail readable) or
delete their row.

## Endpoints

All under `/api`, all requiring the two gates above except `/health`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/health` | Liveness. No auth — lets the UI tell "down" from "denied". |
| `GET` | `/api/me` | The calling admin's identity. |
| `GET` | `/api/tables` | The full table registry. The SPA renders itself from this. |
| `GET` | `/api/tables/:table` | List rows. `page`, `pageSize`, `search`, `sort`, `dir`. |
| `GET` | `/api/tables/:table/options` | `{value,label}` pairs for FK pickers. |
| `GET` | `/api/tables/:table/:id` | One row. |
| `POST` | `/api/tables/:table` | Create. |
| `PATCH` | `/api/tables/:table/:id` | Partial update — only the columns sent. |
| `GET` | `/api/tables/:table/:id/impact` | What a delete would cascade into. |
| `DELETE` | `/api/tables/:table/:id` | Delete. `?expect=N` guards against a stale preview. |
| `GET` | `/api/audit` | The audit trail. `page`, `table`, `actor`, `rowId`. |
| `GET` | `/api/dashboard` | Counts + catalog health checks. |

## The registry is the security boundary

`src/schema/tables.ts` lists every exposed table, its columns, their types and
their FK targets. A `:table` path param that isn't in the registry resolves to
nothing, so there is no route to a table we didn't intend to expose — including
tables a future migration adds. **A new table is invisible to this tool until
someone adds it to the registry on purpose.**

The registry is hand-written rather than introspected from `information_schema`.
Introspection can say a column is `uuid not null`; it can't say the column points
at `card_products` and should render as a picker labelled "Issuer — Card", nor
which tables are safe to expose at all.

When a migration changes a column, change the registry too.

## Delete safety

The FK graph in this schema is not intuitive. The case that matters:

```
card_products                     ← looks like a pure catalog edit
  └─ benefit_definitions   CASCADE
       └─ user_benefit_cycles     CASCADE
            └─ benefit_redemptions CASCADE   ← real users' history
```

`user_cards.card_product_id` is `RESTRICT`, so a product anyone currently holds
can't be deleted at all — but one nobody holds will silently take its whole
benefit subtree with it.

So every delete:

1. Walks the FK graph server-side and counts what goes with it
   (`src/lib/cascade.ts`).
2. Refuses outright when a `RESTRICT` relation will block it, naming the rows.
3. Recomputes the impact at delete time and rejects the request if it no longer
   matches the `expect` count the operator confirmed against.
4. Records the impact in the audit log, so the entry still explains what the
   delete took with it after the child rows are gone.

## Audit log

Every create, update and delete writes to `public.admin_audit_log` with the actor
taken from the **verified JWT** (never from the request body) and full
before/after row images.

The write is deliberately non-fatal: PostgREST calls aren't in one transaction,
so a failed log write can't roll back a mutation that already succeeded, and
failing the response would tell the operator their edit didn't land when it did.
Failures go loudly to the server console instead — watch for `AUDIT WRITE FAILED`.

## Deploying later

Everything below is deliberately **not** done, because the tool is localhost-only
today. Do all of it before exposing this to a network:

- Put it behind a network gate (Cloudflare Access, Tailscale, VPN) rather than
  relying on the app's own auth alone.
- Enforce HTTPS; the bearer token is in a header and would otherwise travel in
  the clear.
- Rate-limit `/api/*` — there is no login throttle here because Supabase Auth
  handles sign-in, but the allowlist check is a cheap oracle for "is this email
  an admin".
- Set `ALLOWED_ORIGINS` to the deployed UI origin only.
- Add `helmet` and disable `x-powered-by`.
- Consider moving the service-role key to a secrets manager rather than an env
  var on disk.
