// Generic CRUD over the registry.
//
// One set of handlers serves every table; the TableSpec supplies the column
// list, the validation rules and the delete-impact graph. That means the
// registry is also the security boundary — a `:table` param that isn't in it
// resolves to nothing, so there is no path to a table we didn't intend to
// expose (auth.users, the analytics views, anything added later by a
// migration).

import { Router } from "express";

import { requireAdmin } from "../auth.js";
import { recordAudit } from "../lib/audit.js";
import { deleteImpact } from "../lib/cascade.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { buildPayload } from "../lib/validate.js";
import { getTable, TABLES } from "../schema/tables.js";
import type { TableSpec } from "../schema/types.js";
import { admin } from "../supabase.js";

export const tablesRouter = Router();
tablesRouter.use(requireAdmin);

const MAX_PAGE_SIZE = 100;
const OPTIONS_LIMIT = 200;

function requireTable(name: string | undefined): TableSpec {
  const spec = name ? getTable(name) : undefined;
  if (!spec) throw notFound(`Unknown table "${name}".`);
  return spec;
}

/** PostgREST's filter grammar is comma/parenthesis delimited, so a raw search
 *  term containing those would change the meaning of the query rather than be
 *  matched literally. Strip them; also strip `*`, which is its wildcard. */
function sanitizeSearch(term: string): string {
  return term.replace(/[,()*"\\]/g, "").trim();
}

/** app_config's primary key is a boolean, so `:id` can't always be a string. */
function coercePk(spec: TableSpec, raw: string): string | boolean {
  const pkField = spec.fields.find((f) => f.name === spec.primaryKey);
  if (pkField?.type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
    throw badRequest(`${spec.label} is keyed by a boolean; got "${raw}".`);
  }
  return raw;
}

/** Human label for a row, e.g. "Chase — Sapphire Preferred". */
function labelFor(spec: TableSpec, row: Record<string, unknown>): string {
  const base = row[spec.labelField];
  const primary =
    base === null || base === undefined || base === ""
      ? `${spec.label} ${String(row[spec.primaryKey]).slice(0, 8)}`
      : String(base);
  const prefix = (row as { ref_prefix?: { [k: string]: unknown } | null }).ref_prefix;
  if (prefix && spec.labelPrefixRef) {
    const parent = getTable(spec.labelPrefixRef.table);
    const parentLabel = parent ? prefix[parent.labelField] : null;
    if (parentLabel) return `${String(parentLabel)} — ${primary}`;
  }
  return primary;
}

/** Select list that also pulls the parent row used in the label, when the spec
 *  declares one. PostgREST resolves the embed through the FK. */
function selectWithPrefix(spec: TableSpec): string {
  if (!spec.labelPrefixRef) return "*";
  const parent = getTable(spec.labelPrefixRef.table);
  if (!parent) return "*";
  return `*, ref_prefix:${parent.name}(${parent.labelField})`;
}

/**
 * Resolve foreign-key ids appearing on a page of rows into display labels.
 *
 * Bounded by design: only the ids actually present on the returned page are
 * looked up, so this is a handful of `in` queries regardless of table size —
 * unlike fetching every row of each referenced table and mapping client-side.
 */
async function resolveRefLabels(
  spec: TableSpec,
  rows: Record<string, unknown>[],
): Promise<Record<string, Record<string, string>>> {
  const byTable: Record<string, Set<string>> = {};
  for (const field of spec.fields) {
    if (!field.ref) continue;
    for (const row of rows) {
      const value = row[field.name];
      if (typeof value === "string" && value) {
        (byTable[field.ref] ??= new Set()).add(value);
      }
    }
  }

  const out: Record<string, Record<string, string>> = {};
  await Promise.all(
    Object.entries(byTable).map(async ([tableName, idSet]) => {
      const refSpec = getTable(tableName);
      if (!refSpec) return;
      const { data, error } = await admin
        .from(tableName)
        .select(selectWithPrefix(refSpec))
        .in(refSpec.primaryKey, [...idSet]);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data as unknown as Record<string, unknown>[]) ?? []) {
        map[String(row[refSpec.primaryKey])] = labelFor(refSpec, row);
      }
      out[tableName] = map;
    }),
  );
  return out;
}

