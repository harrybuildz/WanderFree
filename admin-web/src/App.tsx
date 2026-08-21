// Router. The table registry is fetched once after sign-in and handed to every
// screen — nav, list columns and form fields all come from it, so the UI picks
// up a schema change the moment admin-api's registry does.

import { useEffect, useState } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { api } from "./api";
import { useAuth } from "./auth";
import { Layout } from "./components/Layout";
import { Audit } from "./pages/Audit";
import { Dashboard } from "./pages/Dashboard";
import { Login } from "./pages/Login";
import { RecordForm } from "./pages/RecordForm";
import { TableList } from "./pages/TableList";
import type { TableSpec } from "./types";

export function App() {
  const { loading, admin } = useAuth();
  const [tables, setTables] = useState<TableSpec[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!admin) {
      setTables(null);
      return;
    }
    api
      .tables()
      .then((r) => setTables(r.tables))
      .catch((e: Error) => setError(e.message));
  }, [admin]);

  if (loading) return <div className="spinner">Loading…</div>;
  if (!admin) return <Login />;
  if (error) return <div className="banner danger">{error}</div>;
  if (!tables) return <div className="spinner">Loading schema…</div>;

  return (
    <Routes>
      <Route element={<Layout tables={tables} />}>
        <Route index element={<Dashboard />} />
        <Route path="audit" element={<Audit tables={tables} />} />
        <Route path="t/:table" element={<TableList tables={tables} />} />
        <Route path="t/:table/:id" element={<RecordForm tables={tables} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
