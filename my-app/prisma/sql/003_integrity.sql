-- =====================================================================
--  Al-Sehar Bookstore — integrity engine
--
--  This file is the reason stock cannot be duplicated or under-recorded.
--  Read it before changing anything about selling or stock.
--
--  The contract for application code is deliberately narrow:
--    * To change stock, call fn_take_stock / fn_restock / fn_adjust_stock.
--      Never UPDATE items.quantity_on_hand — a guard will reject it.
--    * To take money, INSERT into payments. Never UPDATE sales totals.
--    * To return goods, INSERT into return_lines. The trigger moves stock
--      and the counters for you.
--  Run after 002_ledgers.sql.
-- =====================================================================

BEGIN;

-- =====================================================================
--  1. The stock ledger applies itself
-- =====================================================================

-- Inserting a stock_movements row is the ONLY way stock ever changes.
-- The UPDATE below takes a row-level lock on the item, so two concurrent
-- inserts for the same item serialise: there is no read-then-write window
-- for them to race in, and `balance_after` is therefore always truthful.
CREATE OR REPLACE FUNCTION fn_stock_movement_apply() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  new_balance integer;
BEGIN
  PERFORM set_config('app.stock_ledger', '1', true);

  UPDATE items
     SET quantity_on_hand = quantity_on_hand + NEW.delta
   WHERE id = NEW.item_id
  RETURNING quantity_on_hand INTO new_balance;

  PERFORM set_config('app.stock_ledger', '', true);

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'stock movement references unknown item %', NEW.item_id;
  END IF;

  -- Belt and braces: the CHECK constraint on items would also catch this,
  -- but an explicit message is far easier to act on.
  IF new_balance < 0 THEN
    RAISE EXCEPTION
      'stock for item % would go negative (have %, change %)',
      NEW.item_id, new_balance - NEW.delta, NEW.delta
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.balance_after := new_balance;
  RETURN NEW;
END;
$$;
CREATE TRIGGER stock_movements_apply BEFORE INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION fn_stock_movement_apply();

-- I1: refuse any attempt to write quantity_on_hand from outside the ledger.
CREATE OR REPLACE FUNCTION fn_items_guard_quantity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity_on_hand IS DISTINCT FROM OLD.quantity_on_hand
     AND coalesce(current_setting('app.stock_ledger', true), '') <> '1' THEN
    RAISE EXCEPTION
      'quantity_on_hand is maintained by the stock ledger; insert into '
      'stock_movements (or call fn_take_stock / fn_restock / fn_adjust_stock) '
      'instead of updating items directly';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER items_guard_quantity BEFORE UPDATE ON items
  FOR EACH ROW EXECUTE FUNCTION fn_items_guard_quantity();

-- ...and the same on INSERT, so a new item can never be born holding
-- stock that no ledger row accounts for. Seeding opening balances is done
-- by inserting the item at zero and then posting an OPENING movement.
CREATE OR REPLACE FUNCTION fn_items_guard_initial_quantity() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantity_on_hand <> 0 THEN
    RAISE EXCEPTION
      'a new item must start at zero stock. Insert the item, then post an '
      'OPENING stock movement so the ledger accounts for every unit.';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER items_guard_initial_quantity BEFORE INSERT ON items
  FOR EACH ROW EXECUTE FUNCTION fn_items_guard_initial_quantity();

-- I3: the ledgers are append-only.
CREATE OR REPLACE FUNCTION fn_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only: % is not allowed. Record a correcting entry instead.',
    TG_TABLE_NAME, TG_OP;
END;
$$;
CREATE TRIGGER stock_movements_append_only
  BEFORE UPDATE OR DELETE ON stock_movements
  FOR EACH STATEMENT EXECUTE FUNCTION fn_append_only();
CREATE TRIGGER payments_append_only
  BEFORE UPDATE OR DELETE ON payments
  FOR EACH STATEMENT EXECUTE FUNCTION fn_append_only();
CREATE TRIGGER return_lines_append_only
  BEFORE UPDATE OR DELETE ON return_lines
  FOR EACH STATEMENT EXECUTE FUNCTION fn_append_only();

