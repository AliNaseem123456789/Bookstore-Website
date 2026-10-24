"use client";
import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";

export type Permission = string;

export type SessionUser = {
  userId: number;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  permissions: Permission[];
};

const SessionContext = createContext<{
  user: SessionUser | null;
  isLoading: boolean;
  can: (permission: Permission) => boolean;
}>({ user: null, isLoading: true, can: () => false });

export function SessionProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isFetching } = useQuery({
    queryKey: ["session"],
    queryFn: () => api.get<{ user: SessionUser | null }>("/api/auth/me"),
    staleTime: 5 * 60_000,
    retry: false,
  });

  const user = data?.user ?? null;

  return (
    <SessionContext.Provider
      value={{
        user,
        // Treat an in-flight refetch as loading too, so the shell never
        // decides someone is signed out while the answer is on its way.
        isLoading: isPending || (isFetching && !data),
        // Mirrors the server's permission table. The server checks this
        // again on every request — this copy only decides what to show.
        can: (permission) => Boolean(user?.permissions.includes(permission)),
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  return useContext(SessionContext);
}
