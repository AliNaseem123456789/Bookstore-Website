-- =====================================================================
--  Invariant tests for the Al-Sehar Bookstore schema.
--  Run against a freshly migrated, empty database.
--  Any uncaught exception aborts the run (ON_ERROR_STOP=1).
-- =====================================================================
\set ON_ERROR_STOP on
\pset pager off
SET client_min_messages TO notice;

CREATE OR REPLACE FUNCTION expect_fail(sql text, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE sql;
    RAISE EXCEPTION 'FAIL (should have been rejected): %', label;
  EXCEPTION
    WHEN raise_exception OR check_violation OR not_null_violation
      OR foreign_key_violation OR unique_violation THEN
      RAISE NOTICE 'PASS  rejected: %', label;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION expect_eq(got anyelement, want anyelement, label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FAIL: % — got %, want %', label, got, want;
  END IF;
  RAISE NOTICE 'PASS  % = %', label, got;
END;
$$;

-- ------------------------------------------------------------ fixtures

INSERT INTO users (email, name, password_hash, role) VALUES
  ('admin@test',   'Admin',   'x', 'ADMIN'),
  ('cashier@test', 'Cashier', 'x', 'CASHIER');

INSERT INTO classes (code, name, sort_order) VALUES ('G9', 'Class 9', 90);

INSERT INTO items (name, publisher, type, price) VALUES
  ('Physics IX',  'STBB', 'BOOK', 375.00),
  ('Biology IX',  'STBB', 'BOOK', 350.00),
  ('Computer IX', 'STBB', 'BOOK', 290.00),
  ('Printed Math Copy', 'Scientific', 'COPY', 425.00);

\echo ''
\echo '================ 1. stock is ledger-only ================'

SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 0, 'new item starts empty');

SELECT expect_fail(
  $$INSERT INTO items (name, price, quantity_on_hand) VALUES ('Sneaky', 1, 50)$$,
  'INSERT an item already holding stock');

SELECT expect_fail(
  $$UPDATE items SET quantity_on_hand = 999 WHERE name = 'Physics IX'$$,
  'UPDATE quantity_on_hand directly');

SELECT expect_eq(
  fn_restock((SELECT id FROM items WHERE name='Physics IX'), 10, NULL,
             (SELECT id FROM users WHERE email='admin@test'), 'opening'),
  10, 'fn_restock returns the new balance');

SELECT expect_eq((SELECT balance_after FROM stock_movements ORDER BY id DESC LIMIT 1),
                 10, 'balance_after is stamped by the trigger');

SELECT expect_fail(
  format($$INSERT INTO stock_movements (item_id, delta, reason)
           VALUES (%s, -11, 'SALE')$$,
         (SELECT id FROM items WHERE name='Physics IX')),
  'a movement that would make stock negative');

SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 10, 'stock untouched after a rejected movement');

SELECT expect_fail(
  $$UPDATE stock_movements SET delta = 1 WHERE id = (SELECT min(id) FROM stock_movements)$$,
  'UPDATE on stock_movements');
SELECT expect_fail(
  $$DELETE FROM stock_movements WHERE id = (SELECT min(id) FROM stock_movements)$$,
  'DELETE on stock_movements');

SELECT expect_fail(
  format($$SELECT fn_adjust_stock(%s, 5, %s, '  ')$$,
         (SELECT id FROM items WHERE name='Physics IX'),
         (SELECT id FROM users WHERE email='admin@test')),
  'a stock correction with no reason given');

\echo ''
\echo '================ 2. checkout ================'

-- Stock everything else.
SELECT fn_restock(id, 20, NULL, (SELECT id FROM users WHERE email='admin@test'), 'opening')
  FROM items WHERE name IN ('Biology IX', 'Computer IX', 'Printed Math Copy');

-- Ask for 14 Physics when only 10 exist, plus 2 Biology. Expect a
-- part-delivered line and a backorder, never negative stock.
SELECT fn_create_sale(
  'Ahmed Raza', '03001234567',
  (SELECT id FROM users WHERE email='cashier@test'),
  jsonb_build_array(
    jsonb_build_object('item_id', (SELECT id FROM items WHERE name='Physics IX'),
                       'qty', 14, 'class_id', (SELECT id FROM classes WHERE code='G9'),
                       'from_full_course', true),
    jsonb_build_object('item_id', (SELECT id FROM items WHERE name='Biology IX'),
                       'qty', 2)
  ),
  100.00, 'test sale'
) AS sale_id \gset

SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 0, 'Physics drained to exactly zero');
SELECT expect_eq((SELECT qty_delivered FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 10, 'delivered what existed');
SELECT expect_eq((SELECT qty_backordered FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 4, 'backordered the shortfall');

-- 14*375 + 2*350 = 5250 + 700 = 5950, less 100 discount = 5850
SELECT expect_eq((SELECT subtotal    FROM sales WHERE id=:sale_id), 5950.00::numeric,
                 'subtotal priced from the catalogue');
SELECT expect_eq((SELECT gross_total FROM sales WHERE id=:sale_id), 5850.00::numeric,
                 'order discount applied');
SELECT expect_eq((SELECT balance_due FROM sales WHERE id=:sale_id), 5850.00::numeric,
                 'unpaid sale owes the full amount');
SELECT expect_eq((SELECT is_settled  FROM sales WHERE id=:sale_id), false,
                 'unpaid sale is not settled');

SELECT expect_fail(
  format($$SELECT fn_create_sale('X', NULL, %s, '[]'::jsonb)$$,
         (SELECT id FROM users WHERE email='cashier@test')),
  'a sale with no lines');
SELECT expect_fail(
  format($$SELECT fn_create_sale('  ', NULL, %s,
            jsonb_build_array(jsonb_build_object('item_id', %s, 'qty', 1)))$$,
         (SELECT id FROM users WHERE email='cashier@test'),
         (SELECT id FROM items WHERE name='Biology IX')),
  'a sale with a blank buyer name');
SELECT expect_fail(
  format($$SELECT fn_create_sale('Y', NULL, %s,
            jsonb_build_array(jsonb_build_object('item_id', %s, 'qty', 1)), 99999)$$,
         (SELECT id FROM users WHERE email='cashier@test'),
         (SELECT id FROM items WHERE name='Biology IX')),
  'a discount larger than the order');

-- Commercial terms are frozen once sold.
SELECT expect_fail(
  format($$UPDATE sale_lines SET unit_price = 1 WHERE sale_id = %s$$, :sale_id),
  'editing the price on a sold line');
SELECT expect_fail(
  format($$UPDATE sales SET gross_total = 1 WHERE id = %s$$, :sale_id),
  'editing the charged total on a sale');
SELECT expect_fail(
  format($$UPDATE sales SET balance_due = 0 WHERE id = %s$$, :sale_id),
  'hand-editing balance_due');

\echo ''
\echo '================ 3. payments ================'

SELECT expect_fail(
  format($$SELECT fn_record_payment(%s, 99999, 'CASH', %s)$$, :sale_id,
         (SELECT id FROM users WHERE email='cashier@test')),
  'paying more than is owed');

SELECT fn_record_payment(:sale_id, 2000.00, 'CASH',
         (SELECT id FROM users WHERE email='cashier@test'), 'part payment');
SELECT expect_eq((SELECT balance_due FROM sales WHERE id=:sale_id), 3850.00::numeric,
                 'balance drops by the payment');
SELECT expect_eq((SELECT amount_received FROM sales WHERE id=:sale_id), 2000.00::numeric,
                 'received total tracked');

SELECT expect_fail(
  $$UPDATE payments SET amount = 5 WHERE id = (SELECT min(id) FROM payments)$$,
  'UPDATE on payments');

\echo ''
\echo '================ 4. returns ================'

-- Return 2 delivered Physics in saleable condition.
SELECT fn_create_return(
  :sale_id, (SELECT id FROM users WHERE email='admin@test'),
  jsonb_build_array(jsonb_build_object(
    'sale_line_id', (SELECT id FROM sale_lines
                      WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
    'qty', 2, 'condition', 'RESELLABLE')),
  'wrong class'
) AS ret_id \gset

SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 2, 'resellable return goes back on the shelf');
SELECT expect_eq((SELECT qty_returned FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 2, 'line records the return');
-- line_total for Physics = 14*375 = 5250, per unit 375, 2 units = 750
SELECT expect_eq((SELECT credit_total FROM sale_returns WHERE id=:ret_id),
                 750.00::numeric, 'credit computed from what was charged');
SELECT expect_eq((SELECT balance_due FROM sales WHERE id=:sale_id), 3100.00::numeric,
                 'credit reduces what the buyer still owes');

-- Damaged: credited, but does not come back into sellable stock.
SELECT fn_create_return(
  :sale_id, (SELECT id FROM users WHERE email='admin@test'),
  jsonb_build_array(jsonb_build_object(
    'sale_line_id', (SELECT id FROM sale_lines
                      WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
    'qty', 1, 'condition', 'DAMAGED')),
  'torn cover');
SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 2, 'damaged return does NOT restock');

-- Cannot return more than was delivered.
SELECT expect_fail(
  format($$SELECT fn_create_return(%s, %s, jsonb_build_array(jsonb_build_object(
             'sale_line_id', %s, 'qty', 99, 'condition', 'RESELLABLE')))$$,
         :sale_id, (SELECT id FROM users WHERE email='admin@test'),
         (SELECT id FROM sale_lines WHERE sale_id=:sale_id
                                      AND item_name_snapshot='Physics IX')),
  'returning more units than were delivered');

-- Cancel 1 of the 4 undelivered backordered units.
SELECT fn_create_return(
  :sale_id, (SELECT id FROM users WHERE email='admin@test'),
  jsonb_build_array(jsonb_build_object(
    'sale_line_id', (SELECT id FROM sale_lines
                      WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
    'qty', 1, 'condition', 'NOT_DELIVERED')),
  'buyer no longer wants it');
SELECT expect_eq((SELECT qty_backordered FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 3, 'cancellation reduces the backorder');
SELECT expect_eq((SELECT qty_cancelled FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 1, 'cancellation is counted');
SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 2, 'cancelling an undelivered unit does not invent stock');

-- Refunds cannot exceed what was charged.
SELECT expect_fail(
  format($$INSERT INTO return_lines (return_id, sale_line_id, qty, refund_amount)
           VALUES (%s, %s, 1, 99999)$$,
         :ret_id,
         (SELECT id FROM sale_lines WHERE sale_id=:sale_id
                                      AND item_name_snapshot='Biology IX')),
  'a refund larger than the price paid');

\echo ''
\echo '================ 5. refund payouts ================'

-- Still in debt, so nothing to hand back.
SELECT expect_fail(
  format($$SELECT fn_refund_payout(%s, 100, %s)$$, :sale_id,
         (SELECT id FROM users WHERE email='admin@test')),
  'paying out cash while the buyer still owes money');

-- A fully-paid sale, then a return, puts the shop in credit.
SELECT fn_create_sale('Sana Khan', NULL,
  (SELECT id FROM users WHERE email='cashier@test'),
  jsonb_build_array(jsonb_build_object(
    'item_id', (SELECT id FROM items WHERE name='Computer IX'), 'qty', 2))
) AS sale2 \gset
SELECT fn_record_payment(:sale2, 580.00, 'CASH',
         (SELECT id FROM users WHERE email='cashier@test'));
SELECT expect_eq((SELECT is_settled FROM sales WHERE id=:sale2), true,
                 'paid in full is settled');

SELECT fn_create_return(:sale2, (SELECT id FROM users WHERE email='admin@test'),
  jsonb_build_array(jsonb_build_object(
    'sale_line_id', (SELECT id FROM sale_lines WHERE sale_id=:sale2),
    'qty', 1, 'condition', 'RESELLABLE')));
SELECT expect_eq((SELECT balance_due FROM sales WHERE id=:sale2), -290.00::numeric,
                 'return on a paid sale puts the buyer in credit');

SELECT expect_fail(
  format($$SELECT fn_refund_payout(%s, 1000, %s)$$, :sale2,
         (SELECT id FROM users WHERE email='admin@test')),
  'refunding more than the credit owed');

SELECT fn_refund_payout(:sale2, 290.00,
         (SELECT id FROM users WHERE email='admin@test'));
SELECT expect_eq((SELECT balance_due FROM sales WHERE id=:sale2), 0.00::numeric,
                 'paying the credit out clears the sale');

\echo ''
\echo '================ 6. backorder fulfilment ================'

-- 3 Physics still on backorder; only 2 in stock.
SELECT expect_fail(
  format($$SELECT fn_fulfill_backorder(%s, 3, %s)$$,
         (SELECT id FROM sale_lines WHERE sale_id=:sale_id
                                      AND item_name_snapshot='Physics IX'),
         (SELECT id FROM users WHERE email='admin@test')),
  'fulfilling more than is physically in stock');

SELECT fn_restock((SELECT id FROM items WHERE name='Physics IX'), 5, NULL,
                  (SELECT id FROM users WHERE email='admin@test'), 'new delivery');
SELECT fn_fulfill_backorder(
  (SELECT id FROM sale_lines WHERE sale_id=:sale_id
                               AND item_name_snapshot='Physics IX'),
  3, (SELECT id FROM users WHERE email='admin@test'));

SELECT expect_eq((SELECT qty_backordered FROM sale_lines
                   WHERE sale_id=:sale_id AND item_name_snapshot='Physics IX'),
                 0, 'backorder cleared');
SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 4, 'fulfilment deducted stock (2 + 5 - 3 = 4)');
SELECT expect_fail(
  format($$SELECT fn_fulfill_backorder(%s, 1, %s)$$,
         (SELECT id FROM sale_lines WHERE sale_id=:sale_id
                                      AND item_name_snapshot='Physics IX'),
         (SELECT id FROM users WHERE email='admin@test')),
  'fulfilling a backorder that is already cleared');

\echo ''
\echo '================ 7. electives are data, not code ================'

INSERT INTO classes (code, name, sort_order) VALUES ('G10', 'Class 10', 100);
INSERT INTO elective_groups (class_id, group_key, label, min_select, max_select)
VALUES ((SELECT id FROM classes WHERE code='G9'), 'SCIENCE', 'Science elective', 1, 1);

INSERT INTO curriculum_items (class_id, item_id, default_qty, elective_group_id)
VALUES ((SELECT id FROM classes WHERE code='G9'),
        (SELECT id FROM items WHERE name='Biology IX'), 1,
        (SELECT id FROM elective_groups WHERE group_key='SCIENCE')),
       ((SELECT id FROM classes WHERE code='G9'),
        (SELECT id FROM items WHERE name='Computer IX'), 1,
        (SELECT id FROM elective_groups WHERE group_key='SCIENCE')),
       ((SELECT id FROM classes WHERE code='G9'),
        (SELECT id FROM items WHERE name='Physics IX'), 1, NULL);

SELECT expect_eq((SELECT count(*)::integer FROM curriculum_items ci
                   JOIN elective_groups eg ON eg.id = ci.elective_group_id
                  WHERE eg.group_key='SCIENCE'),
                 2, 'two items in the science elective group');

-- An elective group belongs to one class and cannot be borrowed by another.
SELECT expect_fail(
  format($$INSERT INTO curriculum_items (class_id, item_id, elective_group_id)
           VALUES (%s, %s, %s)$$,
         (SELECT id FROM classes WHERE code='G10'),
         (SELECT id FROM items WHERE name='Printed Math Copy'),
         (SELECT id FROM elective_groups WHERE group_key='SCIENCE')),
  'using another class''s elective group');

SELECT expect_fail(
  format($$INSERT INTO curriculum_items (class_id, item_id) VALUES (%s, %s)$$,
         (SELECT id FROM classes WHERE code='G9'),
         (SELECT id FROM items WHERE name='Physics IX')),
  'adding the same item to a class twice');

-- One copy shared by several classes: the whole point of the join table.
INSERT INTO curriculum_items (class_id, item_id, default_qty)
VALUES ((SELECT id FROM classes WHERE code='G10'),
        (SELECT id FROM items WHERE name='Printed Math Copy'), 3),
       ((SELECT id FROM classes WHERE code='G9'),
        (SELECT id FROM items WHERE name='Printed Math Copy'), 2);
SELECT expect_eq((SELECT count(*)::integer FROM curriculum_items
                   WHERE item_id=(SELECT id FROM items WHERE name='Printed Math Copy')),
                 2, 'one copy belongs to two classes with different quantities');

\echo ''
\echo '================ 8. duplicate detection and merge ================'

INSERT INTO items (name, publisher, type, price)
VALUES ('physics-ix', 'STBB', 'BOOK', 375.00);
SELECT fn_restock((SELECT id FROM items WHERE name='physics-ix'), 6, NULL,
                  (SELECT id FROM users WHERE email='admin@test'), 'dupe stock');

SELECT expect_eq((SELECT count(*)::integer FROM v_possible_duplicate_items),
                 1, 'normalised names flag the duplicate');

SELECT fn_merge_items((SELECT id FROM items WHERE name='Physics IX'),
                      (SELECT id FROM items WHERE name='physics-ix'),
                      (SELECT id FROM users WHERE email='admin@test'));
SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name='Physics IX'),
                 10, 'merged stock moved across (4 + 6)');
SELECT expect_eq((SELECT quantity_on_hand FROM items WHERE name LIKE 'physics-ix%'),
                 0, 'loser left at zero');
SELECT expect_eq((SELECT is_active FROM items WHERE name LIKE 'physics-ix%'),
                 false, 'loser deactivated');
SELECT expect_eq((SELECT count(*)::integer FROM item_aliases
                   WHERE normalized_alias = fn_normalize('physics-ix')),
                 1, 'old name kept as an alias so search still finds it');

\echo ''
\echo '================ 9. reporting views ================'

SELECT expect_eq((SELECT count(*)::integer FROM v_pending_inventory),
                 0, 'no backorders outstanding after fulfilment');
SELECT expect_eq((SELECT count(*)::integer FROM v_low_stock WHERE item_id =
                   (SELECT id FROM items WHERE name='Printed Math Copy')),
                 0, 'a well-stocked copy is not flagged low');

\echo ''
\echo '================ 10. the self-audit ================'

SELECT expect_eq((SELECT count(*)::integer FROM fn_verify_stock_integrity()),
                 0, 'ledger and cached quantities agree for every item');

\echo ''
\echo 'ALL INVARIANT TESTS PASSED'
