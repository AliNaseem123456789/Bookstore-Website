#!/usr/bin/env bash
# Concurrency proof: hammer the checkout function from many simultaneous
# connections and assert that stock is never duplicated, never
# under-recorded, and that overlapping multi-item orders never deadlock.
set -uo pipefail

PSQL="psql -h /tmp/pgsock -p 5433 -U postgres -d bookstore -tA"
fail=0

q() { $PSQL -c "$1"; }

setup() {
  # TRUNCATE rather than DELETE: the ledgers refuse DELETE by design, and a
  # cascading DELETE from items/users would hit that guard. TRUNCATE is an
  # owner-only reset and does not fire the row triggers.
  $PSQL -q <<'SQL'
TRUNCATE users, items, classes, item_aliases, price_history,
         elective_groups, curriculum_items,
         sales, sale_lines, sale_returns, return_lines, payments,
         stock_movements, restock_batches, audit_log, idempotency_keys
  RESTART IDENTITY CASCADE;
INSERT INTO users (id, email, name, password_hash, role)
VALUES (1, 'c@test', 'Cashier', 'x', 'CASHIER');
SELECT setval('users_id_seq', 10);
INSERT INTO items (id, name, price) VALUES
  (1, 'Contested Book', 100.00),
  (2, 'Other Book',     200.00),
  (3, 'Third Book',     300.00);
SELECT setval('items_id_seq', 10);
SQL
}

check() { # label expected actual
  if [ "$2" = "$3" ]; then
    echo "PASS  $1 = $3"
  else
    echo "FAIL  $1 — got $3, want $2"
    fail=1
  fi
}

# =====================================================================
echo ""
echo "=== A. 20 cashiers race for 5 copies of the same book ==="
# Every one of them asks for 1. Exactly 5 units exist. If the old
# read-then-write pattern were still in place, several would read "5" at
# once and all believe they got one.
setup
q "SELECT fn_restock(1, 5, NULL, 1, 'opening');" > /dev/null

for i in $(seq 1 20); do
  $PSQL -q -c "SELECT fn_create_sale('Racer $i', NULL, 1,
      jsonb_build_array(jsonb_build_object('item_id', 1, 'qty', 1)));" \
      > /dev/null 2>>/tmp/raceA.err &
done
wait

check "sales created"            20 "$(q 'SELECT count(*) FROM sales;')"
check "units actually delivered"  5 "$(q 'SELECT coalesce(sum(qty_delivered),0) FROM sale_lines;')"
check "units backordered"        15 "$(q 'SELECT coalesce(sum(qty_backordered),0) FROM sale_lines;')"
check "stock left on shelf"       0 "$(q 'SELECT quantity_on_hand FROM items WHERE id=1;')"
check "ledger sums to -5"        -5 "$(q 'SELECT coalesce(sum(delta),0) FROM stock_movements WHERE reason=$$SALE$$;')"
check "integrity violations"      0 "$(q 'SELECT count(*) FROM fn_verify_stock_integrity();')"
check "no negative balance ever"  0 "$(q 'SELECT count(*) FROM stock_movements WHERE balance_after < 0;')"

# =====================================================================
echo ""
echo "=== B. 30 cashiers each buy 3 copies, 60 in stock ==="
# 90 requested, 60 available: exactly 60 go out, 30 are backordered.
setup
q "SELECT fn_restock(1, 60, NULL, 1, 'opening');" > /dev/null

for i in $(seq 1 30); do
  $PSQL -q -c "SELECT fn_create_sale('Bulk $i', NULL, 1,
      jsonb_build_array(jsonb_build_object('item_id', 1, 'qty', 3)));" \
      > /dev/null 2>>/tmp/raceB.err &
done
wait

check "sales created"           30 "$(q 'SELECT count(*) FROM sales;')"
check "units delivered"         60 "$(q 'SELECT coalesce(sum(qty_delivered),0) FROM sale_lines;')"
check "units backordered"       30 "$(q 'SELECT coalesce(sum(qty_backordered),0) FROM sale_lines;')"
check "stock left"               0 "$(q 'SELECT quantity_on_hand FROM items WHERE id=1;')"
check "integrity violations"     0 "$(q 'SELECT count(*) FROM fn_verify_stock_integrity();')"
# Every line is all-or-nothing per unit, so delivered+backordered must
# equal what was ordered on every single line.
check "fulfilment adds up"       0 "$(q 'SELECT count(*) FROM sale_lines WHERE qty_delivered + qty_backordered + qty_cancelled <> qty;')"

# =====================================================================
echo ""
echo "=== C. overlapping multi-item orders in opposite order (deadlock) ==="
# Half the cashiers list item 1 then 3; the other half list 3 then 1.
# fn_create_sale sorts by item_id internally, so both halves take locks in
# the same sequence and nothing deadlocks.
setup
q "SELECT fn_restock(1, 100, NULL, 1, 'o'); SELECT fn_restock(3, 100, NULL, 1, 'o');" > /dev/null
: > /tmp/raceC.err

