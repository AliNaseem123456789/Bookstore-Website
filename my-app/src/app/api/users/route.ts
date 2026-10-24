import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requirePermission, route } from "@/server/http";
import { createUser, listUsers } from "@/server/services/people";

export const runtime = "nodejs";

export const GET = route(async (req: NextRequest) => {
  await requirePermission(req, "user.manage");
  return ok({ users: await listUsers() });
});

const Body = z.object({
  name: z.string().min(1),
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  role: z.enum(["ADMIN", "MANAGER", "CASHIER"]),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requirePermission(req, "user.manage");
  const user = await createUser(await parseBody(req, Body), session.userId);
  return ok({ user }, 201);
});
