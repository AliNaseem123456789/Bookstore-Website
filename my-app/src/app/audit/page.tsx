"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  Button,
  Chip,
  MenuItem,
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
import { api, qs } from "@/lib/api";
import { Page, Empty, Code } from "@/components/Page";
import { dayTime } from "@/lib/format";
import { palette } from "@/theme";

type Entry = {
  id: number;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string | null;
  createdAt: string;
  actorName: string | null;
  before?: unknown;
  after?: unknown;
};

/** Actions worth colouring: money and stock leaving the normal path. */
const SERIOUS = new Set([
  "BALANCE_WRITTEN_OFF",
  "STOCK_CORRECTED",
  "PRICE_CHANGED",
  "ITEMS_MERGED",
  "USER_DEACTIVATED",
  "REFUND_PAID",
  "LOGIN_FAILED",
]);

function label(action: string) {
  return action.toLowerCase().replace(/_/g, " ");
}

export default function AuditPage() {
  const [action, setAction] = useState("all");
  const [offset, setOffset] = useState(0);

  const { data, isLoading } = useQuery({
    queryKey: ["audit", action, offset],
    queryFn: () =>
      api.get<{
        entries: Entry[];
        hasMore: boolean;
        nextOffset: number;
        actions: string[];
      }>("/api/audit" + qs({ action: action === "all" ? undefined : action, limit: 100, offset })),
  });

  const entries = data?.entries ?? [];

  return (
    <Page
      title="Activity log"
      subtitle="Who did what: payments taken, stock corrected, prices changed, refunds, sign-ins."
    >
      <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
        <TextField
          select
          label="Action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setOffset(0);
          }}
          sx={{ minWidth: 240 }}
        >
          <MenuItem value="all">Everything</MenuItem>
          {(data?.actions ?? []).map((a) => (
            <MenuItem key={a} value={a}>
              {label(a)}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>When</TableCell>
              <TableCell>Who</TableCell>
              <TableCell>What</TableCell>
              <TableCell>Details</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={4}>
                    <Skeleton height={26} />
                  </TableCell>
                </TableRow>
              ))
            ) : entries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} sx={{ border: 0 }}>
                  <Empty title="Nothing logged yet." />
                </TableCell>
              </TableRow>
            ) : (
              entries.map((e) => (
                <TableRow
                  key={e.id}
                  sx={{
                    borderLeft: "3px solid",
                    borderLeftColor: SERIOUS.has(e.action) ? palette.amber : "transparent",
                  }}
                >
                  <TableCell sx={{ whiteSpace: "nowrap" }}>{dayTime(e.createdAt)}</TableCell>
                  <TableCell>{e.actorName ?? "—"}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      variant="outlined"
                      label={label(e.action)}
                      color={SERIOUS.has(e.action) ? "warning" : "default"}
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2">{e.summary ?? "—"}</Typography>
                    {e.entityId ? (
                      <Code>
                        {e.entityType} #{e.entityId}
                      </Code>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {data?.hasMore || offset > 0 ? (
          <Stack direction="row" spacing={1} justifyContent="center" sx={{ p: 1.5 }}>
            <Button size="small" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}>
              Newer
            </Button>
            <Button size="small" disabled={!data?.hasMore} onClick={() => setOffset(data?.nextOffset ?? offset)}>
              Older
            </Button>
          </Stack>
        ) : null}
      </Box>
    </Page>
  );
}
