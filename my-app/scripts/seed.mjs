#!/usr/bin/env node
/**
 * Seeds the catalogue, classes and curriculum from an export of the old
 * Supabase database.
 *
 * Input (data/):
 *   books.csv             id,name,publisher,class_grade,quantity,price,Type
 *   class_item_map.csv    id,class_grade,book_id,created_at
 *   course_defaults.csv   id,class_grade,item_name_pattern,default_qty,created_at
 *
 * Why these three and not the old spreadsheets: `class_item_map` states
 * which items belong to which class's course, and `course_defaults` states
 * how many of each. The old seed had to guess both from item names. Guessing
 * is what produced a catalogue where the same book existed twice.
 *
 * What this script does NOT carry over:
 *   - `books.class_grade`. An item's "home" grade contradicts the map for
 *     every copy shared between classes (Register belongs to 9 and 10, Urdu
 *     Copy to eight different classes). The map is the only truth here.
 *   - `course_defaults.item_name_pattern` as a pattern. Each pattern is
 *     resolved once, here, into an explicit (class, item, quantity) row, so
 *     nothing is matched by name at sale time.
 *
 * Usage:
 *   node scripts/seed.mjs --dry-run
 *   node scripts/seed.mjs --admin-email a@b.com --admin-password 'secret12'
 *
 * Flags:
 *   --dry-run           parse, resolve and report; touch no database
 *   --force             seed even though items already exist
 *   --include-testing   keep the "Testing" class and its web_test_* items
 *   --reorder-book N    reorder level for books (default 10)
 *   --reorder-copy N    reorder level for copies (default 50)
 *   --show CODE         print one resolved course (e.g. --show G8, --show NUR)
 */
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import bcrypt from "bcryptjs";

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, "..", "data");

