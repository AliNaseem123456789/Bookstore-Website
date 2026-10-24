import { NextRequest } from "next/server";
import { getSession } from "@/server/http";
import { permissionsFor } from "@/server/rbac";
import { ok, route } from "@/server/http";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  const session = await getSession(req);
  if (!session) return ok({ user: null }, 200);
  return ok({ user: { ...session, permissions: permissionsFor(session.role) } });
});
