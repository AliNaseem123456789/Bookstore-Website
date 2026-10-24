"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Box,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
  useMediaQuery,
} from "@mui/material";
import MenuIcon from "@mui/icons-material/Menu";
import PointOfSaleIcon from "@mui/icons-material/PointOfSale";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import PaymentsIcon from "@mui/icons-material/Payments";
import AssignmentReturnIcon from "@mui/icons-material/AssignmentReturn";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import MoveToInboxIcon from "@mui/icons-material/MoveToInbox";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import InsightsIcon from "@mui/icons-material/Insights";
import GroupIcon from "@mui/icons-material/Group";
import HistoryIcon from "@mui/icons-material/History";
import LogoutIcon from "@mui/icons-material/Logout";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { palette } from "@/theme";
import { pkr } from "@/lib/format";

const SIDEBAR_WIDTH = 248;

type NavItem = {
  href: string;
  label: string;
  icon: ReactNode;
  permission: string;
  /** Key into the counts payload, shown as a number beside the label. */
  badge?: "backorders" | "outstanding" | "lowStock";
};

type NavSection = { heading: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    heading: "Sell",
    items: [
      {
        href: "/pos",
        label: "New sale",
        icon: <PointOfSaleIcon fontSize="small" />,
        permission: "sale.create",
      },
      {
        href: "/sales",
        label: "Sales",
        icon: <ReceiptLongIcon fontSize="small" />,
        permission: "sale.viewOwn",
      },
    ],
  },
  {
    heading: "Money",
    items: [
      {
        href: "/collections",
        label: "Collections",
        icon: <PaymentsIcon fontSize="small" />,
        permission: "payment.receive",
        badge: "outstanding",
      },
      {
        href: "/refunds",
        label: "Returns and refunds",
        icon: <AssignmentReturnIcon fontSize="small" />,
        permission: "return.create",
      },
    ],
  },
  {
    heading: "Stock",
    items: [
      {
        href: "/inventory",
        label: "Catalogue",
        icon: <Inventory2Icon fontSize="small" />,
        permission: "stock.view",
        badge: "lowStock",
      },
      {
        href: "/restock",
        label: "Receive stock",
        icon: <MoveToInboxIcon fontSize="small" />,
        permission: "stock.receive",
      },
      {
        href: "/fulfilment",
        label: "To hand over",
        icon: <LocalShippingIcon fontSize="small" />,
        permission: "stock.view",
        badge: "backorders",
      },
      {
        href: "/pending",
        label: "To reorder",
        icon: <PendingActionsIcon fontSize="small" />,
        permission: "stock.view",
      },
    ],
  },
  {
    heading: "Setup",
    items: [
      {
        href: "/courses",
        label: "Class courses",
        icon: <MenuBookIcon fontSize="small" />,
        permission: "curriculum.edit",
      },
      {
        href: "/analytics",
        label: "Reports",
        icon: <InsightsIcon fontSize="small" />,
        permission: "analytics.view",
      },
      {
        href: "/staff",
        label: "Staff",
        icon: <GroupIcon fontSize="small" />,
        permission: "user.manage",
      },
      {
        href: "/audit",
        label: "Activity log",
        icon: <HistoryIcon fontSize="small" />,
        permission: "audit.view",
      },
    ],
  },
];

type Counts = { backorders: number; outstanding: number; lowStock: number };

