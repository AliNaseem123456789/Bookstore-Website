/**
 * Permissions.
 *
 * The old app checked `user.role === "admin"` in React components, which is
 * decoration: the browser can lie. Every permission here is checked on the
 * server, in the route handler, before anything is written. The UI reads the
 * same table purely to decide what to show.
 *
 * MANAGER is the in-between role: it runs the shop day to day — receives
 * stock, takes payments, handles returns, sees the numbers — but cannot
 * touch who has access or what things cost.
 */
import type { Role } from "@/db/schema";

export const PERMISSIONS = [
  // selling
  "sale.create",
  "sale.viewOwn",
  "sale.viewAll",
  "payment.receive",
  // returns and refunds
  "return.create",
  "refund.payout",
  // stock
  "stock.view",
  "stock.receive",
  "stock.fulfill",
  "stock.correct",
  // catalogue
  "item.create",
  "item.edit",
  "item.setPrice",
  "item.merge",
  "curriculum.edit",
  // oversight
  "analytics.view",
  "audit.view",
  "user.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const CASHIER: Permission[] = [
  "sale.create",
  "sale.viewOwn",
  "payment.receive",
  "stock.view",
];

const MANAGER: Permission[] = [
  ...CASHIER,
  "sale.viewAll",
  "return.create",
  "refund.payout",
  "stock.receive",
  "stock.fulfill",
  "item.create",
  "item.edit",
  "analytics.view",
];

const ADMIN: Permission[] = [...PERMISSIONS];

const BY_ROLE: Record<Role, readonly Permission[]> = {
  CASHIER,
  MANAGER,
  ADMIN,
};

export function can(role: Role, permission: Permission): boolean {
  return BY_ROLE[role].includes(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...BY_ROLE[role]];
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  MANAGER: "Manager",
  CASHIER: "Cashier",
};

export const ROLE_DESCRIPTIONS: Record<Role, string> = {
  ADMIN: "Full access, including staff accounts, prices and corrections.",
  MANAGER:
    "Runs the shop: sells, receives stock, handles returns and refunds, sees reports. Cannot manage staff or change prices.",
  CASHIER: "Sells at the counter and takes payments.",
};
