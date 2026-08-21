// The audit log. Every write the console has made, with the full before/after
// row images expandable inline — enough to reconstruct and reverse a bad edit
// by hand.

import { Fragment, useEffect, useState } from "react";

import { api, type AuditEntry } from "../api";
import type { TableSpec } from "../types";

function Diff({ entry }: { entry: AuditEntry }) {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();

  const show = (v: unknown) =>
    v === null || v === undefined ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

  return (
    <table style={{ fontSize: 12, marginTop: 8 }}>
      <thead>
        <tr>
          <th>Column</th>
          <th>Before</th>
          <th>After</th>
        </tr>
      </thead>
      <tbody>
        {keys.map((k) => {
          const b = show(before[k]);
          const a = show(after[k]);
          const same = b === a;
          return (
            <tr key={k} style={same ? { opacity: 0.45 } : undefined}>
              <td className="mono">{k}</td>
              <td className={entry.action === "create" ? "subtle" : undefined}>{b}</td>
              <td className={entry.action === "delete" ? "subtle" : undefined}>{a}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function Audit({ tables }: { tables: TableSpec[] }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .audit({ page, table: filter || undefined })
      .then((r) => {
        if (!active) return;
        setEntries(r.entries);
        setTotal(r.total);
        setError(null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [page, filter]);

  const pages = Math.max(1, Math.ceil(total / 50));

  return (
    <>
      <div className="page-head">
        <h1>Audit log</h1>
        <p className="desc">
          Every create, update and delete made through this console, with full
          before and after row images. Written server-side from the verified
          session — not from anything the browser sends.
        </p>
      </div>

      <div className="card">
        <div className="card-pad row-between">
          <select
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
              setPage(1);
            }}
            style={{ maxWidth: 260 }}
          >
            <option value="">All tables</option>
            {tables.map((t) => (
              <option key={t.name} value={t.name}>
                {t.label}
              </option>
            ))}
          </select>
          <span className="muted">{total.toLocaleString()} entries</span>
        </div>

        {error && (
          <div className="card-pad">
            <div className="banner danger">{error}</div>
          </div>
        )}
        {loading && <div className="spinner">Loading…</div>}

        {!loading && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Table</th>
                  <th>Row</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <Fragment key={e.id}>
                    <tr>
                      <td className="muted">{new Date(e.at).toLocaleString()}</td>
                      <td>{e.actor_email}</td>
                      <td>
                        <span className={`pill ${e.action}`}>{e.action}</span>
                      </td>
                      <td className="mono">{e.table_name}</td>
                      <td className="mono subtle">{e.row_id?.slice(0, 8) ?? "—"}</td>
                      <td className="actions">
                        <button
                          className="small"
                          onClick={() => setOpen(open === e.id ? null : e.id)}
                        >
                          {open === e.id ? "Hide" : "Details"}
                        </button>
                      </td>
                    </tr>
                    {open === e.id && (
                      <tr>
                        <td colSpan={6} style={{ whiteSpace: "normal", maxWidth: "none", background: "var(--surface-muted)" }}>
                          {e.cascade_impact && e.cascade_impact.totalDeleted > 0 && (
                            <div className="banner danger" style={{ marginBottom: 8 }}>
                              This delete also removed{" "}
                              {e.cascade_impact.totalDeleted.toLocaleString()} related
                              row(s):{" "}
                              {e.cascade_impact.deletes
                                .map((d) => `${d.count} ${d.label.toLowerCase()}`)
                                .join(", ")}
                              .
                            </div>
                          )}
                          <Diff entry={e} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: 28, textAlign: "center" }}>
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {pages > 1 && (
          <div className="card-pad inline" style={{ justifyContent: "center" }}>
            <button className="small" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="muted">
              Page {page} of {pages}
            </span>
            <button className="small" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
