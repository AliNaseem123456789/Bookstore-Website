import { NextRequest } from "next/server";
import { forbidden, notFound, ok, requirePermission, route, type RouteCtx } from "@/server/http";
import { can } from "@/server/rbac";
import { getSaleDetail } from "@/server/services/selling";

export const runtime = "nodejs";

export const GET = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "sale.viewOwn");
  const { id } = await ctx.params;

  const saleId = Number(id);
  if (!Number.isInteger(saleId)) throw notFound("That sale does not exist.");

  const sale = await getSaleDetail(saleId);
  if (!can(session.role, "sale.viewAll") && sale.soldBy.id !== session.userId) {
    throw forbidden("You can only open your own sales.");
  }
  return ok({ sale });
});
