/** Shared formatting. Money is always PKR, dates always Karachi time. */

const money = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});
const moneyExact = new Intl.NumberFormat("en-PK", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 5,850 — for table columns, where the currency is in the header. */
export function num(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? money.format(Math.round(n)) : "0";
}

/** PKR 5,850 — for totals and anywhere the unit must be explicit. */
export function pkr(value: number | string | null | undefined): string {
  return `PKR ${num(value)}`;
}

/** PKR 5,850.00 — for receipts and payment confirmations. */
export function pkrExact(value: number | string | null | undefined): string {
  const n = Number(value ?? 0);
  return `PKR ${moneyExact.format(Number.isFinite(n) ? n : 0)}`;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Karachi",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Karachi",
});
const fullFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Karachi",
});

const asDate = (v: Date | string | null | undefined) =>
  v ? (v instanceof Date ? v : new Date(v)) : null;

export function day(v: Date | string | null | undefined): string {
  const d = asDate(v);
  return d ? dateFmt.format(d) : "—";
}
export function dayTime(v: Date | string | null | undefined): string {
  const d = asDate(v);
  return d ? timeFmt.format(d) : "—";
}
export function fullDateTime(v: Date | string | null | undefined): string {
  const d = asDate(v);
  return d ? fullFmt.format(d) : "—";
}

/** "3 days" / "today" — for ageing columns. */
export function age(days: number | null | undefined): string {
  const n = Number(days ?? 0);
  if (n <= 0) return "today";
  if (n === 1) return "1 day";
  if (n < 30) return `${n} days`;
  const months = Math.floor(n / 30);
  return months === 1 ? "1 month" : `${months} months`;
}

export function plural(n: number, one: string, many?: string): string {
  return n === 1 ? `${n} ${one}` : `${n} ${many ?? one + "s"}`;
}

/** ISO date (yyyy-mm-dd) in Karachi time, for date inputs. */
export function isoDay(v: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Karachi",
  }).format(v);
  return parts;
}
