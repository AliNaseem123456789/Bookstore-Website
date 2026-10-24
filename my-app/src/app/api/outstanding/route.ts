import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { listOutstanding } from "@/server/services/selling";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "payment.receive");
  const search = req.nextUrl.searchParams.get("search") ?? undefined;
  return ok({ sales: await listOutstanding(search) });
});
