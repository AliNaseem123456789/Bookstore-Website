"use client";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  InputAdornment,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import { api, qs } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { num, dayTime } from "@/lib/format";
import { palette } from "@/theme";

type Row = {
  id: number;
  code: string;
  name: string;
  type: string;
  quantityOnHand: number;
  reorderLevel: number;
};

type Batch = {
  id: number;
  code: string;
  supplier: string | null;
  note: string | null;
  totalUnits: number;
  createdAt: string;
  receivedBy: string;
};

export default function RestockPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [idemKey, setIdemKey] = useState(() => crypto.randomUUID());

  const { data, isLoading } = useQuery({
    queryKey: ["restock-items", search],
    queryFn: () =>
      api.get<{ items: Row[] }>("/api/items" + qs({ search, limit: 300 })),
  });

  const { data: batches } = useQuery({
    queryKey: ["restock-batches"],
    queryFn: () => api.get<{ batches: Batch[] }>("/api/stock/batches"),
  });

  const entered = useMemo(
    () =>
      Object.entries(qty)
        .map(([id, v]) => ({ itemId: Number(id), qty: Number(v) || 0 }))
        .filter((l) => l.qty > 0),
    [qty],
  );
  const totalUnits = entered.reduce((s, l) => s + l.qty, 0);

  const receive = useMutation({
    mutationFn: () =>
      api.post(
        "/api/stock/receive",
        {
          lines: entered,
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        },
        idemKey,
      ),
    onSuccess: () => {
      setMsg({
        kind: "ok",
        text: `${totalUnits} unit(s) received and added to stock.`,
      });
      setQty({});
      setSupplier("");
      setNote("");
      setIdemKey(crypto.randomUUID());
      queryClient.invalidateQueries();
    },
    onError: (err) =>
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Nothing was received.",
      }),
  });

  const rows = data?.items ?? [];

  return (
    <Page
      title="Receive stock"
      subtitle="Enter what arrived. Each line is written to the stock ledger as one batch you can trace later."
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat label="Lines entered" value={num(entered.length)} />
        <Stat
          label="Units to add"
          value={num(totalUnits)}
          tone={totalUnits ? "good" : "none"}
        />
      </Stack>

      {msg ? (
        <Alert severity={msg.kind === "ok" ? "success" : "error"} sx={{ mb: 2 }}>
          {msg.text}
        </Alert>
      ) : null}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          placeholder="Search the catalogue"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 280 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="action" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          label="Supplier"
          value={supplier}
          onChange={(e) => setSupplier(e.target.value)}
          sx={{ minWidth: 200 }}
        />
        <TextField
          label="Note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          sx={{ flex: 1 }}
        />
      </Stack>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell align="right">On shelf</TableCell>
              <TableCell align="right">Reorder at</TableCell>
              <TableCell align="right" sx={{ width: 140 }}>
                Arriving
              </TableCell>
              <TableCell align="right">After</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={5}>
                    <Skeleton height={28} />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ border: 0 }}>
                  <Empty title="Nothing matches that." />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const adding = Number(qty[r.id]) || 0;
                const low = r.quantityOnHand <= r.reorderLevel;
                return (
                  <TableRow
                    key={r.id}
                    sx={{
                      borderLeft: "3px solid",
                      borderLeftColor: adding > 0 ? palette.stamp : low ? palette.amber : "transparent",
                    }}
                  >
                    <TableCell>
                      <Box sx={{ fontWeight: 500 }}>{r.name}</Box>
                      <Code>{r.code}</Code>
                    </TableCell>
                    <TableCell align="right">{num(r.quantityOnHand)}</TableCell>
                    <TableCell align="right">{num(r.reorderLevel)}</TableCell>
                    <TableCell align="right">
                      <TextField
                        type="number"
                        value={qty[r.id] ?? ""}
                        placeholder="0"
                        onChange={(e) => setQty({ ...qty, [r.id]: e.target.value })}
                        inputProps={{ min: 0, style: { textAlign: "right" } }}
                        sx={{ width: 110 }}
                      />
                    </TableCell>
                    <TableCell align="right" sx={{ fontWeight: adding ? 600 : 400 }}>
                      {adding ? num(r.quantityOnHand + adding) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>

      <Stack direction="row" justifyContent="flex-end" sx={{ mt: 2 }}>
        <Button
          variant="contained"
          size="large"
          disabled={entered.length === 0 || receive.isPending}
          onClick={() => receive.mutate()}
        >
          {receive.isPending ? "Saving…" : `Receive ${num(totalUnits)} unit(s)`}
        </Button>
      </Stack>

      <Typography variant="subtitle2" sx={{ mt: 4, mb: 1 }}>
        Recent deliveries
      </Typography>
      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Batch</TableCell>
              <TableCell>When</TableCell>
              <TableCell>Received by</TableCell>
              <TableCell>Supplier</TableCell>
              <TableCell align="right">Units</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {(batches?.batches ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ border: 0 }}>
                  <Empty title="No deliveries recorded yet." />
                </TableCell>
              </TableRow>
            ) : (
              batches!.batches.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <Code>{b.code}</Code>
                  </TableCell>
                  <TableCell>{dayTime(b.createdAt)}</TableCell>
                  <TableCell>{b.receivedBy}</TableCell>
                  <TableCell>{b.supplier ?? "—"}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    +{num(b.totalUnits)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>
    </Page>
  );
}
