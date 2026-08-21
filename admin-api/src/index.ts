// admin-api — internal admin console server for WanderFreely.
//
// Holds the Supabase service-role key, which bypasses RLS entirely. That is the
// point: the catalog tables are SELECT-only to `authenticated`, so no client
// key can write them. It also means this process must never be exposed
// casually — see admin-api/README.md before deploying it anywhere but
// localhost.

import cors from "cors";
import express from "express";

import { env } from "./env.js";
import { errorHandler } from "./lib/errors.js";
import { auditRouter } from "./routes/audit.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { meRouter } from "./routes/me.js";
import { tablesRouter } from "./routes/tables.js";

const app = express();

app.use(
  cors({
    origin: env.allowedOrigins,
    // Auth travels in the Authorization header, not a cookie, so credentialed
    // requests are unnecessary — and leaving this off means a hostile page
    // can't ride along on an existing session.
    credentials: false,
  }),
);
app.use(express.json({ limit: "1mb" }));

// Unauthenticated: lets the SPA distinguish "API is down" from "not allowed".
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api/me", meRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/audit", auditRouter);
app.use("/api/dashboard", dashboardRouter);

app.use((_req, res) => res.status(404).json({ error: "Not found" }));
app.use(errorHandler);

app.listen(env.PORT, () => {
  console.log(`admin-api listening on http://localhost:${env.PORT}`);
  console.log(`  CORS origins: ${env.allowedOrigins.join(", ")}`);
  console.log(`  Supabase:     ${env.SUPABASE_URL}`);
});
