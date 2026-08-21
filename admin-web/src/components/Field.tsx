// Renders one input from its FieldSpec. Every type the registry can declare
// maps to exactly one control here, so adding a column to a table means adding
// a line to the registry and nothing else.

import type { FieldSpec } from "../types";
import { RefPicker } from "./RefPicker";

interface Props {
  field: FieldSpec;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Convert a stored value into what the control expects. */
function asText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function Field({ field, value, onChange }: Props) {
  const id = `f-${field.name}`;
  const wide =
    field.type === "longtext" || field.type === "jsonb" ? "span-2" : "";

  if (field.readOnly) {
    return (
      <div className={`field ${wide}`}>
        <label>{field.label}</label>
        <div className="ro">{asText(value) || "—"}</div>
      </div>
    );
  }

  let control: React.ReactNode;

  if (field.ref) {
    control = (
      <RefPicker
        id={id}
        table={field.ref}
        value={asText(value)}
        required={field.required}
        onChange={onChange}
      />
    );
  } else {
    switch (field.type) {
      case "boolean":
        control = (
          <label className="inline" style={{ fontWeight: 400 }}>
            <input
              id={id}
              type="checkbox"
              checked={value === true}
              onChange={(e) => onChange(e.target.checked)}
            />
            <span className="muted">{value === true ? "True" : "False"}</span>
          </label>
        );
        break;

      case "enum":
        control = (
          <select
            id={id}
            value={asText(value)}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">— none —</option>
            {(field.enumValues ?? []).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        );
        break;

      case "longtext":
      case "jsonb":
        control = (
          <textarea
            id={id}
            value={asText(value)}
            required={field.required}
            rows={field.type === "jsonb" ? 6 : 3}
            onChange={(e) => onChange(e.target.value)}
          />
        );
        break;

      case "number":
      case "integer":
        control = (
          <input
            id={id}
            type="number"
            // Numerics here are money and multipliers; integers are day
            // indexes. Anything else would be rejected server-side anyway.
            step={field.type === "integer" ? 1 : "any"}
            min={field.min}
            max={field.max}
            value={asText(value)}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          />
        );
        break;

      case "date":
        control = (
          <input
            id={id}
            type="date"
            value={asText(value).slice(0, 10)}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          />
        );
        break;

      case "time":
        control = (
          <input
            id={id}
            type="time"
            value={asText(value)}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          />
        );
        break;

      default:
        control = (
          <input
            id={id}
            type="text"
            value={asText(value)}
            required={field.required}
            onChange={(e) => onChange(e.target.value)}
          />
        );
    }
  }

  return (
    <div className={`field ${wide}`}>
      <label htmlFor={id}>
        {field.label}
        {field.required && <span className="req">*</span>}
      </label>
      {control}
      {field.help && <div className="help">{field.help}</div>}
    </div>
  );
}
