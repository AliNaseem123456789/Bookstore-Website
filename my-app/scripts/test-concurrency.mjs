#!/usr/bin/env node
/**
 * Concurrency proof, over the real HTTP API.
 *
 * The invariant this defends: a unit of stock is never sold twice, and never
 * lost. Two cashiers reaching for the last copy at the same instant must
 * produce one delivery and one backorder — never two deliveries, never
 * negative stock, never a silently dropped request.
 *
 * Unlike prisma/sql/tests/test_concurrency.sh, this is safe to run against a
 * live database: it creates its own scratch items, touches nothing else, and
 * retires them at the end. It does leave its own test sales behind.
 *
 *   $env:E2E_EMAIL="..."; $env:E2E_PASSWORD="..."; npm run test:concurrency
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

/** Stock to put on the shelf, and how many simultaneous buyers to invent. */
const STOCK = 10;
const BUYERS = 24;
const PAIR_BUYERS = 16;

let cookie = "";
let passed = 0;
let failed = 0;

function ok(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, body, headers = {}) {
  const h = { ...headers };
  if (body !== undefined) h["Content-Type"] = "application/json";
  if (cookie) h.Cookie = cookie;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "manual",
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) {
    const m = setCookie.match(/bookstore_session=([^;]*)/);
    if (m) cookie = `bookstore_session=${m[1]}`;
  }
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: res.status, data };
}

const tag = Date.now().toString(36).toUpperCase();

async function makeProbe(suffix, qty) {
  const res = await call("POST", "/api/items", {
    name: `ZZ concurrency probe ${tag}-${suffix}`,
    type: "STATIONERY",
    price: 100,
    reorderLevel: 0,
    openingQty: qty,
    confirmDuplicate: true,
  });
  if (res.status !== 201) {
    throw new Error(`could not create probe item: ${res.data?.error ?? res.status}`);
  }
  return res.data.item;
}

async function main() {
  if (!EMAIL || !PASSWORD) {
    console.error("Set E2E_EMAIL and E2E_PASSWORD to an administrator account.");
    process.exit(1);
  }

  console.log(`Testing ${BASE}\n`);

  const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) {
    console.error(`Could not sign in: ${login.data?.error ?? login.status}`);
    process.exit(1);
  }

  // ------------------------------------------------ one item, many buyers
  const probe = await makeProbe("A", STOCK);
  console.log(`${BUYERS} simultaneous buyers, ${STOCK} on the shelf (item ${probe.code})\n`);

  const results = await Promise.all(
    Array.from({ length: BUYERS }, (_, i) =>
      call(
        "POST",
        "/api/sales",
        {
          buyerName: `Probe buyer ${i + 1}`,
          lines: [{ itemId: probe.id, qty: 1 }],
          amountPaid: 100,
        },
        { "Idempotency-Key": `${tag}-A-${i}` },
      ),
    ),
  );

  const created = results.filter((r) => r.status === 201);
  const errors = results.filter((r) => r.status !== 201);

  ok(
    "every request got a definite answer",
    errors.length === 0,
    errors.length ? `${errors.length} failed: ${errors[0].data?.error ?? errors[0].status}` : `${created.length} sales`,
  );

  let delivered = 0;
  let backordered = 0;
  for (const r of created) {
    for (const line of r.data.sale.lines) {
      delivered += line.qtyDelivered;
      backordered += line.qtyBackordered;
    }
  }

  ok(
    "no unit was sold twice: deliveries never exceed the stock that existed",
    delivered <= STOCK,
    `delivered ${delivered} of ${STOCK}`,
  );
  ok(
    "no unit was lost: every stock unit on the shelf was delivered",
    delivered === STOCK,
    `delivered ${delivered}`,
  );
  ok(
    "the rest became backorders, not negative stock",
    backordered === BUYERS - STOCK,
    `backordered ${backordered}, expected ${BUYERS - STOCK}`,
  );
  ok(
    "every buyer is accounted for exactly once",
    delivered + backordered === BUYERS,
    `${delivered} + ${backordered} = ${delivered + backordered}`,
  );

  const after = await call("GET", `/api/items/${probe.id}`);
  ok(
    "the shelf is at exactly zero, never below",
    after.data.item.quantityOnHand === 0,
    `on hand ${after.data.item.quantityOnHand}`,
  );

  // --------------------------------------- two items, interleaved orders
  // Multi-item checkouts that overlap are where a naive implementation
  // deadlocks. The server locks items in ascending id order, so these should
  // all complete.
  const [p1, p2] = await Promise.all([makeProbe("B", 50), makeProbe("C", 50)]);
  console.log(`\n${PAIR_BUYERS} simultaneous two-item orders, interleaved\n`);

  const pairs = await Promise.all(
    Array.from({ length: PAIR_BUYERS }, (_, i) => {
      // Half the orders list the items in the opposite order.
      const lines =
        i % 2 === 0
          ? [{ itemId: p1.id, qty: 1 }, { itemId: p2.id, qty: 1 }]
          : [{ itemId: p2.id, qty: 1 }, { itemId: p1.id, qty: 1 }];
      return call(
        "POST",
        "/api/sales",
        { buyerName: `Pair buyer ${i + 1}`, lines, amountPaid: 200 },
        { "Idempotency-Key": `${tag}-P-${i}` },
      );
    }),
  );

  const pairErrors = pairs.filter((r) => r.status !== 201);
  ok(
    "overlapping multi-item orders never deadlock",
    pairErrors.length === 0,
    pairErrors.length ? `${pairErrors.length} failed: ${pairErrors[0].data?.error}` : `${pairs.length} sales`,
  );

  const [a1, a2] = await Promise.all([
    call("GET", `/api/items/${p1.id}`),
    call("GET", `/api/items/${p2.id}`),
  ]);
  ok(
    "both items deducted exactly once per order",
    a1.data.item.quantityOnHand === 50 - PAIR_BUYERS &&
      a2.data.item.quantityOnHand === 50 - PAIR_BUYERS,
    `${a1.data.item.quantityOnHand} and ${a2.data.item.quantityOnHand}, expected ${50 - PAIR_BUYERS}`,
  );

  // ------------------------------------------------- the ledger must agree
  const verify = await call("GET", "/api/stock/verify");
  ok(
    "ledger and recorded quantities reconcile after all of that",
    verify.data.healthy === true,
    JSON.stringify(verify.data.violations ?? []),
  );

  // Retire the probes so they do not clutter the catalogue. They cannot be
  // deleted: sales reference them, and that history must stay intact.
  for (const p of [probe, p1, p2]) {
    await call("PATCH", `/api/items/${p.id}`, { isActive: false });
  }
  console.log(`\nProbe items retired (hidden from the catalogue, history kept).`);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\n" + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
