"use client";
import { useState, useCallback } from "react";
import {
  Container,
  Box,
  TextField,
  Button,
  Typography,
  Paper,
  Alert,
  CircularProgress,
} from "@mui/material";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [msg, setMsg] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMsg("");
    
    if (!form.email || !form.password) {
      setMsg("Please fill in all fields");
      return;
    }
    
    setIsLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          password: form.password
        }),
      });

      // Handle non-JSON responses
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || `HTTP ${res.status}`);
      }

      const data = await res.json();
      
      if (data.message === "Login successful") {
        // ✅ CORRECT: Access user.name from the user object
        localStorage.setItem("sellerName", data.user.name);
        setMsg("Login successful! Redirecting...");
        setTimeout(() => window.location.href = "/", 1000);
      } else {
        setMsg(data.error || "Login failed");
      }
    } catch (error) {
      console.error("Login error:", error);
      // Check if it's a JSON parse error
      if (error.message.includes("Unexpected token") || error.message.includes("JSON")) {
        setMsg("Server error. Please try again later.");
      } else {
        setMsg(error.message || "Login failed. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <Paper elevation={6} sx={{ p: 4, borderRadius: 3, width: "100%" }}>
        <Typography variant="h5" component="h1" align="center" gutterBottom fontWeight="bold">
          Login
        </Typography>

        <Box component="form" onSubmit={handleSubmit} sx={{ mt: 2 }}>
          <TextField
            label="Email"
            type="email"
            fullWidth
            margin="normal"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            disabled={isLoading}
          />
          <TextField
            label="Password"
            type="password"
            fullWidth
            margin="normal"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            disabled={isLoading}
          />

          <Button
            type="submit"
            variant="contained"
            color="primary"
            fullWidth
            disabled={isLoading}
            sx={{ mt: 3, py: 1.5, borderRadius: 2 }}
          >
            {isLoading ? <CircularProgress size={24} /> : "Login"}
          </Button>
        </Box>

        {msg && (
          <Alert severity={msg.includes("success") ? "success" : "error"} sx={{ mt: 3 }}>
            {msg}
          </Alert>
        )}
      </Paper>
    </Container>
  );
}