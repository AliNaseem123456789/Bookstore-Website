"use client";
import { useState, useEffect } from "react";
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
} from "@mui/material";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", password: "", adminCode: "" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");
  const [mounted, setMounted] = useState(false);

  const ADMIN_CODE = "SECRET123"; // 🔑 Hardcoded admin code

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null; // avoids hydration mismatch

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    setError("");

    // ✅ Check admin code before sending request
    if (form.adminCode !== ADMIN_CODE) {
      setError("❌ Invalid admin code. You are not allowed to register.");
      return;
    }

    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        password: form.password,
      }),
    });

    const data = await res.json();
    if (res.ok) {
      setMsg("✅ Registered successfully!");
      setForm({ name: "", email: "", password: "", adminCode: "" }); // reset form
    } else {
      setError(data.error || "Something went wrong");
    }
  };

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "80vh",
        backgroundColor: "#f9fafb",
      }}
    >
      <Card sx={{ maxWidth: 400, width: "100%", p: 2, boxShadow: 3 }}>
        <CardContent>
          <Typography variant="h5" gutterBottom align="center">
            Create Account
          </Typography>
          <form onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="Name"
              margin="normal"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <TextField
              fullWidth
              type="email"
              label="Email"
              margin="normal"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <TextField
              fullWidth
              type="password"
              label="Password"
              margin="normal"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <TextField
              fullWidth
              type="password"
              label="Admin Code"
              margin="normal"
              value={form.adminCode}
              onChange={(e) => setForm({ ...form, adminCode: e.target.value })}
              required
            />
            <Button
              type="submit"
              variant="contained"
              color="primary"
              fullWidth
              sx={{ mt: 2 }}
            >
              Register
            </Button>
          </form>

          {msg && (
            <Alert severity="success" sx={{ mt: 2 }}>
              {msg}
            </Alert>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
