import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { verifyStockIntegrity } from "@/server/services/stock";

export const runtime = "nodejs";

/**
 * The self-audit endpoint. `violations` must always be empty: each entry
 * means the stock ledger and the cached quantity disagree, which the schema
 * is built to make impossible. Worth hitting from cron and alerting on.
 */
export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  const violations = await verifyStockIntegrity();
  return ok({ healthy: violations.length === 0, violations });
});
