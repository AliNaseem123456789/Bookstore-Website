"use client";
import type { ReactNode } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { palette, stateColor, type RowState } from "@/theme";

/** Standard page frame: title, one line of orientation, actions on the right. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  maxWidth = 1280,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: number | string;
}) {
  return (
    <Box sx={{ px: { xs: 2, md: 3 }, py: { xs: 2, md: 3 }, maxWidth, mx: "auto" }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={2}
        sx={{ mb: 3, alignItems: { sm: "flex-start" } }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="h1">{title}</Typography>
          {subtitle ? (
            <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
        {actions ? (
          <Stack direction="row" spacing={1} className="no-print">
            {actions}
          </Stack>
        ) : null}
      </Stack>
      {children}
    </Box>
  );
}

/**
 * The signature device: a 3px left rule carrying state.
 * red = money owed, amber = stock trouble, teal = settled.
 */
export function stateRule(state: RowState) {
  return {
    borderLeft: "3px solid",
    borderLeftColor: stateColor[state],
  };
}

/** An empty state that tells the reader what to do, not just that it's empty. */
export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <Box sx={{ py: 7, px: 3, textAlign: "center" }}>
      <Typography variant="subtitle1" sx={{ color: "text.primary" }}>
        {title}
      </Typography>
      {hint ? (
        <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
          {hint}
        </Typography>
      ) : null}
      {action ? <Box sx={{ mt: 2 }}>{action}</Box> : null}
    </Box>
  );
}

/** A labelled figure. Used in rows of three or four at the top of a page. */
export function Stat({
  label,
  value,
  hint,
  tone = "none",
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: RowState;
}) {
  return (
    <Box
      sx={{
        px: 2,
        py: 1.75,
        bgcolor: palette.surface,
        border: `1px solid ${palette.rule}`,
        borderRadius: 1,
        ...stateRule(tone),
        flex: 1,
        minWidth: 160,
      }}
    >
      <Typography variant="caption">{label}</Typography>
      <Typography sx={{ fontSize: "1.375rem", fontWeight: 600, lineHeight: 1.2, mt: 0.25 }}>
        {value}
      </Typography>
      {hint ? (
        <Typography variant="caption" sx={{ display: "block", mt: 0.25 }}>
          {hint}
        </Typography>
      ) : null}
    </Box>
  );
}

/** Document numbers read as codes, so they get the mono face. */
export function Code({ children }: { children: ReactNode }) {
  return (
    <Box
      component="span"
      sx={{
        fontFamily: "var(--mono, 'IBM Plex Mono', monospace)",
        fontSize: "0.8125rem",
        color: "text.secondary",
      }}
    >
      {children}
    </Box>
  );
}
