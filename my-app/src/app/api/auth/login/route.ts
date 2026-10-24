import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, cookieOptions, issueToken, SESSION_COOKIE } from "@/server/auth";
import { permissionsFor } from "@/server/rbac";
import { clientIp, parseBody, recordAudit, route, unauthorized } from "@/server/http";

export const runtime = "nodejs";

const Body = z.object({
  email: z.string().min(1, "Enter your email."),
  password: z.string().min(1, "Enter your password."),
});

export const POST = route(async (req: NextRequest) => {
  const { email, password } = await parseBody(req, Body);
  const session = await authenticate(email, password);

  if (!session) {
    await recordAudit({
      action: "LOGIN_FAILED",
      entityType: "auth",
      entityId: email.toLowerCase(),
      summary: `failed sign-in for ${email}`,
      ip: clientIp(req),
    });
    // Deliberately vague: do not reveal whether the address exists.
    throw unauthorized("That email and password do not match.");
  }

  const token = await issueToken(session);
  const res = NextResponse.json({
    user: { ...session, permissions: permissionsFor(session.role) },
    // The phone app stores this; the browser uses the cookie below.
    token,
  });
  res.cookies.set(SESSION_COOKIE, token, cookieOptions);

  await recordAudit({
    actorUserId: session.userId,
    action: "LOGIN",
    entityType: "auth",
    entityId: String(session.userId),
    summary: `${session.email} signed in`,
    ip: clientIp(req),
  });

  return res;
});
