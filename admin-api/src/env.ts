// Validated environment. Fail loudly at boot rather than at the first request:
// a missing service-role key would otherwise surface as a confusing 401 from
// PostgREST halfway through an edit.

import { config } from "dotenv";
import { z } from "zod";

config();

const schema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_ANON_KEY: z.string().min(1),
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
  PORT: z.coerce.number().int().positive().default(4000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const missing = parsed.error.issues
    .map((i) => `  ${i.path.join(".")}: ${i.message}`)
    .join("\n");
  console.error(
    `admin-api: invalid environment.\n${missing}\n\n` +
      `Copy admin-api/.env.example to admin-api/.env and fill it in.`,
  );
  process.exit(1);
}

export const env = {
  ...parsed.data,
  allowedOrigins: parsed.data.ALLOWED_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};

// A service-role JWT carries {"role":"service_role"}; the anon key carries
// {"role":"anon"}. Pasting the anon key into SUPABASE_SERVICE_ROLE_KEY is an
// easy mistake that would make every write fail with an opaque RLS error, so
// check it here where the message can be useful.
function roleOf(jwt: string): string | null {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8"),
    ) as { role?: string };
    return payload.role ?? null;
  } catch {
    return null;
  }
}

const serviceRole = roleOf(env.SUPABASE_SERVICE_ROLE_KEY);
if (serviceRole && serviceRole !== "service_role") {
  console.error(
    `admin-api: SUPABASE_SERVICE_ROLE_KEY looks like a "${serviceRole}" key, ` +
      `not a service_role key. Catalog writes will fail — the catalog tables ` +
      `are SELECT-only to authenticated. Grab the service_role key from ` +
      `Project Settings > API.`,
  );
  process.exit(1);
}
