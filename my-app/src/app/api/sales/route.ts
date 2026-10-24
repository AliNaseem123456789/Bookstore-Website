import { NextRequest } from "next/server";
import { z } from "zod";
import {
  clientIp, ok, parseBody, requirePermission, route, withIdempotency,
} from "@/server/http";
import { can } from "@/server/rbac";
import { checkout, listSales } from "@/server/services/selling";

export const runtime = "nodejs";

const Line = z.object({
  itemId: z.number().int().positive(),
  qty: z.number().int().positive(),
  lineDiscount: z.number().min(0).optional(),
  classId: z.number().int().positive().nullable().optional(),
  fromFullCourse: z.boolean().optional(),
});

const Body = z.object({
  buyerName: z.string().min(1, "Enter the buyer's name."),
  buyerPhone: z.string().nullable().optional(),
  lines: z.array(Line).min(1, "Add at least one item."),
  orderDiscount: z.number().min(0).optional(),
  amountPaid: z.number().min(0).optional(),
  paymentMethod: z.enum(["CASH", "CARD", "BANK_TRANSFER"]).optional(),
  note: z.string().nullable().optional(),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "sale.create");
  const body = await parseBody(req, Body);

  // Idempotency-Key makes a double-tapped Confirm, or a retry on flaky
  // counter wifi, replay the first result instead of selling twice.
  return withIdempotency(req, "POST /api/sales", body, async () => {
    const sale = await checkout(body, session.userId);
    return { status: 201, body: { sale } };
  });
});

export const GET = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "sale.viewOwn");
  const sp = req.nextUrl.searchParams;

  const result = await listSales({
    search: sp.get("search") ?? undefined,
    sellerId: sp.get("sellerId") ? Number(sp.get("sellerId")) : undefined,
    unpaidOnly: sp.get("unpaid") === "true",
    discountedOnly: sp.get("discounted") === "true",
    from: sp.get("from") ? new Date(sp.get("from")!) : undefined,
    to: sp.get("to") ? new Date(sp.get("to")!) : undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    // A cashier sees only their own sales, whatever they ask for.
    restrictToSellerId: can(session.role, "sale.viewAll") ? undefined : session.userId,
  });

  void clientIp;
  return ok(result);
});
