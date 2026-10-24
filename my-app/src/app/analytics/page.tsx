"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { api, qs } from "@/lib/api";
import { Page, Stat, Empty } from "@/components/Page";
import { BarRow, DayColumns } from "@/components/Bars";
import { num, pkr, isoDay } from "@/lib/format";
import { palette } from "@/theme";

type Dash = {
  overview: {
    transactions: number;
    revenue: number;
    discounts: number;
    returnsCredited: number;
    collected: number;
    outstanding: number;
    unitsSold: number;
    unitsBackordered: number;
    averageBasket: number;
  };
  sellers: Array<{
    userId: number;
    userName: string;
    role: string;
    transactions: number;
    revenue: number;
    discounts: number;
    units: number;
    creditSales: number;
    outstanding: number;
    averageBasket: number;
    revenuePerUnit: number;
  }>;
  daily: Array<{ day: string; revenue: number; transactions: number; units: number }>;
  topItems: Array<{ itemId: number; name: string; units: number; revenue: number; backordered: number }>;
  byClass: Array<{ className: string; units: number; revenue: number }>;
  aging: Array<{ bucket: string; sales: number; amount: number }>;
  valuation: Array<{ type: string; lines: number; units: number; value: number }>;
};

const RANGES = [
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
  { key: "90", label: "3 months" },
] as const;

const AGE_TONE: Record<string, string> = {
  "0-7 days": palette.stamp,
  "8-30 days": palette.amber,
  "31-90 days": "#C4692F",
  "90+ days": palette.margin,
};

