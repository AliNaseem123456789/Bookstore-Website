import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { addCourseItem } from "@/server/services/curriculum";

export const runtime = "nodejs";

const Body = z.object({
  classId: z.number().int().positive(),
  itemId: z.number().int().positive(),
  defaultQty: z.number().int().min(1).default(1),
  electiveGroupId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const POST = route(async (req: NextRequest) => {
  await requirePermission(req, "curriculum.edit");
  const row = await addCourseItem(await parseBody(req, Body));
  return ok({ curriculumItem: row }, 201);
});
