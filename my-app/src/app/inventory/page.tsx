"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  InputAdornment,
  MenuItem,
  Skeleton,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AddIcon from "@mui/icons-material/Add";
import { api, qs } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { ItemDrawer } from "@/components/ItemDrawer";
import { useSession } from "@/lib/session";
import { num, pkr } from "@/lib/format";
import { palette } from "@/theme";

type Row = {
  id: number;
  code: string;
  name: string;
  publisher: string | null;
  type: "BOOK" | "COPY" | "STATIONERY";
  price: number | string;
  quantityOnHand: number;
  reorderLevel: number;
  isActive: boolean;
  classCount: number;
};

export default function InventoryPage() {
  const { can } = useSession();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<"all" | "BOOK" | "COPY" | "STATIONERY">("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["items", search, type, includeInactive],
    queryFn: () =>
      api.get<{ items: Row[] }>(
        "/api/items" +
          qs({
            search,
            type: type === "all" ? undefined : type,
            includeInactive: includeInactive ? "true" : undefined,
            limit: 300,
          }),
      ),
  });

  const rows = data?.items ?? [];
  const stockValue = rows.reduce((s, r) => s + Number(r.price) * r.quantityOnHand, 0);
  const outOfStock = rows.filter((r) => r.quantityOnHand <= 0).length;

  return (
    <Page
      title="Catalogue"
      subtitle="Everything the shop sells, what it costs and how many are on the shelf."
      actions={
        can("item.create") ? (
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => setNewOpen(true)}>
            New item
          </Button>
        ) : null
      }
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat label="Items listed" value={num(rows.length)} />
        <Stat label="Stock value" value={pkr(stockValue)} />
        <Stat
          label="Out of stock"
          value={num(outOfStock)}
          tone={outOfStock ? "warn" : "good"}
        />
      </Stack>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2 }} alignItems="center">
        <TextField
          placeholder="Search name, code or other name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          sx={{ minWidth: 300 }}
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
          value={type}
          onChange={(_, v) => v && setType(v)}
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="BOOK">Books</ToggleButton>
          <ToggleButton value="COPY">Copies</ToggleButton>
          <ToggleButton value="STATIONERY">Other</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel
          control={
            <Switch
              size="small"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
            />
          }
          label={<Typography variant="body2">Show retired</Typography>}
        />
      </Stack>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Item</TableCell>
              <TableCell>Kind</TableCell>
              <TableCell align="right">Price</TableCell>
              <TableCell align="right">On shelf</TableCell>
              <TableCell align="right">Reorder at</TableCell>
              <TableCell align="right">Classes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton height={28} />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} sx={{ border: 0 }}>
                  <Empty
                    title={search ? "Nothing matches that." : "No items yet."}
                    hint={
                      search
                        ? "Try a shorter word — other names are searched too."
                        : "Add the first item to get started."
                    }
                  />
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => {
                const low = r.quantityOnHand <= r.reorderLevel;
                const out = r.quantityOnHand <= 0;
                return (
                  <TableRow
                    key={r.id}
                    hover
                    onClick={() => setOpenId(r.id)}
                    sx={{
                      cursor: "pointer",
                      opacity: r.isActive ? 1 : 0.55,
                      borderLeft: "3px solid",
                      borderLeftColor: out
                        ? palette.margin
                        : low
                          ? palette.amber
                          : "transparent",
                    }}
                  >
                    <TableCell>
                      <Box sx={{ fontWeight: 500 }}>
                        {r.name}
                        {!r.isActive ? (
                          <Chip size="small" label="retired" sx={{ ml: 1 }} variant="outlined" />
                        ) : null}
                      </Box>
                      <Code>
                        {r.code}
                        {r.publisher ? ` · ${r.publisher}` : ""}
                      </Code>
                    </TableCell>
                    <TableCell>
                      {r.type === "BOOK" ? "Book" : r.type === "COPY" ? "Copy" : "Other"}
                    </TableCell>
                    <TableCell align="right">{num(r.price)}</TableCell>
                    <TableCell
                      align="right"
                      sx={{ fontWeight: 600, color: out ? palette.margin : low ? palette.amber : "inherit" }}
                    >
                      {num(r.quantityOnHand)}
                    </TableCell>
                    <TableCell align="right">{num(r.reorderLevel)}</TableCell>
                    <TableCell align="right">{r.classCount || "—"}</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Box>

      <ItemDrawer itemId={openId} onClose={() => setOpenId(null)} />
      {newOpen ? <NewItemDialog onClose={() => setNewOpen(false)} /> : null}
    </Page>
  );
}

/**
 * Creating an item checks for near-duplicates first, so "English Reader 1"
 * and "english reader-1" do not become two books with two stock counts.
 */
function NewItemDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    publisher: "",
    type: "BOOK",
    price: "",
    reorderLevel: "10",
    openingQty: "0",
  });
  const [similar, setSimilar] = useState<Array<{ id: number; name: string }> | null>(null);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (confirmDuplicate: boolean) =>
      api.post<{ item?: unknown; needsConfirmation?: boolean; similar?: Array<{ id: number; name: string }>; error?: string }>(
        "/api/items",
        {
          name: form.name.trim(),
          publisher: form.publisher.trim() || null,
          type: form.type,
          price: Number(form.price),
          reorderLevel: Number(form.reorderLevel),
          openingQty: Number(form.openingQty),
          confirmDuplicate,
        },
      ),
    onSuccess: (res) => {
      if (res?.needsConfirmation) {
        setSimilar(res.similar ?? []);
        setError(res.error ?? null);
        return;
      }
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) => {
      const anyErr = err as { payload?: { needsConfirmation?: boolean; similar?: Array<{ id: number; name: string }> } };
      if (anyErr.payload?.needsConfirmation) {
        setSimilar(anyErr.payload.similar ?? []);
        setError(err instanceof Error ? err.message : null);
        return;
      }
      setError(err instanceof Error ? err.message : "The item was not created.");
    },
  });

  const valid = form.name.trim() && form.price !== "";

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New item</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="warning">{error}</Alert> : null}
          {similar?.length ? (
            <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, p: 1.5 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Already in the catalogue
              </Typography>
              {similar.map((s) => (
                <Typography key={s.id} variant="body2">
                  · {s.name}
                </Typography>
              ))}
              <Typography variant="caption" sx={{ display: "block", mt: 1 }}>
                If one of these is the same book, close this and add stock to it instead.
              </Typography>
            </Box>
          ) : null}

          <TextField
            label="Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
            required
          />
          <Stack direction="row" spacing={1}>
            <TextField
              label="Publisher"
              value={form.publisher}
              onChange={(e) => setForm({ ...form, publisher: e.target.value })}
              fullWidth
            />
            <TextField
              label="Kind"
              select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              sx={{ width: 160 }}
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
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
              required
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start">PKR</InputAdornment>,
              }}
            />
            <TextField
              label="Opening stock"
              type="number"
              value={form.openingQty}
              onChange={(e) => setForm({ ...form, openingQty: e.target.value })}
              sx={{ width: 150 }}
            />
            <TextField
              label="Reorder at"
              type="number"
              value={form.reorderLevel}
              onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              sx={{ width: 130 }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={!valid || create.isPending}
          onClick={() => create.mutate(Boolean(similar))}
        >
          {similar ? "Create anyway" : create.isPending ? "Creating…" : "Create item"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
