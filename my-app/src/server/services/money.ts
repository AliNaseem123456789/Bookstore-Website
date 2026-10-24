import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { badRequest } from "../http";
import { getSaleDetail } from "./selling";
import type { ReturnCondition } from "@/db/schema";

/**
 * Take a payment against an outstanding balance.
 *
 * `fn_record_payment` refuses anything larger than what is owed, so a
 * mistyped amount cannot create a phantom credit, and the sale's balance is
 * recalculated by trigger rather than by arithmetic in this file.
 */
export async function receivePayment(
  input: {
    saleId: number;
    amount: number;
    method?: "CASH" | "CARD" | "BANK_TRANSFER";
    note?: string | null;
  },
  actorId: number,
) {
  if (!(input.amount > 0)) throw badRequest("Enter an amount greater than zero.");

  await db.execute(sql`
    SELECT fn_record_payment(
      ${input.saleId}, ${input.amount},
      ${input.method ?? "CASH"}::"PaymentMethod",
      ${actorId}, ${input.note ?? null}
    )
  `);

  return getSaleDetail(input.saleId);
}

export type ReturnLineInput = {
  saleLineId: number;
  qty: number;
  condition: ReturnCondition;
};

/**
 * Raise a return.
 *
 * The refund value per unit is computed in the database from what the buyer
 * was actually charged, so a return can never credit more than was paid.
 * Condition drives what happens to the goods:
 *   RESELLABLE    -> back on the shelf (stock increases)
 *   DAMAGED       -> credited, written off, stock unchanged
 *   NOT_DELIVERED -> cancels an outstanding backorder, stock unchanged
 *
 * The credit lands on the sale's balance first. Cash only goes back out if
 * that leaves the buyer in credit, and that is a separate explicit step.
 */
export async function createReturn(
  input: {
    saleId: number;
    lines: ReturnLineInput[];
    reason?: string | null;
    /** Hand back any resulting credit in cash straight away. */
    payOutCredit?: boolean;
  },
  actorId: number,
) {
  if (!input.lines?.length) throw badRequest("Select at least one item to return.");
  for (const line of input.lines) {
    if (!Number.isInteger(line.qty) || line.qty < 1) {
      throw badRequest("Every returned line needs a quantity of at least 1.");
    }
  }

  const payload = input.lines.map((l) => ({
    sale_line_id: l.saleLineId,
    qty: l.qty,
    condition: l.condition,
  }));

  return db.transaction(async (tx) => {
    const created = await tx.execute(sql`
      SELECT fn_create_return(
        ${input.saleId}, ${actorId},
        ${JSON.stringify(payload)}::jsonb,
        ${input.reason ?? null}
      ) AS return_id
    `);
    const returnId = Number((created.rows[0] as { return_id: number }).return_id);

    if (input.payOutCredit) {
      const { rows } = await tx.execute(
        sql`SELECT balance_due FROM sales WHERE id = ${input.saleId}`,
      );
      const balance = Number((rows[0] as { balance_due: string }).balance_due);
      // A negative balance means the shop now owes the buyer.
      if (balance < 0) {
        await tx.execute(sql`
          SELECT fn_refund_payout(${input.saleId}, ${-balance}, ${actorId},
                                  ${returnId}, 'REFUND_CASH'::"PaymentMethod",
                                  'refund paid at counter')
        `);
      }
    }

    const sale = await getSaleDetail(input.saleId, tx);
    return { returnId, sale };
  });
}

/** Hand cash back on a sale the buyer has overpaid. */
export async function payOutRefund(
  input: { saleId: number; amount: number; note?: string | null },
  actorId: number,
) {
  if (!(input.amount > 0)) throw badRequest("Enter an amount greater than zero.");
  await db.execute(sql`
    SELECT fn_refund_payout(${input.saleId}, ${input.amount}, ${actorId},
                            NULL, 'REFUND_CASH'::"PaymentMethod",
                            ${input.note ?? null})
  `);
  return getSaleDetail(input.saleId);
}

/**
 * Write off a balance that will never be collected. Admin only, audited,
 * and recorded as a negative payment so the cash ledger still balances.
 */
export async function writeOffBalance(
  input: { saleId: number; reason: string },
  actorId: number,
) {
  if (!input.reason?.trim()) throw badRequest("A write-off needs a reason.");

  const { rows } = await db.execute(
    sql`SELECT balance_due FROM sales WHERE id = ${input.saleId}`,
  );
  if (!rows.length) throw badRequest("That sale does not exist.");
  const balance = Number((rows[0] as { balance_due: string }).balance_due);
  if (balance <= 0) throw badRequest("There is nothing outstanding on that sale.");

  // A WRITE_OFF is stored as a negative payment, which the sign constraint
  // allows, so balance_due reaches zero without pretending cash arrived.
  await db.execute(sql`
    INSERT INTO payments (sale_id, amount, method, received_by_user_id, note)
    VALUES (${input.saleId}, ${-balance}, 'WRITE_OFF', ${actorId}, ${input.reason.trim()})
  `);
  await db.execute(sql`
    INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, summary)
    VALUES (${actorId}, 'BALANCE_WRITTEN_OFF', 'sale', ${String(input.saleId)},
            ${`PKR ${balance} written off: ${input.reason.trim()}`})
  `);

  return getSaleDetail(input.saleId);
}

/**
 * End-of-day cash reconciliation: what each person took, by method, so the
 * drawer can be counted against it.
 */
export async function dayCashSummary(day: Date) {
  const start = new Date(day);
  start.setHours(0, 0, 0, 0);
  const end = new Date(day);
  end.setHours(23, 59, 59, 999);

  const { rows } = await db.execute(sql`
    SELECT u.id   AS user_id,
           u.name AS user_name,
           p.method::text AS method,
           sum(p.amount)::numeric AS total,
           count(*)::int AS entries
      FROM payments p
      JOIN users u ON u.id = p.received_by_user_id
     WHERE p.received_at BETWEEN ${start.toISOString()} AND ${end.toISOString()}
     GROUP BY u.id, u.name, p.method
     ORDER BY u.name, p.method
  `);

  const byPerson = new Map<
    number,
    { userId: number; userName: string; methods: Record<string, number>; net: number }
  >();

  for (const r of rows as unknown as Array<{
    user_id: number;
    user_name: string;
    method: string;
    total: string;
    entries: number;
  }>) {
    const entry =
      byPerson.get(r.user_id) ??
      { userId: r.user_id, userName: r.user_name, methods: {}, net: 0 };
    entry.methods[r.method] = Number(r.total);
    entry.net += Number(r.total);
    byPerson.set(r.user_id, entry);
  }

  const people = [...byPerson.values()];
  return {
    date: start,
    people,
    netTotal: people.reduce((s, p) => s + p.net, 0),
    cashTotal: people.reduce((s, p) => s + (p.methods.CASH ?? 0), 0),
  };
}
