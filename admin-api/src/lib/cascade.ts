// Delete impact preview.
//
// The FK graph in this schema means a single delete can reach a long way. The
// worst case is not obvious: deleting a CATALOG row — a card product — cascades
// into benefit_definitions, and from there into user_benefit_cycles and
// benefit_redemptions, which are live beta users' history. Someone tidying the
// catalog would have no reason to expect that.
//
// So before any delete, walk the graph and count what goes with it. The UI
// shows those counts and requires the operator to confirm against them.

import { getTable } from "../schema/tables.js";
import type { ChildRelation } from "../schema/types.js";
import { admin } from "../supabase.js";

export interface ImpactNode {
  table: string;
  label: string;
  count: number;
  effect: ChildRelation["onDelete"];
  /** Rows further down the chain from this one. */
  children: ImpactNode[];
}

export interface Impact {
  /** Rows that will be permanently deleted, deepest chain included. */
  deletes: ImpactNode[];
  /** Rows that will merely have a column nulled. */
  nullifies: ImpactNode[];
  /** Relations that will BLOCK the delete entirely (ON DELETE RESTRICT). */
  blockers: ImpactNode[];
  totalDeleted: number;
}

/** Count child rows pointing at a set of parent ids. */
async function countAndIds(
  childTable: string,
  column: string,
  parentIds: (string | number | boolean)[],
): Promise<{ count: number; ids: string[] }> {
  if (parentIds.length === 0) return { count: 0, ids: [] };

  const child = getTable(childTable);
  const pk = child?.primaryKey ?? "id";

  const { data, error, count } = await admin
    .from(childTable)
    .select(pk, { count: "exact" })
    .in(column, parentIds as string[])
    // Cap the ids we carry forward: we need them to recurse, but a runaway
    // chain shouldn't pull an unbounded set into memory. The COUNT is exact
    // regardless — only the recursion is truncated.
    .limit(1000);

  if (error) throw error;
  // `select()` with a runtime-built column name gives supabase-js no literal
  // to infer from, so it falls back to its error shape; the double assertion
  // is the documented escape hatch for dynamic selects.
  const ids = ((data as unknown as Record<string, unknown>[]) ?? []).map((r) =>
    String(r[pk]),
  );
  return { count: count ?? ids.length, ids };
}

async function walk(
  tableName: string,
  ids: (string | number | boolean)[],
  seen: Set<string>,
  depth: number,
): Promise<{ deletes: ImpactNode[]; nullifies: ImpactNode[]; blockers: ImpactNode[] }> {
  const deletes: ImpactNode[] = [];
  const nullifies: ImpactNode[] = [];
  const blockers: ImpactNode[] = [];

  const spec = getTable(tableName);
  // Depth guard: reward_categories.parent_id is self-referential, so an
  // unguarded walk on a deep tree could spin.
  if (!spec?.children || ids.length === 0 || depth > 6) {
    return { deletes, nullifies, blockers };
  }

  for (const rel of spec.children) {
    const key = `${tableName}.${rel.table}.${rel.column}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { count, ids: childIds } = await countAndIds(
      rel.table,
      rel.column,
      ids,
    );
    if (count === 0) continue;

    const childSpec = getTable(rel.table);
    const node: ImpactNode = {
      table: rel.table,
      label: childSpec?.label ?? rel.table,
      count,
      effect: rel.onDelete,
      children: [],
    };

    if (rel.onDelete === "restrict") {
      blockers.push(node);
      continue;
    }
    if (rel.onDelete === "set null") {
      nullifies.push(node);
      continue;
    }

    // Cascade — recurse, since the child's own children go too.
    const nested = await walk(rel.table, childIds, seen, depth + 1);
    node.children = nested.deletes;
    deletes.push(node);
    nullifies.push(...nested.nullifies);
    blockers.push(...nested.blockers);
  }

  return { deletes, nullifies, blockers };
}

function sum(nodes: ImpactNode[]): number {
  return nodes.reduce((t, n) => t + n.count + sum(n.children), 0);
}

export async function deleteImpact(
  tableName: string,
  id: string | number | boolean,
): Promise<Impact> {
  const { deletes, nullifies, blockers } = await walk(
    tableName,
    [id],
    new Set(),
    0,
  );
  return { deletes, nullifies, blockers, totalDeleted: sum(deletes) };
}