// ── Registry ───────────────────────────────────────────────────────────────

/** The whole registry. The SPA renders its nav and every form from this. */
tablesRouter.get("/", (_req, res) => {
  res.json({ tables: TABLES });
});

// ── List ───────────────────────────────────────────────────────────────────

tablesRouter.get(
  "/:table",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);

    const page = Math.max(1, Number(req.query.page ?? 1) || 1);
    const pageSize = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Number(req.query.pageSize ?? 25) || 25),
    );

    // Only columns the spec knows are sortable — the value lands in a query
    // string that PostgREST parses.
    const requestedSort = String(req.query.sort ?? "");
    const sortColumn = spec.fields.some((f) => f.name === requestedSort)
      ? requestedSort
      : spec.defaultSort.column;
    const ascending =
      req.query.dir === undefined
        ? spec.defaultSort.ascending
        : req.query.dir === "asc";

    let query = admin
      .from(spec.name)
      .select(selectWithPrefix(spec), { count: "exact" });

    const search = sanitizeSearch(String(req.query.search ?? ""));
    if (search && spec.searchFields.length > 0) {
      query = query.or(
        spec.searchFields.map((f) => `${f}.ilike.*${search}*`).join(","),
      );
    }

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order(sortColumn, { ascending, nullsFirst: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    res.json({
      rows,
      total: count ?? rows.length,
      page,
      pageSize,
      sort: sortColumn,
      dir: ascending ? "asc" : "desc",
      refLabels: await resolveRefLabels(spec, rows),
    });
  }),
);

// ── Picker options ─────────────────────────────────────────────────────────
// Declared before "/:table/:id" so "options" isn't captured as an id.

tablesRouter.get(
  "/:table/options",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);

    let query = admin.from(spec.name).select(selectWithPrefix(spec));

    const search = sanitizeSearch(String(req.query.search ?? ""));
    if (search && spec.searchFields.length > 0) {
      query = query.or(
        spec.searchFields.map((f) => `${f}.ilike.*${search}*`).join(","),
      );
    }

    // Keep the currently-selected value in the list even when a search would
    // exclude it, so editing a record never silently drops its own FK.
    const includeId = req.query.include ? String(req.query.include) : null;

    const { data, error } = await query
      .order(spec.labelField, { ascending: true, nullsFirst: false })
      .limit(OPTIONS_LIMIT);
    if (error) throw error;

    const rows = (data as unknown as Record<string, unknown>[]) ?? [];
    const options = rows.map((row) => ({
      value: String(row[spec.primaryKey]),
      label: labelFor(spec, row),
    }));

    if (includeId && !options.some((o) => o.value === includeId)) {
      const { data: one } = await admin
        .from(spec.name)
        .select(selectWithPrefix(spec))
        .eq(spec.primaryKey, includeId)
        .maybeSingle();
      if (one) {
        options.unshift({
          value: includeId,
          label: labelFor(spec, one as unknown as Record<string, unknown>),
        });
      }
    }

    res.json({ options, truncated: rows.length >= OPTIONS_LIMIT });
  }),
);

// ── Read one ───────────────────────────────────────────────────────────────

tablesRouter.get(
  "/:table/:id",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);
    const id = coercePk(spec, String(req.params.id));

    const { data, error } = await admin
      .from(spec.name)
      .select("*")
      .eq(spec.primaryKey, id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound(`No ${spec.label} row with id ${String(id)}.`);

    const row = data as Record<string, unknown>;
    res.json({ row, refLabels: await resolveRefLabels(spec, [row]) });
  }),
);

// ── Create ─────────────────────────────────────────────────────────────────

