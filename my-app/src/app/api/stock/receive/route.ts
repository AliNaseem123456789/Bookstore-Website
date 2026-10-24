import { NextRequest } from "next/server";
import { z } from "zod";
import { parseBody, requirePermission, route, withIdempotency } from "@/server/http";
import { receiveStock } from "@/server/services/stock";

export const runtime = "nodejs";

const Body = z.object({
  lines: z
    .array(
      z.object({
        itemId: z.number().int().positive(),
        qty: z.number().int().min(0),
      }),
    )
    .min(1),
  supplier: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "stock.receive");
  const body = await parseBody(req, Body);

  // A double-submitted restock grid would otherwise double the stock.
  return withIdempotency(req, "POST /api/stock/receive", body, async () => {
    const batch = await receiveStock(body, session.userId);
    return { status: 201, body: { batch } };
  });
});
