// App shell: sidebar nav grouped by risk class, plus the signed-in identity.
// The grouping is not cosmetic — "Catalog" is shared reference data, "User
// data" is live beta users' rows, and keeping them visually separate is the
// cheapest guard against editing the wrong one.

import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../auth";
import { GROUP_LABELS, type TableSpec } from "../types";

export function Layout({ tables }: { tables: TableSpec[] }) {
  const { admin, signOut } = useAuth();
  const groups: TableSpec["group"][] = ["catalog", "portfolio", "operations"];

  return (
    <div className="shell">
      <nav className="sidebar">
        <div className="brand">
          Wander<span>Freely</span> admin
        </div>

        <NavLink to="/" end>
          Dashboard
        </NavLink>
        <NavLink to="/audit">Audit log</NavLink>

        {groups.map((g) => {
          const inGroup = tables.filter((t) => t.group === g);
          if (inGroup.length === 0) return null;
          return (
            <div key={g}>
              <div className="group-label">{GROUP_LABELS[g]}</div>
              {inGroup.map((t) => (
                <NavLink key={t.name} to={`/t/${t.name}`}>
                  {t.label}
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="spacer" />
        <div className="who">
          {admin?.displayName ?? admin?.email}
          <div style={{ marginTop: 8 }}>
            <button className="small" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