tablesRouter.post(
  "/:table",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);
    if (!spec.writable) {
      throw forbidden(`${spec.label} is read-only in this console.`);
    }

    const payload = buildPayload(spec, req.body ?? {}, { partial: false });

    const { data, error } = await admin
      .from(spec.name)
      .insert(payload)
      .select("*")
      .single();
    if (error) throw error;

    const row = data as Record<string, unknown>;
    await recordAudit({
      actor: req.admin!,
      action: "create",
      table: spec.name,
      rowId: row[spec.primaryKey] as string,
      after: row,
    });

    res.status(201).json({ row });
  }),
);

// ── Update ─────────────────────────────────────────────────────────────────

tablesRouter.patch(
  "/:table/:id",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);
    if (!spec.writable) {
      throw forbidden(`${spec.label} is read-only in this console.`);
    }
    const id = coercePk(spec, String(req.params.id));

    // Read first so the audit log holds a real before-image. Also gives a
    // clean 404 instead of a silent zero-row update.
    const { data: before, error: beforeErr } = await admin
      .from(spec.name)
      .select("*")
      .eq(spec.primaryKey, id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) throw notFound(`No ${spec.label} row with id ${String(id)}.`);

    const payload = buildPayload(spec, req.body ?? {}, { partial: true });

    const { data, error } = await admin
      .from(spec.name)
      .update(payload)
      .eq(spec.primaryKey, id)
      .select("*")
      .single();
    if (error) throw error;

    const row = data as Record<string, unknown>;
    await recordAudit({
      actor: req.admin!,
      action: "update",
      table: spec.name,
      rowId: id,
      before,
      after: row,
    });

    res.json({ row });
  }),
);

// ── Delete impact preview ──────────────────────────────────────────────────

tablesRouter.get(
  "/:table/:id/impact",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);
    const id = coercePk(spec, String(req.params.id));
    res.json({ impact: await deleteImpact(spec.name, id), danger: spec.danger });
  }),
);

// ── Delete ─────────────────────────────────────────────────────────────────

tablesRouter.delete(
  "/:table/:id",
  asyncHandler(async (req, res) => {
    const spec = requireTable(req.params.table);
    if (!spec.writable || !spec.deletable) {
      throw forbidden(
        spec.danger ?? `${spec.label} rows cannot be deleted from this console.`,
      );
    }
    const id = coercePk(spec, String(req.params.id));

    const { data: before, error: beforeErr } = await admin
      .from(spec.name)
      .select("*")
      .eq(spec.primaryKey, id)
      .maybeSingle();
    if (beforeErr) throw beforeErr;
    if (!before) throw notFound(`No ${spec.label} row with id ${String(id)}.`);

    // Recomputed here rather than trusting a number the client sends: the
    // preview the operator saw may be stale, and this is the copy that goes
    // into the audit log as the record of what the delete took with it.
    const impact = await deleteImpact(spec.name, id);
    if (impact.blockers.length > 0) {
      const detail = impact.blockers
        .map((b) => `${b.count} ${b.label.toLowerCase()}`)
        .join(", ");
      throw badRequest(
        `Cannot delete: ${detail} still reference this row. Remove or repoint them first.`,
        impact,
      );
    }

    // The operator must have seen the current impact. `expect` is the total
    // row count their confirmation was based on; a mismatch means the data
    // moved under them, so refuse and make them look again.
    const expectRaw = req.query.expect;
    if (expectRaw !== undefined) {
      const expect = Number(expectRaw);
      if (Number.isFinite(expect) && expect !== impact.totalDeleted) {
        throw badRequest(
          `Cascade changed since you confirmed: this now deletes ${impact.totalDeleted} related row(s), not ${expect}. Re-check before deleting.`,
          impact,
        );
      }
    }

    const { error } = await admin
      .from(spec.name)
      .delete()
      .eq(spec.primaryKey, id);
    if (error) throw error;

    await recordAudit({
      actor: req.admin!,
      action: "delete",
      table: spec.name,
      rowId: id,
      before,
      cascadeImpact: impact,
    });

    res.json({ deleted: true, impact });
  }),
);
