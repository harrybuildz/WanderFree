// Mirrors admin-api/src/schema/types.ts. The registry is fetched at runtime
// from GET /api/tables, so these are the shapes it arrives in.

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
  required?: boolean;
  readOnly?: boolean;
  enumValues?: string[];
  ref?: string;
  min?: number;
  max?: number;
  help?: string;
  default?: unknown;
  hideInList?: boolean;
}

export interface TableSpec {
  name: string;
  label: string;
  group: "catalog" | "portfolio" | "operations";
  description: string;
  primaryKey: string;
  labelField: string;
  defaultSort: { column: string; ascending: boolean };
  searchFields: string[];
  fields: FieldSpec[];
  writable: boolean;
  deletable: boolean;
  danger?: string;
}

export const GROUP_LABELS: Record<TableSpec["group"], string> = {
  catalog: "Catalog",
  portfolio: "User data",
  operations: "Operations",
};
