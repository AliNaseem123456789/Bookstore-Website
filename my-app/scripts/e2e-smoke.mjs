#!/usr/bin/env node
/**
 * End-to-end smoke test against a running server.
 *
 * Drives the real HTTP API the way the web app and the phone app will:
 * sign in, read a course, sell it, take a payment, return an item, fulfil a
 * backorder, and check that permissions and idempotency actually bite.
 *
 *   BASE=http://127.0.0.1:3000 node scripts/e2e-smoke.mjs
 */
const BASE = process.env.BASE ?? "http://127.0.0.1:3000";
const EMAIL = process.env.E2E_EMAIL ?? "ali@alsehar.test";
const PASSWORD = process.env.E2E_PASSWORD ?? "bookstore123";

let passed = 0;
let failed = 0;
let cookie = "";

function ok(label, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
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

const get = (p, h) => call("GET", p, undefined, h);
const post = (p, b, h) => call("POST", p, b, h);
const patch = (p, b) => call("PATCH", p, b);

async function main() {
  console.log(`Testing ${BASE}\n`);

  // ----------------------------------------------------------- auth gate
  cookie = "";
  const anon = await get("/api/items");
  ok("signed-out request is refused", anon.status === 401, `got ${anon.status}`);

  const badLogin = await post("/api/auth/login", {
    email: EMAIL,
    password: "wrong-password",
  });
  ok("wrong password is refused", badLogin.status === 401);
  ok(
    "failure message does not reveal whether the email exists",
    !/no such user|not found|unknown email/i.test(badLogin.data?.error ?? ""),
    badLogin.data?.error,
  );

  const login = await post("/api/auth/login", { email: EMAIL, password: PASSWORD });
  ok("sign in works", login.status === 200 && Boolean(cookie));
  ok("session carries the role", login.data?.user?.role === "ADMIN");
  ok(
    "session carries permissions",
    Array.isArray(login.data?.user?.permissions) &&
      login.data.user.permissions.includes("sale.create"),
  );

  const bearer = login.data?.token;
  ok("a bearer token is issued for the phone app", typeof bearer === "string");

  // The phone app path: no cookie, Authorization header only.
  const savedCookie = cookie;
  cookie = "";
  const viaBearer = await get("/api/classes", { Authorization: `Bearer ${bearer}` });
  ok("bearer token authenticates", viaBearer.status === 200);
  cookie = savedCookie;

  // ------------------------------------------------------------- reading
  const classes = await get("/api/classes");
  ok("classes load", classes.status === 200 && classes.data.classes.length === 13,
     `${classes.data?.classes?.length} classes`);

  const g9 = classes.data.classes.find((c) => c.code === "G9");
  const course = await get(`/api/courses/${g9.id}`);
  ok("class 9 course loads", course.status === 200);
  ok(
    "class 9 has a science elective",
    course.data.course.electiveGroups.length === 1 &&
      course.data.course.electiveGroups[0].items.length === 2,
    course.data.course.electiveGroups[0]?.items.map((i) => i.name).join(" / "),
  );

  const nursery = classes.data.classes.find((c) => c.code === "NUR");
  const nurseryCourse = await get(`/api/courses/${nursery.id}`);
  ok(
    "nursery has no electives, everything is required",
    nurseryCourse.data.course.electiveGroups.length === 0 &&
      nurseryCourse.data.course.mandatory.length > 0,
    `${nurseryCourse.data.course.mandatory.length} required items`,
  );

  // -------------------------------------------------- elective enforcement
  const group = course.data.course.electiveGroups[0];
  const [biology, computer] = group.items;
  const mandatory = course.data.course.mandatory;

  const bothElectives = await post("/api/sales", {
    buyerName: "Elective Tester",
    lines: [
      ...mandatory.map((i) => ({
        itemId: i.itemId, qty: i.defaultQty, classId: g9.id, fromFullCourse: true,
      })),
      { itemId: biology.itemId, qty: 1, classId: g9.id, fromFullCourse: true },
      { itemId: computer.itemId, qty: 1, classId: g9.id, fromFullCourse: true },
    ],
  });
  ok(
    "a full course with BOTH electives is refused",
    bothElectives.status === 400,
    bothElectives.data?.error,
  );

  const noElective = await post("/api/sales", {
    buyerName: "Elective Tester",
    lines: mandatory.map((i) => ({
      itemId: i.itemId, qty: i.defaultQty, classId: g9.id, fromFullCourse: true,
    })),
  });
  ok(
    "a full course with NO elective is refused",
    noElective.status === 400,
    noElective.data?.error,
  );

  // ------------------------------------------------------------- checkout
  const before = await get(`/api/items/${biology.itemId}`);
  const stockBefore = before.data.item.quantityOnHand;

  const sale = await post("/api/sales", {
    buyerName: "Fatima Noor",
    buyerPhone: "03001234567",
    lines: [
      ...mandatory.map((i) => ({
        itemId: i.itemId, qty: i.defaultQty, classId: g9.id, fromFullCourse: true,
      })),
      { itemId: biology.itemId, qty: 1, classId: g9.id, fromFullCourse: true },
    ],
    orderDiscount: 100,
    amountPaid: 500,
  });
  ok("full course sells", sale.status === 201, sale.data?.error);

  const saleId = sale.data?.sale?.id;
  const saleData = sale.data?.sale;
  ok("sale gets a readable number", /^S-\d{4}-\d{6}$/.test(saleData?.code ?? ""),
     saleData?.code);
  ok("discount is applied", saleData?.discountTotal === 100);
  ok(
    "gross is subtotal minus discount",
    Math.abs(saleData.grossTotal - (saleData.subtotal - 100)) < 0.005,
  );
  ok("opening payment recorded", saleData?.amountReceived === 500);
  ok(
    "balance is what is left",
    Math.abs(saleData.balanceDue - (saleData.grossTotal - 500)) < 0.005,
    `owes ${saleData.balanceDue}`,
  );

  const after = await get(`/api/items/${biology.itemId}`);
  ok(
    "stock dropped by exactly one",
    after.data.item.quantityOnHand === stockBefore - 1,
    `${stockBefore} -> ${after.data.item.quantityOnHand}`,
  );

  // -------------------------------------------------------- idempotency
  const key = `smoke-${Date.now()}`;
  const payload = {
    buyerName: "Idempotent Buyer",
    lines: [{ itemId: biology.itemId, qty: 1 }],
  };
  const first = await post("/api/sales", payload, { "Idempotency-Key": key });
  const replay = await post("/api/sales", payload, { "Idempotency-Key": key });
  ok("first submit creates the sale", first.status === 201);
  ok(
    "the same key replays instead of selling twice",
    replay.status === 201 && replay.data.sale.id === first.data.sale.id,
    `ids ${first.data?.sale?.id} / ${replay.data?.sale?.id}`,
  );

  const afterReplay = await get(`/api/items/${biology.itemId}`);
  ok(
    "stock moved only once for the retried request",
    afterReplay.data.item.quantityOnHand === stockBefore - 2,
    `${afterReplay.data.item.quantityOnHand}`,
  );

  // ------------------------------------------------------------- payments
  const over = await post(`/api/sales/${saleId}/payments`, { amount: 9_999_999 });
  ok("overpayment is refused", over.status === 409 || over.status === 400,
     over.data?.error);

  const settle = await post(`/api/sales/${saleId}/payments`, {
    amount: saleData.balanceDue,
  });
  ok("paying the balance settles the sale",
     settle.status === 201 && settle.data.sale.isSettled === true,
     `balance ${settle.data?.sale?.balanceDue}`);

  // -------------------------------------------------------------- returns
  const bioLine = settle.data.sale.lines.find((l) => l.itemId === biology.itemId);
  const ret = await post(`/api/sales/${saleId}/returns`, {
    lines: [{ saleLineId: bioLine.id, qty: 1, condition: "RESELLABLE" }],
    reason: "smoke test",
    payOutCredit: true,
  });
  ok("return is accepted", ret.status === 201, ret.data?.error);
  ok(
    "resellable return puts the book back",
    (await get(`/api/items/${biology.itemId}`)).data.item.quantityOnHand ===
      stockBefore - 1,
  );
  ok(
    "credit was paid out, so nothing is left owing either way",
    Math.abs(ret.data?.sale?.balanceDue ?? 1) < 0.005,
    `balance ${ret.data?.sale?.balanceDue}`,
  );

  const overReturn = await post(`/api/sales/${saleId}/returns`, {
    lines: [{ saleLineId: bioLine.id, qty: 5, condition: "RESELLABLE" }],
  });
  ok("returning more than was bought is refused",
     overReturn.status === 409 || overReturn.status === 400,
     overReturn.data?.error);

  // ---------------------------------------------- backorder and fulfilment
  const scarce = mandatory[0];
  const scarceBefore = (await get(`/api/items/${scarce.itemId}`)).data.item
    .quantityOnHand;

  const oversell = await post("/api/sales", {
    buyerName: "Backorder Buyer",
    lines: [{ itemId: scarce.itemId, qty: scarceBefore + 3 }],
  });
  ok("selling more than is in stock still goes through", oversell.status === 201);
  const oversoldLine = oversell.data.sale.lines[0];
  ok("the shortfall is backordered, not negative stock",
     oversoldLine.qtyDelivered === scarceBefore && oversoldLine.qtyBackordered === 3,
     `delivered ${oversoldLine.qtyDelivered}, backordered ${oversoldLine.qtyBackordered}`);
  ok("stock sits at exactly zero",
     (await get(`/api/items/${scarce.itemId}`)).data.item.quantityOnHand === 0);

  const backorders = await get("/api/stock/backorders");
  ok("the backorder appears on the hand-over list",
     backorders.data.groups.some((g) => g.saleId === oversell.data.sale.id));

  const cannotFulfil = await post("/api/stock/fulfill", {
    lines: [{ saleLineId: oversoldLine.id, qty: 3 }],
  });
  ok("cannot hand over stock that is not there",
     cannotFulfil.status === 409 || cannotFulfil.status === 400,
     cannotFulfil.data?.error);

  const received = await post("/api/stock/receive", {
    lines: [{ itemId: scarce.itemId, qty: 10 }],
    supplier: "Smoke Test Supplier",
  });
  ok("stock can be received", received.status === 201, received.data?.batch?.code);

  const fulfilled = await post("/api/stock/fulfill", {
    lines: [{ saleLineId: oversoldLine.id, qty: 3 }],
  });
  ok("backorder can now be handed over", fulfilled.status === 200, fulfilled.data?.error);
  ok("handing over deducts stock",
     (await get(`/api/items/${scarce.itemId}`)).data.item.quantityOnHand === 7,
     `expected 7, got ${(await get(`/api/items/${scarce.itemId}`)).data.item.quantityOnHand}`);

  // ----------------------------------------------------- stock is guarded
  const correct = await post("/api/stock/correct", {
    itemId: scarce.itemId, countedQty: 9, reason: "smoke test shelf count",
  });
  ok("admin can correct stock to a counted figure",
     correct.status === 200 && correct.data.quantityOnHand === 9);

  const noReason = await post("/api/stock/correct", {
    itemId: scarce.itemId, countedQty: 5, reason: "",
  });
  ok("a correction without a reason is refused", noReason.status === 400);

  // --------------------------------------------------------- permissions
  const cashier = await post("/api/users", {
    name: "Smoke Cashier",
    email: `cashier-${Date.now()}@alsehar.test`,
    password: "cashier123",
    role: "CASHIER",
  });
  ok("admin can add staff", cashier.status === 201, cashier.data?.error);

  const adminCookie = cookie;
  cookie = "";
  await post("/api/auth/login", {
    email: cashier.data.user.email,
    password: "cashier123",
  });

  const cashierSale = await post("/api/sales", {
    buyerName: "Cashier Sale",
    lines: [{ itemId: scarce.itemId, qty: 1 }],
  });
  ok("a cashier can sell", cashierSale.status === 201);

  const cashierStaff = await get("/api/users");
  ok("a cashier cannot see staff", cashierStaff.status === 403, cashierStaff.data?.error);

  const cashierPrice = await patch(`/api/items/${scarce.itemId}`, { price: 1 });
  ok("a cashier cannot change prices",
     cashierPrice.status === 403, cashierPrice.data?.error);

  const cashierCorrect = await post("/api/stock/correct", {
    itemId: scarce.itemId, countedQty: 999, reason: "trying it on",
  });
  ok("a cashier cannot correct stock", cashierCorrect.status === 403);

  const cashierAudit = await get("/api/audit");
  ok("a cashier cannot read the activity log", cashierAudit.status === 403);

  const cashierSales = await get("/api/sales");
  ok("a cashier sees only their own sales",
     cashierSales.status === 200 &&
       cashierSales.data.sales.every((s) => s.soldByName === "Smoke Cashier"),
     `${cashierSales.data?.sales?.length} sale(s) visible`);

  const othersSale = await get(`/api/sales/${saleId}`);
  ok("a cashier cannot open someone else's sale", othersSale.status === 403);

  cookie = adminCookie;

  // ---------------------------------------------------------- reporting
  const dash = await get("/api/analytics/dashboard");
  ok("the dashboard loads", dash.status === 200);
  ok("it counts the sales we just made", dash.data.overview.transactions >= 4,
     `${dash.data?.overview?.transactions} sales`);
  ok("it attributes revenue per person",
     dash.data.sellers.filter((s) => s.transactions > 0).length >= 2,
     dash.data?.sellers
       ?.filter((s) => s.transactions > 0)
       .map((s) => `${s.userName}:${s.revenue}`)
       .join(" "));

  const audit = await get("/api/audit");
  ok("the activity log recorded our actions", audit.status === 200 &&
     audit.data.entries.some((e) => e.action === "SALE_CREATED"));
  ok("it recorded the failed sign-in",
     audit.data.entries.some((e) => e.action === "LOGIN_FAILED"));
  ok("it recorded the stock correction or receipt",
     audit.data.entries.some((e) => e.action === "STOCK_RECEIVED"));

  const pending = await get("/api/stock/pending");
  ok("the reorder list loads", pending.status === 200);

  // ------------------------------------------------- the self-audit, last
  const verify = await get("/api/stock/verify");
  ok("stock ledger and quantities still reconcile after all of that",
     verify.status === 200 && verify.data.healthy === true,
     JSON.stringify(verify.data?.violations ?? []));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
