"use client";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { num, pkr, dayTime } from "@/lib/format";
import { palette } from "@/theme";
import { Code } from "./Page";

type Item = {
  id: number;
  code: string;
  name: string;
  publisher: string | null;
  type: "BOOK" | "COPY" | "STATIONERY";
  price: number | string;
  quantityOnHand: number;
  reorderLevel: number;
  isActive: boolean;
  aliases?: Array<{ id: number; alias: string }>;
};

type Movement = {
  id: number;
  delta: number;
  reason: string;
  balanceAfter: number;
  note: string | null;
  createdAt: string;
  actorName: string | null;
};

const REASON_LABEL: Record<string, string> = {
  OPENING: "Opening balance",
  RESTOCK: "Stock received",
  SALE: "Sold",
  BACKORDER_FULFILL: "Handed over",
  RETURN_RESELLABLE: "Returned to shelf",
  WRITE_OFF: "Written off",
  CORRECTION: "Count correction",
};

export function ItemDrawer({
  itemId,
  onClose,
}: {
  itemId: number | null;
  onClose: () => void;
}) {
  const { can } = useSession();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<Partial<Item>>({});
  const [alias, setAlias] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["item", itemId],
    queryFn: () =>
      api.get<{
        item: Item;
        usedIn: Array<{ classId: number; code: string; name: string; defaultQty: number }>;
        movements: Movement[];
      }>(`/api/items/${itemId}`),
    enabled: itemId !== null,
  });

  useEffect(() => {
    if (data?.item) {
      setForm({
        name: data.item.name,
        publisher: data.item.publisher,
        type: data.item.type,
        price: Number(data.item.price),
        reorderLevel: data.item.reorderLevel,
        isActive: data.item.isActive,
      });
      setMsg(null);
    }
  }, [data?.item]);

  const save = useMutation({
    mutationFn: (patch: Record<string, unknown>) =>
      api.patch(`/api/items/${itemId}`, patch),
    onSuccess: () => {
      setMsg({ kind: "ok", text: "Saved." });
      setAlias("");
      queryClient.invalidateQueries();
    },
    onError: (err) =>
      setMsg({ kind: "err", text: err instanceof Error ? err.message : "Not saved." }),
  });

  const correct = useMutation({
    mutationFn: () =>
      api.post("/api/stock/correct", {
        itemId,
        countedQty: Number(counted),
        reason: reason.trim(),
      }),
    onSuccess: () => {
      setMsg({ kind: "ok", text: "Stock corrected." });
      setCounted("");
      setReason("");
      queryClient.invalidateQueries();
    },
    onError: (err) =>
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "The correction was not saved.",
      }),
  });

  const item = data?.item;

  return (
    <Drawer
      anchor="right"
      open={itemId !== null}
      onClose={onClose}
      slotProps={{ paper: { sx: { width: { xs: "100%", sm: 560 } } } }}
    >
      {isLoading || !item ? (
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
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h4" noWrap>
                {item.name}
              </Typography>
              <Typography variant="caption">
                <Code>{item.code}</Code> · {num(item.quantityOnHand)} on the shelf
              </Typography>
            </Box>
            <IconButton onClick={onClose} size="small">
              <CloseIcon fontSize="small" />
            </IconButton>
          </Stack>

          <Box sx={{ flex: 1, overflowY: "auto", px: 2, py: 2 }}>
            {msg ? (
              <Alert severity={msg.kind === "ok" ? "success" : "error"} sx={{ mb: 2 }}>
                {msg.text}
              </Alert>
            ) : null}

            {can("item.edit") ? (
              <Stack spacing={2}>
                <TextField
                  label="Name"
                  value={form.name ?? ""}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Publisher"
                    value={form.publisher ?? ""}
                    onChange={(e) => setForm({ ...form, publisher: e.target.value })}
                    fullWidth
                  />
                  <TextField
                    label="Kind"
                    select
                    value={form.type ?? "BOOK"}
                    onChange={(e) => setForm({ ...form, type: e.target.value as Item["type"] })}
                    sx={{ width: 150 }}
                  >
                    <MenuItem value="BOOK">Book</MenuItem>
                    <MenuItem value="COPY">Copy</MenuItem>
                    <MenuItem value="STATIONERY">Stationery</MenuItem>
                  </TextField>
                </Stack>
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Price"
                    type="number"
                    value={form.price ?? 0}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                    disabled={!can("item.setPrice")}
                    helperText={
                      can("item.setPrice")
                        ? "Changing this is recorded in price history."
                        : "Only an administrator can change prices."
                    }
                    fullWidth
                  />
                  <TextField
                    label="Reorder level"
                    type="number"
                    value={form.reorderLevel ?? 0}
                    onChange={(e) =>
                      setForm({ ...form, reorderLevel: Number(e.target.value) })
                    }
                    sx={{ width: 150 }}
                  />
                </Stack>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.isActive ?? true}
                      onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                    />
                  }
                  label="Available to sell"
                />
                <Button
                  variant="contained"
                  sx={{ alignSelf: "flex-start" }}
                  disabled={save.isPending}
                  onClick={() => {
                    const patch: Record<string, unknown> = {
                      name: form.name,
                      publisher: form.publisher || null,
                      type: form.type,
                      reorderLevel: form.reorderLevel,
                      isActive: form.isActive,
                    };
                    if (can("item.setPrice")) patch.price = Number(form.price);
                    save.mutate(patch);
                  }}
                >
                  Save changes
                </Button>
              </Stack>
            ) : (
              <Stack spacing={0.5}>
                <Row label="Price" value={pkr(item.price)} />
                <Row label="Kind" value={item.type.toLowerCase()} />
                <Row label="Reorder level" value={num(item.reorderLevel)} />
              </Stack>
            )}

            <Divider sx={{ my: 3 }} />

            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Other names
            </Typography>
            <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
              Add the names staff actually type, so this book is never entered twice.
            </Typography>
            <Stack direction="row" spacing={1} sx={{ mb: 1, flexWrap: "wrap", gap: 1 }}>
              {(item.aliases ?? []).map((a) => (
                <Chip key={a.id} size="small" label={a.alias} variant="outlined" />
              ))}
              {(item.aliases ?? []).length === 0 ? (
                <Typography variant="caption">None yet.</Typography>
              ) : null}
            </Stack>
            {can("item.edit") ? (
              <Stack direction="row" spacing={1}>
                <TextField
                  placeholder="Add another name"
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  fullWidth
                />
                <Button
                  disabled={!alias.trim() || save.isPending}
                  onClick={() => save.mutate({ addAlias: alias.trim() })}
                >
                  Add
                </Button>
              </Stack>
            ) : null}

            {(data?.usedIn ?? []).length ? (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  In these class courses
                </Typography>
                <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
                  {data!.usedIn.map((u) => (
                    <Chip
                      key={u.classId}
                      size="small"
                      label={`${u.name} ×${u.defaultQty}`}
                      variant="outlined"
                    />
                  ))}
                </Stack>
              </>
            ) : null}

            {can("stock.correct") ? (
              <>
                <Divider sx={{ my: 3 }} />
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Correct the count
                </Typography>
                <Typography variant="caption" sx={{ display: "block", mb: 1 }}>
                  Use this after counting the shelf. The difference is written to the
                  stock ledger with your reason — stock is never edited silently.
                </Typography>
                <Stack direction="row" spacing={1}>
                  <TextField
                    label="Counted"
                    type="number"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                    sx={{ width: 120 }}
                  />
                  <TextField
                    label="Reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    fullWidth
                  />
                  <Button
                    disabled={counted === "" || !reason.trim() || correct.isPending}
                    onClick={() => correct.mutate()}
                  >
                    Apply
                  </Button>
                </Stack>
              </>
            ) : null}

            <Divider sx={{ my: 3 }} />
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Stock history
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>When</TableCell>
                  <TableCell>What</TableCell>
                  <TableCell align="right">Change</TableCell>
                  <TableCell align="right">After</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {(data?.movements ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4}>
                      <Typography variant="caption">No movements yet.</Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  data!.movements.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>{dayTime(m.createdAt)}</TableCell>
                      <TableCell>
                        {REASON_LABEL[m.reason] ?? m.reason}
                        {m.actorName ? (
                          <Box component="span" sx={{ color: "text.secondary" }}>
                            {" "}· {m.actorName}
                          </Box>
                        ) : null}
                        {m.note ? (
                          <Typography variant="caption" sx={{ display: "block" }}>
                            {m.note}
                          </Typography>
                        ) : null}
                      </TableCell>
                      <TableCell
                        align="right"
                        sx={{
                          fontWeight: 600,
                          color: m.delta < 0 ? palette.margin : palette.stamp,
                        }}
                      >
                        {m.delta > 0 ? `+${m.delta}` : m.delta}
                      </TableCell>
                      <TableCell align="right">{num(m.balanceAfter)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Box>
        </>
      )}
    </Drawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Stack direction="row" justifyContent="space-between">
      <Typography variant="body2" sx={{ color: "text.secondary" }}>
        {label}
      </Typography>
      <Typography variant="body2">{value}</Typography>
    </Stack>
  );
}
