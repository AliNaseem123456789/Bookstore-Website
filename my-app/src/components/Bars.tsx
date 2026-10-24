"use client";
import { Box, Stack, Tooltip, Typography } from "@mui/material";
import { palette } from "@/theme";

/**
 * A magnitude bar. One hue throughout: every bar on a chart is the same
 * entity type, so colour carries no extra meaning and is never cycled.
 * Values are labelled in text, so the bar length is a second encoding
 * rather than the only one.
 */
export function BarRow({
  label,
  sublabel,
  value,
  max,
  display,
  tone = palette.stamp,
  tooltip,
}: {
  label: string;
  sublabel?: string;
  value: number;
  max: number;
  display: string;
  tone?: string;
  tooltip?: string;
}) {
  const pct = max > 0 ? Math.max(value > 0 ? 2 : 0, (value / max) * 100) : 0;
  return (
    <Tooltip title={tooltip ?? ""} placement="top" arrow disableHoverListener={!tooltip}>
      <Box sx={{ py: 0.75, "&:hover": { bgcolor: palette.paper } }}>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mb: 0.5 }}>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 0 }} noWrap>
            {label}
            {sublabel ? (
              <Box component="span" sx={{ color: "text.secondary" }}>
                {" "}· {sublabel}
              </Box>
            ) : null}
          </Typography>
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            {display}
          </Typography>
        </Stack>
        <Box sx={{ height: 8, bgcolor: palette.rule, borderRadius: "2px", overflow: "hidden" }}>
          <Box
            sx={{
              width: `${pct}%`,
              height: "100%",
              bgcolor: tone,
              borderRadius: "0 4px 4px 0",
              transition: "width .2s",
            }}
          />
        </Box>
      </Box>
    </Tooltip>
  );
}

/** Daily columns. Single series, so no legend: the title names it. */
export function DayColumns({
  data,
  format,
}: {
  data: Array<{ day: string; revenue: number; transactions: number; units: number }>;
  format: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <Box sx={{ display: "flex", alignItems: "flex-end", gap: "2px", height: 160, mt: 1 }}>
      {data.map((d) => {
        const h = (d.revenue / max) * 100;
        return (
          <Tooltip
            key={d.day}
            arrow
            placement="top"
            title={
              <Box sx={{ fontSize: "0.75rem" }}>
                <div>{d.day}</div>
                <div>{format(d.revenue)}</div>
                <div>
                  {d.transactions} sale(s) · {d.units} item(s)
                </div>
              </Box>
            }
          >
            <Box
              sx={{
                flex: 1,
                minWidth: 3,
                height: "100%",
                display: "flex",
                alignItems: "flex-end",
                cursor: "default",
              }}
            >
              <Box
                sx={{
                  width: "100%",
                  height: `${Math.max(d.revenue > 0 ? 2 : 0.5, h)}%`,
                  bgcolor: d.revenue > 0 ? palette.stamp : palette.rule,
                  borderRadius: "4px 4px 0 0",
                  "&:hover": { bgcolor: palette.ink },
                }}
              />
            </Box>
          </Tooltip>
        );
      })}
    </Box>
  );
}
