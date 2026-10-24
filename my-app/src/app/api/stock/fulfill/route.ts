import { NextRequest } from "next/server";
import { z } from "zod";
import { parseBody, requirePermission, route, withIdempotency } from "@/server/http";
import { fulfillBackorders } from "@/server/services/stock";

export const runtime = "nodejs";

const Body = z.object({
  lines: z
    .array(
      z.object({
        saleLineId: z.number().int().positive(),
        qty: z.number().int().min(1),
      }),
    )
    .min(1),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "stock.fulfill");
  const body = await parseBody(req, Body);

  return withIdempotency(req, "POST /api/stock/fulfill", body, async () => {
    const result = await fulfillBackorders(body, session.userId);
    return { status: 200, body: result };
  });
});
