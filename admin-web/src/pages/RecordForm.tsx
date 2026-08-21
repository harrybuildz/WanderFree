// Create / edit one row.
//
// On edit, only the fields the operator actually changed are PATCHed. That
// matters for tables carrying trigger logic: sending back an unchanged
// bonus_value on user_signup_bonuses would re-fire trg_bonus_wallet_credit and
// move a wallet balance for no reason.

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, type Row } from "../api";
import { DeleteDialog } from "../components/DeleteDialog";
import { Field } from "../components/Field";
import { rowLabel } from "../format";
import type { TableSpec } from "../types";

export function RecordForm({ tables }: { tables: TableSpec[] }) {
  const { table: tableName, id } = useParams<{ table: string; id: string }>();
  const navigate = useNavigate();
  const spec = tables.find((t) => t.name === tableName);
  const isNew = id === "new";

  const [original, setOriginal] = useState<Row>({});
  const [values, setValues] = useState<Row>({});
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!spec) return;
    if (isNew) {
      // Seed from the registry's declared defaults, which mirror the columns'
      // Postgres DEFAULTs — so a hand-created row starts out matching what the
      // app itself would have written.
      const seed: Row = {};
      for (const f of spec.fields) {
        if (f.readOnly) continue;
        if (f.default !== undefined) seed[f.name] = f.default;
        else if (f.type === "boolean") seed[f.name] = false;
      }
      setValues(seed);
      setOriginal({});
      setLoading(false);
      return;
    }
    if (!tableName || !id) return;

    let active = true;
    setLoading(true);
    api
      .get(tableName, id)
      .then((r) => {
        if (!active) return;
        setOriginal(r.row);
        setValues(r.row);
        setError(null);
      })
      .catch((e: Error) => active && setError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [spec, tableName, id, isNew]);

  /** Fields whose value differs from what was loaded. */
  const changed = useMemo(() => {
    if (isNew || !spec) return [];
    return spec.fields
      .filter((f) => !f.readOnly)
      .filter((f) => {
        const before = original[f.name];
        const after = values[f.name];
        // JSON columns arrive as objects and are edited as text, so compare
        // their serialised forms rather than by reference.
        if (f.type === "jsonb") {
          return JSON.stringify(before ?? null) !== normaliseJson(after);
        }
        const b = before === null || before === undefined ? "" : String(before);
        const a = after === null || after === undefined ? "" : String(after);
        return b !== a;
      })
      .map((f) => f.name);
  }, [isNew, spec, original, values]);

  function normaliseJson(value: unknown): string {
    if (value === null || value === undefined || value === "") return "null";
    if (typeof value === "object") return JSON.stringify(value);
    try {
      return JSON.stringify(JSON.parse(String(value)));
    } catch {
      // Invalid JSON: treat as changed so the server gets a chance to reject it
      // with a useful message rather than silently dropping the edit.
      return String(value);
    }
  }

  if (!spec) return <div className="banner danger">Unknown table.</div>;
  if (loading) return <div className="spinner">Loading…</div>;

  const readOnlyTable = !spec.writable;
  const label = rowLabel(spec, original);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!spec || !tableName) return;
    setSaving(true);
    setError(null);
    try {
      if (isNew) {
        const body: Row = {};
        for (const f of spec.fields) {
          if (f.readOnly) continue;
          body[f.name] = values[f.name] ?? null;
        }
        const r = await api.create(tableName, body);
        navigate(`/t/${tableName}/${encodeURIComponent(String(r.row[spec.primaryKey]))}`);
      } else {
        const body: Row = {};
        for (const name of changed) body[name] = values[name] ?? null;
        const r = await api.update(tableName, id!, body);
        setOriginal(r.row);
        setValues(r.row);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="page-head">
        <div className="row-between">
          <div>
            <Link to={`/t/${spec.name}`} className="muted" style={{ fontSize: 13 }}>
              ← {spec.label}
            </Link>
            <h1 style={{ marginTop: 6 }}>
              {isNew ? `New ${spec.label.replace(/s$/, "").toLowerCase()}` : label}
            </h1>
          </div>
          {!isNew && spec.writable && spec.deletable && (
            <button className="danger" onClick={() => setDeleting(true)}>
              Delete
            </button>
          )}
        </div>
      </div>

      {spec.danger && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {spec.danger}
        </div>
      )}
      {readOnlyTable && (
        <div className="banner info" style={{ marginBottom: 16 }}>
          This table is read-only in the console. It is written by the app and
          read by Metabase.
        </div>
      )}
      {error && (
        <div className="banner danger" style={{ marginBottom: 16 }}>
          {error}
        </div>
      )}

      <form className="card card-pad" onSubmit={onSubmit}>
        <fieldset disabled={readOnlyTable} style={{ border: 0, padding: 0, margin: 0 }}>
          <div className="field-grid">
            {spec.fields.map((f) => (
              <Field
                key={f.name}
                field={f}
                value={values[f.name]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
              />
            ))}
          </div>
        </fieldset>

        {!readOnlyTable && (
          <div className="inline" style={{ justifyContent: "flex-end", marginTop: 8 }}>
            {!isNew && (
              <span className="muted" style={{ marginRight: "auto" }}>
                {changed.length === 0
                  ? "No changes"
                  : `${changed.length} field${changed.length === 1 ? "" : "s"} changed`}
              </span>
            )}
            <Link className="btn" to={`/t/${spec.name}`}>
              Cancel
            </Link>
            <button
              className="primary"
              disabled={saving || (!isNew && changed.length === 0)}
            >
              {saving ? "Saving…" : isNew ? "Create" : "Save changes"}
            </button>
          </div>
        )}
      </form>

      {deleting && id && (
        <DeleteDialog
          table={spec}
          id={id}
          label={label}
          onClose={() => setDeleting(false)}
          onDeleted={() => navigate(`/t/${spec.name}`)}
        />
      )}
    </>
  );
}
