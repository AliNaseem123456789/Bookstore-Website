import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/**
 * All aggregation happens in SQL.
 *
 * The old dashboard pulled every sale row into the browser and reduced it in
 * JavaScript, which is both slow and wrong at volume (it silently stopped at
 * whatever the query returned). These are GROUP BYs on indexed columns.
 */

export type Range = { from: Date; to: Date };

function bounds(range: Range) {
  const from = new Date(range.from);
  from.setHours(0, 0, 0, 0);
  const to = new Date(range.to);
  to.setHours(23, 59, 59, 999);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Headline numbers for the period. */
export async function storeOverview(range: Range) {
  const { from, to } = bounds(range);

  const { rows } = await db.execute(sql`
    WITH period AS (
      SELECT s.id, s.gross_total, s.discount_total, s.return_credit,
             s.amount_received, s.balance_due
        FROM sales s
       WHERE s.status = 'COMPLETED'
         AND s.sold_at BETWEEN ${from} AND ${to}
    ),
    units AS (
      SELECT coalesce(sum(sl.qty), 0)::int        AS units_sold,
             coalesce(sum(sl.qty_backordered), 0)::int AS units_backordered
        FROM sale_lines sl JOIN period p ON p.id = sl.sale_id
    )
    SELECT (SELECT count(*) FROM period)::int                        AS transactions,
           (SELECT coalesce(sum(gross_total), 0) FROM period)        AS revenue,
           (SELECT coalesce(sum(discount_total), 0) FROM period)     AS discounts,
           (SELECT coalesce(sum(return_credit), 0) FROM period)      AS returns_credited,
           (SELECT coalesce(sum(amount_received), 0) FROM period)    AS collected,
           (SELECT coalesce(sum(balance_due), 0) FROM period
             WHERE balance_due > 0)                                  AS outstanding,
           (SELECT units_sold FROM units)                            AS units_sold,
           (SELECT units_backordered FROM units)                     AS units_backordered
  `);

  const r = rows[0] as Record<string, string | number>;
  const transactions = Number(r.transactions);
  const revenue = Number(r.revenue);

  return {
    transactions,
    revenue,
    discounts: Number(r.discounts),
    returnsCredited: Number(r.returns_credited),
    collected: Number(r.collected),
    outstanding: Number(r.outstanding),
    unitsSold: Number(r.units_sold),
    unitsBackordered: Number(r.units_backordered),
    averageBasket: transactions ? Math.round((revenue / transactions) * 100) / 100 : 0,
  };
}

/**
 * Who sold what. This is the question the whole system exists to answer, so
 * it returns everything needed to rank and compare people in one go.
 */
export async function sellerPerformance(range: Range) {
  const { from, to } = bounds(range);

  const { rows } = await db.execute(sql`
    SELECT u.id                                        AS user_id,
           u.name                                      AS user_name,
           u.email                                     AS user_email,
           u.role::text                                AS role,
           count(DISTINCT s.id)::int                   AS transactions,
           coalesce(sum(s.gross_total), 0)             AS revenue,
           coalesce(sum(s.discount_total), 0)          AS discounts,
           coalesce(sum(sl.units), 0)::int             AS units,
           count(DISTINCT s.id) FILTER (WHERE s.balance_due > 0)::int AS credit_sales,
           coalesce(sum(s.balance_due) FILTER (WHERE s.balance_due > 0), 0) AS outstanding
      FROM users u
      LEFT JOIN sales s
        ON s.sold_by_user_id = u.id
       AND s.status = 'COMPLETED'
       AND s.sold_at BETWEEN ${from} AND ${to}
      LEFT JOIN (
        SELECT sale_id, sum(qty)::int AS units FROM sale_lines GROUP BY sale_id
      ) sl ON sl.sale_id = s.id
     WHERE u.is_active
     GROUP BY u.id, u.name, u.email, u.role
     ORDER BY revenue DESC, u.name
  `);

  return (
    rows as unknown as Array<Record<string, string | number>>
  ).map((r) => {
    const revenue = Number(r.revenue);
    const units = Number(r.units);
    const transactions = Number(r.transactions);
    return {
      userId: Number(r.user_id),
      userName: String(r.user_name),
      userEmail: String(r.user_email),
      role: String(r.role),
      transactions,
      revenue,
      discounts: Number(r.discounts),
      units,
      creditSales: Number(r.credit_sales),
      outstanding: Number(r.outstanding),
      averageBasket: transactions ? Math.round((revenue / transactions) * 100) / 100 : 0,
      revenuePerUnit: units ? Math.round((revenue / units) * 100) / 100 : 0,
    };
  });
}

/** Revenue per day, for the trend chart. */
export async function dailyRevenue(range: Range) {
  const { from, to } = bounds(range);
  const { rows } = await db.execute(sql`
    SELECT to_char(d.day, 'YYYY-MM-DD')                 AS day,
           coalesce(sum(s.gross_total), 0)              AS revenue,
           count(s.id)::int                             AS transactions,
           coalesce(sum(sl.units), 0)::int              AS units
      FROM generate_series(${from}::timestamptz, ${to}::timestamptz, interval '1 day') AS d(day)
      LEFT JOIN sales s
        ON s.status = 'COMPLETED'
       AND s.sold_at >= date_trunc('day', d.day)
       AND s.sold_at <  date_trunc('day', d.day) + interval '1 day'
      LEFT JOIN (
        SELECT sale_id, sum(qty)::int AS units FROM sale_lines GROUP BY sale_id
      ) sl ON sl.sale_id = s.id
     GROUP BY d.day
     ORDER BY d.day
  `);

  return (rows as unknown as Array<Record<string, string | number>>).map((r) => ({
    day: String(r.day),
    revenue: Number(r.revenue),
    transactions: Number(r.transactions),
    units: Number(r.units),
  }));
}

/** Best sellers by units, with revenue alongside. */
export async function topItems(range: Range, limit = 15) {
  const { from, to } = bounds(range);
  const { rows } = await db.execute(sql`
    SELECT sl.item_id                       AS item_id,
           sl.item_name_snapshot            AS name,
           sum(sl.qty)::int                 AS units,
           sum(sl.line_total)               AS revenue,
           sum(sl.qty_backordered)::int     AS backordered
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
     WHERE s.status = 'COMPLETED' AND s.sold_at BETWEEN ${from} AND ${to}
     GROUP BY sl.item_id, sl.item_name_snapshot
     ORDER BY units DESC
     LIMIT ${limit}
  `);

  return (rows as unknown as Array<Record<string, string | number>>).map((r) => ({
    itemId: Number(r.item_id),
    name: String(r.name),
    units: Number(r.units),
    revenue: Number(r.revenue),
    backordered: Number(r.backordered),
  }));
}

/** Revenue split by class, so the busiest grades are visible. */
export async function revenueByClass(range: Range) {
  const { from, to } = bounds(range);
  const { rows } = await db.execute(sql`
    SELECT coalesce(c.name, 'Loose items')  AS class_name,
           coalesce(c.sort_order, 9999)     AS sort_order,
           sum(sl.qty)::int                 AS units,
           sum(sl.line_total)               AS revenue
      FROM sale_lines sl
      JOIN sales s ON s.id = sl.sale_id
      LEFT JOIN classes c ON c.id = sl.class_id
     WHERE s.status = 'COMPLETED' AND s.sold_at BETWEEN ${from} AND ${to}
     GROUP BY c.name, c.sort_order
     ORDER BY sort_order
  `);

  return (rows as unknown as Array<Record<string, string | number>>).map((r) => ({
    className: String(r.class_name),
    units: Number(r.units),
    revenue: Number(r.revenue),
  }));
}

/** Receivables by age bucket — how stale the outstanding money is. */
export async function receivablesAging() {
  const { rows } = await db.execute(sql`
    SELECT CASE
             WHEN now() - sold_at < interval '7 days'  THEN '0-7 days'
             WHEN now() - sold_at < interval '30 days' THEN '8-30 days'
             WHEN now() - sold_at < interval '90 days' THEN '31-90 days'
             ELSE '90+ days'
           END                               AS bucket,
           CASE
             WHEN now() - sold_at < interval '7 days'  THEN 1
             WHEN now() - sold_at < interval '30 days' THEN 2
             WHEN now() - sold_at < interval '90 days' THEN 3
             ELSE 4
           END                               AS sort_order,
           count(*)::int                     AS sales,
           sum(balance_due)                  AS amount
      FROM sales
     WHERE balance_due > 0 AND status = 'COMPLETED'
     GROUP BY bucket, sort_order
     ORDER BY sort_order
  `);

  return (rows as unknown as Array<Record<string, string | number>>).map((r) => ({
    bucket: String(r.bucket),
    sales: Number(r.sales),
    amount: Number(r.amount),
  }));
}

/** Value sitting on the shelves, and how much of it is already promised. */
export async function stockValuation() {
  const { rows } = await db.execute(sql`
    SELECT type::text                                     AS type,
           count(*)::int                                   AS lines,
           sum(quantity_on_hand)::int                      AS units,
           sum(quantity_on_hand * price)                   AS value
      FROM items
     WHERE is_active
     GROUP BY type
     ORDER BY type
  `);

  return (rows as unknown as Array<Record<string, string | number>>).map((r) => ({
    type: String(r.type),
    lines: Number(r.lines),
    units: Number(r.units),
    value: Number(r.value),
  }));
}

/** Everything the dashboard needs, in one round trip. */
export async function dashboard(range: Range) {
  const [overview, sellers, daily, items, byClass, aging, valuation] = await Promise.all([
    storeOverview(range),
    sellerPerformance(range),
    dailyRevenue(range),
    topItems(range),
    revenueByClass(range),
    receivablesAging(),
    stockValuation(),
  ]);
  return { overview, sellers, daily, topItems: items, byClass, aging, valuation };
}
