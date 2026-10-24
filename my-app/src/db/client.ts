import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import { sslFor } from "./ssl";

/**
 * One pool per process, cached across hot reloads in development so a
 * file save does not leak connections.
 *
 * DATABASE_URL points at Supabase's **session** pooler (port 5432). If you
 * move to the transaction pooler (6543), append
 * `?pgbouncer=true&connection_limit=1` and keep `max` at 1 — transaction
 * mode does not support session-level state.
 */
const globalForDb = globalThis as unknown as {
  __bookstorePool?: Pool;
};

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and fill it in.",
    );
  }
  return new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: sslFor(connectionString),
  });
}

export const pool = globalForDb.__bookstorePool ?? createPool();
if (process.env.NODE_ENV !== "production") {
  globalForDb.__bookstorePool = pool;
}

export const db = drizzle(pool, { schema });
export type Db = typeof db;
