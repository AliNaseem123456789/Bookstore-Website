import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { payOutRefund } from "@/server/services/money";

export const runtime = "nodejs";

const Body = z.object({
  saleId: z.number().int().positive(),
  amount: z.number().positive(),
  note: z.string().nullable().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "refund.payout");
  const body = await parseBody(req, Body);
  const sale = await payOutRefund(body, session.userId);
  return ok({ sale });
});
