import { NextRequest } from "next/server";
import { z } from "zod";
import { forbidden, ok, parseBody, requirePermission, route, type RouteCtx } from "@/server/http";
import { can } from "@/server/rbac";
import { addAlias, getItem, updateItem } from "@/server/services/catalogue";
import { classesForItem } from "@/server/services/curriculum";
import { stockHistory } from "@/server/services/stock";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  await requirePermission(req, "stock.view");
  const { id } = await ctx.params;
  const itemId = Number(id);

  const [item, usedIn, history] = await Promise.all([
    getItem(itemId),
    classesForItem(itemId),
    stockHistory({ itemId, limit: 50 }),
  ]);

  return ok({ item, usedIn, movements: history.movements });
});

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  publisher: z.string().nullable().optional(),
  type: z.enum(["BOOK", "COPY", "STATIONERY"]).optional(),
  price: z.number().min(0).optional(),
  reorderLevel: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  addAlias: z.string().min(1).optional(),
});

export const PATCH = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "item.edit");
  const { id } = await ctx.params;
  const body = await parseBody(req, PatchBody);

  // Changing a price is a separate, higher permission than editing a name:
  // it rewrites what every future sale charges.
  if (body.price !== undefined && !can(session.role, "item.setPrice")) {
    throw forbidden("Only an administrator can change prices.");
  }

  if (body.addAlias) await addAlias(Number(id), body.addAlias);

  const { addAlias: _alias, ...patch } = body;
  const item = await updateItem(Number(id), patch, session.userId);
  return ok({ item });
});
