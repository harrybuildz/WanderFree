// List view for one table: search, sort, paginate, and the entry points to
// create, edit and delete.

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { api, type ListResult } from "../api";
import { DeleteDialog } from "../components/DeleteDialog";
import { formatCell, rowLabel } from "../format";
import type { TableSpec } from "../types";

export function TableList({ tables }: { tables: TableSpec[] }) {
  const { table: tableName } = useParams<{ table: string }>();
  const navigate = useNavigate();
  const spec = tables.find((t) => t.name === tableName);

  const [data, setData] = useState<ListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ column: string; dir: "asc" | "desc" } | null>(null);
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Reset view state when navigating between tables — otherwise a search or
  // page number from the previous table leaks into the next one.
  useEffect(() => {
    setSearch("");
    setPage(1);
    setSort(null);
    setData(null);
  }, [tableName]);

  useEffect(() => {
    if (!tableName) return;
    let active = true;
    setLoading(true);
    const t = setTimeout(() => {
      api
        .list(tableName, {
          page,
          search,
          sort: sort?.column,
          dir: sort?.dir,
        })
        .then((r) => {
          if (!active) return;
          setData(r);
          setError(null);
        })
        .catch((e: Error) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    }, search ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [tableName, page, search, sort, reloadKey]);

  if (!spec) return <div className="banner danger">Unknown table.</div>;

  const columns = spec.fields.filter((f) => !f.hideInList);
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  function toggleSort(column: string) {
    setPage(1);
    setSort((s) =>
      s?.column === column
        ? { column, dir: s.dir === "asc" ? "desc" : "asc" }
        : { column, dir: "asc" },
    );
  }

  return (
    <>
      <div className="page-head">
        <div className="row-between">
          <div>
            <h1>{spec.label}</h1>
            <p className="desc">{spec.description}</p>
          </div>
          {spec.writable ? (
            <Link className="btn primary" to={`/t/${spec.name}/new`}>
              New {spec.label.replace(/s$/, "").toLowerCase()}
            </Link>
          ) : (
            <span className="pill readonly">Read-only</span>
          )}
        </div>
      </div>

      {spec.danger && (
        <div className="banner warn" style={{ marginBottom: 16 }}>
          {spec.danger}
        </div>
      )}

      <div className="card">
        <div className="card-pad row-between" style={{ paddingBottom: 12 }}>
          {spec.searchFields.length > 0 ? (
            <input
              type="search"
              placeholder={`Search by ${spec.searchFields.join(", ")}…`}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              style={{ maxWidth: 340 }}
            />
          ) : (
            <span className="muted">
              {data ? `${data.total.toLocaleString()} rows` : ""}
            </span>
          )}
          {data && spec.searchFields.length > 0 && (
            <span className="muted">{data.total.toLocaleString()} rows</span>
          )}
        </div>

        {error && (
          <div className="card-pad">
            <div className="banner danger">{error}</div>
          </div>
        )}

        {loading && !data && <div className="spinner">Loading…</div>}

        {data && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {columns.map((f) => (
                    <th
                      key={f.name}
                      className="sortable"
                      onClick={() => toggleSort(f.name)}
                    >
                      {f.label}
                      {data.sort === f.name && (data.dir === "asc" ? " ▲" : " ▼")}
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => {
                  const id = String(row[spec.primaryKey]);
                  return (
                    <tr key={id}>
                      {columns.map((f) => {
                        const cell = formatCell(f, row[f.name], data.refLabels);
                        return (
                          <td key={f.name} title={cell.text}>
                            <span className={cell.className}>{cell.text}</span>
                          </td>
                        );
                      })}
                      <td className="actions">
                        <button
                          className="small"
                          onClick={() => navigate(`/t/${spec.name}/${encodeURIComponent(id)}`)}
                        >
                          {spec.writable ? "Edit" : "View"}
                        </button>
                        {spec.writable && spec.deletable && (
                          <button
                            className="small ghost"
                            style={{ color: "var(--danger)" }}
                            onClick={() =>
                              setDeleting({ id, label: rowLabel(spec, row) })
                            }
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 1} className="muted" style={{ padding: 28, textAlign: "center" }}>
                      {search ? "No rows match that search." : "No rows yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {data && pages > 1 && (
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

      {deleting && (
        <DeleteDialog
          table={spec}
          id={deleting.id}
          label={deleting.label}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </>
  );
}
