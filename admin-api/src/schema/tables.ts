// The table registry. Mirrors supabase/migrations/ — when a migration changes a
// column, change it here too.
//
// Grouping matches the risk classes in the schema:
//   catalog    — hand-curated reference data. Shared by every user. Editing it
//                is the day-to-day job this tool exists for.
//   portfolio  — live beta users' data. Editable (per the tool's remit) but
//                every destructive path here is loud about what it touches.
//   operations — operator surfaces. Append-only sinks are exposed read-only:
//                they are written by the app and read by Metabase, and hand-
//                editing a log would only ever corrupt the record.

import type { TableSpec } from "./types.js";

const CARD_NETWORK = ["visa", "mastercard", "amex", "discover"] as const;
const PROGRAM_UNIT_TYPE = ["points", "miles", "cash_back"] as const;
const REWARD_UNIT = ["points", "miles", "cash_back"] as const;
const RESET_FREQUENCY = [
  "monthly",
  "quarterly",
  "semiannual",
  "annual",
  "one_time",
] as const;
const RESET_BASIS = ["calendar", "anniversary"] as const;
const BENEFIT_CYCLE_STATUS = [
  "unused",
  "partially_used",
  "fully_used",
  "expired",
] as const;
const MEMBER_ROLE = ["owner", "editor", "viewer"] as const;
const TRANSFER_PARTNER_TYPE = ["airline", "hotel"] as const;

/** Every table carries these; declared once to keep the specs readable. */
const ID = {
  name: "id",
  label: "ID",
  type: "uuid",
  readOnly: true,
  hideInList: true,
} as const;

const CREATED_AT = {
  name: "created_at",
  label: "Created",
  type: "timestamptz",
  readOnly: true,
  hideInList: true,
} as const;

const UPDATED_AT = {
  name: "updated_at",
  label: "Updated",
  type: "timestamptz",
  readOnly: true,
  hideInList: true,
} as const;

