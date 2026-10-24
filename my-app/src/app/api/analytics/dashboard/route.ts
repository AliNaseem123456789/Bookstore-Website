import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { dashboard } from "@/server/services/analytics";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "analytics.view");
  const sp = req.nextUrl.searchParams;
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date();
  const from = sp.get("from")
    ? new Date(sp.get("from")!)
    : new Date(Date.now() - 29 * 86_400_000);
  return ok(await dashboard({ from, to }));
});
