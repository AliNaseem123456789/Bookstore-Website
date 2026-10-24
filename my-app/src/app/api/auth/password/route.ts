import { NextRequest } from "next/server";
import { z } from "zod";
import { ok, parseBody, requireSession, route } from "@/server/http";
import { changeOwnPassword } from "@/server/services/people";

export const runtime = "nodejs";

const Body = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8, "New password must be at least 8 characters."),
});

export const POST = route(async (req: NextRequest) => {
  const session = await requireSession(req);
  const body = await parseBody(req, Body);
  await changeOwnPassword(session.userId, body.currentPassword, body.newPassword);
  return ok({ ok: true });
});
