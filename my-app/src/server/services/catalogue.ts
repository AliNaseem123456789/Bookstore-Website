import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  itemAliases,
  items,
  priceHistory,
  users,
  type ItemType,
} from "@/db/schema";
import { badRequest, notFound } from "../http";

export type ItemSummary = {
  id: number;
  code: string;
  name: string;
  publisher: string | null;
  type: ItemType;
  price: number;
  quantityOnHand: number;
  reorderLevel: number;
  isActive: boolean;
};

const toSummary = (r: typeof items.$inferSelect): ItemSummary => ({
  id: r.id,
  code: r.code,
  name: r.name,
  publisher: r.publisher,
  type: r.type,
  price: Number(r.price),
  quantityOnHand: r.quantityOnHand,
  reorderLevel: r.reorderLevel,
  isActive: r.isActive,
});

export async function listItems(opts: {
  search?: string;
  type?: ItemType;
  includeInactive?: boolean;
  limit?: number;
} = {}): Promise<ItemSummary[]> {
  const where = [];
  if (!opts.includeInactive) where.push(eq(items.isActive, true));
  if (opts.type) where.push(eq(items.type, opts.type));

  if (opts.search?.trim()) {
    const term = opts.search.trim();
    const like = `%${term}%`;
    // Match the display name, the code, or any alias staff may have typed.
    where.push(
      or(
        ilike(items.name, like),
        ilike(items.code, like),
        sql`EXISTS (SELECT 1 FROM ${itemAliases} a
                    WHERE a.item_id = ${items.id}
                      AND a.normalized_alias LIKE ${"%" + normalize(term) + "%"})`,
      )!,
    );
  }

  const rows = await db
    .select()
    .from(items)
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(items.name))
    .limit(opts.limit ?? 500);

  return rows.map(toSummary);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function getItem(id: number) {
  const [row] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!row) throw notFound("That item does not exist.");

  const aliases = await db
    .select({ id: itemAliases.id, alias: itemAliases.alias })
    .from(itemAliases)
    .where(eq(itemAliases.itemId, id))
    .orderBy(asc(itemAliases.alias));

  const prices = await db
    .select({
      id: priceHistory.id,
      oldPrice: priceHistory.oldPrice,
      newPrice: priceHistory.newPrice,
      changedAt: priceHistory.changedAt,
      changedBy: users.name,
    })
    .from(priceHistory)
    .leftJoin(users, eq(users.id, priceHistory.changedById))
    .where(eq(priceHistory.itemId, id))
    .orderBy(desc(priceHistory.changedAt))
    .limit(20);

  return {
    ...toSummary(row),
    aliases,
    priceHistory: prices.map((p) => ({
      id: p.id,
      oldPrice: Number(p.oldPrice),
      newPrice: Number(p.newPrice),
      changedAt: p.changedAt,
      changedBy: p.changedBy,
    })),
  };
}

/**
 * Warn about a near-duplicate before a second copy of the same book is
 * created. This is the first line of defence against the "one book, many
 * names" problem; `fn_merge_items` cleans up the ones that slip through.
 */
export async function findSimilarItems(name: string, excludeId?: number) {
  const norm = normalize(name);
  if (!norm) return [];

  const rows = await db
    .select({
      id: items.id,
      name: items.name,
      publisher: items.publisher,
      price: items.price,
      quantityOnHand: items.quantityOnHand,
      exact: sql<boolean>`${items.normalizedName} = ${norm}`,
    })
    .from(items)
    .where(
      and(
        eq(items.isActive, true),
        excludeId ? sql`${items.id} <> ${excludeId}` : undefined,
        or(
          sql`${items.normalizedName} = ${norm}`,
          // Trigram similarity catches "Oxford Modern English Book-1" vs
          // "Oxford Modern English Book-1 (3rd Edition)".
          sql`similarity(${items.name}, ${name}) > 0.55`,
        )!,
      ),
    )
    .orderBy(desc(sql`similarity(${items.name}, ${name})`))
    .limit(5);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    publisher: r.publisher,
    price: Number(r.price),
    quantityOnHand: r.quantityOnHand,
    exact: r.exact,
  }));
}

