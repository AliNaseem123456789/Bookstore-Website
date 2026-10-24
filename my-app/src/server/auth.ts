/**
 * Authentication: JWT in an httpOnly cookie for the web app, and the same
 * token as a bearer header for the phone app. Deliberately dependency-light
 * and standards-based so the whole thing lifts to AWS or Fly without
 * touching an identity provider.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users, type Role } from "@/db/schema";

export const SESSION_COOKIE = "bookstore_session";
const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export type Session = {
  userId: number;
  email: string;
  name: string;
  role: Role;
};

/**
 * No fallback secret. The old code used `process.env.JWT_SECRET ||
 * "SECRET_KEY"` in three places, which means a deploy that forgets the
 * variable silently accepts tokens anyone can mint. Failing loudly at
 * startup is the only safe behaviour.
 */
function secret(): Uint8Array {
  const value = process.env.JWT_SECRET;
  if (!value || value.length < 32) {
    throw new Error(
      "JWT_SECRET must be set to at least 32 characters. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(value);
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function issueToken(session: Session): Promise<string> {
  return new SignJWT({
    sub: String(session.userId),
    email: session.email,
    name: session.name,
    role: session.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${TOKEN_TTL_SECONDS}s`)
    .sign(secret());
}

export async function readToken(token: string): Promise<Session | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return sessionFromPayload(payload);
  } catch {
    return null;
  }
}

export function sessionFromPayload(payload: JWTPayload): Session | null {
  const userId = Number(payload.sub);
  const role = payload.role as Role | undefined;
  if (!Number.isInteger(userId) || !role) return null;
  return {
    userId,
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    role,
  };
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: TOKEN_TTL_SECONDS,
};

/**
 * Authenticate by email and password. Email is compared case-insensitively
 * because staff type it inconsistently, and a deactivated account is
 * refused even with the right password.
 */
export async function authenticate(
  email: string,
  password: string,
): Promise<Session | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1);

  // Always run a comparison, even when the user does not exist, so the
  // response time does not reveal which emails are registered.
  const hash = user?.passwordHash ?? "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv";
  const ok = await verifyPassword(password, hash);

  if (!user || !ok || !user.isActive) return null;

  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export async function findUserById(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return user ?? null;
}
