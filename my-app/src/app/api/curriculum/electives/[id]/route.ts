import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route, type RouteCtx } from "@/server/http";
import { deleteElectiveGroup, updateElectiveGroup } from "@/server/services/curriculum";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  label: z.string().min(1).optional(),
  minSelect: z.number().int().min(0).optional(),
  maxSelect: z.number().int().min(1).optional(),
});

export const PATCH = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  await requirePermission(req, "curriculum.edit");
  const { id } = await ctx.params;
  const group = await updateElectiveGroup(Number(id), await parseBody(req, Body));
  return ok({ electiveGroup: group });
});

export const DELETE = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  await requirePermission(req, "curriculum.edit");
  const { id } = await ctx.params;
  await deleteElectiveGroup(Number(id));
  return ok({ ok: true });
});
