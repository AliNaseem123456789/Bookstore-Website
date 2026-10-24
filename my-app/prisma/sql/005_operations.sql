-- =====================================================================
--  Al-Sehar Bookstore — the write API
--
--  Every operation that moves stock or money is ONE function call that
--  either fully happens or fully does not. Application code never
--  orchestrates a multi-step write, because two clients (the web app and
--  the phone app) must not be able to drift apart — and because a
--  half-finished checkout is the one bug this shop cannot afford.
--
--  Run after 004_lockdown.sql.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
--  Checkout
--
--  p_lines is a JSON array; one entry per line:
--    { "item_id": 12, "qty": 2, "line_discount": 0,
--      "class_id": 3, "from_full_course": true }
--
--  Unit price is read from the catalogue inside this function, never
--  taken from the client, so a tampered request cannot set its own price.
--
--  Items are locked in ascending item_id order. Two concurrent checkouts
--  covering overlapping items therefore always take locks in the same
--  sequence and cannot deadlock.
--
--  Returns the new sale id.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_sale(
  p_buyer_name     text,
  p_buyer_phone    text,
  p_user_id        integer,
  p_lines          jsonb,
  p_order_discount numeric DEFAULT 0,
  p_note           text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id    integer;
  v_line       record;
  v_item       items;
  v_subtotal   numeric(12,2) := 0;
  v_line_disc  numeric(12,2) := 0;
  v_line_total numeric(12,2);
  v_taken      integer;
  v_gross      numeric(12,2);
  v_order_disc numeric(12,2);
  v_count      integer;
  v_norm       jsonb;
BEGIN
  IF p_buyer_name IS NULL OR btrim(p_buyer_name) = '' THEN
    RAISE EXCEPTION 'a buyer name is required';
  END IF;

  SELECT count(*) INTO v_count
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  IF v_count = 0 THEN
    RAISE EXCEPTION 'a sale must have at least one line';
  END IF;

  IF p_order_discount < 0 THEN
    RAISE EXCEPTION 'order discount cannot be negative';
  END IF;

  -- Normalise the request: collapse duplicate item entries so the same
  -- book appearing in two courses becomes one line and one lock, and sort
  -- by item_id so every concurrent checkout takes locks in the same order.
  -- Held in a jsonb local rather than a temp table, because this runs over
  -- a transaction-mode connection pooler.
  SELECT jsonb_agg(t ORDER BY (t->>'item_id')::integer)
    INTO v_norm
    FROM (
      SELECT jsonb_build_object(
               'item_id',          (e->>'item_id')::integer,
               'qty',              sum((e->>'qty')::integer),
               'line_discount',    sum(coalesce((e->>'line_discount')::numeric, 0)),
               'class_id',         min((e->>'class_id')::integer),
               'from_full_course', bool_or(coalesce((e->>'from_full_course')::boolean, false))
             ) AS t
        FROM jsonb_array_elements(p_lines) AS e
       GROUP BY (e->>'item_id')::integer
    ) grouped;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(v_norm) AS x(qty integer) WHERE x.qty <= 0
  ) THEN
    RAISE EXCEPTION 'every line must have a positive quantity';
  END IF;

  -- Pass 1: price the order from the catalogue, locking each item.
  FOR v_line IN
    SELECT * FROM jsonb_to_recordset(v_norm)
      AS x(item_id integer, qty integer, line_discount numeric,
           class_id integer, from_full_course boolean)
  LOOP
    SELECT * INTO v_item FROM items WHERE id = v_line.item_id FOR UPDATE;
    IF v_item.id IS NULL THEN
      RAISE EXCEPTION 'unknown item %', v_line.item_id;
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is no longer sold', v_item.name;
    END IF;

    v_line_total := round(v_item.price * v_line.qty, 2);
    IF v_line.line_discount > v_line_total THEN
      RAISE EXCEPTION
        'discount of % exceeds the % line total for %',
        v_line.line_discount, v_line_total, v_item.name;
    END IF;

    v_subtotal  := v_subtotal + v_line_total;
    v_line_disc := v_line_disc + v_line.line_discount;
  END LOOP;

  v_order_disc := v_line_disc + p_order_discount;
  IF v_order_disc > v_subtotal THEN
    RAISE EXCEPTION
      'total discount of % exceeds the order subtotal of %',
      v_order_disc, v_subtotal;
  END IF;
  v_gross := v_subtotal - v_order_disc;

  INSERT INTO sales (buyer_name, buyer_phone, sold_by_user_id,
                     subtotal, discount_total, gross_total, note)
  VALUES (btrim(p_buyer_name), nullif(btrim(coalesce(p_buyer_phone, '')), ''),
          p_user_id, v_subtotal, v_order_disc, v_gross, p_note)
  RETURNING id INTO v_sale_id;

  -- Pass 2: take stock and write the lines. Same order as pass 1, and the
  -- locks from pass 1 are still held, so availability cannot have changed
  -- underneath us.
  FOR v_line IN
    SELECT * FROM jsonb_to_recordset(v_norm)
      AS x(item_id integer, qty integer, line_discount numeric,
           class_id integer, from_full_course boolean)
  LOOP
    SELECT * INTO v_item FROM items WHERE id = v_line.item_id;

    v_taken := fn_take_stock(v_line.item_id, v_line.qty, 'SALE',
                             'sale', v_sale_id, p_user_id, NULL);

    INSERT INTO sale_lines (
      sale_id, item_id, item_name_snapshot, unit_price, qty,
      line_discount, line_total, qty_delivered, qty_backordered,
      class_id, from_full_course)
    VALUES (
      v_sale_id, v_item.id, v_item.name, v_item.price, v_line.qty,
      v_line.line_discount,
      round(v_item.price * v_line.qty, 2) - v_line.line_discount,
      v_taken, v_line.qty - v_taken,
      v_line.class_id, v_line.from_full_course);
  END LOOP;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (p_user_id, 'SALE_CREATED', 'sale', v_sale_id::text,
          format('sold to %s for PKR %s', btrim(p_buyer_name), v_gross));

  RETURN v_sale_id;
