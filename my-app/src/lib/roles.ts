/** Role labels for the UI. The server's rbac.ts remains the authority. */
export const ROLE_HINT: Record<
  "ADMIN" | "MANAGER" | "CASHIER",
  { label: string; hint: string }
> = {
  ADMIN: {
    label: "Administrator",
    hint: "Everything, including staff, prices and corrections.",
  },
  MANAGER: {
    label: "Manager",
    hint: "Sells, receives stock, handles returns, sees reports.",
  },
  CASHIER: { label: "Cashier", hint: "Sells at the counter and takes payments." },
};

export const ROLE_ORDER = ["CASHIER", "MANAGER", "ADMIN"] as const;
