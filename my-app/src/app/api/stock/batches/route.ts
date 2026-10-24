import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { listRestockBatches } from "@/server/services/stock";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  return ok({ batches: await listRestockBatches() });
});
