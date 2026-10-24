import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route, type RouteCtx } from "@/server/http";
import { removeCourseItem, updateCourseItem } from "@/server/services/curriculum";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  defaultQty: z.number().int().min(1).optional(),
  electiveGroupId: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const PATCH = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  await requirePermission(req, "curriculum.edit");
  const { id } = await ctx.params;
  const row = await updateCourseItem(Number(id), await parseBody(req, Body));
  return ok({ curriculumItem: row });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  await requirePermission(req, "curriculum.edit");
  const { id } = await ctx.params;
  await removeCourseItem(Number(id));
  return ok({ ok: true });
});
