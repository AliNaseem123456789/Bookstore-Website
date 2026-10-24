import { and, desc, eq, gt, ilike, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { classes, payments, saleLines, saleReturns, sales, users } from "@/db/schema";
import { badRequest, notFound } from "../http";
import { validateElectiveSelection } from "./curriculum";

export type CheckoutLine = {
  itemId: number;
  qty: number;
  lineDiscount?: number;
  classId?: number | null;
  fromFullCourse?: boolean;
};

export type CheckoutInput = {
  buyerName: string;
  buyerPhone?: string | null;
  lines: CheckoutLine[];
  orderDiscount?: number;
  amountPaid?: number;
  paymentMethod?: "CASH" | "CARD" | "BANK_TRANSFER";
  note?: string | null;
};

/**
 * Ring up a sale.
 *
 * All of the dangerous work — pricing from the catalogue, locking items in a
 * deadlock-free order, deducting stock, deciding what is backordered — happens
 * inside `fn_create_sale`, a single database call that either fully happens or
 * fully does not. The optional opening payment is recorded in the same
 * transaction, so a sale can never exist without its money, or vice versa.
 *
 * Unit prices are NOT taken from the client. A tampered request cannot set
 * its own price.
 */
export async function checkout(input: CheckoutInput, actorId: number) {
  if (!input.buyerName?.trim()) throw badRequest("Enter the buyer's name.");
  if (!input.lines?.length) throw badRequest("Add at least one item.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      throw badRequest("Every line needs a quantity of at least 1.");
    }
  }

  // Enforce elective rules per class before we touch the database: a Class 9
  // course must include exactly one of Biology / Computer.
  const byClass = new Map<number, number[]>();
  for (const line of input.lines) {
    if (line.fromFullCourse && line.classId) {
      const list = byClass.get(line.classId) ?? [];
      list.push(line.itemId);
      byClass.set(line.classId, list);
    }
  }
  for (const [classId, itemIds] of byClass) {
    const problems = await validateElectiveSelection(classId, itemIds);
    if (problems.length) throw badRequest(problems.join(" "));
  }

  const payload = input.lines.map((l) => ({
    item_id: l.itemId,
    qty: l.qty,
    line_discount: l.lineDiscount ?? 0,
    class_id: l.classId ?? null,
    from_full_course: l.fromFullCourse ?? false,
  }));

  return db.transaction(async (tx) => {
    const created = await tx.execute(sql`
      SELECT fn_create_sale(
        ${input.buyerName.trim()},
        ${input.buyerPhone?.trim() || null},
        ${actorId},
        ${JSON.stringify(payload)}::jsonb,
        ${input.orderDiscount ?? 0},
        ${input.note ?? null}
      ) AS sale_id
    `);
    const saleId = Number((created.rows[0] as { sale_id: number }).sale_id);

    if (input.amountPaid && input.amountPaid > 0) {
      await tx.execute(sql`
        SELECT fn_record_payment(
          ${saleId}, ${input.amountPaid},
          ${input.paymentMethod ?? "CASH"}::"PaymentMethod",
          ${actorId}, 'taken at checkout'
        )
      `);
    }

    return getSaleDetail(saleId, tx);
  });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type SaleDetail = Awaited<ReturnType<typeof getSaleDetail>>;

export async function getSaleDetail(saleId: number, conn: Tx | typeof db = db) {
  const [sale] = await conn
    .select({
      id: sales.id,
      code: sales.code,
      buyerName: sales.buyerName,
      buyerPhone: sales.buyerPhone,
      status: sales.status,
      subtotal: sales.subtotal,
      discountTotal: sales.discountTotal,
      grossTotal: sales.grossTotal,
      returnCredit: sales.returnCredit,
      amountReceived: sales.amountReceived,
      amountRefunded: sales.amountRefunded,
      balanceDue: sales.balanceDue,
      isSettled: sales.isSettled,
      note: sales.note,
      soldAt: sales.soldAt,
      soldById: sales.soldByUserId,
      soldByName: users.name,
      soldByEmail: users.email,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.soldByUserId))
    .where(eq(sales.id, saleId))
    .limit(1);

  if (!sale) throw notFound("That sale does not exist.");

  const lines = await conn
    .select({
      id: saleLines.id,
      itemId: saleLines.itemId,
      name: saleLines.itemNameSnapshot,
      unitPrice: saleLines.unitPrice,
      qty: saleLines.qty,
      lineDiscount: saleLines.lineDiscount,
      lineTotal: saleLines.lineTotal,
      qtyDelivered: saleLines.qtyDelivered,
      qtyBackordered: saleLines.qtyBackordered,
      qtyCancelled: saleLines.qtyCancelled,
      qtyReturned: saleLines.qtyReturned,
      classId: saleLines.classId,
      className: classes.name,
      fromFullCourse: saleLines.fromFullCourse,
    })
    .from(saleLines)
    .leftJoin(classes, eq(classes.id, saleLines.classId))
    .where(eq(saleLines.saleId, saleId))
    .orderBy(saleLines.id);

  const paymentRows = await conn
    .select({
      id: payments.id,
      amount: payments.amount,
      method: payments.method,
      note: payments.note,
      receivedAt: payments.receivedAt,
      receivedBy: users.name,
    })
    .from(payments)
    .innerJoin(users, eq(users.id, payments.receivedByUserId))
    .where(eq(payments.saleId, saleId))
    .orderBy(payments.receivedAt);

  const returnRows = await conn
    .select({
      id: saleReturns.id,
      code: saleReturns.code,
      reason: saleReturns.reason,
      creditTotal: saleReturns.creditTotal,
      createdAt: saleReturns.createdAt,
      createdBy: users.name,
    })
    .from(saleReturns)
    .innerJoin(users, eq(users.id, saleReturns.createdById))
    .where(eq(saleReturns.saleId, saleId))
    .orderBy(saleReturns.createdAt);

  return {
    id: sale.id,
    code: sale.code,
    buyerName: sale.buyerName,
    buyerPhone: sale.buyerPhone,
    status: sale.status,
    subtotal: Number(sale.subtotal),
    discountTotal: Number(sale.discountTotal),
    grossTotal: Number(sale.grossTotal),
    returnCredit: Number(sale.returnCredit),
    amountReceived: Number(sale.amountReceived),
    amountRefunded: Number(sale.amountRefunded),
    balanceDue: Number(sale.balanceDue),
    isSettled: sale.isSettled,
    note: sale.note,
    soldAt: sale.soldAt,
    soldBy: { id: sale.soldById, name: sale.soldByName, email: sale.soldByEmail },
    lines: lines.map((l) => ({
      ...l,
      unitPrice: Number(l.unitPrice),
      lineDiscount: Number(l.lineDiscount),
      lineTotal: Number(l.lineTotal),
    })),
    payments: paymentRows.map((p) => ({ ...p, amount: Number(p.amount) })),
    returns: returnRows.map((r) => ({ ...r, creditTotal: Number(r.creditTotal) })),
  };
}

export type SaleListFilter = {
  search?: string;
  sellerId?: number;
  unpaidOnly?: boolean;
  discountedOnly?: boolean;
  from?: Date;
  to?: Date;
  /** Cashiers may only ever see their own sales. */
  restrictToSellerId?: number;
  limit?: number;
  offset?: number;
};

export async function listSales(filter: SaleListFilter = {}) {
  const where = [];
  if (filter.restrictToSellerId) {
    where.push(eq(sales.soldByUserId, filter.restrictToSellerId));
  } else if (filter.sellerId) {
    where.push(eq(sales.soldByUserId, filter.sellerId));
  }
  if (filter.unpaidOnly) where.push(gt(sales.balanceDue, "0"));
  if (filter.discountedOnly) where.push(gt(sales.discountTotal, "0"));
  if (filter.from) where.push(sql`${sales.soldAt} >= ${filter.from.toISOString()}`);
  if (filter.to) where.push(sql`${sales.soldAt} <= ${filter.to.toISOString()}`);
  if (filter.search?.trim()) {
    const like = `%${filter.search.trim()}%`;
    where.push(sql`(${sales.buyerName} ILIKE ${like} OR ${sales.code} ILIKE ${like})`);
  }

  const limit = Math.min(filter.limit ?? 50, 200);

  const rows = await db
    .select({
      id: sales.id,
      code: sales.code,
      buyerName: sales.buyerName,
      grossTotal: sales.grossTotal,
      discountTotal: sales.discountTotal,
      amountReceived: sales.amountReceived,
      balanceDue: sales.balanceDue,
      isSettled: sales.isSettled,
      status: sales.status,
      soldAt: sales.soldAt,
      soldByName: users.name,
      itemCount: sql<number>`(
        SELECT coalesce(sum(qty), 0)::int FROM sale_lines WHERE sale_id = ${sales.id}
      )`,
      backorderCount: sql<number>`(
        SELECT coalesce(sum(qty_backordered), 0)::int FROM sale_lines
         WHERE sale_id = ${sales.id}
      )`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.soldByUserId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(sales.soldAt))
    .limit(limit + 1)
    .offset(filter.offset ?? 0);

  const hasMore = rows.length > limit;
  return {
    sales: rows.slice(0, limit).map((r) => ({
      ...r,
      grossTotal: Number(r.grossTotal),
      discountTotal: Number(r.discountTotal),
      amountReceived: Number(r.amountReceived),
      balanceDue: Number(r.balanceDue),
    })),
    hasMore,
    nextOffset: (filter.offset ?? 0) + limit,
  };
}

/** Outstanding balances, oldest debt first — the collections worklist. */
export async function listOutstanding(search?: string) {
  const where = [gt(sales.balanceDue, "0")];
  if (search?.trim()) {
    where.push(ilike(sales.buyerName, `%${search.trim()}%`));
  }

  const rows = await db
    .select({
      id: sales.id,
      code: sales.code,
      buyerName: sales.buyerName,
      buyerPhone: sales.buyerPhone,
      grossTotal: sales.grossTotal,
      amountReceived: sales.amountReceived,
      balanceDue: sales.balanceDue,
      soldAt: sales.soldAt,
      soldByName: users.name,
      daysOutstanding: sql<number>`EXTRACT(DAY FROM (now() - ${sales.soldAt}))::int`,
    })
    .from(sales)
    .innerJoin(users, eq(users.id, sales.soldByUserId))
    .where(and(...where))
    .orderBy(sales.soldAt);

  return rows.map((r) => ({
    ...r,
    grossTotal: Number(r.grossTotal),
    amountReceived: Number(r.amountReceived),
    balanceDue: Number(r.balanceDue),
  }));
}

/** Sales that the buyer has overpaid — the shop owes them money. */
export async function listCreditsOwed() {
  const rows = await db
    .select({
      id: sales.id,
      code: sales.code,
      buyerName: sales.buyerName,
      buyerPhone: sales.buyerPhone,
      balanceDue: sales.balanceDue,
      soldAt: sales.soldAt,
    })
    .from(sales)
    .where(sql`${sales.balanceDue} < 0`)
    .orderBy(sales.soldAt);

  return rows.map((r) => ({
    ...r,
    owedToBuyer: -Number(r.balanceDue),
  }));
}
