"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
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
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import AddIcon from "@mui/icons-material/Add";
import { api, qs } from "@/lib/api";
import { Page, Empty, Stat, Code } from "@/components/Page";
import { num, pkr } from "@/lib/format";
import { palette } from "@/theme";

type ClassRow = { id: number; code: string; name: string; sortOrder: number };

type CourseItem = {
  curriculumId: number;
  itemId: number;
  name: string;
  code: string;
  type: string;
  price: number;
  defaultQty: number;
  quantityOnHand: number;
  electiveGroupId: number | null;
};

type Course = {
  classId: number;
  className: string;
  mandatory: CourseItem[];
  electiveGroups: Array<{
    id: number;
    groupKey: string;
    label: string;
    minSelect: number;
    maxSelect: number;
    items: CourseItem[];
  }>;
  baseTotal: number;
};

type ItemOption = { id: number; name: string; code: string; price: number | string };

export default function CoursesPage() {
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState<number | null>(null);
  const [groupOpen, setGroupOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: classesData } = useQuery({
    queryKey: ["classes"],
    queryFn: () => api.get<{ classes: ClassRow[] }>("/api/classes"),
  });
  const classes = classesData?.classes ?? [];
  const activeId = classId ?? classes[0]?.id ?? null;

  const { data, isLoading } = useQuery({
    queryKey: ["course", activeId],
    queryFn: () => api.get<{ course: Course }>(`/api/courses/${activeId}`),
    enabled: activeId !== null,
  });
  const course = data?.course;

  const invalidate = () => queryClient.invalidateQueries();
  const fail = (err: unknown) =>
    setError(err instanceof Error ? err.message : "That change was not saved.");

  const addItem = useMutation({
    mutationFn: (body: { itemId: number; defaultQty: number; electiveGroupId: number | null }) =>
      api.post("/api/curriculum", { classId: activeId, ...body }),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: fail,
  });

  const patchItem = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.patch(`/api/curriculum/${id}`, body),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: fail,
  });

  const removeItem = useMutation({
    mutationFn: (id: number) => api.del(`/api/curriculum/${id}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: fail,
  });

  const removeGroup = useMutation({
    mutationFn: (id: number) => api.del(`/api/curriculum/electives/${id}`),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: fail,
  });

  const allItems = course
    ? [...course.mandatory, ...course.electiveGroups.flatMap((g) => g.items)]
    : [];

  return (
    <Page
      title="Class courses"
      subtitle="What each class's full course contains, how many of each, and where the buyer gets a choice."
      actions={
        activeId ? (
          <Button startIcon={<AddIcon />} variant="outlined" onClick={() => setGroupOpen(true)}>
            Add a choice group
          </Button>
        ) : null
      }
    >
      <Stack direction="row" spacing={1} sx={{ mb: 3, flexWrap: "wrap", gap: 1 }}>
        {classes.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            color={c.id === activeId ? "primary" : "default"}
            variant={c.id === activeId ? "filled" : "outlined"}
            onClick={() => setClassId(c.id)}
          />
        ))}
      </Stack>

      {error ? (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      ) : null}

      {isLoading || !course ? (
        <Skeleton height={300} />
      ) : (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
            <Stat label="Items in the course" value={num(allItems.length)} />
            <Stat label="Required" value={num(course.mandatory.length)} />
            <Stat
              label="Course price"
              value={pkr(course.baseTotal)}
              hint={course.electiveGroups.length ? "with the cheapest choice" : undefined}
            />
          </Stack>

          <AddItemRow
            onAdd={(itemId, qty, groupId) =>
              addItem.mutate({ itemId, defaultQty: qty, electiveGroupId: groupId })
            }
            groups={course.electiveGroups.map((g) => ({ id: g.id, label: g.label }))}
            busy={addItem.isPending}
          />

          <Typography variant="subtitle2" sx={{ mt: 3, mb: 1 }}>
            Required for every buyer
          </Typography>
          <CourseTable
            rows={course.mandatory}
            groups={course.electiveGroups.map((g) => ({ id: g.id, label: g.label }))}
            onQty={(id, qty) => patchItem.mutate({ id, body: { defaultQty: qty } })}
            onGroup={(id, groupId) =>
              patchItem.mutate({ id, body: { electiveGroupId: groupId } })
            }
            onRemove={(id) => removeItem.mutate(id)}
          />

          {course.electiveGroups.map((g) => (
            <Box key={g.id} sx={{ mt: 3 }}>
              <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
                <Typography variant="subtitle2">{g.label}</Typography>
                <Chip
                  size="small"
                  label={`choose ${g.minSelect === g.maxSelect ? g.minSelect : `${g.minSelect}–${g.maxSelect}`}`}
                  color="primary"
                  variant="outlined"
                />
                <Code>{g.groupKey}</Code>
                <Box sx={{ flex: 1 }} />
                <Button
                  size="small"
                  color="error"
                  onClick={() => removeGroup.mutate(g.id)}
                  disabled={removeGroup.isPending}
                >
                  Remove group
                </Button>
              </Stack>
              {g.items.length === 0 ? (
                <Alert severity="warning">
                  This choice group has no items yet, so the course cannot be sold. Add items
                  above and set their group to &ldquo;{g.label}&rdquo;.
                </Alert>
              ) : (
                <CourseTable
                  rows={g.items}
                  groups={course.electiveGroups.map((x) => ({ id: x.id, label: x.label }))}
                  onQty={(id, qty) => patchItem.mutate({ id, body: { defaultQty: qty } })}
                  onGroup={(id, groupId) =>
                    patchItem.mutate({ id, body: { electiveGroupId: groupId } })
                  }
                  onRemove={(id) => removeItem.mutate(id)}
                />
              )}
            </Box>
          ))}
        </>
      )}

      {groupOpen && activeId ? (
        <GroupDialog classId={activeId} onClose={() => setGroupOpen(false)} />
      ) : null}
    </Page>
  );
}

function CourseTable({
  rows,
  groups,
  onQty,
  onGroup,
  onRemove,
}: {
  rows: CourseItem[];
  groups: Array<{ id: number; label: string }>;
  onQty: (curriculumId: number, qty: number) => void;
  onGroup: (curriculumId: number, groupId: number | null) => void;
  onRemove: (curriculumId: number) => void;
}) {
  return (
    <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Item</TableCell>
            <TableCell align="right">Price</TableCell>
            <TableCell align="right" sx={{ width: 110 }}>
              Quantity
            </TableCell>
            <TableCell sx={{ width: 190 }}>Choice group</TableCell>
            <TableCell align="right">Line</TableCell>
            <TableCell align="right" sx={{ width: 50 }} />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} sx={{ border: 0 }}>
                <Empty title="Nothing here yet." hint="Add items with the search above." />
              </TableCell>
            </TableRow>
          ) : (
            rows.map((r) => (
              <TableRow key={r.curriculumId}>
                <TableCell>
                  <Box sx={{ fontWeight: 500 }}>{r.name}</Box>
                  <Code>
                    {r.code} · {num(r.quantityOnHand)} in stock
                  </Code>
                </TableCell>
                <TableCell align="right">{num(r.price)}</TableCell>
                <TableCell align="right">
                  <TextField
                    type="number"
                    defaultValue={r.defaultQty}
                    onBlur={(e) => {
                      const v = Math.max(1, Number(e.target.value) || 1);
                      if (v !== r.defaultQty) onQty(r.curriculumId, v);
                    }}
                    inputProps={{ min: 1, style: { textAlign: "right" } }}
                    sx={{ width: 84 }}
                  />
                </TableCell>
                <TableCell>
                  <TextField
                    select
                    value={r.electiveGroupId ?? "none"}
                    onChange={(e) =>
                      onGroup(
                        r.curriculumId,
                        e.target.value === "none" ? null : Number(e.target.value),
                      )
                    }
                    fullWidth
                  >
                    <MenuItem value="none">Required</MenuItem>
                    {groups.map((g) => (
                      <MenuItem key={g.id} value={g.id}>
                        {g.label}
                      </MenuItem>
                    ))}
                  </TextField>
                </TableCell>
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {num(r.price * r.defaultQty)}
                </TableCell>
                <TableCell align="right">
                  <IconButton size="small" onClick={() => onRemove(r.curriculumId)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </Box>
  );
}

function AddItemRow({
  onAdd,
  groups,
  busy,
}: {
  onAdd: (itemId: number, qty: number, groupId: number | null) => void;
  groups: Array<{ id: number; label: string }>;
  busy: boolean;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<ItemOption | null>(null);
  const [qty, setQty] = useState("1");
  const [groupId, setGroupId] = useState<string>("none");

  const { data } = useQuery({
    queryKey: ["course-item-search", search],
    queryFn: () => api.get<{ items: ItemOption[] }>("/api/items" + qs({ search, limit: 30 })),
    enabled: search.trim().length > 0,
  });

  return (
    <Stack
      direction={{ xs: "column", md: "row" }}
      spacing={1}
      sx={{
        p: 2,
        border: `1px solid ${palette.rule}`,
        borderRadius: 1,
        bgcolor: palette.surface,
        alignItems: { md: "center" },
      }}
    >
      <Autocomplete
        sx={{ flex: 1, minWidth: 260 }}
        options={data?.items ?? []}
        value={picked}
        onChange={(_, v) => setPicked(v)}
        onInputChange={(_, v) => setSearch(v)}
        getOptionLabel={(o) => o.name}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        renderInput={(p) => <TextField {...p} label="Add an item to this course" />}
        renderOption={(props, o) => (
          <li {...props} key={o.id}>
            <Box>
              <Typography variant="body2">{o.name}</Typography>
              <Typography variant="caption">
                {o.code} · {num(o.price)}
              </Typography>
            </Box>
          </li>
        )}
      />
      <TextField
        label="Qty"
        type="number"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        sx={{ width: 90 }}
        inputProps={{ min: 1 }}
      />
      <TextField
        select
        label="Group"
        value={groupId}
        onChange={(e) => setGroupId(e.target.value)}
        sx={{ width: 190 }}
      >
        <MenuItem value="none">Required</MenuItem>
        {groups.map((g) => (
          <MenuItem key={g.id} value={String(g.id)}>
            {g.label}
          </MenuItem>
        ))}
      </TextField>
      <Button
        variant="contained"
        disabled={!picked || busy}
        onClick={() => {
          if (!picked) return;
          onAdd(picked.id, Math.max(1, Number(qty) || 1), groupId === "none" ? null : Number(groupId));
          setPicked(null);
          setSearch("");
          setQty("1");
        }}
      >
        Add
      </Button>
    </Stack>
  );
}

/**
 * A choice group is data, not code: "pick 1 of Biology / Computer" for
 * Class 9 is one row here, and a second group, or "pick 2 of 4", needs no
 * change to the application.
 */
function GroupDialog({ classId, onClose }: { classId: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [label, setLabel] = useState("Science elective");
  const [groupKey, setKey] = useState("SCIENCE_ELECTIVE");
  const [minSelect, setMin] = useState("1");
  const [maxSelect, setMax] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post("/api/curriculum/electives", {
        classId,
        groupKey: groupKey.trim().toUpperCase().replace(/\s+/g, "_"),
        label: label.trim(),
        minSelect: Number(minSelect),
        maxSelect: Number(maxSelect),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries();
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The group was not created."),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a choice group</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            Use this where the buyer picks between items — for example Biology or
            Computer in Class 9.
          </Typography>
          <TextField
            label="Shown to the cashier as"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            autoFocus
          />
          <TextField
            label="Internal key"
            value={groupKey}
            onChange={(e) => setKey(e.target.value)}
            helperText="Letters and underscores, unique within the class."
          />
          <Stack direction="row" spacing={1}>
            <TextField
              label="Choose at least"
              type="number"
              value={minSelect}
              onChange={(e) => setMin(e.target.value)}
              inputProps={{ min: 0 }}
              fullWidth
            />
            <TextField
              label="At most"
              type="number"
              value={maxSelect}
              onChange={(e) => setMax(e.target.value)}
              inputProps={{ min: 1 }}
              fullWidth
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
          disabled={create.isPending || !label.trim() || !groupKey.trim()}
          onClick={() => create.mutate()}
        >
          Create group
        </Button>
      </DialogActions>
    </Dialog>
  );
}
