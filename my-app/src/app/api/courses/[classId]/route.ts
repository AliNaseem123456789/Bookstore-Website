import { NextRequest } from "next/server";
import { ok, requirePermission, route, type RouteCtx } from "@/server/http";
import { getCourse } from "@/server/services/curriculum";

export const runtime = "nodejs";

export const GET = route<RouteCtx<{ classId: string }>>(async (req, ctx) => {
  await requirePermission(req, "sale.create");
  const { classId } = await ctx.params;
  return ok({ course: await getCourse(Number(classId)) });
});
