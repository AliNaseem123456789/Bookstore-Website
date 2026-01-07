"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import {Container,Typography,Card,CardContent,Button,Stack,Dialog,DialogTitle,DialogContent,DialogActions,TextField,
  CircularProgress,Table,TableBody,TableRow,TableCell,} from "@mui/material";
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
    async function fetchBook() {
      setLoading(true);
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
      setLoading(false);
    }

    if (id) fetchBook();

    setMounted(true);
    setPurchaseDate(formatDate(new Date()));
  }, [id]);

  if (loading) {
    return (
      <Container sx={{ mt: 10, textAlign: "center" }}>
        <CircularProgress />
        <Typography sx={{ mt: 2 }}>Loading book details...</Typography>
      </Container>
    );
  }

  if (error || !book) {
    return (
      <Container sx={{ mt: 10, textAlign: "center" }}>
        <Typography color="error">Book not found</Typography>
      </Container>
    );
  }

  // 🔥 background color logic
  const stockColor =
    book.quantity < 3 ? "red" : book.quantity < 10 ? "orange" : "inherit";

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
      <Card>
        <CardContent>
          <Typography variant="h5" gutterBottom>
            {book.name}
          </Typography>

          {/* ✅ Table for details */}
          <Table>
            <TableBody>
              <TableRow>
                <TableCell>Publisher</TableCell>
                <TableCell>{book.publisher}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Class/Grade</TableCell>
                <TableCell>{book.class_grade || "—"}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Price</TableCell>
                <TableCell>{book.price ? `pkr ${book.price}` : "—"}</TableCell>
              </TableRow>
              <TableRow sx={{ backgroundColor: stockColor }}>
                <TableCell>Stock</TableCell>
                <TableCell>{book.quantity}</TableCell>
              </TableRow>
            </TableBody>
          </Table>

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
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => setEditOpen(true)}
            >
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
        <DialogContent
          sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}
        >
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
          {mounted && purchaseDate && (
            <Typography variant="body2" sx={{ mt: 1 }}>
              Purchase Date: {purchaseDate}
            </Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPurchaseOpen(false)}>Cancel</Button>
          <Button
            onClick={handlePurchaseConfirm}
            variant="contained"
            color="primary"
          >
            Confirm Purchase
          </Button>
        </DialogActions>
      </Dialog>

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
