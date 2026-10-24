"use client";
import { createTheme, alpha } from "@mui/material/styles";

/**
 * Visual language
 * ---------------
 * The subject is a school bookstore counter in Karachi, so the palette comes
 * from the objects on that counter: ink-blue exercise books, faint blue
 * ruling, the red margin rule down the left of a school copy, and the teal of
 * a library date stamp.
 *
 * One signature device carries the whole interface: a 3px left rule on rows
 * and panels that encodes state — red for money owed, amber for stock
 * trouble, teal for settled. Everything else stays deliberately quiet, so a
 * bookseller can read a table at a glance without decoding badges.
 *
 * Numbers are set with tabular figures everywhere so columns of rupees line
 * up on the decimal.
 */

export const palette = {
  ink: "#16213A",
  inkSoft: "#2B3855",
  paper: "#FBFAF8",
  surface: "#FFFFFF",
  rule: "#DCE0E8",
  stamp: "#0F6B63",
  stampSoft: "#E4F0EE",
  margin: "#BE3A31",
  marginSoft: "#FBEAE8",
  amber: "#A8711A",
  amberSoft: "#FDF1DE",
  muted: "#5C6578",
} as const;

/** The state a row or panel is in, shown as its left rule. */
export type RowState = "owed" | "warn" | "good" | "none";

export const stateColor: Record<RowState, string> = {
  owed: palette.margin,
  warn: palette.amber,
  good: palette.stamp,
  none: "transparent",
};

export const stateTint: Record<RowState, string> = {
  owed: palette.marginSoft,
  warn: palette.amberSoft,
  good: palette.stampSoft,
  none: "transparent",
};

const fontStack = [
  "IBM Plex Sans",
  "-apple-system",
  "Segoe UI",
  "Roboto",
  "sans-serif",
].join(", ");

export const monoStack = ["IBM Plex Mono", "ui-monospace", "monospace"].join(", ");

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: palette.stamp, contrastText: "#FFFFFF" },
    secondary: { main: palette.ink },
    error: { main: palette.margin },
    warning: { main: palette.amber },
    success: { main: palette.stamp },
    background: { default: palette.paper, paper: palette.surface },
    text: { primary: palette.ink, secondary: palette.muted },
    divider: palette.rule,
  },
  shape: { borderRadius: 6 },
  typography: {
    fontFamily: fontStack,
    // A tight scale: this is a working tool, not a brochure.
    h1: { fontSize: "1.75rem", fontWeight: 600, letterSpacing: "-0.015em" },
    h2: { fontSize: "1.375rem", fontWeight: 600, letterSpacing: "-0.01em" },
    h3: { fontSize: "1.125rem", fontWeight: 600 },
    h4: { fontSize: "1rem", fontWeight: 600 },
    subtitle1: { fontSize: "0.9375rem", fontWeight: 500 },
    subtitle2: { fontSize: "0.8125rem", fontWeight: 500, color: palette.muted },
    body1: { fontSize: "0.9375rem" },
    body2: { fontSize: "0.8125rem" },
    button: { textTransform: "none", fontWeight: 500 },
    caption: { fontSize: "0.75rem", color: palette.muted },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        "*": { boxSizing: "border-box" },
        body: {
          backgroundColor: palette.paper,
          // Rupee columns must align; this is functional, not stylistic.
          fontVariantNumeric: "tabular-nums",
        },
        ":focus-visible": {
          outline: `2px solid ${palette.stamp}`,
          outlineOffset: 2,
        },
        "@media (prefers-reduced-motion: reduce)": {
          "*": { animationDuration: "0.01ms !important", transitionDuration: "0.01ms !important" },
        },
        "@media print": {
          ".no-print": { display: "none !important" },
        },
      },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none" },
        outlined: { borderColor: palette.rule },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 6 },
        sizeMedium: { paddingBlock: 7 },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottomColor: palette.rule,
          paddingBlock: 8,
          fontSize: "0.875rem",
        },
        head: {
          fontWeight: 600,
          fontSize: "0.75rem",
          color: palette.muted,
          backgroundColor: palette.paper,
          whiteSpace: "nowrap",
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: { "&:last-child td": { borderBottom: "none" } },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 4, fontWeight: 500, fontSize: "0.75rem" },
        sizeSmall: { height: 20 },
      },
    },
    MuiTextField: { defaultProps: { size: "small" } },
    MuiSelect: { defaultProps: { size: "small" } },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: palette.ink, fontSize: "0.75rem" },
      },
    },
    MuiAlert: {
      styleOverrides: {
        standardError: { backgroundColor: palette.marginSoft, color: palette.margin },
        standardWarning: { backgroundColor: palette.amberSoft, color: palette.amber },
        standardSuccess: { backgroundColor: palette.stampSoft, color: palette.stamp },
      },
    },
    MuiLinearProgress: {
      styleOverrides: {
        root: { backgroundColor: alpha(palette.ink, 0.08), height: 6, borderRadius: 3 },
      },
    },
  },
});