END;
$$;

-- ---------------------------------------------------------------------
--  Take money
--
--  Refuses to accept more than is owed, so a cashier cannot create a
--  phantom credit by mistyping an amount.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_record_payment(
  p_sale_id integer,
  p_amount  numeric,
  p_method  "PaymentMethod",
  p_user_id integer,
  p_note    text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_balance numeric(12,2);
  v_id      integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'a payment must be a positive amount';
  END IF;
  IF p_method IN ('REFUND_CASH', 'WRITE_OFF') THEN
    RAISE EXCEPTION 'use fn_refund_payout for money going back out';
  END IF;

  SELECT balance_due INTO v_balance FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'unknown sale %', p_sale_id;
  END IF;
  IF p_amount > v_balance THEN
    RAISE EXCEPTION
      'payment of % is more than the % outstanding on sale %',
      p_amount, v_balance, p_sale_id;
  END IF;

  INSERT INTO payments (sale_id, amount, method, received_by_user_id, note)
  VALUES (p_sale_id, p_amount, p_method, p_user_id, p_note)
  RETURNING id INTO v_id;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (p_user_id, 'PAYMENT_RECEIVED', 'sale', p_sale_id::text,
          format('PKR %s received (%s)', p_amount, p_method));

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
--  Hand money back
--
--  Only ever as much as the shop actually owes, which is a negative
--  balance created by a return.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_refund_payout(
  p_sale_id   integer,
  p_amount    numeric,
  p_user_id   integer,
  p_return_id integer DEFAULT NULL,
  p_method    "PaymentMethod" DEFAULT 'REFUND_CASH',
  p_note      text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_balance numeric(12,2);
  v_owed    numeric(12,2);
  v_id      integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'a refund payout must be a positive amount';
  END IF;

  SELECT balance_due INTO v_balance FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'unknown sale %', p_sale_id;
  END IF;

  -- A negative balance means the shop is in credit to the buyer.
  v_owed := -v_balance;
  IF v_owed <= 0 THEN
    RAISE EXCEPTION
      'nothing to refund on sale %: the buyer is not in credit '
      '(outstanding balance is %)', p_sale_id, v_balance;
  END IF;
  IF p_amount > v_owed THEN
    RAISE EXCEPTION
      'refund of % exceeds the % owed to the buyer on sale %',
      p_amount, v_owed, p_sale_id;
  END IF;

  INSERT INTO payments (sale_id, amount, method, received_by_user_id,
                        return_id, note)
  VALUES (p_sale_id, -p_amount, p_method, p_user_id, p_return_id, p_note)
  RETURNING id INTO v_id;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (p_user_id, 'REFUND_PAID', 'sale', p_sale_id::text,
          format('PKR %s paid back (%s)', p_amount, p_method));

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------
--  Return goods
--
--  p_lines: [{ "sale_line_id": 7, "qty": 1, "condition": "RESELLABLE" }]
--  Refund value per unit is computed from what was actually charged, so
--  a return can never credit more than the buyer paid.
--
--  The credit lands on the sale's balance first. Only if that puts the
--  buyer in credit is cash handed back, and that is a separate explicit
--  call to fn_refund_payout.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_create_return(
  p_sale_id integer,
  p_user_id integer,
  p_lines   jsonb,
  p_reason  text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_return_id integer;
  v_line      record;
  v_sale_line sale_lines;
  v_credit    numeric(12,2);
  v_count     integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM sales WHERE id = p_sale_id) THEN
    RAISE EXCEPTION 'unknown sale %', p_sale_id;
  END IF;

  SELECT count(*) INTO v_count
    FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb));
  IF v_count = 0 THEN
    RAISE EXCEPTION 'a return must have at least one line';
  END IF;

  INSERT INTO sale_returns (sale_id, created_by_id, reason)
  VALUES (p_sale_id, p_user_id, p_reason)
  RETURNING id INTO v_return_id;

  FOR v_line IN
    SELECT (e->>'sale_line_id')::integer AS sale_line_id,
           (e->>'qty')::integer          AS qty,
           coalesce(e->>'condition', 'RESELLABLE')::"ReturnCondition" AS condition
      FROM jsonb_array_elements(p_lines) AS e
     ORDER BY (e->>'sale_line_id')::integer
  LOOP
    SELECT * INTO v_sale_line FROM sale_lines WHERE id = v_line.sale_line_id;
    IF v_sale_line.id IS NULL THEN
      RAISE EXCEPTION 'unknown sale line %', v_line.sale_line_id;
    END IF;
    IF v_sale_line.sale_id <> p_sale_id THEN
      RAISE EXCEPTION
        'sale line % does not belong to sale %', v_line.sale_line_id, p_sale_id;
    END IF;

    -- What the buyer was actually charged per unit, net of line discount.
    v_credit := round((v_sale_line.line_total / v_sale_line.qty) * v_line.qty, 2);

    -- The return_lines triggers do the stock move and the counter moves.
    INSERT INTO return_lines (return_id, sale_line_id, qty, refund_amount, condition)
    VALUES (v_return_id, v_line.sale_line_id, v_line.qty, v_credit, v_line.condition);
  END LOOP;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (p_user_id, 'RETURN_CREATED', 'sale', p_sale_id::text,
          format('return %s raised, credit PKR %s',
                 (SELECT code FROM sale_returns WHERE id = v_return_id),
                 (SELECT credit_total FROM sale_returns WHERE id = v_return_id)));

  RETURN v_return_id;
