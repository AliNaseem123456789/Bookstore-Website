"use client";
import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Chip,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { api, qs } from "@/lib/api";
import { Page, Empty, Code } from "@/components/Page";
import { SaleDrawer } from "@/components/SaleDrawer";
import { num, pkr, dayTime } from "@/lib/format";
import { palette } from "@/theme";
import { useSession } from "@/lib/session";

type Row = {
  id: number;
  code: string;
  buyerName: string;
  grossTotal: number;
  discountTotal: number;
  amountReceived: number;
  balanceDue: number;
  isSettled: boolean;
  status: string;
  soldAt: string;
  soldByName: string;
  itemCount: number;
  backorderCount: number;
};

function SalesList() {
  const params = useSearchParams();
  const { can } = useSession();
  const [search, setSearch] = useState(params?.get("search") ?? "");
  const [filter, setFilter] = useState<"all" | "unpaid" | "discounted">("all");
  const [seller, setSeller] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["sales", search, filter, offset],
    queryFn: () =>
      api.get<{ sales: Row[]; hasMore: boolean; nextOffset: number }>(
        "/api/sales" +
          qs({
            search,
            unpaid: filter === "unpaid" ? "true" : undefined,
            discounted: filter === "discounted" ? "true" : undefined,
            limit: 50,
            offset,
          }),
      ),
  });

  const rows = data?.sales ?? [];

  // Sellers come from the loaded rows: no extra permission needed just to
  // offer a filter.
  const sellers = useMemo(
    () => [...new Set(rows.map((r) => r.soldByName))].sort(),
    [rows],
  );
  const visible = seller === "all" ? rows : rows.filter((r) => r.soldByName === seller);

  return (
    <Page
      title="Sales"
      subtitle={
        can("sale.viewAll")
          ? "Every sale, newest first."
          : "The sales you rang up, newest first."
      }
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search buyer or receipt number"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <ToggleButtonGroup
          size="small"
          exclusive
          value={filter}
          onChange={(_, v) => {
            if (v) {
              setFilter(v);
              setOffset(0);
            }
          }}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="unpaid">Unpaid</ToggleButton>
          <ToggleButton value="discounted">Discounted</ToggleButton>
        </ToggleButtonGroup>
        {sellers.length > 1 ? (
          <TextField
            select
            label="Sold by"
            value={seller}
            onChange={(e) => setSeller(e.target.value)}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value="all">Everyone</MenuItem>
            {sellers.map((s) => (
              <MenuItem key={s} value={s}>
                {s}
              </MenuItem>
            ))}
          </TextField>
        ) : null}
      </Stack>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Receipt</TableCell>
              <TableCell>Buyer</TableCell>
              <TableCell>Sold by</TableCell>
              <TableCell align="right">Items</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="right">Paid</TableCell>
              <TableCell align="right">Owed</TableCell>
              <TableCell>When</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={8}>
                    <Skeleton height={28} />
                  </TableCell>
                </TableRow>
              ))
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} sx={{ border: 0 }}>
                  <Empty
                    title="No sales match that."
                    hint="Clear the filters, or try part of the buyer's name."
                  />
                </TableCell>
              </TableRow>
            ) : (
              visible.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  onClick={() => setOpenId(r.id)}
                  sx={{
                    cursor: "pointer",
                    borderLeft: "3px solid",
                    borderLeftColor:
                      r.balanceDue > 0
                        ? palette.margin
                        : r.backorderCount > 0
                          ? palette.amber
                          : "transparent",
                  }}
                >
                  <TableCell>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>
                    {r.buyerName}
                    {r.backorderCount > 0 ? (
                      <Chip
                        size="small"
                        color="warning"
                        label={`${r.backorderCount} to give`}
                        sx={{ ml: 1 }}
                      />
                    ) : null}
                  </TableCell>
                  <TableCell>{r.soldByName}</TableCell>
                  <TableCell align="right">{r.itemCount}</TableCell>
                  <TableCell align="right">{num(r.grossTotal)}</TableCell>
                  <TableCell align="right">{num(r.amountReceived)}</TableCell>
                  <TableCell align="right" sx={{ color: r.balanceDue > 0 ? palette.margin : "inherit", fontWeight: r.balanceDue > 0 ? 600 : 400 }}>
                    {r.balanceDue > 0 ? num(r.balanceDue) : "—"}
                  </TableCell>
                  <TableCell>{dayTime(r.soldAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data?.hasMore || offset > 0 ? (
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ p: 1.5 }}>
            <Button
              size="small"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Newer
            </Button>
            <Button
              size="small"
              disabled={!data?.hasMore}
              onClick={() => setOffset(data?.nextOffset ?? offset)}
            >
              Older
            </Button>
          </Stack>
        ) : null}
      </Box>

      <SaleDrawer saleId={openId} onClose={() => setOpenId(null)} />
    </Page>
  );
}

/**
 * useSearchParams() suspends while the URL is read, so the part that reads it
 * sits behind its own boundary. Without this the page cannot be prerendered.
 */
export default function SalesPage() {
  return (
    <Suspense fallback={null}>
      <SalesList />
    </Suspense>
  );
}
