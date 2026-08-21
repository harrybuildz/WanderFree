# admin-web

The admin console UI — a Vite + React SPA that talks to [`admin-api`](../admin-api).
Vanilla CSS with the same brand tokens as [`website/`](../website) and the mobile
app; no UI framework, because this is a dense data tool and a framework wouldn't
earn its build step here.

## Setup

`admin-api` must be running first — the SPA is useless without it.

```bash
cd admin-web
nvm use                 # Node 20
npm install
cp .env.example .env    # then fill it in
npm run dev             # http://localhost:5173
```

## Env

Everything here is bundled into the JS and is therefore **public**. Only the anon
key belongs in this file. The service-role key lives in `admin-api/.env` and
never leaves that process.

| Var | Value |
|---|---|
| `VITE_SUPABASE_URL` | Same project URL the mobile app uses |
| `VITE_SUPABASE_ANON_KEY` | The anon / publishable key |
| `VITE_ADMIN_API_URL` | Where `admin-api` is listening (default `http://localhost:4000`) |

## How it's put together

The SPA has **no hardcoded knowledge of the schema.** On sign-in it fetches the
table registry from `GET /api/tables` and renders everything from it — the
sidebar, the list columns, the sort options, every form field, the FK pickers.
Add a column to the registry in `admin-api` and it appears here with no change
to this project.

```
src/
  auth.tsx        Two-stage session: Supabase says "signed in",
                  admin-api says "allowed in". Both required.
  api.ts          Typed fetch wrapper; attaches a fresh access token per call.
  types.ts        Mirrors admin-api/src/schema/types.ts.
  format.ts       Cell formatting for the list view.
  components/
    Layout.tsx        Sidebar, grouped by risk class (Catalog / User data / Operations).
    Field.tsx         One control per FieldSpec type.
    RefPicker.tsx     FK picker — labelled options, server-side search when large.
    DeleteDialog.tsx  Cascade impact preview + type-to-confirm.
  pages/
    Login.tsx       Email/password, and the "you're not on the allowlist" state.
    Dashboard.tsx   Counts + catalog health. Placeholder for richer views.
    TableList.tsx   Search / sort / paginate one table.
    RecordForm.tsx  Create + edit. PATCHes only changed fields.
    Audit.tsx       The audit trail with expandable before/after diffs.
```

## Two behaviours worth knowing

**Edits send only what changed.** `RecordForm` diffs against the loaded row and
PATCHes just those columns. This isn't only efficiency — on
`user_signup_bonuses`, re-sending an unchanged `bonus_value` would re-fire
`trg_bonus_wallet_credit` and move a user's wallet balance for no reason.

**Deletes show their blast radius.** `DeleteDialog` asks the server what the
delete would cascade into and renders the counts, requires the row's name to be
typed when anything else is affected, and refuses when a `RESTRICT` constraint
will block it. See the delete-safety section in
[`admin-api/README.md`](../admin-api/README.md).
