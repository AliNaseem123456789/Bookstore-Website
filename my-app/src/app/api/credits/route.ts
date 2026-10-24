import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { listCreditsOwed } from "@/server/services/selling";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "refund.payout");
  return ok({ sales: await listCreditsOwed() });
});
