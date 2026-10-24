# Database setup

Run these in order, once, against the empty Supabase database.

```
001_init.sql        enums, helper functions, users, classes, items, curriculum
002_ledgers.sql     sales, sale lines, returns, payments, stock ledger, plumbing
003_integrity.sql   the triggers and functions that make stock corruption impossible
004_lockdown.sql    RLS on with no policies, so a leaked anon key can do nothing
```

Two ways to apply them:

**Supabase SQL editor** — open each file, paste, run, in order. Each file is
a single transaction, so a failure leaves nothing half-applied.

**psql** — from a machine that can reach port 5432:

```
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f prisma/sql/001_init.sql \
  -f prisma/sql/002_ledgers.sql \
  -f prisma/sql/003_integrity.sql \
  -f prisma/sql/004_lockdown.sql
```

Then seed the catalogue:

```
npm run db:seed
```

## The contract for application code

Stock is not a column you write. It is the running total of an append-only
ledger, and the database enforces that:

* `items.quantity_on_hand` rejects any direct `UPDATE` or non-zero `INSERT`.
  Use `fn_take_stock`, `fn_restock`, `fn_adjust_stock`, or
  `fn_fulfill_backorder`.
* `stock_movements`, `payments` and `return_lines` reject `UPDATE` and
  `DELETE`. Corrections are new rows, never edits.
* `sales.balance_due` and friends are recomputed by trigger from the payment
  and return ledgers. To change what someone owes, insert a payment or a
  return.
* `sale_lines.qty`, `unit_price` and `line_total` are immutable after
  checkout.

`SELECT * FROM fn_verify_stock_integrity();` must always return zero rows.
Every row it returns is a bug. Run it nightly.