END;
$$;

-- ---------------------------------------------------------------------
--  Receive stock
--
--  p_lines: [{ "item_id": 12, "qty": 50 }]
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_receive_stock(
  p_user_id  integer,
  p_lines    jsonb,
  p_supplier text DEFAULT NULL,
  p_note     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  v_batch_id integer;
  v_line     record;
  v_total    integer := 0;
BEGIN
  INSERT INTO restock_batches (received_by_id, supplier, note)
  VALUES (p_user_id, p_supplier, p_note)
  RETURNING id INTO v_batch_id;

  FOR v_line IN
    SELECT (e->>'item_id')::integer AS item_id,
           (e->>'qty')::integer     AS qty
      FROM jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) AS e
     ORDER BY (e->>'item_id')::integer
  LOOP
    IF v_line.qty IS NULL OR v_line.qty <= 0 THEN
      CONTINUE; -- blank rows in the bulk entry grid are simply skipped
    END IF;
    PERFORM fn_restock(v_line.item_id, v_line.qty, v_batch_id, p_user_id, NULL);
    v_total := v_total + v_line.qty;
  END LOOP;

  IF v_total = 0 THEN
    RAISE EXCEPTION 'nothing to receive: every line was blank or zero';
  END IF;

  UPDATE restock_batches SET total_units = v_total WHERE id = v_batch_id;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
  VALUES (p_user_id, 'STOCK_RECEIVED', 'restock_batch', v_batch_id::text,
          format('%s unit(s) received', v_total));

  RETURN v_batch_id;
