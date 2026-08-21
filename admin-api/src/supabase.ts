// Two clients, deliberately separate.
//
//   admin  — service_role. Bypasses RLS. Every CRUD operation runs through it,
//            which is the entire reason this server exists: the catalog tables
//            are SELECT-only to `authenticated`, so the mobile app's key
//            physically cannot write them.
//
//   verify — anon. Used for exactly one thing: turning a caller's access token
//            into a verified user identity. Kept apart from `admin` so an
//            accidental `.from(...)` on the wrong client can't quietly get
//            service-role reach.

import { createClient } from "@supabase/supabase-js";

import { env } from "./env.js";

export const admin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
  },
);

export const verify = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});
