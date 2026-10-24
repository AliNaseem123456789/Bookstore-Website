/**
 * Drizzle schema — a typed mirror of prisma/sql/*.sql.
 *
 * The SQL files are the source of truth: they carry the CHECK constraints,
 * the triggers and the functions that actually guarantee stock integrity.
 * This file exists so reads are typed and refactor-safe.
 *
 * Columns marked READ-ONLY below are maintained by database triggers. The
 * database will reject an UPDATE from application code, so never put them
 * in a `.set()`.
 */
import {
  pgTable,
  pgEnum,
  serial,
  integer,
  text,
  boolean,
  numeric,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ------------------------------------------------------------------ enums

export const roleEnum = pgEnum("Role", ["ADMIN", "MANAGER", "CASHIER"]);
export const itemTypeEnum = pgEnum("ItemType", ["BOOK", "COPY", "STATIONERY"]);
export const saleStatusEnum = pgEnum("SaleStatus", ["COMPLETED", "VOIDED"]);
export const paymentMethodEnum = pgEnum("PaymentMethod", [
  "CASH",
  "CARD",
  "BANK_TRANSFER",
  "REFUND_CASH",
  "WRITE_OFF",
]);
export const movementReasonEnum = pgEnum("MovementReason", [
  "OPENING",
  "RESTOCK",
  "SALE",
  "BACKORDER_FULFILL",
  "RETURN_RESELLABLE",
  "WRITE_OFF",
  "CORRECTION",
]);
export const returnConditionEnum = pgEnum("ReturnCondition", [
  "RESELLABLE",
  "DAMAGED",
  "NOT_DELIVERED",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type PaymentMethod = (typeof paymentMethodEnum.enumValues)[number];
export type MovementReason = (typeof movementReasonEnum.enumValues)[number];
export type ReturnCondition = (typeof returnConditionEnum.enumValues)[number];

// ------------------------------------------------------------------ users

export const users = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: roleEnum("role").notNull().default("CASHIER"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_key").on(t.email),
    index("users_role_active_idx").on(t.role, t.isActive),
  ],
);

// ---------------------------------------------------------------- classes

export const classes = pgTable("classes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  sortOrder: integer("sort_order").notNull(),
  isActive: boolean("is_active").notNull().default(true),
});

// ------------------------------------------------------------------ items

export const items = pgTable(
  "items",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    /** READ-ONLY: set by trigger from `name`. */
    normalizedName: text("normalized_name").notNull(),
    publisher: text("publisher"),
    type: itemTypeEnum("type").notNull().default("BOOK"),
    price: numeric("price", { precision: 12, scale: 2 }).notNull(),
    /**
     * READ-ONLY. Maintained solely by the stock_movements trigger. Writing
     * this from application code raises an exception — use the
     * fn_take_stock / fn_restock / fn_adjust_stock functions.
     */
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    reorderLevel: integer("reorder_level").notNull().default(10),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("items_code_key").on(t.code),
    index("items_normalized_name_idx").on(t.normalizedName),
    index("items_type_active_idx").on(t.type, t.isActive),
  ],
);

export const itemAliases = pgTable(
  "item_aliases",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    alias: text("alias").notNull(),
    /** READ-ONLY: set by trigger from `alias`. */
    normalizedAlias: text("normalized_alias").notNull(),
  },
  (t) => [
    uniqueIndex("item_aliases_normalized_alias_key").on(t.normalizedAlias),
    index("item_aliases_item_idx").on(t.itemId),
  ],
);

export const priceHistory = pgTable(
  "price_history",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    oldPrice: numeric("old_price", { precision: 12, scale: 2 }).notNull(),
    newPrice: numeric("new_price", { precision: 12, scale: 2 }).notNull(),
    changedById: integer("changed_by_id").references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("price_history_item_idx").on(t.itemId, t.changedAt)],
);

// ------------------------------------------------------------- curriculum

export const electiveGroups = pgTable(
  "elective_groups",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id),
    groupKey: text("group_key").notNull(),
    label: text("label").notNull(),
    minSelect: integer("min_select").notNull().default(1),
    maxSelect: integer("max_select").notNull().default(1),
  },
  (t) => [uniqueIndex("elective_groups_class_key").on(t.classId, t.groupKey)],
);

