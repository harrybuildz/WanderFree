// Delete confirmation, driven by the server's cascade analysis.
//
// This exists because the FK graph is not intuitive. Deleting a card product —
// which reads like a pure catalog edit — cascades through benefit_definitions
// into user_benefit_cycles and benefit_redemptions, i.e. real users' history.
// So the dialog does not ask "are you sure?"; it shows what the database will
// actually do, and refuses outright when a RESTRICT constraint will block it.

import { useEffect, useState } from "react";

import { api, type Impact, type ImpactNode } from "../api";
import type { TableSpec } from "../types";

interface Props {
  table: TableSpec;
  id: string;
  label: string;
  onClose: () => void;
  onDeleted: () => void;
}

function NodeList({ nodes, depth = 0 }: { nodes: ImpactNode[]; depth?: number }) {
  return (
    <ul style={{ margin: "4px 0", paddingLeft: depth === 0 ? 20 : 18 }}>
      {nodes.map((n) => (
        <li key={`${n.table}-${depth}`} style={{ marginBottom: 2 }}>
          <strong>{n.count.toLocaleString()}</strong> {n.label.toLowerCase()}
          {n.children.length > 0 && <NodeList nodes={n.children} depth={depth + 1} />}
        </li>
      ))}
    </ul>
  );
}

export function DeleteDialog({ table, id, label, onClose, onDeleted }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    api
      .impact(table.name, id)
      .then((r) => setImpact(r.impact))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [table.name, id]);

  const blocked = (impact?.blockers.length ?? 0) > 0;
  // A delete that reaches other rows demands the operator type the row's name.
  // A leaf delete is recoverable enough that a plain confirm is proportionate.
  const needsTyping = (impact?.totalDeleted ?? 0) > 0;
  const canDelete =
    !loading && !blocked && (!needsTyping || typed.trim() === label.trim());

  async function onConfirm() {
    if (!impact) return;
    setBusy(true);
    setError(null);
    try {
      await api.remove(table.name, id, impact.totalDeleted);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="scrim" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Delete {table.label.replace(/s$/, "").toLowerCase()}?</h2>
        <p className="muted" style={{ marginTop: 6 }}>
          <strong>{label}</strong>
        </p>

        {loading && <div className="spinner">Checking what this affects…</div>}

        {error && (
          <div className="banner danger" style={{ margin: "14px 0" }}>
            {error}
          </div>
        )}

        {impact && !loading && (
          <div className="stack" style={{ margin: "16px 0" }}>
            {blocked && (
              <div className="banner danger">
                <strong>This delete is blocked.</strong> The database will refuse
                it while these rows still point at it:
                <NodeList nodes={impact.blockers} />
                Remove or repoint them first.
              </div>
            )}

            {!blocked && impact.totalDeleted > 0 && (
              <div className="banner danger">
                <strong>
                  This also permanently deletes {impact.totalDeleted.toLocaleString()}{" "}
                  related row{impact.totalDeleted === 1 ? "" : "s"}:
                </strong>
                <NodeList nodes={impact.deletes} />
              </div>
            )}

            {!blocked && impact.nullifies.length > 0 && (
              <div className="banner warn">
                <strong>These rows survive but lose the reference:</strong>
                <NodeList nodes={impact.nullifies} />
              </div>
            )}

            {!blocked && impact.totalDeleted === 0 && impact.nullifies.length === 0 && (
              <div className="banner info">
                Nothing else references this row.
              </div>
            )}

            {table.danger && !blocked && (
              <div className="banner warn">{table.danger}</div>
            )}

            {!blocked && needsTyping && (
              <div className="field" style={{ margin: 0 }}>
                <label htmlFor="confirm-name">
                  Type <strong>{label}</strong> to confirm
                </label>
                <input
                  id="confirm-name"
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
          </div>
        )}

        <div className="inline" style={{ justifyContent: "flex-end", marginTop: 8 }}>
          <button onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="danger" onClick={onConfirm} disabled={!canDelete || busy}>
            {busy ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}
