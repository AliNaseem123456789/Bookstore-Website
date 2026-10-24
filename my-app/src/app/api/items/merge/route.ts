import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { mergeItems } from "@/server/services/catalogue";

export const runtime = "nodejs";

const Body = z.object({
  keepId: z.number().int().positive(),
  mergeId: z.number().int().positive(),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "item.merge");
  const { keepId, mergeId } = await parseBody(req, Body);
  await mergeItems(keepId, mergeId, session.userId);
  return ok({ ok: true });
});
