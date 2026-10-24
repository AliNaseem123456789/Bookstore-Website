import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { auditLog, users, type Role } from "@/db/schema";
import { hashPassword } from "../auth";
import { badRequest, conflict, notFound } from "../http";

export async function listUsers(includeInactive = true) {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
      salesCount: sql<number>`(
        SELECT count(*)::int FROM sales WHERE sold_by_user_id = ${users.id}
      )`,
    })
    .from(users)
    .where(includeInactive ? undefined : eq(users.isActive, true))
    .orderBy(asc(users.name));
  return rows;
}

export async function createUser(
  input: { name: string; email: string; password: string; role: Role },
  actorId: number,
) {
  if (!input.name?.trim()) throw badRequest("Enter a name.");
  if (!input.email?.trim()) throw badRequest("Enter an email address.");
  if (!input.password || input.password.length < 8) {
    throw badRequest("Password must be at least 8 characters.");
  }

  const [row] = await db
    .insert(users)
    .values({
      name: input.name.trim(),
      email: input.email.trim().toLowerCase(),
      passwordHash: await hashPassword(input.password),
      role: input.role,
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    });

  await db.insert(auditLog).values({
    actorUserId: actorId,
    action: "USER_CREATED",
    entityType: "user",
    entityId: String(row.id),
    summary: `${row.name} <${row.email}> created as ${row.role}`,
  });

  return row;
}

export async function updateUser(
  id: number,
  patch: { name?: string; role?: Role; isActive?: boolean; password?: string },
  actorId: number,
) {
  const [before] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!before) throw notFound("That user does not exist.");

  // Never let the last administrator lock everyone out.
  const losingAdmin =
    before.role === "ADMIN" &&
    ((patch.role && patch.role !== "ADMIN") || patch.isActive === false);
  if (losingAdmin) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(sql`${users.role} = 'ADMIN' AND ${users.isActive} AND ${users.id} <> ${id}`);
    if (count === 0) {
      throw conflict(
        "This is the only active administrator. Promote someone else first.",
      );
    }
  }

  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name.trim();
  if (patch.role !== undefined) values.role = patch.role;
  if (patch.isActive !== undefined) values.isActive = patch.isActive;
  if (patch.password) {
    if (patch.password.length < 8) {
      throw badRequest("Password must be at least 8 characters.");
    }
    values.passwordHash = await hashPassword(patch.password);
  }
  if (!Object.keys(values).length) return before;

  const [after] = await db.update(users).set(values).where(eq(users.id, id)).returning();

  await db.insert(auditLog).values({
    actorUserId: actorId,
    action: patch.password ? "USER_PASSWORD_RESET" : "USER_UPDATED",
    entityType: "user",
    entityId: String(id),
    summary: describeUserChange(before, after),
    before: { role: before.role, isActive: before.isActive, name: before.name },
    after: { role: after.role, isActive: after.isActive, name: after.name },
  });

  return after;
}

function describeUserChange(
  before: typeof users.$inferSelect,
  after: typeof users.$inferSelect,
) {
  const parts: string[] = [];
  if (before.role !== after.role) parts.push(`role ${before.role} -> ${after.role}`);
  if (before.isActive !== after.isActive) {
    parts.push(after.isActive ? "reactivated" : "deactivated");
  }
  if (before.name !== after.name) parts.push(`renamed to ${after.name}`);
  return parts.length ? `${after.email}: ${parts.join(", ")}` : `${after.email} updated`;
}

/**
 * Staff are deactivated, never deleted: their name is attached to every sale
 * they rang up, and that history has to stay intact. The database enforces
 * this too — the foreign keys are ON DELETE RESTRICT.
 */
export async function deactivateUser(id: number, actorId: number) {
  return updateUser(id, { isActive: false }, actorId);
}

export async function changeOwnPassword(
  userId: number,
  current: string,
  next: string,
) {
  const { verifyPassword } = await import("../auth");
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw notFound("Account not found.");
  if (!(await verifyPassword(current, user.passwordHash))) {
    throw badRequest("Your current password is not correct.");
  }
  if (next.length < 8) throw badRequest("New password must be at least 8 characters.");

  await db
    .update(users)
    .set({ passwordHash: await hashPassword(next) })
    .where(eq(users.id, userId));

  await db.insert(auditLog).values({
    actorUserId: userId,
    action: "USER_PASSWORD_CHANGED",
    entityType: "user",
    entityId: String(userId),
    summary: `${user.email} changed their own password`,
  });
}

/** The audit trail, filterable — deliberately readable rather than complete. */
export async function listAuditLog(opts: {
  action?: string;
  entityType?: string;
  actorUserId?: number;
  limit?: number;
  offset?: number;
} = {}) {
  const limit = Math.min(opts.limit ?? 100, 500);
  const where = [];
  if (opts.action) where.push(eq(auditLog.action, opts.action));
  if (opts.entityType) where.push(eq(auditLog.entityType, opts.entityType));
  if (opts.actorUserId) where.push(eq(auditLog.actorUserId, opts.actorUserId));

  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      summary: auditLog.summary,
      before: auditLog.before,
      after: auditLog.after,
      createdAt: auditLog.createdAt,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(auditLog)
    .leftJoin(users, eq(users.id, auditLog.actorUserId))
    .where(where.length ? sql.join(where, sql` AND `) : undefined)
    .orderBy(sql`${auditLog.id} DESC`)
    .limit(limit + 1)
    .offset(opts.offset ?? 0);

  return {
    entries: rows.slice(0, limit),
    hasMore: rows.length > limit,
    nextOffset: (opts.offset ?? 0) + limit,
  };
}

/** Distinct actions present in the log, for the filter dropdown. */
export async function auditActions() {
  const { rows } = await db.execute(
    sql`SELECT DISTINCT action FROM audit_log ORDER BY action`,
  );
  return (rows as unknown as Array<{ action: string }>).map((r) => r.action);
}
