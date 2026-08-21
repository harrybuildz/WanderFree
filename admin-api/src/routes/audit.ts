// Read the audit trail. Written by lib/audit.ts on every mutation; there is no
// write endpoint here on purpose — the log is append-only from the API's side
// and edited by nobody.

import { Router } from "express";

import { requireAdmin } from "../auth.js";
import { asyncHandler } from "../lib/errors.js";
import { admin } from "../supabase.js";

export const auditRouter = Router();
auditRouter.use(requireAdmin);

auditRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(req.query.pageSize ?? 50) || 50),
    );

    let query = admin
      .from("admin_audit_log")
      .select("*", { count: "exact" })
      .order("at", { ascending: false });

    // Both filters are compared as whole values, so no wildcard escaping is
    // needed the way the ILIKE search on the table list needs it.
    if (req.query.table) query = query.eq("table_name", String(req.query.table));
    if (req.query.actor) query = query.eq("actor_email", String(req.query.actor));
    if (req.query.rowId) query = query.eq("row_id", String(req.query.rowId));

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    res.json({ entries: data ?? [], total: count ?? 0, page, pageSize });
  }),
);
