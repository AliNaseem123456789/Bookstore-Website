"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  InputAdornment,
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
import { Page, Empty, Code, Stat } from "@/components/Page";
import { SaleDrawer } from "@/components/SaleDrawer";
import { num, pkr, day } from "@/lib/format";
import { palette } from "@/theme";

type SaleRow = {
  id: number;
  code: string;
  buyerName: string;
  grossTotal: number;
  balanceDue: number;
  soldAt: string;
  soldByName: string;
  itemCount: number;
};

type CreditRow = {
  id: number;
  code: string;
  buyerName: string;
  buyerPhone: string | null;
  owedToBuyer: number;
  soldAt: string;
};

export default function RefundsPage() {
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [payout, setPayout] = useState<CreditRow | null>(null);

  const { data: found, isFetching } = useQuery({
    queryKey: ["refund-search", search],
    queryFn: () =>
      api.get<{ sales: SaleRow[] }>("/api/sales" + qs({ search, limit: 20 })),
    enabled: search.trim().length > 1,
  });

  const { data: credits } = useQuery({
    queryKey: ["credits"],
    queryFn: () => api.get<{ sales: CreditRow[] }>("/api/credits"),
  });

  const creditRows = credits?.sales ?? [];
  const creditTotal = creditRows.reduce((s, r) => s + r.owedToBuyer, 0);

  return (
    <Page
      title="Returns and refunds"
      subtitle="Find the sale, choose what came back, and say whether it can go back on the shelf."
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat
          label="Owed back to buyers"
          value={pkr(creditTotal)}
          hint={creditRows.length ? `${creditRows.length} buyer(s)` : "nothing pending"}
          tone={creditTotal > 0 ? "owed" : "good"}
        />
      </Stack>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Find a sale to return against
      </Typography>
      <TextField
        placeholder="Buyer name or receipt number"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        sx={{ mb: 2, minWidth: 320 }}
        InputProps={{
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" color="action" />
            </InputAdornment>
          ),
        }}
      />

      <Box
        sx={{
          border: `1px solid ${palette.rule}`,
          borderRadius: 1,
          bgcolor: palette.surface,
          mb: 4,
        }}
      >
        {search.trim().length < 2 ? (
          <Empty
            title="Search for the sale first."
            hint="A return is always recorded against the original receipt, so the right stock and money move back."
          />
        ) : (found?.sales ?? []).length === 0 ? (
          <Empty title={isFetching ? "Searching…" : "No sale matches that."} />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Receipt</TableCell>
                <TableCell>Buyer</TableCell>
                <TableCell>Sold</TableCell>
                <TableCell align="right">Items</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {(found?.sales ?? []).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell sx={{ fontWeight: 500 }}>{r.buyerName}</TableCell>
                  <TableCell>{day(r.soldAt)}</TableCell>
                  <TableCell align="right">{r.itemCount}</TableCell>
                  <TableCell align="right">{num(r.grossTotal)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="outlined" onClick={() => setOpenId(r.id)}>
                      Open
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Money owed back to buyers
      </Typography>
      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        {creditRows.length === 0 ? (
          <Empty title="Nothing to pay out." hint="Returns have all been settled." />
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Buyer</TableCell>
                <TableCell>Receipt</TableCell>
                <TableCell>Sold</TableCell>
                <TableCell align="right">Owed</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>
            <TableBody>
              {creditRows.map((r) => (
                <TableRow
                  key={r.id}
                  hover
                  sx={{ borderLeft: `3px solid ${palette.margin}` }}
                >
                  <TableCell sx={{ fontWeight: 500 }}>
                    {r.buyerName}
                    {r.buyerPhone ? ` · ${r.buyerPhone}` : ""}
                  </TableCell>
                  <TableCell>
                    <Code>{r.code}</Code>
                  </TableCell>
                  <TableCell>{day(r.soldAt)}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600, color: palette.margin }}>
                    {num(r.owedToBuyer)}
                  </TableCell>
                  <TableCell align="right">
                    <Button size="small" variant="contained" onClick={() => setPayout(r)}>
                      Pay out
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Box>

      <SaleDrawer saleId={openId} onClose={() => setOpenId(null)} />
      {payout ? <PayoutDialog row={payout} onClose={() => setPayout(null)} /> : null}
    </Page>
  );
}

function PayoutDialog({ row, onClose }: { row: CreditRow; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(row.owedToBuyer));
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post("/api/refunds", {
        saleId: row.id,
        amount: Number(amount),
        note: note.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The payout was not recorded."),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Pay out to {row.buyerName}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2">
            The shop owes <strong>{pkr(row.owedToBuyer)}</strong> on receipt {row.code}.
          </Typography>
          <TextField
            label="Cash handed back"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            InputProps={{
              startAdornment: <InputAdornment position="start">PKR</InputAdornment>,
            }}
          />
          <TextField label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={mutation.isPending || !(Number(amount) > 0)}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Record payout"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