export default function AnalyticsPage() {
  const [range, setRange] = useState<"7" | "30" | "90">("30");
  const [tab, setTab] = useState<"people" | "store">("people");

  const from = new Date(Date.now() - Number(range) * 86_400_000);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", range],
    queryFn: () =>
      api.get<Dash>("/api/analytics/dashboard" + qs({ from: isoDay(from), to: isoDay() })),
  });

  const d = data;
  const sellers = (d?.sellers ?? []).filter((s) => s.transactions > 0);
  const maxSellerRevenue = Math.max(1, ...sellers.map((s) => s.revenue));

  return (
    <Page
      title="Reports"
      subtitle="Who sold what, and how the shop is doing overall."
      actions={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={range}
          onChange={(_, v) => v && setRange(v)}
        >
          {RANGES.map((r) => (
            <ToggleButton key={r.key} value={r.key}>
              {r.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      }
    >
      <Stack direction="row" spacing={1} sx={{ mb: 3 }}>
        <Button
          variant={tab === "people" ? "contained" : "text"}
          onClick={() => setTab("people")}
        >
          By person
        </Button>
        <Button
          variant={tab === "store" ? "contained" : "text"}
          onClick={() => setTab("store")}
        >
          Whole shop
        </Button>
      </Stack>

      {isLoading || !d ? (
        <Skeleton height={320} />
      ) : tab === "people" ? (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
            <Stat label="Revenue" value={pkr(d.overview.revenue)} hint={`${range} days`} />
            <Stat label="Sales" value={num(d.overview.transactions)} />
            <Stat label="Average basket" value={pkr(d.overview.averageBasket)} />
            <Stat
              label="Still owed"
              value={pkr(d.overview.outstanding)}
              tone={d.overview.outstanding > 0 ? "owed" : "good"}
            />
          </Stack>

          <Panel title="Revenue by person" caption="Each bar is one member of staff.">
            {sellers.length === 0 ? (
              <Empty title="No sales in this period." />
            ) : (
              sellers.map((s) => (
                <BarRow
                  key={s.userId}
                  label={s.userName}
                  sublabel={`${num(s.transactions)} sale(s) · ${num(s.units)} item(s)`}
                  value={s.revenue}
                  max={maxSellerRevenue}
                  display={pkr(s.revenue)}
                  tooltip={`Average basket ${pkr(s.averageBasket)} · discounts ${pkr(s.discounts)}`}
                />
              ))
            )}
          </Panel>

          <Panel title="The detail" caption="Same figures as a table, for copying out.">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Person</TableCell>
                  <TableCell align="right">Sales</TableCell>
                  <TableCell align="right">Items</TableCell>
                  <TableCell align="right">Revenue</TableCell>
                  <TableCell align="right">Avg basket</TableCell>
                  <TableCell align="right">Discounts</TableCell>
                  <TableCell align="right">Credit sales</TableCell>
                  <TableCell align="right">Still owed</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {sellers.map((s) => (
                  <TableRow key={s.userId}>
                    <TableCell sx={{ fontWeight: 500 }}>{s.userName}</TableCell>
                    <TableCell align="right">{num(s.transactions)}</TableCell>
                    <TableCell align="right">{num(s.units)}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 600 }}>
                      {num(s.revenue)}
                    </TableCell>
                    <TableCell align="right">{num(s.averageBasket)}</TableCell>
                    <TableCell align="right">{num(s.discounts)}</TableCell>
                    <TableCell align="right">{num(s.creditSales)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ color: s.outstanding > 0 ? palette.margin : "inherit" }}
                    >
                      {s.outstanding > 0 ? num(s.outstanding) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      ) : (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
            <Stat label="Revenue" value={pkr(d.overview.revenue)} />
            <Stat label="Collected" value={pkr(d.overview.collected)} />
            <Stat label="Items sold" value={num(d.overview.unitsSold)} />
            <Stat
              label="Owed to buyers"
              value={num(d.overview.unitsBackordered)}
              hint="units not yet handed over"
              tone={d.overview.unitsBackordered ? "warn" : "good"}
            />
          </Stack>

          <Panel title={`Revenue per day · last ${range} days`} caption="Hover a column for that day's figures.">
            <DayColumns data={d.daily} format={pkr} />
          </Panel>

          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: 2,
            }}
          >
            <Panel title="Best sellers" caption="By number of items sold.">
              {d.topItems.length === 0 ? (
                <Empty title="Nothing sold yet." />
              ) : (
                d.topItems.slice(0, 10).map((t) => (
                  <BarRow
                    key={t.itemId}
                    label={t.name}
                    value={t.units}
                    max={Math.max(1, ...d.topItems.map((x) => x.units))}
                    display={`${num(t.units)} sold`}
                    tooltip={`${pkr(t.revenue)}${t.backordered ? ` · ${t.backordered} backordered` : ""}`}
                  />
                ))
              )}
            </Panel>

            <Panel title="Revenue by class" caption="Which grades the money comes from.">
              {d.byClass.length === 0 ? (
                <Empty title="Nothing sold yet." />
              ) : (
                d.byClass.map((c) => (
                  <BarRow
                    key={c.className}
                    label={c.className}
                    value={c.revenue}
                    max={Math.max(1, ...d.byClass.map((x) => x.revenue))}
                    display={pkr(c.revenue)}
                    tooltip={`${num(c.units)} item(s)`}
                  />
                ))
              )}
            </Panel>

            <Panel title="How old the debts are" caption="Outstanding balances by age.">
              {d.aging.length === 0 ? (
                <Empty title="Nothing outstanding." />
              ) : (
                d.aging.map((a) => (
                  <BarRow
                    key={a.bucket}
                    label={a.bucket}
                    sublabel={`${num(a.sales)} sale(s)`}
                    value={a.amount}
                    max={Math.max(1, ...d.aging.map((x) => x.amount))}
                    display={pkr(a.amount)}
                    tone={AGE_TONE[a.bucket] ?? palette.stamp}
                  />
                ))
              )}
            </Panel>

            <Panel title="Stock on hand" caption="Value sitting on the shelves.">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Kind</TableCell>
                    <TableCell align="right">Titles</TableCell>
                    <TableCell align="right">Units</TableCell>
                    <TableCell align="right">Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {d.valuation.map((v) => (
                    <TableRow key={v.type}>
                      <TableCell>{v.type.toLowerCase()}</TableCell>
                      <TableCell align="right">{num(v.lines)}</TableCell>
                      <TableCell align="right">{num(v.units)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {num(v.value)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Panel>
          </Box>
        </>
      )}
    </Page>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${palette.rule}`,
        borderRadius: 1,
        bgcolor: palette.surface,
        p: 2,
        mb: 2,
      }}
    >
      <Typography variant="h4">{title}</Typography>
      {caption ? (
        <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
          {caption}
        </Typography>
      ) : null}
      {children}
    </Box>
  );
}