export const curriculumItems = pgTable(
  "curriculum_items",
  {
    id: serial("id").primaryKey(),
    classId: integer("class_id")
      .notNull()
      .references(() => classes.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    defaultQty: integer("default_qty").notNull().default(1),
    /** null => mandatory part of the course. */
    electiveGroupId: integer("elective_group_id").references(() => electiveGroups.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("curriculum_items_class_item_key").on(t.classId, t.itemId),
    index("curriculum_class_idx").on(t.classId, t.sortOrder),
  ],
);

// ------------------------------------------------------------------ sales

export const sales = pgTable(
  "sales",
  {
    id: serial("id").primaryKey(),
    /** READ-ONLY: database default generates S-YYYY-NNNNNN. */
    code: text("code").notNull(),
    buyerName: text("buyer_name").notNull(),
    buyerPhone: text("buyer_phone"),
    soldByUserId: integer("sold_by_user_id")
      .notNull()
      .references(() => users.id),
    status: saleStatusEnum("status").notNull().default("COMPLETED"),

    // Immutable after checkout; the database rejects changes.
    subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
    discountTotal: numeric("discount_total", { precision: 12, scale: 2 }).notNull(),
    grossTotal: numeric("gross_total", { precision: 12, scale: 2 }).notNull(),

    // READ-ONLY: all four derived by trigger from the payment and return
    // ledgers. Insert a payment or a return to change what is owed.
    returnCredit: numeric("return_credit", { precision: 12, scale: 2 }).notNull(),
    amountReceived: numeric("amount_received", { precision: 12, scale: 2 }).notNull(),
    amountRefunded: numeric("amount_refunded", { precision: 12, scale: 2 }).notNull(),
    balanceDue: numeric("balance_due", { precision: 12, scale: 2 }).notNull(),
    isSettled: boolean("is_settled").notNull().default(false),

    note: text("note"),
    soldAt: timestamp("sold_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sales_code_key").on(t.code),
    index("sales_sold_at_idx").on(t.soldAt),
    index("sales_seller_idx").on(t.soldByUserId, t.soldAt),
    index("sales_settled_idx").on(t.isSettled, t.soldAt),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),

    // Snapshots: history does not change when the catalogue does.
    itemNameSnapshot: text("item_name_snapshot").notNull(),
    unitPrice: numeric("unit_price", { precision: 12, scale: 2 }).notNull(),

    qty: integer("qty").notNull(),
    lineDiscount: numeric("line_discount", { precision: 12, scale: 2 }).notNull(),
    lineTotal: numeric("line_total", { precision: 12, scale: 2 }).notNull(),

    // ordered = delivered + backordered + cancelled, always.
    qtyDelivered: integer("qty_delivered").notNull().default(0),
    qtyBackordered: integer("qty_backordered").notNull().default(0),
    qtyCancelled: integer("qty_cancelled").notNull().default(0),
    qtyReturned: integer("qty_returned").notNull().default(0),

    classId: integer("class_id").references(() => classes.id),
    fromFullCourse: boolean("from_full_course").notNull().default(false),
  },
  (t) => [
    index("sale_lines_sale_idx").on(t.saleId),
    index("sale_lines_item_idx").on(t.itemId),
  ],
);

/** Signed cash ledger. Append-only: the database rejects UPDATE and DELETE. */
export const payments = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    /** Positive = money in. Negative = money handed back. */
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull().default("CASH"),
    receivedByUserId: integer("received_by_user_id")
      .notNull()
      .references(() => users.id),
    returnId: integer("return_id"),
    note: text("note"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payments_sale_idx").on(t.saleId),
    index("payments_received_idx").on(t.receivedAt),
    index("payments_cashier_idx").on(t.receivedByUserId, t.receivedAt),
  ],
);

// ---------------------------------------------------------------- returns

export const saleReturns = pgTable(
  "sale_returns",
  {
    id: serial("id").primaryKey(),
    /** READ-ONLY: database default generates R-YYYY-NNNNNN. */
    code: text("code").notNull(),
    saleId: integer("sale_id")
      .notNull()
      .references(() => sales.id),
    createdById: integer("created_by_id")
      .notNull()
      .references(() => users.id),
    reason: text("reason"),
    /** READ-ONLY: summed by trigger from its lines. */
    creditTotal: numeric("credit_total", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sale_returns_code_key").on(t.code),
    index("sale_returns_sale_idx").on(t.saleId),
  ],
);

/** Append-only. Inserting here moves stock and the line counters by trigger. */
export const returnLines = pgTable(
  "return_lines",
  {
    id: serial("id").primaryKey(),
    returnId: integer("return_id")
      .notNull()
      .references(() => saleReturns.id),
    saleLineId: integer("sale_line_id")
      .notNull()
      .references(() => saleLines.id),
    qty: integer("qty").notNull(),
    refundAmount: numeric("refund_amount", { precision: 12, scale: 2 }).notNull(),
    condition: returnConditionEnum("condition").notNull().default("RESELLABLE"),
  },
  (t) => [
    index("return_lines_return_idx").on(t.returnId),
    index("return_lines_sale_line_idx").on(t.saleLineId),
  ],
);

// ----------------------------------------------------------- stock ledger

/**
 * The single source of truth for stock. Append-only; a trigger applies
 * `delta` to items.quantityOnHand and stamps `balanceAfter`.
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => items.id),
    delta: integer("delta").notNull(),
    reason: movementReasonEnum("reason").notNull(),
    refType: text("ref_type"),
    refId: integer("ref_id"),
    /** READ-ONLY: stamped by the trigger. */
    balanceAfter: integer("balance_after").notNull().default(0),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("stock_movements_item_idx").on(t.itemId, t.createdAt),
    index("stock_movements_reason_idx").on(t.reason, t.createdAt),
  ],
);

export const restockBatches = pgTable("restock_batches", {
  id: serial("id").primaryKey(),
  /** READ-ONLY: database default generates RS-YYYY-NNNNNN. */
  code: text("code").notNull(),
  receivedById: integer("received_by_id")
    .notNull()
    .references(() => users.id),
  supplier: text("supplier"),
  note: text("note"),
  totalUnits: integer("total_units").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --------------------------------------------------------------- plumbing

export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    actorUserId: integer("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    summary: text("summary"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_action_idx").on(t.action, t.createdAt),
  ],
);

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(),
  endpoint: text("endpoint").notNull(),
  requestHash: text("request_hash").notNull(),
  statusCode: integer("status_code").notNull(),
  response: jsonb("response").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ------------------------------------------------------------- row types

export type User = typeof users.$inferSelect;
export type ItemRow = typeof items.$inferSelect;
export type ClassRow = typeof classes.$inferSelect;
export type SaleRow = typeof sales.$inferSelect;
export type SaleLineRow = typeof saleLines.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type StockMovementRow = typeof stockMovements.$inferSelect;
export type AuditLogRow = typeof auditLog.$inferSelect;
