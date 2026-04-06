"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabaseClient";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Table,
  TableBody,
  TableRow,
  TableCell,
  Box,
} from "@mui/material";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export default function BookDetailPage({ params }) {
  const unwrappedParams = React.use(params);
  const { id } = unwrappedParams;

  const router = useRouter();

  const [book, setBook] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(null);
  const [isAdmin, setIsAdmin] = React.useState(false); // Admin state

  const [mounted, setMounted] = React.useState(false);
  const [purchaseDate, setPurchaseDate] = React.useState("");

  const [editOpen, setEditOpen] = React.useState(false);
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);

  const [form, setForm] = React.useState({
    name: "",
    publisher: "",
    class_grade: "",
    price: "",
    quantity: "",
  });

  const [purchaseForm, setPurchaseForm] = React.useState({
    buyer_name: "",
    amount_paid: "",
  });

  React.useEffect(() => {
    async function checkAuthAndFetchData() {
      setLoading(true);
      try {
        // 1. Check Authentication and Role
        const res = await fetch("/api/me");
        const session = await res.json();

        // Verify if user exists and has admin role
        // Adjust 'session.user.role' based on your actual API response structure
        if (!res.ok || session.user?.role !== "admin") {
          alert("Access Denied: Admin privileges required.");
          router.push("/"); // Redirect unauthorized users
          return;
        }

        setIsAdmin(true);

        // 2. Fetch Book Data
        const { data, error: fetchError } = await supabase
          .from("books")
          .select("*")
          .eq("id", id)
          .single();

        if (fetchError) {
          setError(fetchError.message);
        } else {
          setBook(data);
          setForm({
            name: data.name || "",
            publisher: data.publisher || "",
            class_grade: data.class_grade || "",
            price: data.price || "",
            quantity: data.quantity || "",
          });
        }
      } catch (err) {
        setError("Authentication failed");
        router.push("/");
      } finally {
        setLoading(false);
      }
    }

    if (id) checkAuthAndFetchData();

    setMounted(true);
    setPurchaseDate(formatDate(new Date()));
  }, [id, router]);

  // Loading state (including auth check)
  if (loading) {
    return (
      <Container sx={{ mt: 10, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Verifying permissions...</Typography>
      </Container>
    );
  }

  // Prevent rendering if not admin (double safety)
  if (!isAdmin) return null;

  if (error || !book) {
    return (
      <Container sx={{ mt: 10, textAlign: "center" }}>
        <Typography color="error">
          Book not found or access error: {error}
        </Typography>
        <Button onClick={() => router.push("/")} sx={{ mt: 2 }}>
          Back to Home
        </Button>
      </Container>
    );
  }

  const stockColor =
    book.quantity < 3 ? "#ffebee" : book.quantity < 10 ? "#fff3e0" : "inherit";

  const stockTextColor =
    book.quantity < 3 ? "#c62828" : book.quantity < 10 ? "#ef6c00" : "inherit";

  async function handlePurchaseConfirm() {
    try {
      const { error: purchaseError } = await supabase.from("purchases").insert([
        {
          book_id: book.id,
          buyer_name: purchaseForm.buyer_name,
          amount_paid: purchaseForm.amount_paid,
          date: new Date().toISOString(),
        },
      ]);

      if (purchaseError) throw purchaseError;

      const newQuantity = book.quantity - 1;
      const { error: updateError } = await supabase
        .from("books")
        .update({ quantity: newQuantity })
        .eq("id", book.id);

      if (updateError) throw updateError;

      setBook({ ...book, quantity: newQuantity });
      setPurchaseForm({ buyer_name: "", amount_paid: "" });
      setPurchaseOpen(false);

      alert(`Purchase recorded for: ${book.name}`);
    } catch (err) {
      alert("Error while making purchase: " + err.message);
    }
  }

  async function handleRemove() {
    if (!confirm("Are you sure you want to delete this book?")) return;
    const { error } = await supabase.from("books").delete().eq("id", book.id);
    if (error) alert("Error while removing book: " + error.message);
    else {
      alert(`Book removed: ${book.name}`);
      router.push("/");
    }
  }

  async function handleSave() {
    const { error } = await supabase
      .from("books")
      .update({
        name: form.name,
        publisher: form.publisher,
        class_grade: form.class_grade,
        price: form.price,
        quantity: form.quantity,
      })
      .eq("id", book.id);

    if (error) {
      alert("Error updating details: " + error.message);
    } else {
      alert("Book details updated");
      setBook({ ...book, ...form });
      setEditOpen(false);
    }
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Card elevation={3}>
        <CardContent>
          <Box
            display="flex"
            justifyContent="space-between"
            alignItems="center"
            mb={2}
          >
            <Typography variant="h5" fontWeight="bold">
              {book.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {/* Convert id to string first to avoid the TypeError */}
              ID: {String(book.id).substring(0, 8)}...
            </Typography>
          </Box>

          <Table size="small">
            <TableBody>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>Publisher</TableCell>
                <TableCell>{book.publisher}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>Class/Grade</TableCell>
                <TableCell>{book.class_grade || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell sx={{ fontWeight: "bold" }}>Price</TableCell>
                <TableCell>{book.price ? `PKR ${book.price}` : "—"}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: stockColor }}>
                <TableCell sx={{ fontWeight: "bold", color: stockTextColor }}>
                  Stock
                </TableCell>
                <TableCell sx={{ fontWeight: "bold", color: stockTextColor }}>
                  {book.quantity}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>

          <Stack direction="row" spacing={2} sx={{ mt: 4 }}>
            <Button
              variant="contained"
              color="error"
              fullWidth
              onClick={handleRemove}
            >
              Remove
            </Button>
            <Button
              variant="contained"
              color="secondary"
              fullWidth
              onClick={() => setEditOpen(true)}
            >
              Edit Details
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog
        open={editOpen}
        onClose={() => setEditOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit Book Details</DialogTitle>
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
          <TextField
            label="Book Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            fullWidth
          />
          <TextField
            label="Publisher"
            value={form.publisher}
            onChange={(e) => setForm({ ...form, publisher: e.target.value })}
            fullWidth
          />
          <TextField
            label="Class/Grade"
            value={form.class_grade}
            onChange={(e) => setForm({ ...form, class_grade: e.target.value })}
            fullWidth
          />
          <TextField
            label="Price"
            type="number"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            fullWidth
          />
          <TextField
            label="Quantity"
            type="number"
            value={form.quantity}
            onChange={(e) => setForm({ ...form, quantity: e.target.value })}
            fullWidth
          />
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
