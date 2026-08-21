// Foreign-key picker.
//
// Loads labelled options from the API rather than raw ids, because a curator
// choosing a benefit's card product needs to see "Chase — Sapphire Preferred",
// not a uuid. The server caps the option list, so when it reports a truncated
// result a search box appears and filtering moves server-side; the currently
// selected value is always requested explicitly (`include`) so editing a record
// can never silently drop its own reference.

import { useEffect, useState } from "react";

import { api } from "../api";

interface Props {
  table: string;
  value: string;
  onChange: (value: string) => void;
  id?: string;
  required?: boolean;
}

export function RefPicker({ table, value, onChange, id, required }: Props) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    // Debounced so typing in the search box doesn't fire a request per keypress.
    const t = setTimeout(() => {
      api
        .options(table, { search, include: value || undefined })
        .then((r) => {
          if (!active) return;
          setOptions(r.options);
          setTruncated(r.truncated);
          setError(null);
        })
        .catch((e: Error) => active && setError(e.message))
        .finally(() => active && setLoading(false));
    }, search ? 250 : 0);

    return () => {
      active = false;
      clearTimeout(t);
    };
  }, [table, search, value]);

  if (error) return <div className="banner danger">{error}</div>;

  return (
    <>
      {truncated && (
        <input
          type="search"
          placeholder={`Search ${table.replace(/_/g, " ")}…`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ marginBottom: 6 }}
        />
      )}
      <select
        id={id}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">{loading ? "Loading…" : "— none —"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {truncated && (
        <div className="help">
          Showing the first 200 matches — search to narrow the list.
        </div>
      )}
    </>
  );
}
