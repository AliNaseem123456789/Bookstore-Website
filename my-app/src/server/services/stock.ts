import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  items,
  restockBatches,
  saleLines,
  sales,
  stockMovements,
  users,
} from "@/db/schema";
import { badRequest } from "../http";

/**
 * Receive new stock as one batch.
 *
 * Every unit lands in the ledger with a reason and a batch reference, which
 * is what makes "where did these 40 copies come from?" answerable months
 * later. Blank rows in the bulk-entry grid are skipped, not treated as zero.
 */
export async function receiveStock(
  input: {
    lines: Array<{ itemId: number; qty: number }>;
    supplier?: string | null;
    note?: string | null;
  },
  actorId: number,
) {
  const usable = input.lines.filter((l) => l.qty && l.qty > 0);
  if (!usable.length) throw badRequest("Enter a quantity for at least one item.");

  const payload = usable.map((l) => ({ item_id: l.itemId, qty: l.qty }));

  const { rows } = await db.execute(sql`
    SELECT fn_receive_stock(${actorId}, ${JSON.stringify(payload)}::jsonb,
                            ${input.supplier ?? null}, ${input.note ?? null}) AS batch_id
  `);
  const batchId = Number((rows[0] as { batch_id: number }).batch_id);

  const [batch] = await db
    .select()
    .from(restockBatches)
    .where(eq(restockBatches.id, batchId))
    .limit(1);

  return batch;
}

/** Correct stock to a counted shelf figure. Admin only; a reason is required. */
export async function correctStock(
  input: { itemId: number; countedQty: number; reason: string },
  actorId: number,
) {
  if (input.countedQty < 0) throw badRequest("A counted quantity cannot be negative.");
  if (!input.reason?.trim()) throw badRequest("A correction needs a reason.");

  const { rows } = await db.execute(sql`
    SELECT fn_adjust_stock(${input.itemId}, ${input.countedQty}, ${actorId},
                           ${input.reason.trim()}) AS new_qty
  `);
  return Number((rows[0] as { new_qty: number }).new_qty);
}

/**
 * Hand over goods that were previously backordered.
 *
 * This is the step the old system never did: it marked backorders
 * "delivered" without touching stock, so handing over a book was invisible
 * to inventory. Here it deducts stock, in the same transaction, and refuses
 * if the stock is not physically there.
 */
export async function fulfillBackorders(
  input: { lines: Array<{ saleLineId: number; qty: number }> },
  actorId: number,
) {
  if (!input.lines?.length) throw badRequest("Nothing selected to hand over.");

  return db.transaction(async (tx) => {
    const done: Array<{ saleLineId: number; qty: number }> = [];
    // Ascending id keeps the lock order consistent with everything else.
    for (const line of [...input.lines].sort((a, b) => a.saleLineId - b.saleLineId)) {
      if (!line.qty || line.qty < 1) continue;
      await tx.execute(
        sql`SELECT fn_fulfill_backorder(${line.saleLineId}, ${line.qty}, ${actorId})`,
      );
      done.push(line);
    }
    if (!done.length) throw badRequest("Nothing selected to hand over.");
    return { fulfilled: done };
  });
}

/** Outstanding backorders grouped by buyer, for the fulfilment worklist. */
export async function listBackorders() {
  const rows = await db
    .select({
      saleId: sales.id,
      saleCode: sales.code,
      buyerName: sales.buyerName,
      buyerPhone: sales.buyerPhone,
      soldAt: sales.soldAt,
      lineId: saleLines.id,
      itemId: saleLines.itemId,
      itemName: saleLines.itemNameSnapshot,
      qtyBackordered: saleLines.qtyBackordered,
      availableNow: items.quantityOnHand,
      daysWaiting: sql<number>`EXTRACT(DAY FROM (now() - ${sales.soldAt}))::int`,
    })
    .from(saleLines)
    .innerJoin(sales, eq(sales.id, saleLines.saleId))
    .innerJoin(items, eq(items.id, saleLines.itemId))
    .where(and(sql`${saleLines.qtyBackordered} > 0`, eq(sales.status, "COMPLETED")))
    .orderBy(sales.soldAt);

  const groups = new Map<
    number,
    {
      saleId: number;
      saleCode: string;
      buyerName: string;
      buyerPhone: string | null;
      soldAt: Date;
      daysWaiting: number;
      lines: Array<{
        lineId: number;
        itemId: number;
        itemName: string;
        qtyBackordered: number;
        availableNow: number;
        canFulfill: number;
      }>;
    }
  >();

  for (const r of rows) {
    const group =
      groups.get(r.saleId) ??
      {
        saleId: r.saleId,
        saleCode: r.saleCode,
        buyerName: r.buyerName,
        buyerPhone: r.buyerPhone,
        soldAt: r.soldAt,
        daysWaiting: r.daysWaiting,
        lines: [],
      };
    group.lines.push({
      lineId: r.lineId,
      itemId: r.itemId,
      itemName: r.itemName,
      qtyBackordered: r.qtyBackordered,
      availableNow: r.availableNow,
      canFulfill: Math.min(r.qtyBackordered, r.availableNow),
    });
    groups.set(r.saleId, group);
  }

  return [...groups.values()];
}

