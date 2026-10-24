import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { correctStock } from "@/server/services/stock";

export const runtime = "nodejs";

const Body = z.object({
  itemId: z.number().int().positive(),
  countedQty: z.number().int().min(0),
  reason: z.string().min(1, "A correction needs a reason."),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "stock.correct");
  const body = await parseBody(req, Body);
  const newQty = await correctStock(body, session.userId);
  return ok({ quantityOnHand: newQty });
});
