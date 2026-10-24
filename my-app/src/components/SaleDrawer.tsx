"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import PrintIcon from "@mui/icons-material/Print";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { num, pkr, dayTime, fullDateTime } from "@/lib/format";
import { palette } from "@/theme";
import { Code } from "./Page";

export type SaleLineDetail = {
  id: number;
  itemId: number;
  name: string;
  unitPrice: number;
  qty: number;
  lineDiscount: number;
  lineTotal: number;
  qtyDelivered: number;
  qtyBackordered: number;
  qtyCancelled: number;
  qtyReturned: number;
  className: string | null;
  fromFullCourse: boolean;
};

export type SaleDetail = {
  id: number;
  code: string;
  buyerName: string;
  buyerPhone: string | null;
  status: "COMPLETED" | "VOIDED";
  subtotal: number;
  discountTotal: number;
  grossTotal: number;
  returnCredit: number;
  amountReceived: number;
  amountRefunded: number;
  balanceDue: number;
  isSettled: boolean;
  note: string | null;
  soldAt: string;
  soldBy: { id: number; name: string; email: string };
  lines: SaleLineDetail[];
  payments: Array<{
    id: number;
    amount: number;
    method: string;
    note: string | null;
    receivedAt: string;
    receivedBy: string;
  }>;
  returns: Array<{
    id: number;
    code: string;
    reason: string | null;
    creditTotal: number;
    createdAt: string;
    createdBy: string;
  }>;
};

