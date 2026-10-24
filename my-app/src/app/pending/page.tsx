"use client";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
} from "@mui/material";
import { api } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { num, day } from "@/lib/format";
import { palette } from "@/theme";

type Row = {
  itemId: number;
  code: string;
  name: string;
  type: string;
  quantityOnHand: number;
  pendingQty: number;
  waitingSales: number;
  oldestOrderAt: string;
  shortBy: number;
};

type LowRow = {
  itemId: number;
  code: string;
  name: string;
  quantityOnHand: number;
  reorderLevel: number;
  committedQty: number;
  freeQty: number;
};

export default function PendingPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["pending-inventory"],
    queryFn: () => api.get<{ items: Row[] }>("/api/stock/pending"),
  });
  const { data: low } = useQuery({
    queryKey: ["low-stock"],
    queryFn: () => api.get<{ items: LowRow[] }>("/api/stock/low"),
  });

  const rows = data?.items ?? [];
  const lowRows = low?.items ?? [];
  const unitsShort = rows.reduce((s, r) => s + r.shortBy, 0);

  return (
    <Page
      title="To reorder"
      subtitle="What buyers are waiting for, and what is running low on the shelf."
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat
          label="Units short"
          value={num(unitsShort)}
          hint="owed with no stock to cover it"
          tone={unitsShort ? "owed" : "good"}
        />
        <Stat label="Titles waiting" value={num(rows.length)} />
        <Stat
          label="Below reorder level"
          value={num(lowRows.length)}
          tone={lowRows.length ? "warn" : "good"}
        />
      </Stack>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface, mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="right">Promised</TableCell>
              <TableCell align="right">In stock</TableCell>
              <TableCell align="right">Short by</TableCell>
              <TableCell align="right">Buyers</TableCell>
              <TableCell>Oldest order</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6}>
                  <Skeleton height={28} />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ border: 0 }}>
                  <Empty title="Nothing on back order." hint="No buyer is waiting for stock." />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow
                  key={r.itemId}
                  sx={{
                    borderLeft: "3px solid",
                    borderLeftColor: r.shortBy > 0 ? palette.margin : palette.stamp,
                  }}
                >
                  <TableCell>
                    <Box sx={{ fontWeight: 500 }}>{r.name}</Box>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell align="right">{num(r.pendingQty)}</TableCell>
                  <TableCell align="right">{num(r.quantityOnHand)}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ fontWeight: 600, color: r.shortBy > 0 ? palette.margin : "inherit" }}
                  >
                    {r.shortBy > 0 ? num(r.shortBy) : "—"}
                  </TableCell>
                  <TableCell align="right">{num(r.waitingSales)}</TableCell>
                  <TableCell>{day(r.oldestOrderAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Running low</TableCell>
              <TableCell align="right">On shelf</TableCell>
              <TableCell align="right">Promised</TableCell>
              <TableCell align="right">Free to sell</TableCell>
              <TableCell align="right">Reorder at</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {lowRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ border: 0 }}>
                  <Empty title="Nothing below its reorder level." />
                </TableCell>
              </TableRow>
            ) : (
              lowRows.map((r) => (
                <TableRow
                  key={r.itemId}
                  sx={{
                    borderLeft: "3px solid",
                    borderLeftColor: r.freeQty <= 0 ? palette.margin : palette.amber,
                  }}
                >
                  <TableCell>
                    <Box sx={{ fontWeight: 500 }}>{r.name}</Box>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell align="right">{num(r.quantityOnHand)}</TableCell>
                  <TableCell align="right">{num(r.committedQty)}</TableCell>
                  <TableCell align="right">
                    <Chip
                      size="small"
                      color={r.freeQty <= 0 ? "error" : "warning"}
                      label={num(r.freeQty)}
                    />
                  </TableCell>
                  <TableCell align="right">{num(r.reorderLevel)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Page>
  );
}
