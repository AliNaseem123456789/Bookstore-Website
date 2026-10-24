import { NextRequest } from "next/server";
import { z } from "zod";
import { parseBody, requirePermission, route, withIdempotency, type RouteCtx } from "@/server/http";
import { createReturn } from "@/server/services/money";

export const runtime = "nodejs";

const Body = z.object({
  lines: z
    .array(
      z.object({
        saleLineId: z.number().int().positive(),
        qty: z.number().int().positive(),
        condition: z.enum(["RESELLABLE", "DAMAGED", "NOT_DELIVERED"]),
      }),
    )
    .min(1, "Select at least one item to return."),
  reason: z.string().nullable().optional(),
  payOutCredit: z.boolean().optional(),
});

export const POST = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "return.create");
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);

  return withIdempotency(req, `POST /api/sales/${id}/returns`, body, async () => {
    const result = await createReturn({ saleId: Number(id), ...body }, session.userId);
    return { status: 201, body: result };
  });
});
