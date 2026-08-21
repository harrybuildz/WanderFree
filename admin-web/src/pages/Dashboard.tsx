// Dashboard. Kept intentionally small — the brief was to reserve the space, not
// to fill it. What's here is the catalog-health check, because those three
// conditions cause silent, invisible bugs in the app and nothing else reports
// them.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { api } from "../api";

type Data = Awaited<ReturnType<typeof api.dashboard>>;

function Stats({ title, values }: { title: string; values: Record<string, number> }) {
  const labels: Record<string, string> = {
    issuers: "Issuers",
    products: "Card products",
    benefitDefs: "Benefit definitions",
    rewardRules: "Reward rules",
    programs: "Rewards programs",
    profiles: "Users",
    portfolios: "Portfolios",
    userCards: "Cards held",
    cycles: "Benefit cycles",
    redemptions: "Redemptions",
  };
  return (
    <section>
      <h2 style={{ marginBottom: 10 }}>{title}</h2>
      <div className="stat-grid">
        {Object.entries(values).map(([k, v]) => (
          <div className="stat" key={k}>
            <div className="n">{v.toLocaleString()}</div>
            <div className="k">{labels[k] ?? k}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Dashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .dashboard()
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="banner danger">{error}</div>;
  if (!data) return <div className="spinner">Loading…</div>;

  const { health } = data;
  const noBenefits = health.productsWithNoBenefits;

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <p className="desc">
          Catalog and usage at a glance. This page is a placeholder for richer
          operational views — the CRUD screens in the sidebar are the working
          surface.
        </p>
      </div>

      <div className="stack">
        <Stats title="Catalog" values={data.catalog} />
        <Stats title="Users" values={data.users} />

        <section>
          <h2 style={{ marginBottom: 10 }}>Catalog health</h2>
          <div className="stack">
            {noBenefits.length > 0 ? (
              <div className="banner warn">
                <strong>
                  {noBenefits.length} card product
                  {noBenefits.length === 1 ? " has" : "s have"} no benefit
                  definitions.
                </strong>{" "}
                A user who adds one of these sees a card with nothing on it.
                <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
                  {noBenefits.slice(0, 12).map((p) => (
                    <li key={p.id}>
                      <Link to={`/t/card_products/${p.id}`}>{p.name}</Link>
                    </li>
                  ))}
                  {noBenefits.length > 12 && (
                    <li className="muted">…and {noBenefits.length - 12} more</li>
                  )}
                </ul>
              </div>
            ) : (
              <div className="banner success">
                Every card product has at least one benefit definition.
              </div>
            )}

            {health.productsWithNoProgram > 0 && (
              <div className="banner warn">
                <strong>
                  {health.productsWithNoProgram} card product
                  {health.productsWithNoProgram === 1 ? "" : "s"} with no rewards
                  program.
                </strong>{" "}
                Completed signup bonuses on these credit nothing, and the cards
                show as unlinked on the Points tab.{" "}
                <Link to="/t/card_products">Review card products →</Link>
              </div>
            )}

            {health.anniversaryDefs > 0 && health.activeCardsWithNoOpenedOn > 0 && (
              <div className="banner warn">
                <strong>
                  {health.activeCardsWithNoOpenedOn} active card
                  {health.activeCardsWithNoOpenedOn === 1 ? " has" : "s have"} no
                  opened date,
                </strong>{" "}
                and {health.anniversaryDefs} benefit definition
                {health.anniversaryDefs === 1 ? " resets" : "s reset"} on an
                anniversary basis. Anniversary benefits get no cycle at all
                without that anchor, so those users silently never see them.{" "}
                <Link to="/t/user_cards">Review cards →</Link>
              </div>
            )}
          </div>
        </section>

        <section>
          <div className="row-between" style={{ marginBottom: 10 }}>
            <h2>Recent changes</h2>
            <Link to="/audit">Full audit log →</Link>
          </div>
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Who</th>
                  <th>Action</th>
                  <th>Table</th>
                </tr>
              </thead>
              <tbody>
                {data.recentActivity.map((e) => (
                  <tr key={e.id}>
                    <td className="muted">{new Date(e.at).toLocaleString()}</td>
                    <td>{e.actor_email}</td>
                    <td>
                      <span className={`pill ${e.action}`}>{e.action}</span>
                    </td>
                    <td className="mono">{e.table_name}</td>
                  </tr>
                ))}
                {data.recentActivity.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: 24, textAlign: "center" }}>
                      Nothing has been changed through the console yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
