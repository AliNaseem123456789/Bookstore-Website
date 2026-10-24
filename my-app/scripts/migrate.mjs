#!/usr/bin/env node
/**
 * Applies prisma/sql/*.sql in order.
 *
 * Each file is one transaction, so a failure leaves nothing half-applied.
 * Already-applied files are skipped by recording them in `_migrations`.
 *
 *   node scripts/migrate.mjs
 *   node scripts/migrate.mjs --reset   (drops everything first — dev only)
 */
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sqlDir = join(here, "..", "prisma", "sql");

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env first.");
  process.exit(1);
}


/** Matches src/db/ssl.ts: no TLS locally, relaxed TLS for hosted Postgres. */
function sslFor(connectionString) {
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
    return { rejectUnauthorized: false };
  }
  if (sslmode === "disable") return false;
  const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0", ""].includes(host);
  return local ? false : { rejectUnauthorized: false };
}

const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });

async function main() {
  await client.connect();

  if (process.argv.includes("--reset")) {
    if (process.env.NODE_ENV === "production") {
      console.error("Refusing to --reset with NODE_ENV=production.");
      process.exit(1);
    }
    console.log("Dropping and recreating the public schema…");
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  }

  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const { rows: done } = await client.query("SELECT name FROM _migrations");
  const applied = new Set(done.map((r) => r.name));

  const files = (await readdir(sqlDir))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  skip  ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(sqlDir, file), "utf8");
    process.stdout.write(`  run   ${file} … `);
    try {
      // The files carry their own BEGIN/COMMIT.
      await client.query(sql);
      await client.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
      console.log("ok");
      ran += 1;
    } catch (err) {
      console.log("FAILED");
      console.error(`\n${file}: ${err.message}\n`);
      process.exit(1);
    }
  }

  const { rows } = await client.query(
    "SELECT count(*)::int AS n FROM fn_verify_stock_integrity()",
  );
  console.log(
    `\n${ran} migration(s) applied. Stock integrity check: ${
      rows[0].n === 0 ? "clean" : `${rows[0].n} PROBLEM(S)`
    }.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => client.end());
