import { NextRequest } from "next/server";
import { z } from "zod";
import { badRequest, ok, parseBody, requirePermission, route, type RouteCtx } from "@/server/http";
import { deactivateUser, updateUser } from "@/server/services/people";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

const Body = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export const PATCH = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "user.manage");
  const { id } = await ctx.params;
  const body = await parseBody(req, Body);

  if (Number(id) === session.userId && body.isActive === false) {
    throw badRequest("You cannot deactivate your own account.");
  }

  const user = await updateUser(Number(id), body, session.userId);
  return ok({ user });
});

/**
 * Deactivates rather than deletes. Staff names are attached to every sale
 * they rang up and that history must stay intact — the database enforces
 * this too, with ON DELETE RESTRICT.
 */
export const DELETE = route<RouteCtx<{ id: string }>>(async (req, ctx) => {
  const session = await requirePermission(req, "user.manage");
  const { id } = await ctx.params;
  if (Number(id) === session.userId) {
    throw badRequest("You cannot deactivate your own account.");
  }
  const user = await deactivateUser(Number(id), session.userId);
  return ok({ user });
});
