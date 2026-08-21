// Shapes describing an editable table. The registry in tables.ts is the single
// source of truth for BOTH ends of the tool: the API validates writes against
// it, and the SPA renders forms from it (fetched via GET /api/tables). Adding a
// column means editing one file, not two.
//
// The registry is hand-written rather than introspected from information_schema
// on purpose. Introspection can tell you a column is `uuid not null`; it cannot
// tell you that it points at card_products and should render as a searchable
// picker labelled "Issuer — Card", nor which tables are safe to expose at all.

export type FieldType =
  | "uuid"
  | "text"
  | "longtext"
  | "number"
  | "integer"
  | "boolean"
  | "date"
  | "time"
  | "timestamptz"
  | "enum"
  | "jsonb"
  | "int-array";

export interface FieldSpec {
  name: string;
  label: string;
  type: FieldType;
  /** Required on create. Server-generated columns are readOnly instead. */
  required?: boolean;
  /** Never accepted from the client (ids, created_at, trigger-maintained). */
  readOnly?: boolean;
  /** Allowed values for `enum` fields; mirrors the Postgres enum. */
  enumValues?: readonly string[];
  /** FK target table name — the SPA renders a picker over its rows. */
  ref?: string;
  min?: number;
  max?: number;
  /** Shown under the input. Use for anything a curator could get wrong. */
  help?: string;
  /** Value a create form opens with. Mirrors the column's Postgres DEFAULT so
   *  a new row starts out matching what the app would have produced. */
  default?: unknown;
  /** Hide from the list view (still editable on the record form). */
  hideInList?: boolean;
}

/** A child relation, used to compute delete impact before it happens. */
export interface ChildRelation {
  table: string;
  /** Column on the child table pointing back at this one. */
  column: string;
  onDelete: "cascade" | "restrict" | "set null";
}

export interface TableSpec {
  name: string;
  label: string;
  group: "catalog" | "portfolio" | "operations";
  description: string;
  primaryKey: string;
  /** Column rendered as the row's human label in pickers and headings. */
  labelField: string;
  /** Extra columns joined into the picker label, e.g. issuer name. */
  labelPrefixRef?: { field: string; table: string };
  defaultSort: { column: string; ascending: boolean };
  /** Columns matched by the list-view search box (ILIKE, OR'd). */
  searchFields: string[];
  fields: FieldSpec[];
  /** false ⇒ list/read only; create, update and delete are refused. */
  writable: boolean;
  deletable: boolean;
  children?: ChildRelation[];
  /** Rendered as a standing warning banner on the table's screens. */
  danger?: string;
}

export const editableFields = (t: TableSpec) => t.fields.filter((f) => !f.readOnly);
