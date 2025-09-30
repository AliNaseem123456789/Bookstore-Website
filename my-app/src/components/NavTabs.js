"use client";
import React, { useEffect, useState } from "react";
import { Tabs, Tab, Box, Button, Stack } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavTabs() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    setMounted(true);

    async function fetchUser() {
      const res = await fetch("/api/me");
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    }
    fetchUser();
  }, []);

  if (!mounted) return null;

  const routes = [
    { label: "Sell Books", value: "/" },
    { label: "Sell History", value: "/purchases" },
    { label: "Sell Courses", value: "/courses" },
    { label: "Course Sales History", value: "/coursesales" },
  ];

  // ✅ Normalize pathname to a base route
  const currentTab =
    routes.find((r) =>
      r.value === "/"
        ? pathname === "/" // homepage exact
        : pathname.startsWith(r.value)
    )?.value || false;

  async function handleLogout() {
    await fetch("/api/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <Box
      sx={{
        borderBottom: 1,
        borderColor: "divider",
        mb: 2,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      {/* Left side: navigation */}
      <Tabs value={currentTab}>
        {routes.map((route) => (
          <Tab
            key={route.value}
            label={route.label}
            value={route.value} // ✅ must match currentTab
            component={Link}
            href={route.value}
          />
        ))}
      </Tabs>

      {/* Right side: Add account + Logout */}
      {user && (
        <Stack direction="row" spacing={2}>
          <Button
            component={Link}
            href="/register"
            variant="contained"
            color="primary"
          >
            Add New Account
          </Button>
          <Button
            onClick={handleLogout}
            variant="outlined"
            color="error"
          >
            Logout
          </Button>
        </Stack>
      )}
    </Box>
  );
}