export async function createItem(input: {
  name: string;
  publisher?: string | null;
  type: ItemType;
  price: number;
  reorderLevel?: number;
  openingQty?: number;
  actorId: number;
}) {
  if (!input.name.trim()) throw badRequest("An item needs a name.");
  if (input.price < 0) throw badRequest("Price cannot be negative.");

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(items)
      .values({
        // `code` and `normalized_name` are filled in by database defaults
        // and triggers; cast keeps TypeScript honest about that.
        name: input.name.trim(),
        publisher: input.publisher?.trim() || null,
        type: input.type,
        price: input.price.toFixed(2),
        reorderLevel: input.reorderLevel ?? 10,
      } as typeof items.$inferInsert)
      .returning();

    // Opening stock must go through the ledger like everything else.
    if (input.openingQty && input.openingQty > 0) {
      await tx.execute(
        sql`INSERT INTO stock_movements
              (item_id, delta, reason, ref_type, created_by_user_id, note)
            VALUES (${row.id}, ${input.openingQty}, 'OPENING', 'item_create',
                    ${input.actorId}, 'opening stock on item creation')`,
      );
    }

    const [fresh] = await tx.select().from(items).where(eq(items.id, row.id));
    return toSummary(fresh);
  });
}

export async function updateItem(
  id: number,
  input: {
    name?: string;
    publisher?: string | null;
    type?: ItemType;
    price?: number;
    reorderLevel?: number;
    isActive?: boolean;
  },
  actorId: number,
) {
  const [before] = await db.select().from(items).where(eq(items.id, id)).limit(1);
  if (!before) throw notFound("That item does not exist.");

  if (input.price !== undefined && input.price < 0) {
    throw badRequest("Price cannot be negative.");
  }

  return db.transaction(async (tx) => {
    // The price-change trigger reads this to record who changed it.
    await tx.execute(sql`SELECT set_config('app.actor_id', ${String(actorId)}, true)`);

    const patch: Record<string, unknown> = {};
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.publisher !== undefined) patch.publisher = input.publisher?.trim() || null;
    if (input.type !== undefined) patch.type = input.type;
    if (input.price !== undefined) patch.price = input.price.toFixed(2);
    if (input.reorderLevel !== undefined) patch.reorderLevel = input.reorderLevel;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (Object.keys(patch).length === 0) return toSummary(before);

    const [after] = await tx
      .update(items)
      .set(patch)
      .where(eq(items.id, id))
      .returning();

    return toSummary(after);
  });
}

export async function addAlias(itemId: number, alias: string) {
  if (!alias.trim()) throw badRequest("An alias needs some text.");
  const [row] = await db
    .insert(itemAliases)
    .values({ itemId, alias: alias.trim() } as typeof itemAliases.$inferInsert)
    .returning();
  return row;
}

export async function removeAlias(aliasId: number) {
  await db.delete(itemAliases).where(eq(itemAliases.id, aliasId));
}

/** Catalogue entries that look like the same thing entered twice. */
export async function listPossibleDuplicates() {
  const { rows } = await db.execute(sql`
    SELECT a.id            AS keep_id,
           a.name          AS keep_name,
           a.quantity_on_hand AS keep_qty,
           a.price         AS keep_price,
           b.id            AS merge_id,
           b.name          AS merge_name,
           b.quantity_on_hand AS merge_qty,
           b.price         AS merge_price
      FROM items a
      JOIN items b ON a.normalized_name = b.normalized_name AND a.id < b.id
     WHERE a.is_active AND b.is_active
     ORDER BY a.name
  `);
  return rows as unknown as Array<{
    keep_id: number;
    keep_name: string;
    keep_qty: number;
    keep_price: string;
    merge_id: number;
    merge_name: string;
    merge_qty: number;
    merge_price: string;
  }>;
}

/**
 * Fold a duplicate into the real item. Stock moves across as a traceable
 * pair of ledger entries, the old name survives as a searchable alias, and
 * past sales keep pointing at the row that recorded them.
 */
export async function mergeItems(keepId: number, mergeId: number, actorId: number) {
  if (keepId === mergeId) throw badRequest("Pick two different items.");
  await db.execute(sql`SELECT fn_merge_items(${keepId}, ${mergeId}, ${actorId})`);
}
