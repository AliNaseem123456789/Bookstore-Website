import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { listPossibleDuplicates } from "@/server/services/catalogue";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "item.merge");
  return ok({ duplicates: await listPossibleDuplicates() });
});
