"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RemoveIcon from "@mui/icons-material/Remove";
import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { api, qs } from "@/lib/api";
import { num, pkr, plural } from "@/lib/format";
import { Empty } from "@/components/Page";
import { palette } from "@/theme";

type ItemRow = {
  id: number;
  code: string;
  name: string;
  type: "BOOK" | "COPY" | "STATIONERY";
  publisher: string | null;
  price: number | string;
  quantityOnHand: number;
  classCount: number;
};

type CourseItem = {
  itemId: number;
  name: string;
  price: number;
  defaultQty: number;
  quantityOnHand: number;
  electiveGroupId: number | null;
};

type CourseView = {
  classId: number;
  className: string;
  mandatory: CourseItem[];
  electiveGroups: Array<{
    id: number;
    label: string;
    minSelect: number;
    maxSelect: number;
    items: CourseItem[];
  }>;
  baseTotal: number;
};

type ClassRow = { id: number; code: string; name: string };

type Line = {
  key: string;
  itemId: number;
  name: string;
  unitPrice: number;
  qty: number;
  lineDiscount: number;
  stock: number;
  classId: number | null;
  className?: string;
  fromFullCourse: boolean;
};

/**
 * One ticket row per (item, course) pair. Adding the same book twice from the
 * same place adds to its quantity instead of making a second row; the same
 * book bought loose *and* inside a course stays two rows, because only one of
 * them belongs to the course.
 */
const lineKey = (itemId: number, classId: number | null, course: boolean) =>
  `${itemId}:${classId ?? "loose"}:${course ? "course" : "single"}`;

const groupKeyOf = (l: Line) =>
  l.fromFullCourse && l.classId ? `course:${l.classId}` : "loose";

