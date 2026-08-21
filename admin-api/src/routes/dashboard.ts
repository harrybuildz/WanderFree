// Dashboard. Deliberately thin — this is the space reserved for whatever
// operational view turns out to be wanted; today it answers "is the catalog
// healthy, and what changed recently?".
//
// The health checks are the ones that map to real, silent app bugs:
//   * a card product with no benefit definitions shows a user an empty card
//   * a card product with no rewards program can't receive a signup-bonus
//     credit and shows as "unlinked" on the Points tab
//   * an anniversary-basis benefit gets NO cycle on a card with no opened
//     date, so it silently never appears for that user

import { Router } from "express";

import { requireAdmin } from "../auth.js";
import { asyncHandler } from "../lib/errors.js";
import { admin } from "../supabase.js";

export const dashboardRouter = Router();
dashboardRouter.use(requireAdmin);

/** head:true asks PostgREST for the count without transferring any rows. */
async function count(table: string): Promise<number> {
  const { count: n, error } = await admin
    .from(table)
    .select("*", { count: "exact", head: true });
  if (error) throw error;
  return n ?? 0;
}

dashboardRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [
      issuers,
      products,
      benefitDefs,
      rewardRules,
      programs,
      profiles,
      portfolios,
      userCards,
      cycles,
      redemptions,
    ] = await Promise.all([
      count("card_issuers"),
      count("card_products"),
      count("benefit_definitions"),
      count("card_reward_rules"),
      count("rewards_programs"),
      count("profiles"),
      count("portfolios"),
      count("user_cards"),
      count("user_benefit_cycles"),
      count("benefit_redemptions"),
    ]);

    const [
      productsNoProgram,
      anniversaryDefs,
      activeCardsNoOpenedOn,
      productRows,
      recent,
    ] = await Promise.all([
      admin
        .from("card_products")
        .select("*", { count: "exact", head: true })
        .is("rewards_program_id", null),
      admin
        .from("benefit_definitions")
        .select("*", { count: "exact", head: true })
        .eq("reset_basis", "anniversary"),
      admin
        .from("user_cards")
        .select("*", { count: "exact", head: true })
        .is("opened_on", null)
        .eq("is_active", true),
      // Fetched rather than counted: the operator wants to know WHICH products
      // to go fix, not just how many.
      admin.from("card_products").select("id, name, benefit_definitions(id)"),
      admin
        .from("admin_audit_log")
        .select("id, actor_email, action, table_name, row_id, at")
        .order("at", { ascending: false })
        .limit(10),
    ]);

    if (productRows.error) throw productRows.error;

    const emptyProducts = (
      (productRows.data as unknown as {
        id: string;
        name: string;
        benefit_definitions: unknown[];
      }[]) ?? []
    )
      .filter((p) => (p.benefit_definitions ?? []).length === 0)
      .map((p) => ({ id: p.id, name: p.name }));

    res.json({
      catalog: { issuers, products, benefitDefs, rewardRules, programs },
      users: { profiles, portfolios, userCards, cycles, redemptions },
      health: {
        productsWithNoBenefits: emptyProducts,
        productsWithNoProgram: productsNoProgram.count ?? 0,
        anniversaryDefs: anniversaryDefs.count ?? 0,
        activeCardsWithNoOpenedOn: activeCardsNoOpenedOn.count ?? 0,
      },
      recentActivity: recent.data ?? [],
    });
  }),
);
