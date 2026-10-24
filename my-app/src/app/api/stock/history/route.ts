import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { stockHistory } from "@/server/services/stock";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  const sp = req.nextUrl.searchParams;
  return ok(
    await stockHistory({
      itemId: sp.get("itemId") ? Number(sp.get("itemId")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    }),
  );
});