/**
 * What to reorder: total units owed to buyers per item, against what is on
 * the shelf. This is the old Pending Inventory page, but correct — it reads
 * the fulfilment counters rather than a separate backorder table that could
 * disagree with them.
 */
export async function pendingInventory() {
  const { rows } = await db.execute(sql`
    SELECT item_id, code, name, type::text AS type, quantity_on_hand,
           pending_qty, waiting_sales, oldest_order_at
      FROM v_pending_inventory
     ORDER BY pending_qty DESC, name
  `);
  return (
    rows as unknown as Array<{
      item_id: number;
      code: string;
      name: string;
      type: string;
      quantity_on_hand: number;
      pending_qty: number;
      waiting_sales: number;
      oldest_order_at: string;
    }>
  ).map((r) => ({
    itemId: r.item_id,
    code: r.code,
    name: r.name,
    type: r.type,
    quantityOnHand: r.quantity_on_hand,
    pendingQty: r.pending_qty,
    waitingSales: r.waiting_sales,
    oldestOrderAt: r.oldest_order_at,
    shortBy: Math.max(0, r.pending_qty - r.quantity_on_hand),
  }));
}

/** Items at or below their reorder level, net of what is already promised. */
export async function lowStock() {
  const { rows } = await db.execute(sql`
    SELECT item_id, code, name, type::text AS type,
           quantity_on_hand, reorder_level, committed_qty, free_qty
      FROM v_low_stock
     ORDER BY free_qty ASC, name
  `);
  return (
    rows as unknown as Array<{
      item_id: number;
      code: string;
      name: string;
      type: string;
      quantity_on_hand: number;
      reorder_level: number;
      committed_qty: number;
      free_qty: number;
    }>
  ).map((r) => ({
    itemId: r.item_id,
    code: r.code,
    name: r.name,
    type: r.type,
    quantityOnHand: r.quantity_on_hand,
    reorderLevel: r.reorder_level,
    committedQty: r.committed_qty,
    freeQty: r.free_qty,
  }));
}

/** The ledger for one item, or across the shop — the stock audit trail. */
export async function stockHistory(opts: {
  itemId?: number;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);

  const rows = await db
    .select({
      id: stockMovements.id,
      itemId: stockMovements.itemId,
      itemName: items.name,
      delta: stockMovements.delta,
      reason: stockMovements.reason,
      balanceAfter: stockMovements.balanceAfter,
      refType: stockMovements.refType,
      refId: stockMovements.refId,
      note: stockMovements.note,
      createdAt: stockMovements.createdAt,
      actorName: users.name,
    })
    .from(stockMovements)
    .innerJoin(items, eq(items.id, stockMovements.itemId))
    .leftJoin(users, eq(users.id, stockMovements.createdByUserId))
    .where(opts.itemId ? eq(stockMovements.itemId, opts.itemId) : undefined)
    .orderBy(desc(stockMovements.id))
    .limit(limit + 1)
    .offset(opts.offset ?? 0);

  return {
    movements: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextOffset: (opts.offset ?? 0) + limit,
  };
}

export async function listRestockBatches(limit = 50) {
  return db
    .select({
      id: restockBatches.id,
      code: restockBatches.code,
      supplier: restockBatches.supplier,
      note: restockBatches.note,
      totalUnits: restockBatches.totalUnits,
      createdAt: restockBatches.createdAt,
      receivedBy: users.name,
    })
    .from(restockBatches)
    .innerJoin(users, eq(users.id, restockBatches.receivedById))
    .orderBy(desc(restockBatches.createdAt))
    .limit(limit);
}

/**
 * The self-audit. Must always return an empty list: every row means the
 * ledger and the cached quantity disagree, which should be impossible.
 * Exposed in the UI and runnable from cron so a bug cannot hide.
 */
export async function verifyStockIntegrity() {
  const { rows } = await db.execute(
    sql`SELECT item_id, item_name, cached, ledger FROM fn_verify_stock_integrity()`,
  );
  return rows as unknown as Array<{
    item_id: number;
    item_name: string;
    cached: number;
    ledger: string;
  }>;
}
