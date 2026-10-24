import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route, type RouteCtx } from "@/server/http";
import { writeOffBalance } from "@/server/services/money";

export const runtime = "nodejs";

const Body = z.object({ reason: z.string().min(1, "A write-off needs a reason.") });

export const POST = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  // Deliberately admin-only: this makes money disappear from the books.
  const session = await requirePermission(req, "stock.correct");
  const { id } = await ctx.params;
  const { reason } = await parseBody(req, Body);
  const sale = await writeOffBalance({ saleId: Number(id), reason }, session.userId);
  return ok({ sale });
});