export default function PosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  /** Two steps: fill the ticket, then take the money. */
  const [step, setStep] = useState<"build" | "pay">("build");

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"items" | "courses">("items");
  const [openClassId, setOpenClassId] = useState<number | null>(null);
  const [electivePick, setElectivePick] = useState<Record<number, number[]>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const [lines, setLines] = useState<Line[]>([]);
  const [buyerName, setBuyerName] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("");
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [amountPaid, setAmountPaid] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "BANK_TRANSFER">("CASH");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: classesData } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ classes: ClassRow[] }>("/api/classes"),
    staleTime: 10 * 60_000,
  });

  const { data: itemsData, isFetching: searching } = useQuery({
    queryKey: ["pos-items", search],
    queryFn: () => api.get<{ items: ItemRow[] }>("/api/items" + qs({ search, limit: 40 })),
    staleTime: 15_000,
    enabled: step === "build" && mode === "items",
  });

  const { data: courseData, isFetching: loadingCourse } = useQuery({
    queryKey: ["course", openClassId],
    queryFn: () => api.get<{ course: CourseView }>(`/api/courses/${openClassId}`),
    enabled: openClassId !== null,
  });
  const course = courseData?.course;

  // Default each choice group to its cheapest option, so a cashier who
  // changes nothing still gets a valid course.
  useEffect(() => {
    if (!course) return;
    setElectivePick((prev) => {
      if (prev[course.classId]) return prev;
      const picks: number[] = [];
      for (const g of course.electiveGroups) {
        const cheapest = [...g.items]
          .sort((a, b) => a.price * a.defaultQty - b.price * b.defaultQty)
          .slice(0, Math.max(1, g.minSelect));
        picks.push(...cheapest.map((i) => i.itemId));
      }
      return { ...prev, [course.classId]: picks };
    });
  }, [course]);

  /** Total wanted per item across the whole ticket, for the stock warning. */
  const demand = useMemo(() => {
    const m = new Map<number, { qty: number; stock: number }>();
    for (const l of lines) {
      const prev = m.get(l.itemId);
      m.set(l.itemId, { qty: (prev?.qty ?? 0) + l.qty, stock: l.stock });
    }
    return m;
  }, [lines]);

  /** Courses as one row each, loose items last. */
  const groups = useMemo(() => {
    const order: string[] = [];
    const map = new Map<
      string,
      { key: string; title: string; isCourse: boolean; lines: Line[]; total: number; units: number }
    >();

    for (const l of lines) {
      const key = groupKeyOf(l);
      if (!map.has(key)) {
        order.push(key);
        map.set(key, {
          key,
          title: key === "loose" ? "Single items" : `${l.className ?? "Course"} — full course`,
          isCourse: key !== "loose",
          lines: [],
          total: 0,
          units: 0,
        });
      }
      const g = map.get(key)!;
      g.lines.push(l);
      g.total += l.unitPrice * l.qty - l.lineDiscount;
      g.units += l.qty;
    }

    // Loose items sit at the bottom: courses are the headline.
    return order
      .map((k) => map.get(k)!)
      .sort((a, b) => Number(a.key === "loose") - Number(b.key === "loose"));
  }, [lines]);

  const subtotal = useMemo(
    () => lines.reduce((s, l) => s + l.unitPrice * l.qty - l.lineDiscount, 0),
    [lines],
  );
  const totalUnits = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);
  const payable = Math.max(0, subtotal - orderDiscount);
  const paidNow = amountPaid === "" ? payable : Math.max(0, Number(amountPaid) || 0);
  const balance = Math.round((payable - paidNow) * 100) / 100;

  const backorderUnits = useMemo(() => {
    let total = 0;
    for (const { qty, stock } of demand.values()) total += Math.max(0, qty - stock);
    return total;
  }, [demand]);

  /**
   * A fresh idempotency key whenever the ticket or the money changes, so a
   * retry after a dropped connection replays the same sale while an edited
   * ticket counts as a new one.
   */
  const idemKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      JSON.stringify(lines.map((l) => [l.itemId, l.qty, l.lineDiscount, l.classId])),
      buyerName,
      orderDiscount,
      amountPaid,
      paymentMethod,
    ],
  );

  function addLine(next: Omit<Line, "key">) {
    const key = lineKey(next.itemId, next.classId, next.fromFullCourse);
    setLines((prev) => {
      const found = prev.find((l) => l.key === key);
      if (found) return prev.map((l) => (l.key === key ? { ...l, qty: l.qty + next.qty } : l));
      return [...prev, { ...next, key }];
    });
  }

  function addItem(item: ItemRow) {
    addLine({
      itemId: item.id,
      name: item.name,
      unitPrice: Number(item.price),
      qty: 1,
      lineDiscount: 0,
      stock: item.quantityOnHand,
      classId: null,
      fromFullCourse: false,
    });
  }

  function addCourse() {
    if (!course) return;
    const picks = new Set(electivePick[course.classId] ?? []);

    for (const g of course.electiveGroups) {
      const n = g.items.filter((i) => picks.has(i.itemId)).length;
      if (n < g.minSelect) {
        setError(`Choose ${g.minSelect === 1 ? "one" : g.minSelect} for ${g.label}.`);
        return;
      }
      if (n > g.maxSelect) {
        setError(`${g.label}: choose at most ${g.maxSelect}.`);
        return;
      }
    }

    const chosen = [
      ...course.mandatory,
      ...course.electiveGroups.flatMap((g) => g.items.filter((i) => picks.has(i.itemId))),
    ];

    setError(null);
    for (const i of chosen) {
      addLine({
        itemId: i.itemId,
        name: i.name,
        unitPrice: i.price,
        qty: i.defaultQty,
        lineDiscount: 0,
        stock: i.quantityOnHand,
        classId: course.classId,
        className: course.className,
        fromFullCourse: true,
      });
    }
    // A course arrives as one row; leave it folded so the ticket stays short.
    setCollapsed((prev) => ({ ...prev, [`course:${course.classId}`]: true }));
    setOpenClassId(null);
  }

  const setQty = (key: string, qty: number) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: Math.max(1, qty) } : l)));

  const setDiscount = (key: string, value: number) =>
    setLines((prev) =>
      prev.map((l) => (l.key === key ? { ...l, lineDiscount: Math.max(0, value) } : l)),
    );

  const removeLine = (key: string) => setLines((prev) => prev.filter((l) => l.key !== key));

  const removeGroup = (key: string) =>
    setLines((prev) => prev.filter((l) => groupKeyOf(l) !== key));

  function clearTicket() {
    setLines([]);
    setBuyerName("");
    setBuyerPhone("");
    setOrderDiscount(0);
    setAmountPaid("");
    setNote("");
    setError(null);
    setStep("build");
  }

  async function charge() {
    if (busy) return;
    if (!buyerName.trim()) {
      setError("Enter the buyer's name.");
      return;
    }
    if (!lines.length) {
      setError("The ticket is empty.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.post<{ sale: { id: number } }>(
        "/api/sales",
        {
          buyerName: buyerName.trim(),
          buyerPhone: buyerPhone.trim() || null,
          lines: lines.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            lineDiscount: l.lineDiscount || undefined,
            classId: l.classId,
            fromFullCourse: l.fromFullCourse,
          })),
          orderDiscount: orderDiscount || undefined,
          amountPaid: paidNow,
          paymentMethod,
          note: note.trim() || null,
        },
        idemKey,
      );
      queryClient.invalidateQueries();
      clearTicket();
      router.push(`/receipt/${res.sale.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The sale was not saved.");
      setBusy(false);
    }
  }

  const items = itemsData?.items ?? [];
  const classes = classesData?.classes ?? [];

  // ------------------------------------------------------------- ticket rows
  const ticketBody = (editable: boolean) =>
    groups.length === 0 ? (
      <Empty title="Nothing on the ticket yet." hint="Search an item, or open a class course." />
    ) : (
      groups.map((g) => {
        const folded = collapsed[g.key] ?? false;
        return (
          <Box key={g.key} sx={{ borderBottom: `1px solid ${palette.rule}` }}>
            <Stack
              direction="row"
              alignItems="center"
              spacing={1}
              sx={{ px: 1.5, py: 1.25, bgcolor: g.isCourse ? palette.stampSoft : "transparent" }}
            >
              <IconButton
                size="small"
                onClick={() => setCollapsed((p) => ({ ...p, [g.key]: !folded }))}
                aria-label={folded ? "Show items" : "Hide items"}
              >
                {folded ? <ExpandMoreIcon fontSize="small" /> : <ExpandLessIcon fontSize="small" />}
              </IconButton>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                  {g.title}
                </Typography>
                <Typography variant="caption">
                  {plural(g.lines.length, "line")} · {plural(g.units, "item")}
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {num(g.total)}
              </Typography>
              {editable ? (
                <Tooltip title="Remove all of these">
                  <IconButton size="small" onClick={() => removeGroup(g.key)}>
                    <CloseIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Stack>

            <Collapse in={!folded} unmountOnExit>
              {g.lines.map((l) => {
                const want = demand.get(l.itemId);
                const short = Math.max(0, (want?.qty ?? l.qty) - l.stock);
                return (
                  <Box
                    key={l.key}
                    sx={{
                      px: 1.5,
                      py: 1,
                      borderTop: `1px solid ${palette.rule}`,
                      borderLeft: "3px solid",
                      borderLeftColor: short > 0 ? palette.amber : "transparent",
                    }}
                  >
                    <Stack direction="row" spacing={1} alignItems="flex-start">
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="body2">{l.name}</Typography>
                        <Typography variant="caption">
                          {l.qty} × {num(l.unitPrice)}
                          {l.lineDiscount > 0 ? ` · −${num(l.lineDiscount)}` : ""}
                        </Typography>
                      </Box>
                      <Typography variant="body2" sx={{ width: 78, textAlign: "right" }}>
                        {num(l.unitPrice * l.qty - l.lineDiscount)}
                      </Typography>
                      {editable ? (
                        <IconButton size="small" onClick={() => removeLine(l.key)} aria-label="Remove">
                          <CloseIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                      ) : null}
                    </Stack>

                    {editable ? (
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }}>
                        <IconButton
                          size="small"
                          onClick={() => setQty(l.key, l.qty - 1)}
                          disabled={l.qty <= 1}
                        >
                          <RemoveIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                        <TextField
                          value={l.qty}
                          onChange={(e) => setQty(l.key, parseInt(e.target.value, 10) || 1)}
                          type="number"
                          variant="standard"
                          inputProps={{ min: 1, style: { textAlign: "center", width: 40 } }}
                          InputProps={{ disableUnderline: true }}
                        />
                        <IconButton size="small" onClick={() => setQty(l.key, l.qty + 1)}>
                          <AddIcon sx={{ fontSize: 15 }} />
                        </IconButton>
                        <TextField
                          value={l.lineDiscount || ""}
                          onChange={(e) => setDiscount(l.key, Number(e.target.value) || 0)}
                          placeholder="Discount"
                          type="number"
                          sx={{ width: 112, ml: "auto" }}
                          InputProps={{
                            startAdornment: <InputAdornment position="start">−</InputAdornment>,
                          }}
                        />
                      </Stack>
                    ) : null}

                    {short > 0 ? (
                      <Typography variant="caption" sx={{ color: palette.amber, display: "block", mt: 0.5 }}>
                        Only {num(l.stock)} in stock — {num(short)} will be owed to the buyer.
                      </Typography>
                    ) : null}
                  </Box>
                );
              })}
            </Collapse>
          </Box>
        );
      })
    );

  // ---------------------------------------------------------------- checkout
  if (step === "pay") {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 420px" },
          minHeight: "calc(100vh - 56px)",
        }}
      >
        <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5, minWidth: 0 }}>
          <Stack direction="row" alignItems="center" spacing={2} sx={{ mb: 2 }}>
            <Button startIcon={<ArrowBackIcon />} onClick={() => setStep("build")} color="inherit">
              Back to ticket
            </Button>
            <Box sx={{ flex: 1 }} />
            <Typography variant="caption">
              {plural(totalUnits, "item")} · {plural(lines.length, "line")}
            </Typography>
          </Stack>

          <Typography variant="h1" sx={{ mb: 0.5 }}>
            Checkout
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mb: 2 }}>
            Check the ticket, then take the payment on the right.
          </Typography>

          <Box
            sx={{
              border: `1px solid ${palette.rule}`,
              borderRadius: 1,
              bgcolor: palette.surface,
              overflow: "hidden",
            }}
          >
            {ticketBody(false)}
          </Box>
        </Box>

        <Box
          sx={{
            borderLeft: { lg: `1px solid ${palette.rule}` },
            borderTop: { xs: `1px solid ${palette.rule}`, lg: "none" },
            bgcolor: palette.surface,
            position: { lg: "sticky" },
            top: 0,
            alignSelf: "flex-start",
            width: "100%",
            p: 2,
          }}
        >
          <Stack spacing={1.5}>
            <Typography variant="h4">Payment</Typography>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Buyer name"
                value={buyerName}
                onChange={(e) => setBuyerName(e.target.value)}
                autoFocus
                fullWidth
                required
              />
              <TextField
                label="Phone"
                value={buyerPhone}
                onChange={(e) => setBuyerPhone(e.target.value)}
                sx={{ width: 150 }}
              />
            </Stack>

            <Stack direction="row" spacing={1}>
              <TextField
                label="Order discount"
                type="number"
                value={orderDiscount || ""}
                onChange={(e) => setOrderDiscount(Math.max(0, Number(e.target.value) || 0))}
                fullWidth
              />
              <TextField
                label="Method"
                select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                sx={{ width: 150 }}
              >
                <MenuItem value="CASH">Cash</MenuItem>
                <MenuItem value="CARD">Card</MenuItem>
                <MenuItem value="BANK_TRANSFER">Transfer</MenuItem>
              </TextField>
            </Stack>

            <TextField
              label="Amount received"
              type="number"
              value={amountPaid}
              onChange={(e) => setAmountPaid(e.target.value)}
              placeholder={String(payable)}
              helperText={
                amountPaid === ""
                  ? "Blank means paid in full."
                  : balance > 0
                    ? `Buyer will owe ${pkr(balance)}`
                    : balance < 0
                      ? `Change / credit ${pkr(-balance)}`
                      : "Paid in full."
              }
              InputProps={{
                startAdornment: <InputAdornment position="start">PKR</InputAdornment>,
              }}
            />

            <Divider />

            <Stack direction="row" justifyContent="space-between">
              <Typography variant="body2">Subtotal</Typography>
              <Typography variant="body2">{num(subtotal)}</Typography>
            </Stack>
            {orderDiscount > 0 ? (
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="body2" sx={{ color: palette.margin }}>
                  Order discount
                </Typography>
                <Typography variant="body2" sx={{ color: palette.margin }}>
                  −{num(orderDiscount)}
                </Typography>
              </Stack>
            ) : null}
            <Stack direction="row" justifyContent="space-between" alignItems="baseline">
              <Typography variant="h4">Payable</Typography>
              <Typography sx={{ fontSize: "1.5rem", fontWeight: 600 }}>{pkr(payable)}</Typography>
            </Stack>

            {backorderUnits > 0 ? (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                {plural(backorderUnits, "unit")} not in stock. They will be recorded as owed and
                appear under &ldquo;To hand over&rdquo;.
              </Alert>
            ) : null}

            {error ? <Alert severity="error">{error}</Alert> : null}

            <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />

            <Button
              variant="contained"
              size="large"
              fullWidth
              disabled={busy || !lines.length}
              onClick={charge}
              sx={{ py: 1.25 }}
            >
              {busy ? <CircularProgress size={22} color="inherit" /> : `Charge ${pkr(payable)}`}
            </Button>
          </Stack>
        </Box>
      </Box>
    );
  }

  // ------------------------------------------------------------------- build
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", lg: "minmax(0,1fr) 420px" },
        minHeight: "calc(100vh - 56px)",
      }}
    >
      <Box sx={{ px: { xs: 2, md: 3 }, py: 2.5, minWidth: 0 }}>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }} alignItems="center">
          <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, v) => v && setMode(v)}>
            <ToggleButton value="items" sx={{ px: 2 }}>
              Single items
            </ToggleButton>
            <ToggleButton value="courses" sx={{ px: 2 }}>
              Class course
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === "items" ? (
            <TextField
              placeholder="Search by name or code, then press Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && items.length) {
                  addItem(items[0]);
                  setSearch("");
                }
                if (e.key === "Escape") setSearch("");
              }}
              autoFocus
              fullWidth
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" color="action" />
                  </InputAdornment>
                ),
                endAdornment: searching ? <CircularProgress size={16} /> : null,
              }}
            />
          ) : null}
        </Stack>

        {mode === "items" ? (
          <Box
            sx={{
              border: `1px solid ${palette.rule}`,
              borderRadius: 1,
              bgcolor: palette.surface,
              overflow: "hidden",
            }}
          >
            {items.length === 0 ? (
              <Empty
                title={search ? "Nothing matches that." : "Start typing to find an item."}
                hint={
                  search
                    ? "Try a shorter word — other names are searched too."
                    : "Enter adds the first result straight to the ticket."
                }
              />
            ) : (
              items.map((item) => {
                const out = item.quantityOnHand <= 0;
                const onTicket = lines
                  .filter((l) => l.itemId === item.id)
                  .reduce((s, l) => s + l.qty, 0);
                return (
                  <Box
                    key={item.id}
                    onClick={() => addItem(item)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && addItem(item)}
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 2,
                      px: 2,
                      py: 1.25,
                      cursor: "pointer",
                      borderBottom: `1px solid ${palette.rule}`,
                      borderLeft: "3px solid",
                      borderLeftColor: out ? palette.amber : "transparent",
                      "&:last-of-type": { borderBottom: "none" },
                      "&:hover": { bgcolor: palette.paper },
                    }}
                  >
                    <Box sx={{ flex: 1, minWidth: 0 }}>
                      <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                        {item.name}
                      </Typography>
                      <Typography variant="caption">
                        {item.code}
                        {item.publisher ? ` · ${item.publisher}` : ""}
                      </Typography>
                    </Box>
                    {/* Already on the ticket: the answer to "did I add this?" */}
                    {onTicket > 0 ? (
                      <Chip size="small" color="primary" label={`${onTicket} on ticket`} />
                    ) : null}
                    <Chip
                      size="small"
                      variant="outlined"
                      label={item.type === "COPY" ? "Copy" : item.type === "BOOK" ? "Book" : "Other"}
                    />
                    <Typography variant="body2" sx={{ width: 76, textAlign: "right" }}>
                      {out ? "none left" : `${num(item.quantityOnHand)} left`}
                    </Typography>
                    <Typography sx={{ width: 90, textAlign: "right", fontWeight: 600 }}>
                      {num(item.price)}
                    </Typography>
                  </Box>
                );
              })
            )}
          </Box>
        ) : openClassId === null ? (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2,1fr)",
                sm: "repeat(3,1fr)",
                md: "repeat(4,1fr)",
              },
              gap: 1.5,
            }}
          >
            {classes.map((c) => (
              <Box
                key={c.id}
                onClick={() => setOpenClassId(c.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && setOpenClassId(c.id)}
                sx={{
                  px: 2,
                  py: 2,
                  cursor: "pointer",
                  bgcolor: palette.surface,
                  border: `1px solid ${palette.rule}`,
                  borderRadius: 1,
                  "&:hover": { borderColor: palette.stamp },
                }}
              >
                <Typography sx={{ fontWeight: 600 }}>{c.name}</Typography>
                <Typography variant="caption">Full course</Typography>
              </Box>
            ))}
          </Box>
        ) : (
          <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
            <Stack
              direction="row"
              alignItems="center"
              sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${palette.rule}` }}
            >
              <Box sx={{ flex: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{course?.className ?? "Loading…"}</Typography>
                {course ? (
                  <Typography variant="caption">
                    {plural(course.mandatory.length, "required item")}
                    {course.electiveGroups.length
                      ? ` · ${plural(course.electiveGroups.length, "choice")}`
                      : ""}
                  </Typography>
                ) : null}
              </Box>
              <Button size="small" onClick={() => setOpenClassId(null)}>
                All classes
              </Button>
            </Stack>

            {loadingCourse || !course ? (
              <Box sx={{ p: 4, textAlign: "center" }}>
                <CircularProgress size={22} />
              </Box>
            ) : (
              <>
                {course.electiveGroups.map((g) => {
                  const picks = electivePick[course.classId] ?? [];
                  return (
                    <Box
                      key={g.id}
                      sx={{
                        px: 2,
                        py: 1.5,
                        bgcolor: palette.stampSoft,
                        borderBottom: `1px solid ${palette.rule}`,
                      }}
                    >
                      <Typography variant="subtitle2" sx={{ color: "text.primary" }}>
                        {g.label} — choose{" "}
                        {g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}
                      </Typography>
                      <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
                        {g.items.map((i) => {
                          const on = picks.includes(i.itemId);
                          return (
                            <Chip
                              key={i.itemId}
                              label={`${i.name} · ${num(i.price)}`}
                              color={on ? "primary" : "default"}
                              variant={on ? "filled" : "outlined"}
                              onClick={() =>
                                setElectivePick((prev) => {
                                  const current = prev[course.classId] ?? [];
                                  const others = current.filter(
                                    (id) => !g.items.some((x) => x.itemId === id),
                                  );
                                  const mine = current.filter((id) =>
                                    g.items.some((x) => x.itemId === id),
                                  );
                                  let nextMine: number[];
                                  if (mine.includes(i.itemId)) {
                                    nextMine = mine.filter((id) => id !== i.itemId);
                                  } else if (g.maxSelect === 1) {
                                    nextMine = [i.itemId];
                                  } else {
                                    nextMine = [...mine, i.itemId].slice(-g.maxSelect);
                                  }
                                  return { ...prev, [course.classId]: [...others, ...nextMine] };
                                })
                              }
                            />
                          );
                        })}
                      </Stack>
                    </Box>
                  );
                })}

                <Box sx={{ maxHeight: 360, overflowY: "auto" }}>
                  {course.mandatory.map((i) => (
                    <Stack
                      key={i.itemId}
                      direction="row"
                      alignItems="center"
                      spacing={2}
                      sx={{ px: 2, py: 1, borderBottom: `1px solid ${palette.rule}` }}
                    >
                      <Typography variant="body2" sx={{ flex: 1 }} noWrap>
                        {i.name}
                      </Typography>
                      <Typography variant="caption" sx={{ width: 50, textAlign: "right" }}>
                        ×{i.defaultQty}
                      </Typography>
                      <Typography variant="caption" sx={{ width: 76, textAlign: "right" }}>
                        {i.quantityOnHand <= 0 ? "none left" : `${num(i.quantityOnHand)} left`}
                      </Typography>
                      <Typography variant="body2" sx={{ width: 80, textAlign: "right" }}>
                        {num(i.price * i.defaultQty)}
                      </Typography>
                    </Stack>
                  ))}
                </Box>

                <Stack direction="row" alignItems="center" spacing={2} sx={{ px: 2, py: 2 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption">Course total</Typography>
                    <Typography sx={{ fontSize: "1.25rem", fontWeight: 600 }}>
                      {pkr(course.baseTotal)}
                    </Typography>
                  </Box>
                  <Button variant="contained" size="large" onClick={addCourse}>
                    Add course to ticket
                  </Button>
                </Stack>
              </>
            )}
          </Box>
        )}

        {error ? (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        ) : null}
      </Box>

      {/* ---------------------------------------------------------- ticket */}
      <Box
        sx={{
          borderLeft: { lg: `1px solid ${palette.rule}` },
          borderTop: { xs: `1px solid ${palette.rule}`, lg: "none" },
          bgcolor: palette.surface,
          display: "flex",
          flexDirection: "column",
          position: { lg: "sticky" },
          top: 0,
          maxHeight: { lg: "calc(100vh - 56px)" },
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${palette.rule}` }}
        >
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4">Ticket</Typography>
            {lines.length ? (
              <Typography variant="caption">
                {plural(totalUnits, "item")} · {plural(lines.length, "line")}
              </Typography>
            ) : null}
          </Box>
          {lines.length ? (
            <Button size="small" color="inherit" onClick={clearTicket}>
              Clear
            </Button>
          ) : null}
        </Stack>

        <Box sx={{ flex: 1, overflowY: "auto" }}>{ticketBody(true)}</Box>

        <Box sx={{ borderTop: `1px solid ${palette.rule}`, p: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" sx={{ mb: 1.5 }}>
            <Typography variant="h4">Subtotal</Typography>
            <Typography sx={{ fontSize: "1.5rem", fontWeight: 600 }}>{pkr(subtotal)}</Typography>
          </Stack>

          {backorderUnits > 0 ? (
            <Alert severity="warning" sx={{ py: 0.5, mb: 1.5 }}>
              {plural(backorderUnits, "unit")} not in stock — recorded as owed to the buyer.
            </Alert>
          ) : null}

          <Button
            variant="contained"
            size="large"
            fullWidth
            endIcon={<ArrowForwardIcon />}
            disabled={!lines.length}
            onClick={() => {
              setError(null);
              setStep("pay");
            }}
            sx={{ py: 1.25 }}
          >
            Review and pay
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
