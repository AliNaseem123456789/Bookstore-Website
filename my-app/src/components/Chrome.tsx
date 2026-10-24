"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import AppShell from "./AppShell";

/**
 * Sign-in and the printable receipt stand alone; everything else lives
 * inside the shell. Keeping this decision in one client component means the
 * route tree stays flat and readable.
 */
const BARE_ROUTES = ["/login", "/receipt"];

export default function Chrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  const bare = BARE_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (bare) return <>{children}</>;
  return <AppShell>{children}</AppShell>;
}
