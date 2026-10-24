import { NextRequest } from "next/server";
import { ok, requirePermission, route } from "@/server/http";
import { auditActions, listAuditLog } from "@/server/services/people";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "audit.view");
  const sp = req.nextUrl.searchParams;
  const [log, actions] = await Promise.all([
    listAuditLog({
      action: sp.get("action") ?? undefined,
      entityType: sp.get("entityType") ?? undefined,
      actorUserId: sp.get("actorUserId") ? Number(sp.get("actorUserId")) : undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
    }),
    auditActions(),
  ]);
  return ok({ ...log, actions });
});