function useCounts(enabled: boolean) {
  return useQuery({
    queryKey: ["nav-counts"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Counts> => {
      const [backorders, outstanding, low] = await Promise.all([
        api
          .get<{ groups: unknown[] }>("/api/stock/backorders")
          .catch(() => ({ groups: [] })),
        api
          .get<{ sales: unknown[] }>("/api/outstanding")
          .catch(() => ({ sales: [] })),
        api.get<{ items: unknown[] }>("/api/stock/low").catch(() => ({ items: [] })),
      ]);
      return {
        backorders: backorders.groups.length,
        outstanding: outstanding.sales.length,
        lowStock: low.items.length,
      };
    },
  });
}

/** Today's takings, shown in the topbar so the day is always in view. */
function useTodayTotal(enabled: boolean) {
  return useQuery({
    queryKey: ["today-cash"],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      api.get<{ netTotal: number; cashTotal: number }>("/api/analytics/day-cash"),
  });
}

export default function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, can } = useSession();
  const isDesktop = useMediaQuery("(min-width:900px)");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);

  const counts = useCounts(Boolean(user));
  const today = useTodayTotal(Boolean(user) && can("analytics.view"));

  useEffect(() => {
    if (!isLoading && !user) router.replace("/login");
  }, [isLoading, user, router]);

  // Close the drawer when navigating on a phone.
  useEffect(() => setMobileOpen(false), [pathname]);

  const sections = useMemo(
    () =>
      SECTIONS.map((s) => ({
        ...s,
        items: s.items.filter((i) => can(i.permission)),
      })).filter((s) => s.items.length > 0),
    [can],
  );

  if (isLoading || !user) {
    return (
      <Box
        sx={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "text.secondary",
        }}
      >
        <Typography variant="body2">Loading…</Typography>
      </Box>
    );
  }

  async function signOut() {
    await api.post("/api/auth/logout");
    window.location.href = "/login";
  }

  const nav = (
    <Box
      component="nav"
      sx={{
        width: SIDEBAR_WIDTH,
        flexShrink: 0,
        bgcolor: palette.ink,
        color: "#fff",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
      }}
    >
      <Box sx={{ px: 2.5, pt: 2.5, pb: 2 }}>
        <Typography sx={{ fontWeight: 600, fontSize: "1rem", letterSpacing: "-0.01em" }}>
          Al-Sehar
        </Typography>
        <Typography sx={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.55)" }}>
          Bookstore
        </Typography>
      </Box>

      <Box sx={{ flex: 1, pb: 2 }}>
        {sections.map((section) => (
          <Box key={section.heading} sx={{ mb: 1.5 }}>
            <Typography
              sx={{
                px: 2.5,
                py: 0.75,
                fontSize: "0.6875rem",
                fontWeight: 600,
                color: "rgba(255,255,255,0.4)",
              }}
            >
              {section.heading}
            </Typography>
            <List disablePadding>
              {section.items.map((item) => {
                const active =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const count = item.badge ? counts.data?.[item.badge] : undefined;
                return (
                  <ListItemButton
                    key={item.href}
                    component={Link}
                    href={item.href}
                    selected={active}
                    sx={{
                      px: 2.5,
                      py: 0.875,
                      gap: 1.5,
                      color: active ? "#fff" : "rgba(255,255,255,0.72)",
                      // The signature left rule, here marking the open page.
                      borderLeft: "3px solid",
                      borderLeftColor: active ? palette.stamp : "transparent",
                      bgcolor: active ? "rgba(255,255,255,0.07)" : "transparent",
                      "&.Mui-selected": { bgcolor: "rgba(255,255,255,0.07)" },
                      "&.Mui-selected:hover": { bgcolor: "rgba(255,255,255,0.1)" },
                      "&:hover": { bgcolor: "rgba(255,255,255,0.05)" },
                    }}
                  >
                    <Box sx={{ display: "flex", color: "inherit", opacity: active ? 1 : 0.8 }}>
                      {item.icon}
                    </Box>
                    <ListItemText
                      primary={item.label}
                      slotProps={{
                        primary: {
                          sx: { fontSize: "0.875rem", fontWeight: active ? 500 : 400 },
                        },
                      }}
                    />
                    {count ? (
                      <Box
                        sx={{
                          minWidth: 20,
                          px: 0.625,
                          py: 0.125,
                          borderRadius: "4px",
                          textAlign: "center",
                          fontSize: "0.6875rem",
                          fontWeight: 600,
                          bgcolor:
                            item.badge === "outstanding"
                              ? palette.margin
                              : palette.amber,
                          color: "#fff",
                        }}
                      >
                        {count}
                      </Box>
                    ) : null}
                  </ListItemButton>
                );
              })}
            </List>
          </Box>
        ))}
      </Box>

      <Divider sx={{ borderColor: "rgba(255,255,255,0.1)" }} />
      <Box sx={{ p: 2 }}>
        <Typography sx={{ fontSize: "0.8125rem", fontWeight: 500 }}>
          {user.name}
        </Typography>
        <Typography sx={{ fontSize: "0.6875rem", color: "rgba(255,255,255,0.5)" }}>
          {user.role === "ADMIN"
            ? "Administrator"
            : user.role === "MANAGER"
              ? "Manager"
              : "Cashier"}
        </Typography>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: palette.paper }}>
      {isDesktop ? (
        <Box
          sx={{
            width: SIDEBAR_WIDTH,
            flexShrink: 0,
            position: "sticky",
            top: 0,
            height: "100vh",
          }}
          className="no-print"
        >
          {nav}
        </Box>
      ) : (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          slotProps={{ paper: { sx: { width: SIDEBAR_WIDTH, border: 0 } } }}
        >
          {nav}
        </Drawer>
      )}

      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Box
          component="header"
          className="no-print"
          sx={{
            height: 56,
            flexShrink: 0,
            px: { xs: 1.5, md: 3 },
            display: "flex",
            alignItems: "center",
            gap: 2,
            borderBottom: `1px solid ${palette.rule}`,
            bgcolor: palette.surface,
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          {!isDesktop && (
            <IconButton onClick={() => setMobileOpen(true)} aria-label="Open menu">
              <MenuIcon />
            </IconButton>
          )}

          <Box sx={{ flex: 1 }} />

          {today.data ? (
            <Tooltip title="Money taken today, across all staff">
              <Stack direction="row" spacing={1} alignItems="baseline">
                <Typography variant="caption">Today</Typography>
                <Typography sx={{ fontWeight: 600, fontSize: "0.9375rem" }}>
                  {pkr(today.data.netTotal)}
                </Typography>
              </Stack>
            </Tooltip>
          ) : null}

          <Tooltip title="Account">
            <IconButton
              onClick={(e) => setMenuAnchor(e.currentTarget)}
              size="small"
              sx={{
                width: 32,
                height: 32,
                bgcolor: palette.stampSoft,
                color: palette.stamp,
                fontSize: "0.8125rem",
                fontWeight: 600,
                "&:hover": { bgcolor: palette.stampSoft },
              }}
            >
              {user.name.slice(0, 1).toUpperCase()}
            </IconButton>
          </Tooltip>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={() => setMenuAnchor(null)}
            slotProps={{ paper: { variant: "outlined", sx: { minWidth: 200 } } }}
          >
            <Box sx={{ px: 2, py: 1 }}>
              <Typography variant="subtitle2" sx={{ color: "text.primary" }}>
                {user.name}
              </Typography>
              <Typography variant="caption">{user.email}</Typography>
            </Box>
            <Divider />
            <MenuItem
              component={Link}
              href="/settings"
              onClick={() => setMenuAnchor(null)}
              sx={{ fontSize: "0.875rem" }}
            >
              Change password
            </MenuItem>
            <MenuItem onClick={signOut} sx={{ fontSize: "0.875rem", gap: 1 }}>
              <LogoutIcon fontSize="small" /> Sign out
            </MenuItem>
          </Menu>
        </Box>

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
