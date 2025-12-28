"use client";
import React, { useEffect, useState, useCallback } from "react";
import { Tabs, Tab, Box, Button, Stack, Menu, MenuItem } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AdminPanelSettings } from "@mui/icons-material";

// Optimized NavTabs component
const NavTabs = React.memo(function NavTabs() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [adminAnchorEl, setAdminAnchorEl] = useState(null);

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

  // Optimized logout handler with useCallback
  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
      window.location.href = "/login";
    } catch (error) {
      console.error("Logout failed:", error);
    }
  }, []);

  // Handle admin menu
  const handleAdminMenuOpen = useCallback((event) => {
    setAdminAnchorEl(event.currentTarget);
  }, []);

  const handleAdminMenuClose = useCallback(() => {
    setAdminAnchorEl(null);
  }, []);

  // Memoized routes configuration
  const routes = React.useMemo(() => [
    { label: "Sell Books", value: "/" },
    { label: "Sell History", value: "/purchases" },
    { label: "Sell Courses", value: "/courses" },
    { label: "Course Sales History", value: "/coursesales" },
  ], []);

  // Memoized current tab calculation
  const currentTab = React.useMemo(() => {
    return routes.find((r) =>
      r.value === "/"
        ? pathname === "/"
        : pathname.startsWith(r.value)
    )?.value || false;
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
      {/* Left side: navigation */}
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
        
        {/* Admin tab - only show for admins */}
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

      {/* Admin dropdown menu */}
      {isAdmin && (
        <Menu
          anchorEl={adminAnchorEl}
          open={Boolean(adminAnchorEl)}
          onClose={handleAdminMenuClose}
          anchorOrigin={{
            vertical: 'bottom',
            horizontal: 'left',
          }}
          transformOrigin={{
            vertical: 'top',
            horizontal: 'left',
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
});

export default NavTabs;