import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { createClass, listClasses } from "@/server/services/curriculum";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "stock.view");
  const includeInactive = req.nextUrl.searchParams.get("includeInactive") === "true";
  return ok({ classes: await listClasses(includeInactive) });
});

const Body = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  sortOrder: z.number().int(),
});

export const POST = route(async (req: NextRequest) => {
  await requirePermission(req, "curriculum.edit");
  const cls = await createClass(await parseBody(req, Body));
  return ok({ class: cls }, 201);
});
