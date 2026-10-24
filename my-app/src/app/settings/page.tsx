"use client";
import { useState } from "react";
import { Alert, Box, Button, Stack, TextField } from "@mui/material";
import { Page } from "@/components/Page";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { ROLE_HINT } from "@/lib/roles";
import { palette } from "@/theme";
import { Stat } from "@/components/Page";

export default function SettingsPage() {
  const { user } = useSession();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (newPassword !== confirm) {
      setMsg({ kind: "err", text: "The two new passwords do not match." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      await api.post("/api/auth/password", { currentPassword, newPassword });
      setMsg({ kind: "ok", text: "Password changed." });
      setCurrent("");
      setNew("");
      setConfirm("");
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof Error ? err.message : "Could not change the password.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page title="Your account" subtitle="Signed-in details and password." maxWidth={760}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 3 }}>
        <Stat label="Name" value={user?.name ?? "—"} />
        <Stat label="Email" value={<span style={{ fontSize: "0.9375rem" }}>{user?.email ?? "—"}</span>} />
        <Stat
          label="Role"
          value={user ? ROLE_HINT[user.role].label : "—"}
          hint={user ? ROLE_HINT[user.role].hint : undefined}
          tone="good"
        />
      </Stack>

      <Box
        component="form"
        onSubmit={submit}
        sx={{
          p: 3,
          maxWidth: 420,
          bgcolor: palette.surface,
          border: `1px solid ${palette.rule}`,
          borderRadius: 1,
        }}
      >
        <Stack spacing={2}>
          {msg ? (
            <Alert severity={msg.kind === "ok" ? "success" : "error"}>{msg.text}</Alert>
          ) : null}
          <TextField
            label="Current password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            required
          />
          <TextField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            helperText="At least 8 characters."
            autoComplete="new-password"
            required
          />
          <TextField
            label="Repeat new password"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Button type="submit" variant="contained" disabled={busy} sx={{ alignSelf: "flex-start" }}>
            {busy ? "Saving…" : "Change password"}
          </Button>
        </Stack>
      </Box>
    </Page>
  );
}
