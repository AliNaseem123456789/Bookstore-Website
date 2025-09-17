"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
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
} from "@mui/material";

export default function BookDetail({ params }) {
  const { id } = React.use(params);

  const [book, setBook] = React.useState(null);
  const [error, setError] = React.useState(null);

  // Dialog states
  const [editOpen, setEditOpen] = React.useState(false);
  const [purchaseOpen, setPurchaseOpen] = React.useState(false);

  // Form for editing
  const [form, setForm] = React.useState({
    name: "",
    publisher: "",
    class_grade: "",
    price: "",
    quantity: "",
  });

  // Form for purchase
  const [purchaseForm, setPurchaseForm] = React.useState({
    buyer_name: "",
    amount_paid: "",
  });

  React.useEffect(() => {
    async function fetchBook() {
      const { data, error } = await supabase
        .from("books")
        .select("*")
        .eq("id", id)
        .single();
      if (error) setError(error.message);
      else {
        setBook(data);
        setForm({
          name: data.name || "",
          publisher: data.publisher || "",
          class_grade: data.class_grade || "",
          price: data.price || "",
          quantity: data.quantity || "",
        });
      }
    }
    if (id) fetchBook();
  }, [id]);

  if (error || !book) {
    return <p>Book not found</p>;
  }

  // Handle purchase confirm
  async function handlePurchaseConfirm() {
    try {
      // Step 1: Insert into purchases table
      const { error: purchaseError } = await supabase.from("purchases").insert([
        {
          book_id: book.id,
          buyer_name: purchaseForm.buyer_name,
          amount_paid: purchaseForm.amount_paid,
          date: new Date().toISOString(),
        },
      ]);

      if (purchaseError) throw purchaseError;

      // Step 2: Reduce book quantity by 1
      const newQuantity = book.quantity - 1;
      const { error: updateError } = await supabase
        .from("books")
        .update({ quantity: newQuantity })
        .eq("id", book.id);

      if (updateError) throw updateError;

      // Update local state
      setBook({ ...book, quantity: newQuantity });

      // Reset purchase form and close
      setPurchaseForm({ buyer_name: "", amount_paid: "" });
      setPurchaseOpen(false);

      alert(`Purchase recorded for: ${book.name}`);
    } catch (err) {
      alert("Error while making purchase: " + err.message);
    }
  }

  // Handle remove
  async function handleRemove() {
    const { error } = await supabase.from("books").delete().eq("id", book.id);
    if (error) alert("Error while removing book: " + error.message);
    else alert(`Book removed: ${book.name}`);
  }

  // Open edit dialog
  function handleOpenEditDialog() {
    setForm({
      name: book.name || "",
      publisher: book.publisher || "",
      class_grade: book.class_grade || "",
      price: book.price || "",
      quantity: book.quantity || "",
    });
    setEditOpen(true);
  }

  // Save changes
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
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {book.name}
          </Typography>
          <Typography>Publisher: {book.publisher}</Typography>
          <Typography>Class/Grade: {book.class_grade || "—"}</Typography>
          <Typography>Price: {book.price ? `₹${book.price}` : "—"}</Typography>
          <Typography>Stock: {book.quantity}</Typography>

          <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
            <Button
              variant="contained"
              color="primary"
              onClick={() => setPurchaseOpen(true)}
              disabled={book.quantity <= 0}
            >
              Make Purchase
            </Button>
            <Button variant="outlined" color="error" onClick={handleRemove}>
              Remove Book
            </Button>
            <Button variant="outlined" color="secondary" onClick={handleOpenEditDialog}>
              Change Details
            </Button>
          </Stack>
        </CardContent>
      </Card>

      {/* Purchase Dialog */}
      <Dialog
        open={purchaseOpen}
        onClose={() => setPurchaseOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Make Purchase</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Buyer Name"
            value={purchaseForm.buyer_name}
            onChange={(e) =>
              setPurchaseForm({ ...purchaseForm, buyer_name: e.target.value })
            }
            fullWidth
          />
          <TextField
            label="Amount Paid"
            type="number"
            value={purchaseForm.amount_paid}
            onChange={(e) =>
              setPurchaseForm({ ...purchaseForm, amount_paid: e.target.value })
            }
            fullWidth
          />
          <Typography variant="body2" sx={{ mt: 1 }}>
            Purchase Date: {new Date().toLocaleString()}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurchaseOpen(false)}>Cancel</Button>
          <Button onClick={handlePurchaseConfirm} variant="contained" color="primary">
            Confirm Purchase
          </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Edit Book Details</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
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
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancel</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Save Changes
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
