"use client";
import React, { useEffect, useState, useCallback, useMemo } from "react";
import {
  AppBar,
  Toolbar,
  Typography,
  Box,
  Button,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Badge,
  Menu,
  MenuItem,
  Stack,
  Divider,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import AdminPanelSettings from "@mui/icons-material/AdminPanelSettings";
import ShoppingCartIcon from "@mui/icons-material/ShoppingCart";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCart } from "../context/CartContext";

const NavTabs = React.memo(function NavTabs() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [user, setUser] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
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

  const handleDrawerToggle = () => setMobileOpen(!mobileOpen);
  const handleAdminMenuOpen = (e) => setAdminAnchorEl(e.currentTarget);
  const handleAdminMenuClose = () => setAdminAnchorEl(null);

  const routes = useMemo(
    () => [
      { label: "Books", value: "/" },
      { label: "Courses", value: "/courses" },
      { label: "Sales", value: "/coursesales" },
      { label: "Pending", value: "/pending_payment" },
    ],
    [],
  );

  const isAdmin = user?.role === "admin";

  if (!mounted) return null;

  // Mobile Drawer Content
  const drawer = (
    <Box onClick={handleDrawerToggle} sx={{ textAlign: "center", p: 2 }}>
      <Typography variant="h6" sx={{ my: 2, fontWeight: "bold" }}>
        Al-Sehar
      </Typography>
      <Divider />
      <List>
        {routes.map((route) => (
          <ListItem key={route.value} disablePadding>
            <ListItemButton
              component={Link}
              href={route.value}
              selected={pathname === route.value}
            >
              <ListItemText primary={route.label} />
            </ListItemButton>
          </ListItem>
        ))}
        <ListItem disablePadding>
          <ListItemButton component={Link} href="/cart">
            <Badge badgeContent={cart.length} color="secondary">
              <ListItemText primary="Cart" />
            </Badge>
          </ListItemButton>
        </ListItem>
        {isAdmin && (
          <ListItem disablePadding>
            <ListItemButton component={Link} href="/admin/users">
              <ListItemText primary="Admin Panel" />
            </ListItemButton>
          </ListItem>
        )}
      </List>
      {user && (
        <Button
          fullWidth
          variant="contained"
          color="error"
          onClick={handleLogout}
          sx={{ mt: 2 }}
        >
          Logout
        </Button>
      )}
    </Box>
  );

  return (
    <>
      <AppBar position="sticky" color="default" elevation={1} sx={{ mb: 3 }}>
        <Toolbar sx={{ justifyContent: "space-between" }}>
          {/* Mobile Menu Toggle */}
          <IconButton
            color="inherit"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: "none" } }}
          >
            <MenuIcon />
          </IconButton>

          <Typography
            variant="h6"
            component="div"
            sx={{ fontWeight: "bold", display: { xs: "none", sm: "block" } }}
          >
            Al-Sehar Bookstore
          </Typography>

          {/* Desktop Navigation */}
          <Box sx={{ display: { xs: "none", sm: "flex" }, gap: 1 }}>
            {routes.map((route) => (
              <Button
                key={route.value}
                component={Link}
                href={route.value}
                color={pathname === route.value ? "primary" : "inherit"}
                sx={{
                  fontWeight: pathname === route.value ? "bold" : "normal",
                }}
              >
                {route.label}
              </Button>
            ))}

            {isAdmin && (
              <>
                <Button
                  startIcon={<AdminPanelSettings />}
                  onClick={handleAdminMenuOpen}
                  color="inherit"
                >
                  Admin
                </Button>
                <Menu
                  anchorEl={adminAnchorEl}
                  open={Boolean(adminAnchorEl)}
                  onClose={handleAdminMenuClose}
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
              </>
            )}
          </Box>

          {/* Right Side Icons */}
          <Stack direction="row" spacing={1} alignItems="center">
            <IconButton component={Link} href="/cart" color="inherit">
              <Badge badgeContent={cart.length} color="secondary">
                <ShoppingCartIcon />
              </Badge>
            </IconButton>

            {user && (
              <Button
                onClick={handleLogout}
                variant="outlined"
                color="error"
                size="small"
                sx={{ display: { xs: "none", sm: "inline-flex" } }}
              >
                Logout
              </Button>
            )}
          </Stack>
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }} // Better open performance on mobile.
        sx={{
          display: { xs: "block", sm: "none" },
          "& .MuiDrawer-paper": { boxSizing: "border-box", width: 240 },
        }}
      >
        {drawer}
      </Drawer>
    </>
  );
});

export default NavTabs;