const argv = process.argv.slice(2);
const has = (flag) => argv.includes(`--${flag}`);
const argOf = (flag, fallback) => {
  const i = argv.indexOf(`--${flag}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DRY_RUN = has("dry-run");
const FORCE = has("force");
const INCLUDE_TESTING = has("include-testing");
const REORDER_BOOK = Number(argOf("reorder-book", 10));
const REORDER_COPY = Number(argOf("reorder-copy", 50));

const SHOW = argOf("show", null);

const ADMIN_EMAIL = argOf("admin-email", process.env.SEED_ADMIN_EMAIL);
const ADMIN_PASSWORD = argOf("admin-password", process.env.SEED_ADMIN_PASSWORD);
const ADMIN_NAME = argOf("admin-name", process.env.SEED_ADMIN_NAME ?? "Administrator");

// ------------------------------------------------------------------ csv

/** A CSV reader that honours quoted fields, doubled quotes and CRLF. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];

  const header = rows[0].map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => v.trim() !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

/**
 * Mirrors fn_normalize in the database: lowercase, punctuation to spaces,
 * runs of whitespace collapsed. Used here only to spot duplicates before
 * they are inserted.
 */
function normalize(s) {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    // "Nusery" for "Nursery" appears in both a class label and an item
    // pattern in the export. Fixing it here keeps the row's intent.
    .replace(/\bnusery\b/g, "nursery");
}

// ------------------------------------------------------------- classes

/**
 * The grade labels in the export, mapped to class codes and an order that
 * reads the way a bookseller thinks: Nursery, KG, then 1 to 10.
 *
 * "Nusery" is a typo present in course_defaults; it resolves to Nursery
 * rather than being dropped, because the row behind it is a real default.
 */
function classFor(rawGrade) {
  const g = String(rawGrade ?? "").trim();
  const key = g.toLowerCase().replace(/\s+/g, "");
  const named = {
    nursery: { code: "NUR", name: "Nursery", sortOrder: 10 },
    nusery: { code: "NUR", name: "Nursery", sortOrder: 10 },
    "kg-1": { code: "KG1", name: "KG-1", sortOrder: 20 },
    kg1: { code: "KG1", name: "KG-1", sortOrder: 20 },
    "kg-2": { code: "KG2", name: "KG-2", sortOrder: 30 },
    kg2: { code: "KG2", name: "KG-2", sortOrder: 30 },
    testing: { code: "TEST", name: "Testing", sortOrder: 990 },
  };
  if (named[key]) return named[key];
  const n = Number(key);
  if (Number.isInteger(n) && n >= 1 && n <= 12) {
    return { code: `G${n}`, name: `Class ${n}`, sortOrder: 100 + n * 10 };
  }
  return null;
}

/** Classes 9 and 10 offer Biology or Computer, never both. */
const ELECTIVE_CLASSES = new Set(["G9", "G10"]);
const ELECTIVE_MATCH = /^(biology|computer)\b/i;

const TESTING_ITEM = /^web_test_/i;

// -------------------------------------------------------------- resolve

/**
 * Picks the default quantity for one item in one class.
 *
 * The export stores quantities as name patterns, which is ambiguous: in
 * Nursery, the pattern "Urdu Copy" is a substring of the item "Nursery Urdu
 * Copy". Resolving by *most specific match wins* (exact, then longest
 * substring either way) removes the ambiguity, and it happens once here
 * rather than on every sale.
 */
function resolveQty(itemName, patterns) {
  const target = normalize(itemName);
  let best = null;

  for (const p of patterns) {
    const pat = normalize(p.pattern);
    if (!pat) continue;
    let score = -1;
    if (pat === target) score = 1000 + pat.length;
    else if (target.includes(pat)) score = pat.length;
    else if (pat.includes(target)) score = target.length - 1;
    if (score > 0 && (!best || score > best.score)) {
      best = { score, qty: p.qty, pattern: p.pattern };
    }
  }
  return best;
}

// ----------------------------------------------------------------- main

async function main() {
  const [booksRaw, mapRaw, defaultsRaw] = await Promise.all([
    readFile(join(dataDir, "books.csv"), "utf8"),
    readFile(join(dataDir, "class_item_map.csv"), "utf8"),
    readFile(join(dataDir, "course_defaults.csv"), "utf8"),
  ]);

  const books = parseCsv(booksRaw);
  const mapRows = parseCsv(mapRaw);
  const defaultRows = parseCsv(defaultsRaw);

  const notes = [];

  // ----------------------------------------------------------- items
  const items = [];
  const skippedItems = [];
  for (const b of books) {
    const name = b.name.trim();
    const oldId = Number(b.id);
    if (!name || !Number.isInteger(oldId)) continue;

    const isTesting =
      TESTING_ITEM.test(name) || b.class_grade.trim().toLowerCase() === "testing";
    if (isTesting && !INCLUDE_TESTING) {
      skippedItems.push(name);
      continue;
    }

    const type = b.Type?.trim().toLowerCase() === "copy" ? "COPY" : "BOOK";
    items.push({
      oldId,
      name,
      publisher: b.publisher?.trim() || null,
      type,
      price: Number(b.price) || 0,
      qty: Math.max(0, Number(b.quantity) || 0),
      reorderLevel: type === "COPY" ? REORDER_COPY : REORDER_BOOK,
      homeGrade: b.class_grade?.trim() || null,
    });
  }

  // Items whose name is a copy but typed as a book. Reported, not changed:
  // the export is the record, and the kind is editable in the catalogue.
  for (const i of items) {
    if (i.type === "BOOK" && /\bcopy\b/i.test(i.name)) {
      notes.push(`"${i.name}" is named like a copy but exported as Type=Book.`);
    }
  }

  // Two items that normalize to the same name are the duplicate problem the
  // new schema is meant to end. Flag them; merging is a decision for a person.
  const byNorm = new Map();
  for (const i of items) {
    const k = normalize(i.name);
    if (!byNorm.has(k)) byNorm.set(k, []);
    byNorm.get(k).push(i);
  }
  const duplicates = [...byNorm.values()].filter((g) => g.length > 1);

  // --------------------------------------------------------- classes
  const classes = new Map();
  const unknownGrades = new Set();
  for (const r of mapRows) {
    const cls = classFor(r.class_grade);
    if (!cls) {
      unknownGrades.add(r.class_grade);
      continue;
    }
    if (cls.code === "TEST" && !INCLUDE_TESTING) continue;
    classes.set(cls.code, cls);
  }
  // Always offer the full ladder, even where the export has no rows yet.
  for (const g of ["Nursery", "KG-1", "KG-2", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const cls = classFor(g);
    if (cls) classes.set(cls.code, cls);
  }

  // ------------------------------------------------------ curriculum
  const itemByOldId = new Map(items.map((i) => [i.oldId, i]));
  const defaultsByClass = new Map();
  for (const d of defaultRows) {
    const cls = classFor(d.class_grade);
    if (!cls) {
      unknownGrades.add(d.class_grade);
      continue;
    }
    if (cls.code === "TEST" && !INCLUDE_TESTING) continue;
    if (!defaultsByClass.has(cls.code)) defaultsByClass.set(cls.code, []);
    defaultsByClass.get(cls.code).push({
      pattern: d.item_name_pattern.trim(),
      qty: Math.max(1, Number(d.default_qty) || 1),
    });
  }

  const curriculum = [];
  const seenPair = new Set();
  const missingItems = [];
  const usedPatterns = new Set();

  for (const r of mapRows) {
    const cls = classFor(r.class_grade);
    if (!cls) continue;
    if (cls.code === "TEST" && !INCLUDE_TESTING) continue;

    const item = itemByOldId.get(Number(r.book_id));
    if (!item) {
      missingItems.push(`${cls.name} -> item id ${r.book_id}`);
      continue;
    }

    const pairKey = `${cls.code}:${item.oldId}`;
    if (seenPair.has(pairKey)) continue;
    seenPair.add(pairKey);

    const patterns = defaultsByClass.get(cls.code) ?? [];
    const match = resolveQty(item.name, patterns);
    if (match) usedPatterns.add(`${cls.code}:${normalize(match.pattern)}`);

    const isElective =
      ELECTIVE_CLASSES.has(cls.code) && ELECTIVE_MATCH.test(item.name);

    curriculum.push({
      classCode: cls.code,
      className: cls.name,
      oldItemId: item.oldId,
      itemName: item.name,
      defaultQty: match ? match.qty : 1,
      matchedPattern: match ? match.pattern : null,
      isElective,
      type: item.type,
    });
  }

  // Patterns that matched nothing are quantities the old system silently
  // ignored — worth seeing rather than losing again.
  const orphanDefaults = [];
  for (const [code, patterns] of defaultsByClass) {
    for (const p of patterns) {
      if (!usedPatterns.has(`${code}:${normalize(p.pattern)}`)) {
        orphanDefaults.push(`${code}: "${p.pattern}" (qty ${p.qty})`);
      }
    }
  }

  // Sort so a course reads books first, then copies, each alphabetically.
  curriculum.sort(
    (a, b) =>
      a.classCode.localeCompare(b.classCode) ||
      (a.type === b.type ? 0 : a.type === "BOOK" ? -1 : 1) ||
      a.itemName.localeCompare(b.itemName),
  );

  // ---------------------------------------------------------- report
  const openingUnits = items.reduce((s, i) => s + i.qty, 0);
  const inNoCourse = items.filter(
    (i) => !curriculum.some((c) => c.oldItemId === i.oldId),
  );

  console.log("Parsed from data/:");
  console.log(`  items            ${items.length} (${items.filter((i) => i.type === "BOOK").length} books, ${items.filter((i) => i.type === "COPY").length} copies)`);
  console.log(`  opening stock    ${openingUnits} units`);
  console.log(`  classes          ${classes.size}`);
  console.log(`  course rows      ${curriculum.length}`);
  console.log(`  elective rows    ${curriculum.filter((c) => c.isElective).length}`);
  console.log(`  quantities set   ${curriculum.filter((c) => c.matchedPattern).length} from course_defaults, ${curriculum.filter((c) => !c.matchedPattern).length} defaulted to 1`);
  console.log(`  not in any course ${inNoCourse.length} item(s) — sellable on their own`);
  if (skippedItems.length) {
    console.log(`  skipped test data ${skippedItems.length} item(s) (--include-testing keeps them)`);
  }

  if (duplicates.length) {
    console.log("\nPossible duplicate names (imported as separate items):");
    for (const g of duplicates) console.log(`  ${g.map((x) => `#${x.oldId} ${x.name}`).join("  |  ")}`);
  }
  if (missingItems.length) {
    console.log("\nCourse rows pointing at items that are not in books.csv (skipped):");
    for (const m of missingItems) console.log(`  ${m}`);
  }
  if (orphanDefaults.length) {
    console.log("\nQuantities in course_defaults that match no item in that class (ignored):");
    for (const o of orphanDefaults) console.log(`  ${o}`);
  }
  if (unknownGrades.size) {
    console.log(`\nUnrecognised class labels: ${[...unknownGrades].map((g) => JSON.stringify(g)).join(", ")}`);
  }
  if (notes.length) {
    console.log("\nWorth a look in the catalogue later:");
    for (const n of [...new Set(notes)]) console.log(`  ${n}`);
  }

  for (const code of ELECTIVE_CLASSES) {
    const picks = curriculum.filter((c) => c.classCode === code && c.isElective);
    if (picks.length) {
      console.log(`\n${code} science elective: ${picks.map((p) => p.itemName).join(" / ")}`);
    }
  }

  if (SHOW) {
    const want = String(SHOW).toUpperCase();
    const rows = curriculum.filter(
      (c) => c.classCode === want || c.className.toUpperCase() === want,
    );
    if (!rows.length) {
      console.log(`\nNo course found for "${SHOW}". Codes: ${[...classes.keys()].join(", ")}`);
    } else {
      console.log(`\n${rows[0].className} — ${rows.length} line(s):`);
      let total = 0;
      for (const c of rows) {
        const item = itemByOldId.get(c.oldItemId);
        const line = item.price * c.defaultQty;
        if (!c.isElective) total += line;
        console.log(
          `  ${String(c.defaultQty).padStart(2)} x ${c.itemName.padEnd(46).slice(0, 46)} ` +
            `${String(item.price).padStart(8)} = ${String(line).padStart(9)}` +
            `${c.isElective ? "   [choice]" : ""}` +
            `${c.matchedPattern ? `   <- "${c.matchedPattern}"` : ""}`,
        );
      }
      const electives = rows.filter((c) => c.isElective);
      const cheapest = electives.length
        ? Math.min(...electives.map((c) => itemByOldId.get(c.oldItemId).price * c.defaultQty))
        : 0;
      console.log(`  course price: ${total + cheapest}${electives.length ? " (with the cheaper choice)" : ""}`);
    }
  }

  if (DRY_RUN) {
    console.log("\nDry run: nothing was written.");
    return;
  }

  // ------------------------------------------------------------- write
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  const client = new pg.Client({ connectionString: url, ssl: sslFor(url) });
  await client.connect();

  try {
    const { rows: existing } = await client.query("SELECT count(*)::int AS n FROM items");
    if (existing[0].n > 0 && !FORCE) {
      console.error(
        `\nThe catalogue already holds ${existing[0].n} item(s). ` +
          "Re-seeding would duplicate it. Start clean with `npm run db:reset && npm run db:migrate`, " +
          "or pass --force if you know what you are doing.",
      );
      process.exit(1);
    }

    await client.query("BEGIN");

    // ------------------------------------------------------ admin user
    let adminId;
    const { rows: admins } = await client.query(
      "SELECT id FROM users WHERE role = 'ADMIN' ORDER BY id LIMIT 1",
    );
    if (admins.length) {
      adminId = admins[0].id;
    } else {
      if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
        throw new Error(
          "No administrator exists yet. Re-run with --admin-email and --admin-password " +
            "(at least 8 characters).",
        );
      }
      if (ADMIN_PASSWORD.length < 8) {
        throw new Error("The administrator password must be at least 8 characters.");
      }
      const hash = await bcrypt.hash(ADMIN_PASSWORD, 12);
      const { rows } = await client.query(
        `INSERT INTO users (email, name, password_hash, role)
         VALUES (lower($1), $2, $3, 'ADMIN') RETURNING id`,
        [ADMIN_EMAIL, ADMIN_NAME, hash],
      );
      adminId = rows[0].id;
      console.log(`\nCreated administrator ${ADMIN_EMAIL}.`);
    }

    // --------------------------------------------------------- classes
    const classIds = new Map();
    for (const cls of [...classes.values()].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const { rows } = await client.query(
        `INSERT INTO classes (code, name, sort_order)
         VALUES ($1, $2, $3)
         ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [cls.code, cls.name, cls.sortOrder],
      );
      classIds.set(cls.code, rows[0].id);
    }

    // ----------------------------------------------------------- items
    const itemIds = new Map();
    for (const i of items) {
      // quantity_on_hand is left at zero: a trigger refuses any other value
      // on insert, because stock may only arrive through the ledger.
      const { rows } = await client.query(
        `INSERT INTO items (name, publisher, type, price, reorder_level)
         VALUES ($1, $2, $3::"ItemType", $4, $5)
         RETURNING id`,
        [i.name, i.publisher, i.type, i.price, i.reorderLevel],
      );
      const id = rows[0].id;
      itemIds.set(i.oldId, id);

      if (i.qty > 0) {
        await client.query(
          `INSERT INTO stock_movements
             (item_id, delta, reason, ref_type, created_by_user_id, note)
           VALUES ($1, $2, 'OPENING', 'seed', $3, $4)`,
          [id, i.qty, adminId, "opening balance from database export"],
        );
      }
    }

    // ------------------------------------------------- elective groups
    const groupIds = new Map();
    for (const code of ELECTIVE_CLASSES) {
      const needed = curriculum.some((c) => c.classCode === code && c.isElective);
      if (!needed) continue;
      const { rows } = await client.query(
        `INSERT INTO elective_groups (class_id, group_key, label, min_select, max_select)
         VALUES ($1, 'SCIENCE_ELECTIVE', 'Science elective', 1, 1)
         ON CONFLICT (class_id, group_key) DO UPDATE SET label = EXCLUDED.label
         RETURNING id`,
        [classIds.get(code)],
      );
      groupIds.set(code, rows[0].id);
    }

    // ------------------------------------------------------ curriculum
    let sortOrder = 0;
    let lastClass = null;
    for (const c of curriculum) {
      if (c.classCode !== lastClass) {
        sortOrder = 0;
        lastClass = c.classCode;
      }
      await client.query(
        `INSERT INTO curriculum_items
           (class_id, item_id, default_qty, elective_group_id, sort_order)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (class_id, item_id) DO UPDATE
           SET default_qty = EXCLUDED.default_qty,
               elective_group_id = EXCLUDED.elective_group_id`,
        [
          classIds.get(c.classCode),
          itemIds.get(c.oldItemId),
          c.defaultQty,
          c.isElective ? (groupIds.get(c.classCode) ?? null) : null,
          (sortOrder += 10),
        ],
      );
    }

    await client.query("COMMIT");

    const { rows: check } = await client.query(
      "SELECT count(*)::int AS n FROM fn_verify_stock_integrity()",
    );
    const { rows: totals } = await client.query(
      `SELECT (SELECT count(*) FROM items)::int            AS items,
              (SELECT count(*) FROM classes)::int          AS classes,
              (SELECT count(*) FROM curriculum_items)::int AS course_rows,
              (SELECT coalesce(sum(quantity_on_hand),0) FROM items)::int AS units`,
    );
    const t = totals[0];
    console.log(
      `\nSeeded ${t.items} items, ${t.classes} classes, ${t.course_rows} course rows, ` +
        `${t.units} units of opening stock.`,
    );
    console.log(
      `Stock integrity check: ${check[0].n === 0 ? "clean" : `${check[0].n} PROBLEM(S)`}.`,
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

/** Matches src/db/ssl.ts: no TLS locally, relaxed TLS for hosted Postgres. */
function sslFor(connectionString) {
  const override = process.env.DATABASE_SSL;
  if (override === "disable") return false;
  if (override === "require") return { rejectUnauthorized: false };
  try {
    const u = new URL(connectionString);
    if (u.searchParams.get("sslmode") === "disable") return false;
    const local = ["localhost", "127.0.0.1", "::1", "0.0.0.0", ""].includes(u.hostname);
    return local ? false : { rejectUnauthorized: false };
  } catch {
    return { rejectUnauthorized: false };
  }
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
