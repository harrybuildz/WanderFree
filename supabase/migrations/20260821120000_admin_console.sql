-- Admin console: allowlist + audit log for the internal CRUD tool (admin-api).
--
-- The admin API authenticates a human with ordinary Supabase Auth (anon key,
-- from the SPA), then verifies the resulting JWT server-side and checks the
-- caller's email against public.admin_users before doing ANY work with the
-- service-role key. Two independent gates, so a leaked/borrowed user token is
-- not by itself admin access.
--
-- Neither table is reachable from the mobile app: RLS is enabled with NO
-- policies and every privilege is revoked from anon/authenticated, so the only
-- access path is service_role (the API) or a dashboard session. Adding an admin
-- is therefore a deliberate Studio/SQL action, never something the app can do.
--
-- The audit log exists because the console can write per-portfolio tables that
-- hold live beta users' data. Every mutation records who did it, to which row,
-- and the full before/after image, so a bad edit can be identified and undone.

-- ── Allowlist ──────────────────────────────────────────────────────────────

create table if not exists public.admin_users (
  id uuid primary key default gen_random_uuid(),
  -- Stored normalized (see trigger below) so the API can do a plain, exact
  -- lower-cased equality lookup. Matching with ilike would be wrong here:
  -- '_' and '%' are LIKE wildcards and both are legal in an email local-part,
  -- so 'a_b@x.com' would also match 'axb@x.com'.
  email text not null,
  display_name text,
  -- Soft revoke: flip to false to cut access without losing the audit trail's
  -- reference to who this was.
  is_active boolean not null default true,
  note text,
  created_at timestamptz not null default now()
);

create unique index if not exists admin_users_email_key
  on public.admin_users (email);

comment on table public.admin_users is
  'Allowlist of emails permitted to use the internal admin console. Service-role only; the mobile app can neither read nor write it.';

-- Normalize on the way in so an operator typing "Admin@Example.com " in Studio
-- still matches the lower-cased lookup the API performs.
create or replace function public.admin_users_normalize_email() returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.email = lower(btrim(new.email));
  return new;
end;
$$;

drop trigger if exists trg_admin_users_normalize on public.admin_users;
create trigger trg_admin_users_normalize
  before insert or update of email on public.admin_users
  for each row execute function public.admin_users_normalize_email();

alter table public.admin_users enable row level security;
-- Deliberately no policies: RLS with zero policies denies everything for
-- anon/authenticated. service_role bypasses RLS.
revoke all on table public.admin_users from anon, authenticated;

-- ── Audit log ──────────────────────────────────────────────────────────────

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Captured from the verified JWT, not from the request body.
  actor_email text not null,
  actor_id uuid,
  action text not null check (action in ('create', 'update', 'delete')),
  table_name text not null,
  -- text, not uuid: app_config's primary key is a boolean.
  row_id text,
  -- Full row images. `before` is null on create, `after` null on delete.
  before jsonb,
  after jsonb,
  -- Cascade impact recorded at delete time, so the log still explains what a
  -- delete took with it after the child rows are gone.
  cascade_impact jsonb,
  at timestamptz not null default now()
);

comment on table public.admin_audit_log is
  'Append-only record of every write made through the admin console, including full before/after row images. Service-role only.';

create index if not exists idx_admin_audit_log_at
  on public.admin_audit_log (at desc);
create index if not exists idx_admin_audit_log_table
  on public.admin_audit_log (table_name, at desc);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from anon, authenticated;
