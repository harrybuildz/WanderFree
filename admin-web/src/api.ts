// Typed wrapper around admin-api.
//
// Every call attaches the current Supabase access token. The token is read
// fresh from the client per request rather than captured once, so a refresh
// mid-session doesn't start producing 401s.

import { API_URL, supabase } from "./supabase";
import type { TableSpec } from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new ApiError(401, "Not signed in.");

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
      ...init.headers,
    },
  });

  const text = await res.text();
  const body = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new ApiError(
      res.status,
      (body as { error?: string }).error ?? res.statusText,
      (body as { details?: unknown }).details,
    );
  }
  return body as T;
}

const qs = (params: Record<string, string | number | undefined>) => {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== "") sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
};

export type Row = Record<string, unknown>;

export interface ListResult {
  rows: Row[];
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: "asc" | "desc";
  refLabels: Record<string, Record<string, string>>;
}

export interface ImpactNode {
  table: string;
  label: string;
  count: number;
  effect: "cascade" | "restrict" | "set null";
  children: ImpactNode[];
}

export interface Impact {
  deletes: ImpactNode[];
  nullifies: ImpactNode[];
  blockers: ImpactNode[];
  totalDeleted: number;
}

export interface AuditEntry {
  id: string;
  actor_email: string;
  action: "create" | "update" | "delete";
  table_name: string;
  row_id: string | null;
  before: Row | null;
  after: Row | null;
  cascade_impact: Impact | null;
  at: string;
}

export const api = {
  me: () => request<{ admin: { email: string; displayName: string | null } }>("/api/me"),

  tables: () => request<{ tables: TableSpec[] }>("/api/tables"),

  list: (
    table: string,
    params: {
      page?: number;
      pageSize?: number;
      search?: string;
      sort?: string;
      dir?: string;
    },
  ) => request<ListResult>(`/api/tables/${table}${qs(params)}`),

  options: (table: string, params: { search?: string; include?: string }) =>
    request<{ options: { value: string; label: string }[]; truncated: boolean }>(
      `/api/tables/${table}/options${qs(params)}`,
    ),

  get: (table: string, id: string) =>
    request<{ row: Row; refLabels: Record<string, Record<string, string>> }>(
      `/api/tables/${table}/${encodeURIComponent(id)}`,
    ),

  create: (table: string, body: Row) =>
    request<{ row: Row }>(`/api/tables/${table}`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  update: (table: string, id: string, body: Row) =>
    request<{ row: Row }>(`/api/tables/${table}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  impact: (table: string, id: string) =>
    request<{ impact: Impact; danger?: string }>(
      `/api/tables/${table}/${encodeURIComponent(id)}/impact`,
    ),

  remove: (table: string, id: string, expect: number) =>
    request<{ deleted: true; impact: Impact }>(
      `/api/tables/${table}/${encodeURIComponent(id)}${qs({ expect })}`,
      { method: "DELETE" },
    ),

  audit: (params: { page?: number; table?: string; rowId?: string }) =>
    request<{ entries: AuditEntry[]; total: number; page: number; pageSize: number }>(
      `/api/audit${qs(params)}`,
    ),

  dashboard: () =>
    request<{
      catalog: Record<string, number>;
      users: Record<string, number>;
      health: {
        productsWithNoBenefits: { id: string; name: string }[];
        productsWithNoProgram: number;
        anniversaryDefs: number;
        activeCardsWithNoOpenedOn: number;
      };
      recentActivity: {
        id: string;
        actor_email: string;
        action: string;
        table_name: string;
        row_id: string | null;
        at: string;
      }[];
    }>("/api/dashboard"),
};
