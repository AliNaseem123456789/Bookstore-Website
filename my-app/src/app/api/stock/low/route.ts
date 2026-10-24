import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { lowStock } from "@/server/services/stock";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  return ok({ items: await lowStock() });
});
