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
import AddIcon from "@mui/icons-material/Add";
import { api } from "@/lib/api";
import { Page, Empty } from "@/components/Page";
import { ROLE_HINT, ROLE_ORDER } from "@/lib/roles";
import { useSession } from "@/lib/session";
import { day } from "@/lib/format";
import { palette } from "@/theme";

type User = {
  id: number;
  name: string;
  email: string;
  role: "ADMIN" | "MANAGER" | "CASHIER";
  isActive: boolean;
  createdAt: string;
};

export default function StaffPage() {
  const { user: me } = useSession();
  const [createOpen, setCreateOpen] = useState(false);
  const [edit, setEdit] = useState<User | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["users"],
    queryFn: () => api.get<{ users: User[] }>("/api/users"),
  });

  const users = data?.users ?? [];

  return (
    <Page
      title="Staff"
      subtitle="Who can sign in, and what each of them is allowed to do."
      actions={
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
          Add person
        </Button>
      }
      maxWidth={1000}
    >
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "repeat(3,1fr)" },
          gap: 1.5,
          mb: 3,
        }}
      >
        {ROLE_ORDER.map((r) => (
          <Box
            key={r}
            sx={{
              p: 2,
              border: `1px solid ${palette.rule}`,
              borderRadius: 1,
              bgcolor: palette.surface,
            }}
          >
            <Typography variant="subtitle1">{ROLE_HINT[r].label}</Typography>
            <Typography variant="caption">{ROLE_HINT[r].hint}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ border: `1px solid ${palette.rule}`, borderRadius: 1, bgcolor: palette.surface }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Email</TableCell>
              <TableCell>Role</TableCell>
              <TableCell>Added</TableCell>
              <TableCell align="right" />
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5}>
                  <Skeleton height={28} />
                </TableCell>
              </TableRow>
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} sx={{ border: 0 }}>
                  <Empty title="No staff accounts yet." />
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow
                  key={u.id}
                  sx={{
                    opacity: u.isActive ? 1 : 0.5,
                    borderLeft: "3px solid",
                    borderLeftColor: u.isActive ? "transparent" : palette.rule,
                  }}
                >
                  <TableCell sx={{ fontWeight: 500 }}>
                    {u.name}
                    {u.id === me?.userId ? (
                      <Chip size="small" label="you" sx={{ ml: 1 }} variant="outlined" />
                    ) : null}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      label={ROLE_HINT[u.role].label}
                      color={u.role === "ADMIN" ? "primary" : "default"}
                      variant={u.role === "CASHIER" ? "outlined" : "filled"}
                    />
                  </TableCell>
                  <TableCell>{day(u.createdAt)}</TableCell>
                  <TableCell align="right">
                    <Button size="small" onClick={() => setEdit(u)}>
                      {u.isActive ? "Manage" : "Reactivate"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Box>

      {createOpen ? <CreateDialog onClose={() => setCreateOpen(false)} /> : null}
      {edit ? <EditDialog user={edit} onClose={() => setEdit(null)} /> : null}
    </Page>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "CASHIER" });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post("/api/users", form),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err) =>
      setError(err instanceof Error ? err.message : "The account was not created."),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add person</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField
            label="Full name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
          <TextField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <TextField
            label="Temporary password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            helperText="At least 8 characters. They can change it after signing in."
          />
          <TextField
            label="Role"
            select
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
            helperText={ROLE_HINT[form.role as keyof typeof ROLE_HINT].hint}
          >
            {ROLE_ORDER.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_HINT[r].label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
        <Button
          variant="contained"
          disabled={
            create.isPending ||
            !form.name.trim() ||
            !form.email.trim() ||
            form.password.length < 8
          }
          onClick={() => create.mutate()}
        >
          Create
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function EditDialog({ user, onClose }: { user: User; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { user: me } = useSession();
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isSelf = me?.userId === user.id;

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/users/${user.id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      onClose();
    },
    onError: (err) => setError(err instanceof Error ? err.message : "Not saved."),
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{user.name}</DialogTitle>
      <DialogContent>
        <Stack spacing={2}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <TextField label="Full name" value={name} onChange={(e) => setName(e.target.value)} />
          <TextField
            label="Role"
            select
            value={role}
            onChange={(e) => setRole(e.target.value as User["role"])}
            helperText={ROLE_HINT[role].hint}
            disabled={isSelf}
          >
            {ROLE_ORDER.map((r) => (
              <MenuItem key={r} value={r}>
                {ROLE_HINT[r].label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Set a new password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Leave blank to keep the current one"
            helperText="At least 8 characters."
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ justifyContent: "space-between" }}>
        <Box>
          {!isSelf ? (
            <Button
              color="error"
              onClick={() => patch.mutate({ isActive: !user.isActive })}
              disabled={patch.isPending}
            >
              {user.isActive ? "Deactivate" : "Reactivate"}
            </Button>
          ) : null}
        </Box>
        <Box>
          <Button onClick={onClose} color="inherit">
            Cancel
          </Button>
          <Button
            variant="contained"
            disabled={patch.isPending || (password !== "" && password.length < 8)}
            onClick={() =>
              patch.mutate({
                name,
                ...(isSelf ? {} : { role }),
                ...(password ? { password } : {}),
              })
            }
          >
            Save
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}
