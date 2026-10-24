"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import { api } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { num, day, age } from "@/lib/format";
import { palette } from "@/theme";

type Group = {
  saleId: number;
  saleCode: string;
  buyerName: string;
  buyerPhone: string | null;
  soldAt: string;
  daysWaiting: number;
  lines: Array<{
    lineId: number;
    itemId: number;
    itemName: string;
    qtyBackordered: number;
    availableNow: number;
    canFulfill: number;
  }>;
};

export default function FulfilmentPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["backorders"],
    queryFn: () => api.get<{ groups: Group[] }>("/api/stock/backorders"),
  });

  const handOver = useMutation({
    mutationFn: (lines: Array<{ saleLineId: number; qty: number }>) =>
      api.post("/api/stock/fulfill", { lines }),
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "Nothing was handed over."),
  });

  const groups = data?.groups ?? [];
  const unitsOwed = groups.reduce(
    (s, g) => s + g.lines.reduce((t, l) => t + l.qtyBackordered, 0),
    0,
  );
  const readyNow = groups.filter((g) => g.lines.some((l) => l.canFulfill > 0));

  return (
    <Page
      title="To hand over"
      subtitle="Items buyers have paid for but not yet received. Handing one over deducts it from stock."
    >
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat label="Units owed" value={num(unitsOwed)} tone={unitsOwed ? "warn" : "good"} />
        <Stat label="Buyers waiting" value={num(groups.length)} />
        <Stat
          label="Ready to give now"
          value={num(readyNow.length)}
          hint="stock has arrived"
          tone={readyNow.length ? "good" : "none"}
        />
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      ) : null}

      {isLoading ? (
        <Skeleton height={200} />
      ) : groups.length === 0 ? (
        <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
          <Empty
            title="Nothing waiting."
            hint="Every item sold has been handed over."
          />
        </Box>
      ) : (
        <Stack spacing={2}>
          {groups.map((g) => {
            const canAll = g.lines.filter((l) => l.canFulfill > 0);
            const fullyReady = g.lines.every((l) => l.canFulfill >= l.qtyBackordered);
            return (
              <Box
                key={g.saleId}
                sx={{
                  border: `1px solid ${palette.rule}`,
                  borderLeft: "3px solid",
                  borderLeftColor: fullyReady ? palette.stamp : palette.amber,
                  borderRadius: 1,
                  bgcolor: palette.surface,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={2}
                  sx={{ px: 2, py: 1.5, borderBottom: `1px solid ${palette.rule}` }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600 }}>
                      {g.buyerName}
                      {g.buyerPhone ? (
                        <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>
                          {" "}· {g.buyerPhone}
                        </Box>
                      ) : null}
                    </Typography>
                    <Typography variant="caption">
                      <Code>{g.saleCode}</Code> · ordered {day(g.soldAt)} · waiting {age(g.daysWaiting)}
                    </Typography>
                  </Box>
                  <Chip
                    size="small"
                    color={fullyReady ? "success" : "warning"}
                    label={fullyReady ? "All in stock" : "Partly in stock"}
                  />
                  <Button
                    variant="contained"
                    size="small"
                    startIcon={<LocalShippingIcon sx={{ fontSize: 16 }} />}
                    disabled={canAll.length === 0 || handOver.isPending}
                    onClick={() =>
                      handOver.mutate(
                        canAll.map((l) => ({ saleLineId: l.lineId, qty: l.canFulfill })),
                      )
                    }
                  >
                    Hand over {canAll.reduce((s, l) => s + l.canFulfill, 0)}
                  </Button>
                </Stack>

                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell align="right">Owed</TableCell>
                      <TableCell align="right">In stock</TableCell>
                      <TableCell align="right">Can give</TableCell>
                      <TableCell align="right" />
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {g.lines.map((l) => (
                      <TableRow key={l.lineId}>
                        <TableCell>{l.itemName}</TableCell>
                        <TableCell align="right">{num(l.qtyBackordered)}</TableCell>
                        <TableCell align="right">{num(l.availableNow)}</TableCell>
                        <TableCell
                          align="right"
                          sx={{ fontWeight: 600, color: l.canFulfill > 0 ? palette.stamp : palette.amber }}
                        >
                          {num(l.canFulfill)}
                        </TableCell>
                        <TableCell align="right">
                          <Button
                            size="small"
                            disabled={l.canFulfill === 0 || handOver.isPending}
                            onClick={() =>
                              handOver.mutate([{ saleLineId: l.lineId, qty: l.canFulfill }])
                            }
                          >
                            Give {l.canFulfill || ""}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Box>
            );
          })}
        </Stack>
      )}
    </Page>
  );
}
