"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PaymentsIcon from "@mui/icons-material/Payments";
import { api, qs } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { PaymentDialog, SaleDrawer } from "@/components/SaleDrawer";
import { num, pkr, day, age } from "@/lib/format";
import { palette } from "@/theme";

type Row = {
  id: number;
  code: string;
  buyerName: string;
  buyerPhone: string | null;
  grossTotal: number;
  amountReceived: number;
  balanceDue: number;
  soldAt: string;
  soldByName: string;
  daysOutstanding: number;
};

export default function CollectionsPage() {
  const [search, setSearch] = useState("");
  const [payRow, setPayRow] = useState<Row | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["outstanding", search],
    queryFn: () => api.get<{ sales: Row[] }>("/api/outstanding" + qs({ search })),
  });

  const rows = data?.sales ?? [];
  const total = rows.reduce((s, r) => s + r.balanceDue, 0);
  const stale = rows.filter((r) => r.daysOutstanding > 30);

  return (
    <Page
      title="Collections"
      subtitle="Money still owed, oldest first. Taking a payment here updates the sale and the receipt."
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat label="Outstanding" value={pkr(total)} tone={total > 0 ? "owed" : "good"} />
        <Stat label="Buyers owing" value={num(rows.length)} />
        <Stat
          label="Older than a month"
          value={num(stale.length)}
          hint={stale.length ? pkr(stale.reduce((s, r) => s + r.balanceDue, 0)) : undefined}
          tone={stale.length ? "warn" : "none"}
        />
      </Stack>

      <TextField
        placeholder="Search buyer"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, minWidth: 280 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
      />

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Buyer</TableCell>
              <TableCell>Receipt</TableCell>
              <TableCell>Sold</TableCell>
              <TableCell>Waiting</TableCell>
              <TableCell align="right">Bill</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Owed</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton height={28} />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ border: 0 }}>
                  <Empty
                    title="Nothing outstanding."
                    hint="Every sale is settled."
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{
                    borderLeft: "3px solid",
                    borderLeftColor: r.daysOutstanding > 30 ? palette.margin : palette.amber,
                  }}
                >
                  <TableCell
                    sx={{ fontWeight: 500, cursor: "pointer" }}
                    onClick={() => setOpenId(r.id)}
                  >
                    {r.buyerName}
                    {r.buyerPhone ? (
                      <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                        {" "}· {r.buyerPhone}
                      </Box>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell>{day(r.soldAt)}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      color={r.daysOutstanding > 30 ? "error" : "default"}
                      label={age(r.daysOutstanding)}
                    />
                  </TableCell>
                  <TableCell align="right">{num(r.grossTotal)}</TableCell>
                  <TableCell align="right">{num(r.amountReceived)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: palette.margin }}>
                    {num(r.balanceDue)}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      variant="contained"
                      startIcon={<PaymentsIcon sx={{ fontSize: 16 }} />}
                      onClick={() => setPayRow(r)}
                    >
                      Receive
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {payRow ? (
        <PaymentDialog sale={payRow} open onClose={() => setPayRow(null)} />
      ) : null}
      <SaleDrawer saleId={openId} onClose={() => setOpenId(null)} />
    </Page>
  );
}
