import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route, withIdempotency, type RouteCtx } from "@/server/http";
import { receivePayment } from "@/server/services/money";

export const runtime = "nodejs";

const Body = z.object({
  amount: z.number().positive("Enter an amount greater than zero."),
  method: z.enum(["CASH", "CARD", "BANK_TRANSFER"]).optional(),
  note: z.string().nullable().optional(),
});

export const POST = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "payment.receive");
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);

  return withIdempotency(
    req,
    `POST /api/sales/${id}/payments`,
    body,
    async () => {
      const sale = await receivePayment(
        { saleId: Number(id), ...body },
        session.userId,
      );
      return { status: 201, body: { sale } };
    },
  );
});
void ok;