END;
$$;

-- ---------------------------------------------------------------------
--  Merge a duplicate catalogue entry into the real one
--
--  Moves stock, repoints history, keeps the loser's name as an alias so
--  searching for it still finds the survivor.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_merge_items(
  p_keep_id  integer,
  p_merge_id integer,
  p_user_id  integer
) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_keep  items;
  v_merge items;
BEGIN
  IF p_keep_id = p_merge_id THEN
    RAISE EXCEPTION 'cannot merge an item into itself';
  END IF;

  -- Lock low id first so two merges cannot deadlock.
  IF p_keep_id < p_merge_id THEN
    SELECT * INTO v_keep  FROM items WHERE id = p_keep_id  FOR UPDATE;
    SELECT * INTO v_merge FROM items WHERE id = p_merge_id FOR UPDATE;
  ELSE
    SELECT * INTO v_merge FROM items WHERE id = p_merge_id FOR UPDATE;
    SELECT * INTO v_keep  FROM items WHERE id = p_keep_id  FOR UPDATE;
  END IF;

  IF v_keep.id IS NULL OR v_merge.id IS NULL THEN
    RAISE EXCEPTION 'both items must exist';
  END IF;

  -- Move any stock across as an explicit, traceable pair of movements
  -- rather than editing quantities.
  IF v_merge.quantity_on_hand > 0 THEN
    INSERT INTO stock_movements (item_id, delta, reason, ref_type, ref_id,
                                 created_by_user_id, note)
    VALUES (p_merge_id, -v_merge.quantity_on_hand, 'CORRECTION', 'item_merge',
            p_keep_id, p_user_id,
            format('merged into item %s', p_keep_id));
    INSERT INTO stock_movements (item_id, delta, reason, ref_type, ref_id,
                                 created_by_user_id, note)
    VALUES (p_keep_id, v_merge.quantity_on_hand, 'CORRECTION', 'item_merge',
            p_merge_id, p_user_id,
            format('merged from item %s', p_merge_id));
  END IF;

  -- Keep the old name findable.
  INSERT INTO item_aliases (item_id, alias, normalized_alias)
  VALUES (p_keep_id, v_merge.name, fn_normalize(v_merge.name))
  ON CONFLICT (normalized_alias) DO NOTHING;
  UPDATE item_aliases SET item_id = p_keep_id WHERE item_id = p_merge_id;

  -- Repoint curriculum membership, skipping rows that would collide.
  UPDATE curriculum_items ci SET item_id = p_keep_id
   WHERE ci.item_id = p_merge_id
     AND NOT EXISTS (SELECT 1 FROM curriculum_items x
                      WHERE x.class_id = ci.class_id AND x.item_id = p_keep_id);
  DELETE FROM curriculum_items WHERE item_id = p_merge_id;

  -- Past sales and past movements are deliberately NOT repointed. They are
  -- history: they carry their own name snapshots, the ledger for the old
  -- item must keep summing to its own (now zero) balance, and both tables
  -- are append-only by design. The loser row stays, deactivated, as the
  -- anchor for that history.
  UPDATE items SET is_active = false, name = v_merge.name || ' (merged)'
   WHERE id = p_merge_id;

  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id,
                         summary, before, after)
  VALUES (p_user_id, 'ITEMS_MERGED', 'item', p_keep_id::text,
          format('%s merged into %s', v_merge.name, v_keep.name),
          to_jsonb(v_merge), to_jsonb(v_keep));
END;
$$;

COMMIT;
