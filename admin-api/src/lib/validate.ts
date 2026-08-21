// Coerce and validate a request body against a table's field specs.
//
// Everything arrives from an HTML form as a string, and PostgREST is strict
// about types — "" is not a valid numeric and not a valid null. So the job here
// is threefold: reject unknown columns (the registry is the allowlist), turn
// blanks into real nulls, and parse each field to the type Postgres expects.

import { badRequest } from "./errors.js";
import type { FieldSpec, TableSpec } from "../schema/types.js";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

function coerce(field: FieldSpec, raw: unknown): unknown {
  // Treat empty string as "cleared" — an HTML input can't produce null.
  const value = raw === "" ? null : raw;

  if (value === null || value === undefined) {
    if (field.required) {
      throw badRequest(`${field.label} is required.`);
    }
    return null;
  }

  switch (field.type) {
    case "uuid": {
      const s = String(value).trim();
      // Postgres would reject a malformed uuid anyway; catching it here gives a
      // message naming the field instead of a raw PostgREST error.
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
      ) {
        throw badRequest(`${field.label} must be a UUID.`);
      }
      return s;
    }

    case "text":
    case "longtext": {
      const s = String(value);
      // A field that is only whitespace is a cleared field, not a value.
      return s.trim() === "" ? (field.required ? s : null) : s;
    }

    case "number":
    case "integer": {
      const n = typeof value === "number" ? value : Number(String(value).trim());
      if (!Number.isFinite(n)) {
        throw badRequest(`${field.label} must be a number.`);
      }
      if (field.type === "integer" && !Number.isInteger(n)) {
        throw badRequest(`${field.label} must be a whole number.`);
      }
      if (field.min !== undefined && n < field.min) {
        throw badRequest(`${field.label} must be at least ${field.min}.`);
      }
      if (field.max !== undefined && n > field.max) {
        throw badRequest(`${field.label} must be at most ${field.max}.`);
      }
      return n;
    }

    case "boolean": {
      if (typeof value === "boolean") return value;
      const s = String(value).toLowerCase();
      if (["true", "1", "yes", "on"].includes(s)) return true;
      if (["false", "0", "no", "off"].includes(s)) return false;
      throw badRequest(`${field.label} must be true or false.`);
    }

    case "date": {
      const s = String(value).trim();
      if (!ISO_DATE.test(s)) {
        throw badRequest(`${field.label} must be a date (YYYY-MM-DD).`);
      }
      return s;
    }

    case "time": {
      const s = String(value).trim();
      if (!TIME.test(s)) {
        throw badRequest(`${field.label} must be a time (HH:MM).`);
      }
      return s;
    }

    case "timestamptz": {
      const s = String(value).trim();
      if (Number.isNaN(Date.parse(s))) {
        throw badRequest(`${field.label} must be a timestamp.`);
      }
      return s;
    }

    case "enum": {
      const s = String(value).trim();
      if (!field.enumValues?.includes(s)) {
        throw badRequest(
          `${field.label} must be one of: ${field.enumValues?.join(", ")}.`,
        );
      }
      return s;
    }

    case "jsonb": {
      if (typeof value === "object") return value;
      try {
        return JSON.parse(String(value));
      } catch {
        throw badRequest(`${field.label} must be valid JSON.`);
      }
    }

    case "int-array": {
      const parts = Array.isArray(value)
        ? value
        : String(value)
            .split(",")
            .map((p) => p.trim())
            .filter(Boolean);
      const nums = parts.map((p) => {
        const n = Number(p);
        if (!Number.isInteger(n)) {
          throw badRequest(`${field.label} must be a list of whole numbers.`);
        }
        return n;
      });
      return nums.length === 0 ? null : nums;
    }
  }
}

/**
 * Build the row to send to PostgREST.
 *
 * `partial` distinguishes create from update: on create every required field
 * must be present; on update only the supplied fields are touched, so a form
 * that submits one column doesn't null out the rest.
 */
export function buildPayload(
  table: TableSpec,
  body: Record<string, unknown>,
  { partial }: { partial: boolean },
): Record<string, unknown> {
  const writable = table.fields.filter((f) => !f.readOnly);
  const known = new Set(writable.map((f) => f.name));

  const unknownKeys = Object.keys(body).filter((k) => !known.has(k));
  if (unknownKeys.length > 0) {
    throw badRequest(
      `Unknown or read-only column(s) for ${table.name}: ${unknownKeys.join(", ")}.`,
    );
  }

  const out: Record<string, unknown> = {};
  for (const field of writable) {
    const present = Object.prototype.hasOwnProperty.call(body, field.name);
    if (partial && !present) continue;
    out[field.name] = coerce(field, present ? body[field.name] : null);
  }

  if (Object.keys(out).length === 0) {
    throw badRequest("No fields to write.");
  }
  return out;
}