-- Sale lines: the fulfilment counters move, the commercial terms never do.
CREATE OR REPLACE FUNCTION fn_sale_lines_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.qty          IS DISTINCT FROM OLD.qty
  OR NEW.unit_price   IS DISTINCT FROM OLD.unit_price
  OR NEW.line_total   IS DISTINCT FROM OLD.line_total
  OR NEW.line_discount IS DISTINCT FROM OLD.line_discount
  OR NEW.item_id      IS DISTINCT FROM OLD.item_id
  OR NEW.sale_id      IS DISTINCT FROM OLD.sale_id THEN
    RAISE EXCEPTION
      'sale line %: price and quantity are immutable once sold. '
      'Use a return to reverse part of a sale.', OLD.id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sale_lines_guard BEFORE UPDATE ON sale_lines
  FOR EACH ROW EXECUTE FUNCTION fn_sale_lines_guard();

-- =====================================================================
--  2. Stock operations — the only supported entry points
-- =====================================================================

-- Take up to `p_want` units off the shelf for a sale.
--
-- Returns how many were actually taken, which may be fewer than asked for
-- (the shop deliberately allows selling out-of-stock items; the shortfall
-- becomes a backorder). The FOR UPDATE lock means two cashiers selling the
-- last copy at the same moment cannot both succeed: the second one waits,
-- then sees the true remaining count.
CREATE OR REPLACE FUNCTION fn_take_stock(
  p_item_id  integer,
  p_want     integer,
  p_reason   "MovementReason",
  p_ref_type text,
  p_ref_id   integer,
  p_user_id  integer,
  p_note     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  available integer;
  taken     integer;
BEGIN
  IF p_want <= 0 THEN
    RAISE EXCEPTION 'fn_take_stock: quantity must be positive, got %', p_want;
  END IF;

  SELECT quantity_on_hand INTO available
    FROM items WHERE id = p_item_id
     FOR UPDATE;

  IF available IS NULL THEN
    RAISE EXCEPTION 'fn_take_stock: unknown item %', p_item_id;
  END IF;

  taken := least(available, p_want);

  IF taken > 0 THEN
    INSERT INTO stock_movements
      (item_id, delta, reason, ref_type, ref_id, created_by_user_id, note)
    VALUES
      (p_item_id, -taken, p_reason, p_ref_type, p_ref_id, p_user_id, p_note);
  END IF;

  RETURN taken;
END;
$$;

CREATE OR REPLACE FUNCTION fn_restock(
  p_item_id  integer,
  p_qty      integer,
  p_batch_id integer,
  p_user_id  integer,
  p_note     text DEFAULT NULL
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  new_balance integer;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'fn_restock: quantity must be positive, got %', p_qty;
  END IF;

  INSERT INTO stock_movements
    (item_id, delta, reason, ref_type, ref_id, created_by_user_id, note)
  VALUES
    (p_item_id, p_qty, 'RESTOCK', 'restock_batch', p_batch_id, p_user_id, p_note)
  RETURNING balance_after INTO new_balance;

  RETURN new_balance;
END;
$$;

-- Admin stock count correction. `p_counted` is the real shelf count; the
-- function works out the delta so the caller cannot fat-finger a direction.
CREATE OR REPLACE FUNCTION fn_adjust_stock(
  p_item_id integer,
  p_counted integer,
  p_user_id integer,
  p_note    text
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  available integer;
  diff      integer;
BEGIN
  IF p_counted < 0 THEN
    RAISE EXCEPTION 'fn_adjust_stock: counted quantity cannot be negative';
  END IF;
  IF p_note IS NULL OR btrim(p_note) = '' THEN
    RAISE EXCEPTION 'fn_adjust_stock: a reason is required for a correction';
  END IF;

  SELECT quantity_on_hand INTO available
    FROM items WHERE id = p_item_id FOR UPDATE;
  IF available IS NULL THEN
    RAISE EXCEPTION 'fn_adjust_stock: unknown item %', p_item_id;
  END IF;

  diff := p_counted - available;
  IF diff = 0 THEN
    RETURN available;
  END IF;

  INSERT INTO stock_movements
    (item_id, delta, reason, ref_type, ref_id, created_by_user_id, note)
  VALUES
    (p_item_id, diff, 'CORRECTION', 'stock_count', NULL, p_user_id, p_note);

  RETURN p_counted;
END;
$$;

-- Hand over units that were backordered. Deducts stock now, and moves the
-- line's counters from backordered to delivered. Refuses to over-deliver
-- and refuses to deliver stock that is not physically there.
CREATE OR REPLACE FUNCTION fn_fulfill_backorder(
  p_sale_line_id integer,
  p_qty          integer,
  p_user_id      integer
) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE
  line      sale_lines;
  taken     integer;
BEGIN
  IF p_qty <= 0 THEN
    RAISE EXCEPTION 'fn_fulfill_backorder: quantity must be positive';
  END IF;

  SELECT * INTO line FROM sale_lines WHERE id = p_sale_line_id FOR UPDATE;
  IF line.id IS NULL THEN
    RAISE EXCEPTION 'fn_fulfill_backorder: unknown sale line %', p_sale_line_id;
  END IF;

  IF p_qty > line.qty_backordered THEN
    RAISE EXCEPTION
      'sale line %: only % unit(s) are on backorder, cannot deliver %',
      p_sale_line_id, line.qty_backordered, p_qty;
  END IF;

  taken := fn_take_stock(line.item_id, p_qty, 'BACKORDER_FULFILL',
                         'sale_line', p_sale_line_id, p_user_id, NULL);

  IF taken < p_qty THEN
    RAISE EXCEPTION
      'not enough stock to fulfil: asked for %, only % available for item %',
      p_qty, taken, line.item_id
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE sale_lines
     SET qty_delivered   = qty_delivered + p_qty,
         qty_backordered = qty_backordered - p_qty
   WHERE id = p_sale_line_id;

  RETURN p_qty;
END;
$$;

-- =====================================================================
--  3. Returns move stock and counters by themselves
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_return_line_apply() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line         sale_lines;
  actor        integer;
  returnable   integer;
  cancellable  integer;
BEGIN
  SELECT created_by_id INTO actor FROM sale_returns WHERE id = NEW.return_id;

  SELECT * INTO line FROM sale_lines WHERE id = NEW.sale_line_id FOR UPDATE;
  IF line.id IS NULL THEN
    RAISE EXCEPTION 'return references unknown sale line %', NEW.sale_line_id;
  END IF;

  IF NEW.condition = 'NOT_DELIVERED' THEN
    -- Cancelling a backorder the buyer never received.
    cancellable := line.qty_backordered;
    IF NEW.qty > cancellable THEN
      RAISE EXCEPTION
        'sale line %: only % undelivered unit(s) can be cancelled, asked %',
        line.id, cancellable, NEW.qty;
    END IF;
    UPDATE sale_lines
       SET qty_backordered = qty_backordered - NEW.qty,
           qty_cancelled   = qty_cancelled + NEW.qty
     WHERE id = line.id;

  ELSE
    -- A physical return of units the buyer was actually given.
    returnable := line.qty_delivered - line.qty_returned;
    IF NEW.qty > returnable THEN
      RAISE EXCEPTION
        'sale line %: only % delivered unit(s) can be returned, asked %',
        line.id, returnable, NEW.qty;
    END IF;

    UPDATE sale_lines
       SET qty_returned = qty_returned + NEW.qty
     WHERE id = line.id;

    IF NEW.condition = 'RESELLABLE' THEN
      INSERT INTO stock_movements
        (item_id, delta, reason, ref_type, ref_id, created_by_user_id, note)
      VALUES
        (line.item_id, NEW.qty, 'RETURN_RESELLABLE', 'return_line', NEW.id,
         actor, NULL);
    ELSE
      -- Damaged: it is back in the building but not back on the shelf, so
      -- stock is unchanged. Logged so the loss is visible in reporting.
      INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
      VALUES (actor, 'RETURN_DAMAGED', 'sale_line', line.id::text,
              format('%s unit(s) of %s returned damaged, written off',
                     NEW.qty, line.item_name_snapshot));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
-- AFTER INSERT so NEW.id exists for the movement's ref_id.
CREATE TRIGGER return_lines_apply AFTER INSERT ON return_lines
  FOR EACH ROW EXECUTE FUNCTION fn_return_line_apply();

-- Refund credit may never exceed what the buyer was actually charged
-- for those units.
CREATE OR REPLACE FUNCTION fn_return_line_validate() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  line      sale_lines;
  max_credit numeric(12,2);
BEGIN
  SELECT * INTO line FROM sale_lines WHERE id = NEW.sale_line_id;
  IF line.id IS NULL THEN
    RAISE EXCEPTION 'return references unknown sale line %', NEW.sale_line_id;
  END IF;

  -- Per-unit price net of the line discount, times units returned.
  max_credit := round((line.line_total / line.qty) * NEW.qty, 2);
  IF NEW.refund_amount > max_credit THEN
    RAISE EXCEPTION
      'refund of % exceeds the % actually charged for % unit(s) of line %',
      NEW.refund_amount, max_credit, NEW.qty, line.id;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER return_lines_validate BEFORE INSERT ON return_lines
  FOR EACH ROW EXECUTE FUNCTION fn_return_line_validate();

-- =====================================================================
--  4. Sale money totals are derived, never assigned
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_recalc_sale(p_sale_id integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_credit   numeric(12,2);
  v_received numeric(12,2);
  v_refunded numeric(12,2);
  v_gross    numeric(12,2);
  v_balance  numeric(12,2);
BEGIN
  SELECT gross_total INTO v_gross FROM sales WHERE id = p_sale_id FOR UPDATE;
  IF v_gross IS NULL THEN
    RETURN;
  END IF;

  SELECT coalesce(sum(rl.refund_amount), 0)
    INTO v_credit
    FROM return_lines rl
    JOIN sale_returns sr ON sr.id = rl.return_id
   WHERE sr.sale_id = p_sale_id;

  SELECT coalesce(sum(amount) FILTER (WHERE amount > 0), 0),
         coalesce(-sum(amount) FILTER (WHERE amount < 0), 0)
    INTO v_received, v_refunded
    FROM payments
   WHERE sale_id = p_sale_id;

  -- What the buyer still owes: what they were charged, less anything
  -- credited back, less what they paid, plus anything handed back to them.
  v_balance := (v_gross - v_credit) - v_received + v_refunded;

  PERFORM set_config('app.sale_recalc', '1', true);
  UPDATE sales
     SET return_credit   = v_credit,
         amount_received = v_received,
         amount_refunded = v_refunded,
         balance_due     = v_balance,
         is_settled      = (v_balance <= 0)
   WHERE id = p_sale_id;
  PERFORM set_config('app.sale_recalc', '', true);
END;
$$;

CREATE OR REPLACE FUNCTION fn_recalc_sale_from_payment() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM fn_recalc_sale(NEW.sale_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER payments_recalc AFTER INSERT ON payments
  FOR EACH ROW EXECUTE FUNCTION fn_recalc_sale_from_payment();

CREATE OR REPLACE FUNCTION fn_recalc_sale_from_return() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_sale_id integer;
BEGIN
  SELECT sale_id INTO v_sale_id FROM sale_returns WHERE id = NEW.return_id;

  UPDATE sale_returns
     SET credit_total = (SELECT coalesce(sum(refund_amount), 0)
                           FROM return_lines WHERE return_id = NEW.return_id)
   WHERE id = NEW.return_id;

  PERFORM fn_recalc_sale(v_sale_id);
  RETURN NULL;
END;
$$;
CREATE TRIGGER return_lines_recalc AFTER INSERT ON return_lines
  FOR EACH ROW EXECUTE FUNCTION fn_recalc_sale_from_return();

-- Set the opening balance when a sale is created.
CREATE OR REPLACE FUNCTION fn_sales_set_initial_balance() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.balance_due := NEW.gross_total;
  NEW.is_settled  := (NEW.gross_total <= 0);
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_initial_balance BEFORE INSERT ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_sales_set_initial_balance();

-- Refuse hand-edited money on a sale.
CREATE OR REPLACE FUNCTION fn_sales_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.subtotal       IS DISTINCT FROM OLD.subtotal
   OR NEW.discount_total IS DISTINCT FROM OLD.discount_total
   OR NEW.gross_total    IS DISTINCT FROM OLD.gross_total) THEN
    RAISE EXCEPTION
      'sale %: the charged amount is immutable. Use a return to reverse it.',
      OLD.id;
  END IF;

  IF (NEW.return_credit   IS DISTINCT FROM OLD.return_credit
   OR NEW.amount_received IS DISTINCT FROM OLD.amount_received
   OR NEW.amount_refunded IS DISTINCT FROM OLD.amount_refunded
   OR NEW.balance_due     IS DISTINCT FROM OLD.balance_due)
   AND coalesce(current_setting('app.sale_recalc', true), '') <> '1' THEN
    RAISE EXCEPTION
      'sale %: money totals are derived from the payment and return '
      'ledgers. Insert a payment or a return instead of updating the sale.',
      OLD.id;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_guard BEFORE UPDATE ON sales
  FOR EACH ROW EXECUTE FUNCTION fn_sales_guard();

-- =====================================================================
--  5. Reconciliation and reporting helpers
-- =====================================================================

-- The self-audit. Every row returned is a bug: the ledger and the cached
-- quantity disagree. Expected result is zero rows, forever. Worth running
-- nightly and alerting on.
CREATE OR REPLACE FUNCTION fn_verify_stock_integrity()
RETURNS TABLE (item_id integer, item_name text, cached integer, ledger bigint)
LANGUAGE sql STABLE AS $$
  SELECT i.id, i.name, i.quantity_on_hand,
         coalesce(sum(m.delta), 0) AS ledger_total
    FROM items i
    LEFT JOIN stock_movements m ON m.item_id = i.id
   GROUP BY i.id, i.name, i.quantity_on_hand
  HAVING i.quantity_on_hand <> coalesce(sum(m.delta), 0);
$$;

-- What to reorder: aggregate outstanding backorders per item.
CREATE OR REPLACE VIEW v_pending_inventory AS
  SELECT i.id            AS item_id,
         i.code,
         i.name,
         i.type,
         i.quantity_on_hand,
         sum(sl.qty_backordered)::integer AS pending_qty,
         count(DISTINCT sl.sale_id)::integer AS waiting_sales,
         min(s.sold_at)  AS oldest_order_at
    FROM sale_lines sl
    JOIN sales s ON s.id = sl.sale_id AND s.status = 'COMPLETED'
    JOIN items i ON i.id = sl.item_id
   WHERE sl.qty_backordered > 0
   GROUP BY i.id, i.code, i.name, i.type, i.quantity_on_hand;

-- Low stock, taking outstanding backorders into account.
CREATE OR REPLACE VIEW v_low_stock AS
  SELECT i.id AS item_id,
         i.code,
         i.name,
         i.type,
         i.quantity_on_hand,
         i.reorder_level,
         coalesce(p.pending_qty, 0) AS committed_qty,
         i.quantity_on_hand - coalesce(p.pending_qty, 0) AS free_qty
    FROM items i
    LEFT JOIN v_pending_inventory p ON p.item_id = i.id
   WHERE i.is_active
     AND i.quantity_on_hand - coalesce(p.pending_qty, 0) <= i.reorder_level;

-- Possible duplicate catalogue entries, for the merge screen.
CREATE OR REPLACE VIEW v_possible_duplicate_items AS
  SELECT a.id AS item_id, a.name AS item_name,
         b.id AS other_id, b.name AS other_name,
         a.normalized_name
    FROM items a
    JOIN items b
      ON a.normalized_name = b.normalized_name
     AND a.id < b.id;

COMMIT;
