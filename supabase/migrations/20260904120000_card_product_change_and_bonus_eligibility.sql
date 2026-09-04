-- Card product changes + signup-bonus eligibility notes.
--
-- Two user-facing features, both modelled as columns on user_cards (the
-- per-portfolio card instance) so no new tables or RLS policies are needed —
-- the existing user_cards row policies already cover these columns.
--
-- 1. Product change (upgrade/downgrade within the same issuer). We keep the
--    SAME user_cards row — preserving opened_on, spend history, and the
--    signup bonus — and just swap card_product_id. `product_changed_from_id`
--    remembers where it came from so the UI can show "Product-changed from X".
--
-- 2. Signup-bonus eligibility. Separate from is_completed ("earned"): this is
--    a manual per-card note of whether the user CAN earn this card's bonus.
--    `bonus_eligibility` is the state; `bonus_eligible_on` is the date the
--    'eligible_on' state unlocks.

alter table public.user_cards
  add column if not exists product_changed_from_id uuid
    references public.card_products(id) on delete set null;

comment on column public.user_cards.product_changed_from_id is
  'The card_product this card was product-changed from (upgrade/downgrade within the same issuer). Null = original product, never changed.';

alter table public.user_cards
  add column if not exists bonus_eligibility text not null default 'eligible'
    check (bonus_eligibility in ('eligible', 'not_eligible', 'eligible_on'));

comment on column public.user_cards.bonus_eligibility is
  'Manual note of the user''s signup-bonus eligibility for this card: eligible | not_eligible (earned before) | eligible_on (a future date).';

alter table public.user_cards
  add column if not exists bonus_eligible_on date;

comment on column public.user_cards.bonus_eligible_on is
  'Date the signup bonus becomes available again, when bonus_eligibility = ''eligible_on''.';
