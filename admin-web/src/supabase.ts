// Anon-key client. Used for exactly one job: signing the operator in so we have
// an access token to present to admin-api. It never reads or writes app data —
// under RLS as an ordinary authenticated user it could only see its own rows
// anyway, which is not what this console is for.

import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "admin-web: missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. " +
      "Copy admin-web/.env.example to admin-web/.env and fill it in.",
  );
}

export const supabase = createClient(url, anonKey);

export const API_URL =
  import.meta.env.VITE_ADMIN_API_URL ?? "http://localhost:4000";