export const TABLES: TableSpec[] = [
  // ── Catalog ──────────────────────────────────────────────────────────────
  {
    name: "card_issuers",
    label: "Issuers",
    group: "catalog",
    description: "Banks that issue the cards in the catalog.",
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    children: [
      { table: "card_products", column: "issuer_id", onDelete: "restrict" },
    ],
    fields: [
      ID,
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        help: 'Displayed to users and used to derive cash-back program names ("<Issuer> Cash Back").',
      },
    ],
  },
  {
    name: "rewards_programs",
    label: "Rewards programs",
    group: "catalog",
    description:
      "Points/miles/cash currencies. Wallet balances are per program, not per card — two Chase cards pool into one Ultimate Rewards balance.",
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    children: [
      {
        table: "card_products",
        column: "rewards_program_id",
        onDelete: "set null",
      },
      {
        table: "program_transfer_partners",
        column: "rewards_program_id",
        onDelete: "cascade",
      },
      {
        table: "wallet_accounts",
        column: "rewards_program_id",
        onDelete: "restrict",
      },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "unit_type",
        label: "Unit type",
        type: "enum",
        enumValues: PROGRAM_UNIT_TYPE,
        required: true,
        default: "points",
        help: "Drives how balances are formatted in the app (points/miles vs. dollars).",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "card_products",
    label: "Card products",
    group: "catalog",
    description: "The cards users can add to a wallet.",
    primaryKey: "id",
    labelField: "name",
    labelPrefixRef: { field: "issuer_id", table: "card_issuers" },
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    danger:
      "Deleting a card product cascades into its benefit definitions, and from there into users' benefit cycles and redemption history.",
    children: [
      {
        table: "benefit_definitions",
        column: "card_product_id",
        onDelete: "cascade",
      },
      {
        table: "card_reward_rules",
        column: "card_product_id",
        onDelete: "cascade",
      },
      { table: "user_cards", column: "card_product_id", onDelete: "restrict" },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "issuer_id",
        label: "Issuer",
        type: "uuid",
        ref: "card_issuers",
        required: true,
      },
      {
        name: "rewards_program_id",
        label: "Rewards program",
        type: "uuid",
        ref: "rewards_programs",
        help: "Leave empty for a card that earns nothing transferable. Without this, completed signup bonuses have no wallet to credit and the card shows as unlinked on the Points tab.",
      },
      {
        name: "network",
        label: "Network",
        type: "enum",
        enumValues: CARD_NETWORK,
      },
      {
        name: "annual_fee",
        label: "Annual fee",
        type: "number",
        required: true,
        min: 0,
        default: 0,
      },
    ],
  },
  {
    name: "benefit_categories",
    label: "Benefit categories",
    group: "catalog",
    description:
      "Groups benefits in the app's filter bar and picks the row icon.",
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name", "description"],
    writable: true,
    deletable: true,
    children: [
      {
        table: "benefit_definitions",
        column: "benefit_category_id",
        onDelete: "set null",
      },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      { name: "description", label: "Description", type: "longtext" },
    ],
  },
  {
    name: "benefit_definitions",
    label: "Benefit definitions",
    group: "catalog",
    description:
      "The rule for a recurring perk — '$300 travel credit, annual, calendar basis'. One instance per user per period becomes a benefit cycle.",
    primaryKey: "id",
    labelField: "name",
    labelPrefixRef: { field: "card_product_id", table: "card_products" },
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    danger:
      "Cycles are materialised from these by the app. Changing reset frequency or basis does not rewrite cycles that already exist — only newly created ones follow the new rule.",
    children: [
      {
        table: "user_benefit_cycles",
        column: "benefit_definition_id",
        onDelete: "cascade",
      },
      {
        table: "benefit_redemptions",
        column: "benefit_definition_id",
        onDelete: "restrict",
      },
    ],
    fields: [
      ID,
      {
        name: "name",
        label: "Name",
        type: "text",
        required: true,
        help: 'The app splits a leading "$…" into a value pill, so "$300 Travel Credit" renders well.',
      },
      {
        name: "card_product_id",
        label: "Card product",
        type: "uuid",
        ref: "card_products",
        required: true,
      },
      {
        name: "benefit_category_id",
        label: "Category",
        type: "uuid",
        ref: "benefit_categories",
      },
      {
        name: "value_per_period",
        label: "Value per period",
        type: "number",
        min: 0,
        help: "Dollar cap for ONE cycle. This seeds the cycle's allotted value — leave empty for an uncapped perk (lounge access, insurance), which then can't be marked used.",
      },
      {
        name: "annual_value",
        label: "Annual value",
        type: "number",
        min: 0,
        help: "Total across a year. For a $50/quarter credit this is 200 while value per period is 50.",
      },
      {
        name: "reset_frequency",
        label: "Reset frequency",
        type: "enum",
        enumValues: RESET_FREQUENCY,
        required: true,
        default: "annual",
      },
      {
        name: "reset_basis",
        label: "Reset basis",
        type: "enum",
        enumValues: RESET_BASIS,
        required: true,
        default: "calendar",
        help: "Calendar resets on Jan 1 / quarter boundaries. Anniversary is anchored to the user's card opened date — cards with no opened date get NO cycle for anniversary benefits.",
      },
      {
        name: "requires_enrollment",
        label: "Requires enrollment",
        type: "boolean",
        required: true,
        default: false,
      },
    ],
  },
  {
    name: "reward_categories",
    label: "Reward categories",
    group: "catalog",
    description:
      "Spend categories for earn rules (dining, travel, …). Self-nesting via parent.",
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    children: [
      { table: "reward_categories", column: "parent_id", onDelete: "set null" },
      {
        table: "card_reward_rules",
        column: "reward_category_id",
        onDelete: "restrict",
      },
      {
        table: "spend_entries",
        column: "reward_category_id",
        onDelete: "set null",
      },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "parent_id",
        label: "Parent category",
        type: "uuid",
        ref: "reward_categories",
        help: "Optional. Lets a narrow category roll up to a broad one.",
      },
    ],
  },
  {
    name: "card_reward_rules",
    label: "Reward rules",
    group: "catalog",
    description:
      "Earn multipliers per spend category. Modeled but not yet consumed by the mobile app.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "multiplier", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    fields: [
      ID,
      {
        name: "card_product_id",
        label: "Card product",
        type: "uuid",
        ref: "card_products",
        required: true,
      },
      {
        name: "reward_category_id",
        label: "Reward category",
        type: "uuid",
        ref: "reward_categories",
        required: true,
      },
      {
        name: "multiplier",
        label: "Multiplier",
        type: "number",
        required: true,
        min: 0,
        default: 1,
        help: "3 means 3x. Stored with 2 decimal places.",
      },
      {
        name: "reward_unit",
        label: "Reward unit",
        type: "enum",
        enumValues: REWARD_UNIT,
        required: true,
        default: "points",
      },
      {
        name: "spend_cap",
        label: "Spend cap",
        type: "number",
        min: 0,
        help: "Annual spend after which the multiplier stops applying. Empty = uncapped.",
      },
      {
        name: "days_of_week",
        label: "Days of week",
        type: "int-array",
        help: "Comma-separated, 0 = Sunday … 6 = Saturday. Empty = every day.",
      },
      { name: "start_time", label: "Start time", type: "time" },
      { name: "end_time", label: "End time", type: "time" },
      {
        name: "conditions",
        label: "Conditions",
        type: "jsonb",
        help: "Free-form JSON for rules the columns above can't express.",
      },
    ],
  },
  {
    name: "transfer_partners",
    label: "Transfer partners",
    group: "catalog",
    description:
      "Airlines and hotels points can transfer to. Modeled but not yet consumed by the mobile app.",
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "name", ascending: true },
    searchFields: ["name"],
    writable: true,
    deletable: true,
    children: [
      {
        table: "program_transfer_partners",
        column: "transfer_partner_id",
        onDelete: "cascade",
      },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "partner_type",
        label: "Type",
        type: "enum",
        enumValues: TRANSFER_PARTNER_TYPE,
        required: true,
      },
    ],
  },
  {
    name: "program_transfer_partners",
    label: "Program ↔ partner links",
    group: "catalog",
    description: "Which programs transfer to which partners, and at what ratio.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "transfer_ratio", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    fields: [
      ID,
      {
        name: "rewards_program_id",
        label: "Rewards program",
        type: "uuid",
        ref: "rewards_programs",
        required: true,
      },
      {
        name: "transfer_partner_id",
        label: "Transfer partner",
        type: "uuid",
        ref: "transfer_partners",
        required: true,
      },
      {
        name: "transfer_ratio",
        label: "Transfer ratio",
        type: "number",
        required: true,
        min: 0,
        default: 1,
        help: "1.0 means 1:1. 1.5 means 1000 points become 1500 partner miles.",
      },
      {
        name: "is_active",
        label: "Active",
        type: "boolean",
        required: true,
        default: true,
      },
    ],
  },

  // ── Per-portfolio (live user data) ───────────────────────────────────────
  {
    name: "profiles",
    label: "Profiles (users)",
    group: "portfolio",
    description:
      "One row per Supabase Auth user. Created by the handle_new_user trigger at signup.",
    primaryKey: "id",
    labelField: "display_name",
    defaultSort: { column: "display_name", ascending: true },
    searchFields: ["display_name"],
    writable: true,
    // Deleting a profile means deleting the auth user; that path is
    // purge_user() in SQL, which also transfers shared portfolios.
    deletable: false,
    danger:
      "To remove a user, run purge_user() / admin_delete_user() in Supabase Studio — it transfers shared portfolios to a surviving member instead of destroying other people's data. Deleting here is disabled for that reason.",
    fields: [
      { ...ID, hideInList: false },
      { name: "display_name", label: "Display name", type: "text" },
    ],
  },
  {
    name: "portfolios",
    label: "Portfolios",
    group: "portfolio",
    description:
      'The sharing container all user data hangs off. Called "Profiles" in the app UI.',
    primaryKey: "id",
    labelField: "name",
    defaultSort: { column: "created_at", ascending: false },
    searchFields: ["name", "type"],
    writable: true,
    deletable: true,
    danger:
      "Deleting a portfolio cascades every card, benefit cycle, redemption, signup bonus, spend entry and wallet balance belonging to it. This is a real user's whole history.",
    children: [
      {
        table: "portfolio_members",
        column: "portfolio_id",
        onDelete: "cascade",
      },
      { table: "user_cards", column: "portfolio_id", onDelete: "cascade" },
      { table: "wallet_accounts", column: "portfolio_id", onDelete: "cascade" },
    ],
    fields: [
      ID,
      { name: "name", label: "Name", type: "text", required: true },
      {
        name: "type",
        label: "Type",
        type: "text",
        help: 'Free text. Signup creates "personal".',
      },
      {
        name: "created_by",
        label: "Created by",
        type: "uuid",
        ref: "profiles",
        required: true,
        help: "Only this profile can rename or delete the portfolio from the app.",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "portfolio_members",
    label: "Portfolio members",
    group: "portfolio",
    description:
      "Who can access a portfolio. RLS reads this table for every per-user query.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "role", ascending: true },
    searchFields: [],
    writable: true,
    deletable: true,
    danger:
      "Adding a row here grants a person full read/write access to everything in that portfolio. Removing the last member orphans it.",
    fields: [
      ID,
      {
        name: "portfolio_id",
        label: "Portfolio",
        type: "uuid",
        ref: "portfolios",
        required: true,
      },
      {
        name: "profile_id",
        label: "Profile",
        type: "uuid",
        ref: "profiles",
        required: true,
      },
      {
        name: "role",
        label: "Role",
        type: "enum",
        enumValues: MEMBER_ROLE,
        required: true,
        default: "viewer",
        help: "Advisory only today — RLS grants any member full read/write. Enforcement is not implemented.",
      },
    ],
  },
  {
    name: "user_cards",
    label: "User cards",
    group: "portfolio",
    description: "A card a user holds, in one portfolio.",
    primaryKey: "id",
    labelField: "nickname",
    defaultSort: { column: "created_at", ascending: false },
    searchFields: ["nickname", "last_four"],
    writable: true,
    deletable: true,
    danger:
      "Deleting a user card cascades its benefit cycles, redemptions, signup bonuses and spend entries. The app itself never hard-deletes — it sets Active to false.",
    children: [
      {
        table: "user_benefit_cycles",
        column: "user_card_id",
        onDelete: "cascade",
      },
      {
        table: "benefit_redemptions",
        column: "user_card_id",
        onDelete: "cascade",
      },
      {
        table: "user_signup_bonuses",
        column: "user_card_id",
        onDelete: "cascade",
      },
      { table: "spend_entries", column: "user_card_id", onDelete: "cascade" },
    ],
    fields: [
      ID,
      {
        name: "portfolio_id",
        label: "Portfolio",
        type: "uuid",
        ref: "portfolios",
        required: true,
      },
      {
        name: "card_product_id",
        label: "Card product",
        type: "uuid",
        ref: "card_products",
        required: true,
      },
      { name: "nickname", label: "Nickname", type: "text" },
      { name: "last_four", label: "Last four", type: "text" },
      {
        name: "opened_on",
        label: "Opened on",
        type: "date",
        help: "Anchor for anniversary-basis benefit cycles. Editing it does NOT recompute cycles that already exist.",
      },
      {
        name: "is_active",
        label: "Active",
        type: "boolean",
        required: true,
        default: true,
        help: "The app's remove-card action clears this rather than deleting the row.",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "user_benefit_cycles",
    label: "Benefit cycles",
    group: "portfolio",
    description:
      "One instance of a benefit for one card over one period. The current cycle is the one whose date range contains today.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "period_end", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    danger:
      "Unique on (card, benefit definition, period start) — a duplicate period start will be rejected. Deleting a cycle also deletes the redemptions recorded against it.",
    children: [
      {
        table: "benefit_redemptions",
        column: "benefit_cycle_id",
        onDelete: "cascade",
      },
    ],
    fields: [
      ID,
      {
        name: "user_card_id",
        label: "User card",
        type: "uuid",
        ref: "user_cards",
        required: true,
      },
      {
        name: "benefit_definition_id",
        label: "Benefit definition",
        type: "uuid",
        ref: "benefit_definitions",
        required: true,
      },
      {
        name: "period_start",
        label: "Period start",
        type: "date",
        required: true,
      },
      { name: "period_end", label: "Period end", type: "date", required: true },
      {
        name: "allotted_value",
        label: "Allotted value",
        type: "number",
        min: 0,
        help: "The dollar cap for this cycle. Empty means the benefit can't be marked used in the app.",
      },
      {
        name: "status",
        label: "Status",
        type: "enum",
        enumValues: BENEFIT_CYCLE_STATUS,
        required: true,
        default: "unused",
        help: "The app only ever writes 'unused' and 'expired'; it derives fully-redeemed from the redemption sum instead. Setting 'fully_used' here does mark it used in the app.",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "benefit_redemptions",
    label: "Redemptions",
    group: "portfolio",
    description: "A recorded use of a benefit, against one cycle.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "redeemed_on", ascending: false },
    searchFields: ["notes"],
    writable: true,
    deletable: true,
    danger:
      "The cycle, card and benefit definition on a redemption must agree with each other — nothing in the database enforces that they do.",
    fields: [
      ID,
      {
        name: "benefit_cycle_id",
        label: "Benefit cycle",
        type: "uuid",
        ref: "user_benefit_cycles",
        required: true,
      },
      {
        name: "user_card_id",
        label: "User card",
        type: "uuid",
        ref: "user_cards",
        required: true,
      },
      {
        name: "benefit_definition_id",
        label: "Benefit definition",
        type: "uuid",
        ref: "benefit_definitions",
        required: true,
      },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        min: 0,
        help: "Sums across a cycle to decide whether it reads as fully redeemed.",
      },
      {
        name: "redeemed_on",
        label: "Redeemed on",
        type: "date",
        required: true,
      },
      { name: "notes", label: "Notes", type: "longtext" },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "user_signup_bonuses",
    label: "Signup bonuses",
    group: "portfolio",
    description: "Spend-toward-bonus tracking for one card.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "created_at", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    danger:
      "Editing Completed or Bonus value fires trg_bonus_wallet_credit, which moves the portfolio's wallet balance by the delta and rewrites Credited amount. Do not hand-edit Credited amount to 'fix' a balance — it is the ledger the trigger reconciles against.",
    children: [
      {
        table: "spend_entries",
        column: "signup_bonus_id",
        onDelete: "set null",
      },
    ],
    fields: [
      ID,
      {
        name: "user_card_id",
        label: "User card",
        type: "uuid",
        ref: "user_cards",
        required: true,
      },
      {
        name: "required_spend",
        label: "Required spend",
        type: "number",
        required: true,
        min: 0,
      },
      { name: "spend_deadline", label: "Spend deadline", type: "date" },
      {
        name: "bonus_value",
        label: "Bonus value",
        type: "number",
        min: 0,
        help: "In the card's rewards-program unit (points/miles/dollars), not always dollars.",
      },
      {
        name: "is_completed",
        label: "Completed",
        type: "boolean",
        required: true,
        default: false,
      },
      {
        name: "credited_amount",
        label: "Credited amount",
        type: "number",
        min: 0,
        help: "Trigger-maintained ledger of what was actually added to the wallet. Null means never credited.",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "spend_entries",
    label: "Spend entries",
    group: "portfolio",
    description:
      "Manual spend logged toward a signup bonus. Not general transaction history.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "spent_on", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    danger:
      "The app writes these via add_spend_entry() / remove_spend_entry(), which re-derive the linked bonus's completion. Writing a row here does NOT re-derive it — adjust the bonus by hand if the total crosses its threshold.",
    fields: [
      ID,
      {
        name: "user_card_id",
        label: "User card",
        type: "uuid",
        ref: "user_cards",
        required: true,
      },
      {
        name: "signup_bonus_id",
        label: "Signup bonus",
        type: "uuid",
        ref: "user_signup_bonuses",
        help: "Empty means the spend counts toward nothing.",
      },
      {
        name: "amount",
        label: "Amount",
        type: "number",
        required: true,
        min: 0,
      },
      { name: "spent_on", label: "Spent on", type: "date", required: true },
      {
        name: "reward_category_id",
        label: "Reward category",
        type: "uuid",
        ref: "reward_categories",
        help: "Never populated by the app today.",
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },
  {
    name: "wallet_accounts",
    label: "Wallet balances",
    group: "portfolio",
    description:
      "A portfolio's balance in one rewards program. Manually maintained — there is no bank linking.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "balance", ascending: false },
    searchFields: [],
    writable: true,
    deletable: true,
    danger:
      "Unique on (portfolio, program). Completed signup bonuses auto-credit this balance via trigger, so an edit here can be silently adjusted again later by a bonus change.",
    fields: [
      ID,
      {
        name: "portfolio_id",
        label: "Portfolio",
        type: "uuid",
        ref: "portfolios",
        required: true,
      },
      {
        name: "rewards_program_id",
        label: "Rewards program",
        type: "uuid",
        ref: "rewards_programs",
        required: true,
      },
      {
        name: "balance",
        label: "Balance",
        type: "number",
        required: true,
        min: 0,
        default: 0,
      },
      CREATED_AT,
      UPDATED_AT,
    ],
  },

  // ── Operations ───────────────────────────────────────────────────────────
  {
    name: "app_config",
    label: "Feature flags",
    group: "operations",
    description:
      "Single-row public config the mobile app reads at launch. Kill-switches and WIP gating.",
    primaryKey: "id",
    labelField: "id",
    defaultSort: { column: "updated_at", ascending: false },
    searchFields: [],
    writable: true,
    // Singleton: a CHECK constraint pins it to exactly one row (id = true).
    deletable: false,
    danger:
      "Read by every client on launch. A malformed flags object can gate a feature off for all users at once.",
    fields: [
      { name: "id", label: "ID", type: "boolean", readOnly: true },
      {
        name: "flags",
        label: "Flags",
        type: "jsonb",
        required: true,
        default: "{}",
        help: 'JSON object of flag name to value, e.g. {"points_tab": true}.',
      },
      UPDATED_AT,
    ],
  },
  {
    name: "admin_users",
    label: "Admin allowlist",
    group: "operations",
    description:
      "Emails permitted to sign in to this console. Both gates must pass: a valid Supabase Auth session AND an active row here.",
    primaryKey: "id",
    labelField: "email",
    defaultSort: { column: "email", ascending: true },
    searchFields: ["email", "display_name", "note"],
    writable: true,
    deletable: true,
    danger:
      "This table controls who can reach the service-role key. Removing your own row locks you out of this console — recover by re-adding it in Supabase Studio.",
    fields: [
      ID,
      {
        name: "email",
        label: "Email",
        type: "text",
        required: true,
        help: "Must match a Supabase Auth user's email. Lower-cased automatically.",
      },
      { name: "display_name", label: "Display name", type: "text" },
      {
        name: "is_active",
        label: "Active",
        type: "boolean",
        required: true,
        default: true,
        help: "Uncheck to revoke access while keeping the audit trail readable.",
      },
      { name: "note", label: "Note", type: "text" },
      CREATED_AT,
    ],
  },
  {
    name: "analytics_events",
    label: "Analytics events",
    group: "operations",
    description:
      "Append-only behavioral event stream written by the app. Read-only here — hand-editing a log only corrupts the record.",
    primaryKey: "id",
    labelField: "event_name",
    defaultSort: { column: "received_at", ascending: false },
    searchFields: ["event_name"],
    writable: false,
    deletable: false,
    fields: [
      ID,
      { name: "event_name", label: "Event", type: "text", readOnly: true },
      { name: "received_at", label: "Received", type: "timestamptz", readOnly: true },
      { name: "occurred_at", label: "Occurred", type: "timestamptz", readOnly: true },
      { name: "profile_id", label: "Profile", type: "uuid", readOnly: true },
      { name: "portfolio_id", label: "Portfolio", type: "uuid", readOnly: true },
      { name: "platform", label: "Platform", type: "text", readOnly: true },
      { name: "app_version", label: "App version", type: "text", readOnly: true },
      { name: "session_id", label: "Session", type: "uuid", readOnly: true, hideInList: true },
      { name: "properties", label: "Properties", type: "jsonb", readOnly: true, hideInList: true },
    ],
  },
  {
    name: "client_errors",
    label: "Client errors",
    group: "operations",
    description:
      "Append-only crash/error log from the app. Read-only. May contain incidental PII in message and stack — do not export.",
    primaryKey: "id",
    labelField: "message",
    defaultSort: { column: "received_at", ascending: false },
    searchFields: ["message", "error_type"],
    writable: false,
    deletable: false,
    danger:
      "Message and stack can incidentally contain user input (a typed card name, an email in a validation message). Operator-only.",
    fields: [
      ID,
      { name: "received_at", label: "Received", type: "timestamptz", readOnly: true },
      { name: "source", label: "Source", type: "text", readOnly: true },
      { name: "fatal", label: "Fatal", type: "boolean", readOnly: true },
      { name: "error_type", label: "Type", type: "text", readOnly: true },
      { name: "message", label: "Message", type: "longtext", readOnly: true },
      { name: "platform", label: "Platform", type: "text", readOnly: true },
      { name: "app_version", label: "App version", type: "text", readOnly: true },
      { name: "stack", label: "Stack", type: "longtext", readOnly: true, hideInList: true },
      { name: "occurred_at", label: "Occurred", type: "timestamptz", readOnly: true, hideInList: true },
      { name: "profile_id", label: "Profile", type: "uuid", readOnly: true, hideInList: true },
      { name: "session_id", label: "Session", type: "uuid", readOnly: true, hideInList: true },
      { name: "context", label: "Context", type: "jsonb", readOnly: true, hideInList: true },
    ],
  },
];

const BY_NAME = new Map(TABLES.map((t) => [t.name, t]));

/** Look up a table spec. Anything not in the registry is not reachable through
 *  this API at all — that is the allowlist for `table` path params. */
export function getTable(name: string): TableSpec | undefined {
  return BY_NAME.get(name);
}
