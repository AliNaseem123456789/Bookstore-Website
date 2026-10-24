import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { dayCashSummary } from "@/server/services/money";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "analytics.view");
  const day = req.nextUrl.searchParams.get("date");
  return ok(await dayCashSummary(day ? new Date(day) : new Date()));
});
