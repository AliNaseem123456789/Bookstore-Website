"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Tabs, Tab, Box, Button, Stack, Menu, MenuItem, Badge } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminPanelSettings } from "@mui/icons-material";
import { useCart } from "../context/CartContext";

const NavTabs = React.memo(function NavTabs() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [adminAnchorEl, setAdminAnchorEl] = useState(null);

  const { cart } = useCart();

  useEffect(() => {
    setMounted(true);
    async function fetchUser() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      }
    }
    fetchUser();
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, []);

  const handleAdminMenuOpen = useCallback((event) => {
    setAdminAnchorEl(event.currentTarget);
  }, []);
  const handleAdminMenuClose = useCallback(() => {
    setAdminAnchorEl(null);
  }, []);

  const routes = useMemo(() => [
    { label: "Sell Books", value: "/" },
    { label: "Books Sold", value: "/purchases" },
    { label: "Sell Courses", value: "/courses" },
    { label: "Course Sold History", value: "/coursesales" },
    { label: "Cart", value: "/cart" },
  ], []);

  // FIX: longest match first to avoid prefix issues
  const currentTab = useMemo(() => {
    if (pathname === "/") return "/"; // exact match
    // Sort routes by length descending to match longest path first
    const sortedRoutes = [...routes].sort((a, b) => b.value.length - a.value.length);
    const match = sortedRoutes.find((r) => pathname.startsWith(r.value));
    return match ? match.value : false;
  }, [pathname, routes]);

  const isAdmin = user?.role === "admin";

  if (!mounted) return null;

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
      {/* Left: Tabs */}
      <Tabs value={currentTab}>
        {routes.map((route) => (
          <Tab
            key={route.value}
            label={
              route.value === "/cart" ? (
                <Badge badgeContent={cart.length} color="secondary">
                  {route.label}
                </Badge>
              ) : (
                route.label
              )
            }
            value={route.value}
            component={Link}
            href={route.value}
          />
        ))}

        {/* Admin tab */}
        {isAdmin && (
          <Tab
            icon={<AdminPanelSettings />}
            iconPosition="start"
            label="Admin"
            value="/admin"
            onClick={handleAdminMenuOpen}
          />
        )}
      </Tabs>

      {/* Admin dropdown */}
      {isAdmin && (
        <Menu
          anchorEl={adminAnchorEl}
          open={Boolean(adminAnchorEl)}
          onClose={handleAdminMenuClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "left",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "left",
          }}
        >
          <MenuItem
            onClick={handleAdminMenuClose}
            component={Link}
            href="/admin/users"
          >
            User Management
          </MenuItem>
          <MenuItem
            onClick={handleAdminMenuClose}
            component={Link}
            href="/admin/sales"
          >
            Sales Analytics
          </MenuItem>
        </Menu>
      )}

      {/* Right: Logout */}
      {user && (
        <Stack direction="row" spacing={2}>
          <Button onClick={handleLogout} variant="outlined" color="error">
            Logout
          </Button>
        </Stack>
      )}
    </Box>
  );
});

export default NavTabs;
