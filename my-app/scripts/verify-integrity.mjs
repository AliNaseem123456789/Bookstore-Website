#!/usr/bin/env node
/**
 * The nightly self-audit.
 *
 * Exits 0 when the stock ledger and every item's recorded quantity agree, and
 * 1 when they do not. Point cron at it and alert on a non-zero exit:
 *
 *   0 3 * * *  cd /srv/bookstore && node scripts/verify-integrity.mjs
 *
 * This should never fail. The schema is built so it cannot — every failure is
 * a real bug worth investigating immediately.
 */
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}


/** Matches src/db/ssl.ts: no TLS locally, relaxed TLS for hosted Postgres. */
function sslFor(connectionString) {
  const override = process.env.DATABASE_SSL;
  if (override === "disable") return false;
  if (override === "require") return { rejectUnauthorized: false };
  let host = "";
  let sslmode = "";
  try {
    const u = new URL(connectionString);
    host = u.hostname;
    sslmode = u.searchParams.get("sslmode") ?? "";
  } catch {
    return { rejectUnauthorized: false };
  }
  if (sslmode === "disable") return false;
  const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0", ""].includes(host);
  return local ? false : { rejectUnauthorized: false };
}

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });

async function main() {
  await client.connect();

  const { rows: drift } = await client.query(
    "SELECT item_id, item_name, cached, ledger FROM fn_verify_stock_integrity()",
  );

  // A second, independent check: the fulfilment counters on every sale line
  // must still add up to what was ordered.
  const { rows: lines } = await client.query(`
    SELECT id, sale_id, item_name_snapshot, qty,
           qty_delivered, qty_backordered, qty_cancelled, qty_returned
      FROM sale_lines
     WHERE qty_delivered + qty_backordered + qty_cancelled <> qty
        OR qty_returned > qty_delivered
  `);

  // And a third: no sale's balance may disagree with its own ledgers.
  const { rows: money } = await client.query(`
    SELECT s.id, s.code, s.balance_due AS recorded,
           (s.gross_total
             - coalesce((SELECT sum(rl.refund_amount) FROM return_lines rl
                          JOIN sale_returns sr ON sr.id = rl.return_id
                         WHERE sr.sale_id = s.id), 0)
             - coalesce((SELECT sum(amount) FROM payments
                         WHERE sale_id = s.id), 0)
           ) AS computed
      FROM sales s
  `);
  const moneyDrift = money.filter(
    (r) => Math.abs(Number(r.recorded) - Number(r.computed)) > 0.005,
  );

  let failed = false;

  if (drift.length) {
    failed = true;
    console.error(`STOCK DRIFT on ${drift.length} item(s):`);
    for (const r of drift) {
      console.error(
        `  item ${r.item_id} (${r.item_name}): recorded ${r.cached}, ledger says ${r.ledger}`,
      );
    }
  }
  if (lines.length) {
    failed = true;
    console.error(`FULFILMENT COUNTERS wrong on ${lines.length} sale line(s):`);
    for (const r of lines) {
      console.error(
        `  line ${r.id} (sale ${r.sale_id}, ${r.item_name_snapshot}): ` +
          `ordered ${r.qty}, delivered ${r.qty_delivered}, ` +
          `backordered ${r.qty_backordered}, cancelled ${r.qty_cancelled}, ` +
          `returned ${r.qty_returned}`,
      );
    }
  }
  if (moneyDrift.length) {
    failed = true;
    console.error(`BALANCE DRIFT on ${moneyDrift.length} sale(s):`);
    for (const r of moneyDrift) {
      console.error(
        `  ${r.code}: recorded ${r.recorded}, ledgers say ${r.computed}`,
      );
    }
  }

  if (failed) process.exitCode = 1;
  else {
    const { rows: counts } = await client.query(`
      SELECT (SELECT count(*) FROM items)::int           AS items,
             (SELECT count(*) FROM stock_movements)::int AS movements,
             (SELECT count(*) FROM sales)::int           AS sales
    `);
    const c = counts[0];
    console.log(
      `All clear. ${c.items} items, ${c.movements} stock movements, ${c.sales} sales — ` +
        `stock, fulfilment counters and balances all reconcile.`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exit(1);
  })
  .finally(() => client.end());
