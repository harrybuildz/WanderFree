// Cell formatting for the list view.

import type { FieldSpec } from "./types";

export function formatCell(
  field: FieldSpec,
  value: unknown,
  refLabels: Record<string, Record<string, string>>,
): { text: string; className?: string } {
  if (value === null || value === undefined || value === "") {
    return { text: "—", className: "subtle" };
  }

  if (field.ref) {
    const label = refLabels[field.ref]?.[String(value)];
    return label
      ? { text: label, className: "pill ref" }
      : { text: String(value).slice(0, 8), className: "mono subtle" };
  }

  switch (field.type) {
    case "boolean":
      return { text: value ? "Yes" : "No", className: value ? "pill on" : "pill off" };
    case "timestamptz":
      // Local time is right here: the operator reading this is in one place.
      return { text: new Date(String(value)).toLocaleString(), className: "muted" };
    case "date":
      // A Postgres `date` has no timezone — parsing it as a Date would shift it
      // a day backwards in any negative-offset zone. Show the stored string.
      return { text: String(value).slice(0, 10) };
    case "uuid":
      return { text: String(value).slice(0, 8), className: "mono subtle" };
    case "jsonb":
      return { text: JSON.stringify(value), className: "mono" };
    case "number":
      return { text: Number(value).toLocaleString() };
    default:
      return { text: String(value) };
  }
}

export function rowLabel(
  spec: { labelField: string; primaryKey: string; label: string },
  row: Record<string, unknown>,
): string {
  const base = row[spec.labelField];
  if (base === null || base === undefined || base === "") {
    return String(row[spec.primaryKey]).slice(0, 8);
  }
  return String(base);
}
