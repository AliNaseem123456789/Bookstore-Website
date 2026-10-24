import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { createElectiveGroup } from "@/server/services/curriculum";

export const runtime = "nodejs";

const Body = z.object({
  classId: z.number().int().positive(),
  groupKey: z.string().min(1),
  label: z.string().min(1),
  minSelect: z.number().int().min(0).default(1),
  maxSelect: z.number().int().min(1).default(1),
});

export const POST = route(async (req: NextRequest) => {
  await requirePermission(req, "curriculum.edit");
  const group = await createElectiveGroup(await parseBody(req, Body));
  return ok({ electiveGroup: group }, 201);
});
