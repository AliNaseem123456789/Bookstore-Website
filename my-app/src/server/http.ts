/**
 * Route-handler plumbing: session resolution, permission enforcement,
 * request validation, idempotency, and turning database errors into
 * messages a bookseller can act on.
 */
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z, type ZodType } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, idempotencyKeys } from "@/db/schema";
import { SESSION_COOKIE, readToken, type Session } from "./auth";
import { can, type Permission } from "./rbac";

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = "Please sign in again.") => new HttpError(401, m);
export const forbidden = (m = "You do not have access to that.") =>
  new HttpError(403, m);
export const notFound = (m = "Not found.") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Reads the session from the cookie (web) or a bearer token (phone app). */
export async function getSession(req: NextRequest): Promise<Session | null> {
  const bearer = req.headers.get("authorization");
  if (bearer?.toLowerCase().startsWith("bearer ")) {
    return readToken(bearer.slice(7).trim());
  }
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  return cookie ? readToken(cookie) : null;
}

export async function requireSession(req: NextRequest): Promise<Session> {
  const session = await getSession(req);
  if (!session) throw unauthorized();
  return session;
}

export async function requirePermission(
  req: NextRequest,
  permission: Permission,
): Promise<Session> {
  const session = await requireSession(req);
  if (!can(session.role, permission)) {
    throw forbidden(
      `Your role (${session.role.toLowerCase()}) cannot do that. Ask an administrator.`,
    );
  }
  return session;
}

/**
 * Postgres raises our business rules as exceptions with readable messages.
 * Surface those to the user rather than a generic 500 — "only 3 unit(s) are
 * on backorder" is genuinely what the cashier needs to read.
 */
const PG_USER_ERROR_CODES = new Set([
  "P0001", // raise_exception — our own RAISE statements
  "23514", // check_violation
  "23505", // unique_violation
  "23503", // foreign_key_violation
  "23502", // not_null_violation
]);

type PgError = { code?: string; message?: string; constraint?: string };

/**
 * Drizzle wraps driver errors in its own error with the real one on `cause`,
 * so the Postgres error code is not on the object we catch. Walk the chain to
 * find it — otherwise every business rule the database enforces surfaces as a
 * blank 500 instead of the message it carefully raised.
 */
function findPgError(err: unknown, depth = 0): PgError | null {
  if (!err || typeof err !== "object" || depth > 5) return null;
  const candidate = err as PgError & { cause?: unknown };
  if (typeof candidate.code === "string" && PG_USER_ERROR_CODES.has(candidate.code)) {
    return candidate;
  }
  return findPgError(candidate.cause, depth + 1);
}

function describeDbError(err: PgError): string | null {
  if (!err.code || !PG_USER_ERROR_CODES.has(err.code)) return null;

  if (err.code === "23505") {
    if (err.constraint?.includes("users_email")) {
      return "That email address is already registered.";
    }
    if (err.constraint?.includes("normalized_alias")) {
      return "Another item already uses that name.";
    }
    if (err.constraint?.includes("curriculum_items_class_item")) {
      return "That item is already in this class's course.";
    }
    return "That record already exists.";
  }
  if (err.constraint === "items_qty_non_negative") {
    return "That would take stock below zero.";
  }
  return err.message ?? null;
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof HttpError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof z.ZodError) {
    const first = err.issues[0];
    const where = first?.path.join(".");
    return NextResponse.json(
      {
        error: where ? `${where}: ${first.message}` : (first?.message ?? "Invalid request."),
        issues: err.issues,
      },
      { status: 400 },
    );
  }

  const pgError = findPgError(err);
  if (pgError) {
    const described = describeDbError(pgError);
    if (described) {
      return NextResponse.json({ error: described }, { status: 409 });
    }
  }

  console.error("[unhandled]", err);
  return NextResponse.json(
    { error: "Something went wrong. Nothing was saved." },
    { status: 500 },
  );
}

/**
 * Parse and validate a JSON body.
 *
 * Returns the schema's *output* type, so `z.default(...)` fields come back
 * required rather than possibly-undefined.
 */
export async function parseBody<S extends ZodType>(
  req: NextRequest,
  shape: S,
): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Expected a JSON body.");
  }
  return shape.parse(raw) as z.output<S>;
}

/**
 * Wraps a handler so thrown HttpErrors and database errors become responses.
 *
 * Generic over the route context so dynamic segments keep their types:
 *   route<RouteCtx<{ id: string }>>(async (req, ctx) => { … })
 */
export type RouteCtx<P extends Record<string, string> = Record<string, never>> = {
  params: Promise<P>;
};

export function route<C = unknown>(
  handler: (req: NextRequest, ctx: C) => Promise<NextResponse>,
) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * Makes a mutating endpoint safe to retry.
 *
 * The client sends `Idempotency-Key`. The first call runs and its response is
 * stored; any repeat of the same key replays that response instead of acting
 * again. This is what stops a double-tapped Confirm button, a flaky counter
 * wifi, or a phone-app retry from creating two sales.
 */
export async function withIdempotency(
  req: NextRequest,
  endpoint: string,
  payload: unknown,
  run: () => Promise<{ status: number; body: unknown }>,
): Promise<NextResponse> {
  const key = req.headers.get("idempotency-key")?.trim();
  if (!key) {
    const result = await run();
    return NextResponse.json(result.body, { status: result.status });
  }

  const hash = createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");

  const [existing] = await db
    .select()
    .from(idempotencyKeys)
    .where(sql`${idempotencyKeys.key} = ${key}`)
    .limit(1);

  if (existing) {
    if (existing.requestHash !== hash) {
      throw conflict(
        "This request was already used for different data. Start a new one.",
      );
    }
    return NextResponse.json(existing.response, {
      status: existing.statusCode,
      headers: { "Idempotent-Replay": "true" },
    });
  }

  const result = await run();

  // If two identical requests arrive at once, the loser's insert conflicts
  // and we simply let the stored response stand.
  await db
    .insert(idempotencyKeys)
    .values({
      key,
      endpoint,
      requestHash: hash,
      statusCode: result.status,
      response: result.body as object,
    })
    .onConflictDoNothing();

  return NextResponse.json(result.body, { status: result.status });
}

export async function recordAudit(entry: {
  actorUserId?: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  summary?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}) {
  await db.insert(auditLog).values({
    actorUserId: entry.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    summary: entry.summary ?? null,
    before: (entry.before ?? null) as object | null,
    after: (entry.after ?? null) as object | null,
    ip: entry.ip ?? null,
  });
}

export function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    null
  );
}

export const ok = (body: unknown, status = 200) => NextResponse.json(body, { status });