/** Everything you can do to one sale, in one panel. */
export function SaleDrawer({
  saleId,
  onClose,
}: {
  saleId: number | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const [payOpen, setPayOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [writeOffOpen, setWriteOffOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sale", saleId],
    queryFn: () => api.get<{ sale: SaleDetail }>(`/api/sales/${saleId}`),
    enabled: saleId !== null,
  });
  const sale = data?.sale;

  return (
    <Drawer
      anchor="right"
      open={saleId !== null}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 520 } } } }}
    >
      {isLoading || !sale ? (
        <Box sx={{ display: "grid", placeItems: "center", height: "100%" }}>
          <CircularProgress size={24} />
        </Box>
      ) : (
        <>
          <Stack
            direction="row"
            alignItems="center"
            sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${palette.rule}` }}
          >
            <Box sx={{ flex: 1 }}>
              <Typography variant="h4">{sale.buyerName}</Typography>
              <Typography variant="caption">
                <Code>{sale.code}</Code> · {fullDateTime(sale.soldAt)} · {sale.soldBy.name}
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
            <Stack direction="row" spacing={1} sx={{ mb: 2, flexWrap: "wrap", gap: 1 }}>
              <Chip
                size="small"
                label={sale.balanceDue > 0 ? `Owes ${pkr(sale.balanceDue)}` : "Settled"}
                color={sale.balanceDue > 0 ? "error" : "success"}
              />
              {sale.status === "VOIDED" ? (
                <Chip size="small" label="Voided" variant="outlined" />
              ) : null}
              {sale.lines.some((l) => l.qtyBackordered > 0) ? (
                <Chip size="small" color="warning" label="Items to hand over" />
              ) : null}
            </Stack>

            {sale.lines.map((l) => (
              <Box
                key={l.id}
                sx={{
                  py: 1,
                  borderBottom: `1px solid ${palette.rule}`,
                  borderLeft: "3px solid",
                  borderLeftColor:
                    l.qtyBackordered > 0 ? palette.amber : "transparent",
                  pl: 1,
                }}
              >
                <Stack direction="row" justifyContent="space-between" spacing={1}>
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {l.name}
                  </Typography>
                  <Typography variant="body2">{num(l.lineTotal)}</Typography>
                </Stack>
                <Typography variant="caption">
                  {l.qty} × {num(l.unitPrice)}
                  {l.lineDiscount > 0 ? ` · −${num(l.lineDiscount)}` : ""}
                  {l.className ? ` · ${l.className}` : ""}
                  {l.qtyBackordered > 0 ? ` · ${l.qtyBackordered} to collect` : ""}
                  {l.qtyReturned > 0 ? ` · ${l.qtyReturned} returned` : ""}
                  {l.qtyCancelled > 0 ? ` · ${l.qtyCancelled} cancelled` : ""}
                </Typography>
              </Box>
            ))}

            <Box sx={{ mt: 2 }}>
              <Line label="Subtotal" value={num(sale.subtotal)} />
              {sale.discountTotal > 0 ? (
                <Line label="Discount" value={`−${num(sale.discountTotal)}`} />
              ) : null}
              {sale.returnCredit > 0 ? (
                <Line label="Returns credited" value={`−${num(sale.returnCredit)}`} />
              ) : null}
              <Line label="Total" value={pkr(sale.grossTotal - sale.returnCredit)} strong />
              <Line label="Received" value={pkr(sale.amountReceived)} />
              {sale.amountRefunded > 0 ? (
                <Line label="Refunded" value={pkr(sale.amountRefunded)} />
              ) : null}
              <Line
                label={sale.balanceDue < 0 ? "Owed to buyer" : "Balance due"}
                value={pkr(Math.abs(sale.balanceDue))}
                strong
                tone={sale.balanceDue > 0 ? "owed" : undefined}
              />
            </Box>

            {sale.payments.length ? (
              <>
                <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                  Payments
                </Typography>
                {sale.payments.map((p) => (
                  <Stack key={p.id} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                    <Typography variant="caption">
                      {dayTime(p.receivedAt)} · {p.method.toLowerCase().replace("_", " ")} · {p.receivedBy}
                      {p.note ? ` · ${p.note}` : ""}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      {num(p.amount)}
                    </Typography>
                  </Stack>
                ))}
              </>
            ) : null}

            {sale.returns.length ? (
              <>
                <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
                  Returns
                </Typography>
                {sale.returns.map((r) => (
                  <Stack key={r.id} direction="row" justifyContent="space-between" sx={{ py: 0.5 }}>
                    <Typography variant="caption">
                      {dayTime(r.createdAt)} · <Code>{r.code}</Code> · {r.createdBy}
                      {r.reason ? ` · ${r.reason}` : ""}
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600 }}>
                      −{num(r.creditTotal)}
                    </Typography>
                  </Stack>
                ))}
              </>
            ) : null}

            {sale.note ? (
              <Alert severity="info" sx={{ mt: 2 }}>
                {sale.note}
              </Alert>
            ) : null}
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{ p: 2, borderTop: `1px solid ${palette.rule}`, flexWrap: "wrap", gap: 1 }}
          >
            {sale.balanceDue > 0 && can("payment.receive") ? (
              <Button variant="contained" onClick={() => setPayOpen(true)}>
                Take payment
              </Button>
            ) : null}
            {can("return.create") ? (
              <Button variant="outlined" onClick={() => setReturnOpen(true)}>
                Return items
              </Button>
            ) : null}
            <Button
              component={Link}
              href={`/receipt/${sale.id}`}
              startIcon={<PrintIcon />}
              color="inherit"
            >
              Receipt
            </Button>
            {sale.balanceDue > 0 && can("stock.correct") ? (
              <Button color="inherit" onClick={() => setWriteOffOpen(true)}>
                Write off
              </Button>
            ) : null}
          </Stack>

          <PaymentDialog
            sale={sale}
            open={payOpen}
            onClose={() => setPayOpen(false)}
          />
          <ReturnDialog
            sale={sale}
            open={returnOpen}
            onClose={() => setReturnOpen(false)}
          />
          <WriteOffDialog
            sale={sale}
            open={writeOffOpen}
            onClose={() => setWriteOffOpen(false)}
          />
        </>
      )}
    </Drawer>
  );
}

function Line({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "owed";
}) {
  return (
    <Stack direction="row" justifyContent="space-between" sx={{ py: 0.25 }}>
      <Typography variant="body2" sx={{ fontWeight: strong ? 600 : 400 }}>
        {label}
      </Typography>
      <Typography
        variant="body2"
        sx={{
          fontWeight: strong ? 600 : 400,
          color: tone === "owed" ? palette.margin : "inherit",
        }}
      >
        {value}
      </Typography>
    </Stack>
  );
}

/** Record money received against an outstanding balance. */
export function PaymentDialog({
  sale,
  open,
  onClose,
}: {
  sale: Pick<SaleDetail, "id" | "buyerName" | "balanceDue">;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(String(sale.balanceDue));
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/sales/${sale.id}/payments`, {
        amount: Number(amount),
        method,
        note: note.trim() || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The payment was not recorded."),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Take payment</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {sale.buyerName} owes <strong>{pkr(sale.balanceDue)}</strong>.
        </Typography>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Amount received"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            InputProps={{
              startAdornment: <InputAdornment position="start">PKR</InputAdornment>,
            }}
          />
          <TextField
            label="Method"
            select
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          >
            <MenuItem value="CASH">Cash</MenuItem>
            <MenuItem value="CARD">Card</MenuItem>
            <MenuItem value="BANK_TRANSFER">Bank transfer</MenuItem>
          </TextField>
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
          {mutation.isPending ? "Saving…" : "Record payment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Returns. Per line you choose how many come back and in what condition:
 * resellable goes back on the shelf, damaged is written off, and
 * "never received" cancels something still owed to the buyer.
 */
export function ReturnDialog({
  sale,
  open,
  onClose,
}: {
  sale: SaleDetail;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<Record<number, { qty: number; condition: string }>>({});
  const [reason, setReason] = useState("");
  const [payOut, setPayOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const returnable = useMemo(
    () =>
      sale.lines
        .map((l) => ({
          line: l,
          maxReturn: Math.max(0, l.qty - l.qtyReturned - l.qtyCancelled),
        }))
        .filter((r) => r.maxReturn > 0),
    [sale.lines],
  );

  const creditEstimate = useMemo(() => {
    let total = 0;
    for (const { line } of returnable) {
      const row = rows[line.id];
      if (!row?.qty) continue;
      const perUnit = line.qty > 0 ? line.lineTotal / line.qty : 0;
      total += perUnit * row.qty;
    }
    return Math.round(total * 100) / 100;
  }, [rows, returnable]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/sales/${sale.id}/returns`, {
        lines: Object.entries(rows)
          .filter(([, v]) => v.qty > 0)
          .map(([id, v]) => ({
            saleLineId: Number(id),
            qty: v.qty,
            condition: v.condition,
          })),
        reason: reason.trim() || null,
        payOutCredit: payOut,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      setRows({});
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The return was not saved."),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Return items</DialogTitle>
      <DialogContent>
        {returnable.length === 0 ? (
          <Alert severity="info">Everything on this sale has already been returned.</Alert>
        ) : (
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}

            {returnable.map(({ line, maxReturn }) => {
              const row = rows[line.id] ?? { qty: 0, condition: "RESELLABLE" };
              return (
                <Box
                  key={line.id}
                  sx={{ borderBottom: `1px solid ${palette.rule}`, pb: 1.5 }}
                >
                  <Typography variant="body2" sx={{ fontWeight: 500 }}>
                    {line.name}
                  </Typography>
                  <Typography variant="caption">
                    sold {line.qty} · {num(line.lineTotal / Math.max(1, line.qty))} each
                    {line.qtyBackordered > 0 ? ` · ${line.qtyBackordered} not yet handed over` : ""}
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      label="Qty back"
                      type="number"
                      value={row.qty || ""}
                      onChange={(e) =>
                        setRows((prev) => ({
                          ...prev,
                          [line.id]: {
                            ...row,
                            qty: Math.min(maxReturn, Math.max(0, Number(e.target.value) || 0)),
                          },
                        }))
                      }
                      inputProps={{ min: 0, max: maxReturn }}
                      sx={{ width: 110 }}
                      helperText={`max ${maxReturn}`}
                    />
                    <TextField
                      label="Condition"
                      select
                      value={row.condition}
                      onChange={(e) =>
                        setRows((prev) => ({
                          ...prev,
                          [line.id]: { ...row, condition: e.target.value },
                        }))
                      }
                      sx={{ flex: 1 }}
                    >
                      <MenuItem value="RESELLABLE">Back on the shelf</MenuItem>
                      <MenuItem value="DAMAGED">Damaged — write off</MenuItem>
                      {line.qtyBackordered > 0 ? (
                        <MenuItem value="NOT_DELIVERED">Never received — cancel</MenuItem>
                      ) : null}
                    </TextField>
                  </Stack>
                </Box>
              );
            })}

            <TextField
              label="Reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Wrong class, duplicate purchase, damaged in transit…"
            />

            <Alert severity="info" sx={{ py: 0.5 }}>
              Credit of about <strong>{pkr(creditEstimate)}</strong>.
              {sale.balanceDue > 0
                ? " This reduces what the buyer still owes first."
                : " The buyer has paid in full, so this becomes money owed back to them."}
            </Alert>

            {sale.balanceDue <= 0 ? (
              <FormControlLabel
                control={
                  <Switch checked={payOut} onChange={(e) => setPayOut(e.target.checked)} />
                }
                label="Hand the cash back now"
              />
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={
            mutation.isPending ||
            !Object.values(rows).some((r) => r.qty > 0)
          }
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Saving…" : "Record return"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Forgive an uncollectable balance. Admin only, reason required, audited. */
function WriteOffDialog({
  sale,
  open,
  onClose,
}: {
  sale: Pick<SaleDetail, "id" | "buyerName" | "balanceDue">;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => api.post(`/api/sales/${sale.id}/writeoff`, { reason: reason.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The write-off was not saved."),
  });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Write off {pkr(sale.balanceDue)}</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          This clears what {sale.buyerName} owes without any money being received. It
          stays on the record and in the activity log.
        </Alert>
        {error ? <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert> : null}
        <TextField
          label="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          fullWidth
          autoFocus
          required
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          color="error"
          disabled={mutation.isPending || !reason.trim()}
          onClick={() => mutation.mutate()}
        >
          Write off
        </Button>
      </DialogActions>
    </Dialog>
  );
}