for i in $(seq 1 15); do
  $PSQL -q -c "SELECT fn_create_sale('Fwd $i', NULL, 1, jsonb_build_array(
      jsonb_build_object('item_id', 1, 'qty', 2),
      jsonb_build_object('item_id', 3, 'qty', 2)));" > /dev/null 2>>/tmp/raceC.err &
  $PSQL -q -c "SELECT fn_create_sale('Rev $i', NULL, 1, jsonb_build_array(
      jsonb_build_object('item_id', 3, 'qty', 2),
      jsonb_build_object('item_id', 1, 'qty', 2)));" > /dev/null 2>>/tmp/raceC.err &
done
wait

deadlocks=$(grep -ci "deadlock" /tmp/raceC.err 2>/dev/null; true)
deadlocks=${deadlocks:-0}
check "deadlocks"                0 "$deadlocks"
check "sales created"           30 "$(q 'SELECT count(*) FROM sales;')"
check "item 1 stock (100-60)"   40 "$(q 'SELECT quantity_on_hand FROM items WHERE id=1;')"
check "item 3 stock (100-60)"   40 "$(q 'SELECT quantity_on_hand FROM items WHERE id=3;')"
check "integrity violations"     0 "$(q 'SELECT count(*) FROM fn_verify_stock_integrity();')"

# =====================================================================
echo ""
echo "=== D. same book twice in one order is merged, not double-locked ==="
# A buyer taking the Class 9 course AND the Class 10 course where both
# include the same copy: two entries for one item in a single checkout.
setup
q "SELECT fn_restock(1, 10, NULL, 1, 'opening');" > /dev/null
q "SELECT fn_create_sale('Merged', NULL, 1, jsonb_build_array(
     jsonb_build_object('item_id', 1, 'qty', 3),
     jsonb_build_object('item_id', 1, 'qty', 4)));" > /dev/null

check "one line, not two"        1 "$(q 'SELECT count(*) FROM sale_lines;')"
check "quantities combined"      7 "$(q 'SELECT qty FROM sale_lines;')"
check "stock deducted once"      3 "$(q 'SELECT quantity_on_hand FROM items WHERE id=1;')"
check "integrity violations"     0 "$(q 'SELECT count(*) FROM fn_verify_stock_integrity();')"

# =====================================================================
echo ""
echo "=== E. 20 simultaneous payments on one credit sale ==="
# Each tries to pay 100 against a 1000 bill. Over-payment must be
# impossible: exactly 10 can succeed.
setup
q "SELECT fn_restock(1, 100, NULL, 1, 'o');" > /dev/null
q "SELECT fn_create_sale('Debtor', NULL, 1, jsonb_build_array(
     jsonb_build_object('item_id', 1, 'qty', 10)));" > /dev/null
: > /tmp/raceE.err

for i in $(seq 1 20); do
  $PSQL -q -c "SELECT fn_record_payment(1, 100, 'CASH', 1);" \
    > /dev/null 2>>/tmp/raceE.err &
done
wait

check "payments accepted"       10 "$(q 'SELECT count(*) FROM payments;')"
check "total received"        1000 "$(q 'SELECT amount_received::integer FROM sales WHERE id=1;')"
check "balance cleared"          0 "$(q 'SELECT balance_due::integer FROM sales WHERE id=1;')"
check "never overpaid"           0 "$(q 'SELECT count(*) FROM sales WHERE balance_due < 0;')"

# =====================================================================
echo ""
echo "=== F. concurrent returns of the same line ==="
# 2 units were delivered; 5 clerks each try to return 2. Only one can win.
setup
q "SELECT fn_restock(1, 10, NULL, 1, 'o');" > /dev/null
q "SELECT fn_create_sale('Returner', NULL, 1, jsonb_build_array(
     jsonb_build_object('item_id', 1, 'qty', 2)));" > /dev/null
: > /tmp/raceF.err

for i in $(seq 1 5); do
  $PSQL -q -c "SELECT fn_create_return(1, 1, jsonb_build_array(
      jsonb_build_object('sale_line_id', 1, 'qty', 2, 'condition', 'RESELLABLE')));" \
      > /dev/null 2>>/tmp/raceF.err &
done
wait

check "returns accepted"         1 "$(q 'SELECT count(*) FROM return_lines;')"
check "units returned on line"   2 "$(q 'SELECT qty_returned FROM sale_lines WHERE id=1;')"
check "stock back to 10"        10 "$(q 'SELECT quantity_on_hand FROM items WHERE id=1;')"
check "integrity violations"     0 "$(q 'SELECT count(*) FROM fn_verify_stock_integrity();')"

echo ""
if [ "$fail" = "0" ]; then
  echo "ALL CONCURRENCY TESTS PASSED"
else
  echo "SOME CONCURRENCY TESTS FAILED"
fi
exit $fail
