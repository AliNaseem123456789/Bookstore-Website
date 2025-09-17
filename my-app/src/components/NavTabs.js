"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { Tabs, Tab, Box } from "@mui/material";
import Link from "next/link";

export default function NavTabs() {
  const pathname = usePathname();

  // Map routes to tab values
  const routes = [
    { label: "Books", value: "/" },
    { label: "Sell History", value: "/purchases" },
  ];

  // Ensure active tab matches current route
  const currentTab = routes.find((r) => pathname.startsWith(r.value))?.value || false;

  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
      <Tabs value={currentTab}>
        {routes.map((route) => (
          <Tab
            key={route.value}
            label={route.label}
            value={route.value}
            component={Link}
            href={route.value}
          />
        ))}
      </Tabs>
    </Box>
  );
}
