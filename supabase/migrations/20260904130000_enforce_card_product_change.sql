-- Integrity guardrails for card product changes (upgrade/downgrade in-issuer).
--
-- The mobile client models a product change by swapping user_cards.card_product_id,
-- and its picker only offers products from the SAME issuer. But RLS lets a user
-- update their own user_cards row to ANY product, so that UI filter is not a real
-- guarantee. This trigger makes it one, and also owns product_changed_from_id so
-- provenance is recorded exactly once (the ORIGINAL product) no matter how many
-- times the card is later changed — immune to a client racing a read-then-write.
--
-- Cycle re-seeding stays in the app (useChangeCardProduct), mirroring
-- useAddUserCard, so the calendar/anniversary period math has a single source of
-- truth in benefitPeriods.ts rather than being duplicated in PL/pgSQL.

create or replace function public.enforce_card_product_change()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_old_issuer uuid;
  v_new_issuer uuid;
begin
  if new.card_product_id is distinct from old.card_product_id then
    select issuer_id into v_old_issuer
      from card_products where id = old.card_product_id;
    select issuer_id into v_new_issuer
      from card_products where id = new.card_product_id;

    if v_new_issuer is distinct from v_old_issuer then
      raise exception
        'Card product change must stay within the same issuer'
        using errcode = 'check_violation';
    end if;

    -- Record provenance once: the original product this card was changed away
    -- from. Later changes preserve it; the client cannot set or override it.
    if old.product_changed_from_id is null then
      new.product_changed_from_id := old.card_product_id;
    else
      new.product_changed_from_id := old.product_changed_from_id;
    end if;
  else
    -- Not a product change: provenance is trigger-owned, never edited directly.
    new.product_changed_from_id := old.product_changed_from_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_card_product_change on public.user_cards;
create trigger trg_enforce_card_product_change
  before update on public.user_cards
  for each row
  execute function public.enforce_card_product_change();
