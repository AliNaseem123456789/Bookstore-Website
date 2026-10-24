"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "@/lib/api";
import { palette } from "@/theme";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/api/auth/login", { email, password });
      // Drop any cached "signed out" answer before the shell asks again.
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      router.replace(params?.get("next") || "/pos");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        bgcolor: palette.paper,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 380 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h1" sx={{ fontSize: "1.5rem" }}>
            Al-Sehar Bookstore
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", mt: 0.5 }}>
            Sign in to the counter.
          </Typography>
        </Box>

        <Box
          component="form"
          onSubmit={submit}
          sx={{
            p: 3,
            bgcolor: palette.surface,
            border: `1px solid ${palette.rule}`,
            borderLeft: `3px solid ${palette.stamp}`,
            borderRadius: 1,
          }}
        >
          <Stack spacing={2}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              autoFocus
              required
              fullWidth
            />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              fullWidth
            />
            <Button
              type="submit"
              variant="contained"
              size="large"
              disabled={busy}
              fullWidth
            >
              {busy ? <CircularProgress size={22} color="inherit" /> : "Sign in"}
            </Button>
          </Stack>
        </Box>

        <Typography variant="caption" sx={{ display: "block", mt: 2, textAlign: "center" }}>
          Ask an administrator if you need an account.
        </Typography>
      </Box>
    </Box>
  );
}

/**
 * useSearchParams() suspends while the URL is read, so the part that reads it
 * sits behind its own boundary. Without this the page cannot be prerendered.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
