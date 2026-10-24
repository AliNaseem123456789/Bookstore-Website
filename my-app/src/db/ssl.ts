/**
 * Whether to negotiate TLS for a given connection string.
 *
 * Supabase terminates TLS at the pooler with its own chain, so verification
 * is off there; a local Postgres usually has no TLS at all. Honours an
 * explicit `sslmode=` in the URL, and `DATABASE_SSL=disable|require` as an
 * override for unusual hosts.
 */
export type SslSetting = false | { rejectUnauthorized: boolean };

export function sslFor(connectionString: string): SslSetting {
  // Return an explicit `false` rather than `undefined` for "no TLS": pg
  // treats undefined as "work it out from the connection string and
  // PGSSLMODE", which is how a local socket ends up attempting TLS.
  const override = process.env.DATABASE_SSL;
  if (override === "disable") return false;
  if (override === "require") return { rejectUnauthorized: false };

  let host = "";
  let sslmode = "";
  try {
    const u = new URL(connectionString);
    host = u.hostname;
    sslmode = u.searchParams.get("sslmode") ?? "";
  } catch {
    // Unparsable: fall back to the safe remote default.
    return { rejectUnauthorized: false };
  }

  if (sslmode === "disable") return false;

  const local =
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    host.endsWith(".local") ||
    host === "";

  return local ? false : { rejectUnauthorized: false };
}
