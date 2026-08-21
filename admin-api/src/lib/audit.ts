// Append a row to public.admin_audit_log.
//
// Every mutation is recorded with the actor taken from the VERIFIED JWT, never
// from the request body, plus full before/after images so a bad edit can be
// reconstructed and reversed.
//
// Deliberately non-fatal: if the log write fails, the mutation that already
// succeeded is not rolled back (it can't be — PostgREST calls aren't in one
// transaction), and failing the response would tell the operator their edit
// didn't land when it did. Log loudly to the server console instead.

import type { AdminActor } from "../auth.js";
import { admin } from "../supabase.js";

export interface AuditEntry {
  actor: AdminActor;
  action: "create" | "update" | "delete";
  table: string;
  rowId: string | number | boolean | null;
  before?: unknown;
  after?: unknown;
  cascadeImpact?: unknown;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  const { error } = await admin.from("admin_audit_log").insert({
    actor_email: entry.actor.email,
    actor_id: entry.actor.id,
    action: entry.action,
    table_name: entry.table,
    row_id: entry.rowId === null ? null : String(entry.rowId),
    before: entry.before ?? null,
    after: entry.after ?? null,
    cascade_impact: entry.cascadeImpact ?? null,
  });
  if (error) {
    console.error(
      `admin-api: AUDIT WRITE FAILED for ${entry.action} on ${entry.table} ` +
        `row ${String(entry.rowId)} by ${entry.actor.email}:`,
      error.message,
    );
  }
}
