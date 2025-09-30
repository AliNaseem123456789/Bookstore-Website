"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  List,
  ListItem,
  ListItemText,
  Checkbox,
} from "@mui/material";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export default function CoursesPage() {
  const [selectedClass, setSelectedClass] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [buyerName, setBuyerName] = React.useState("");
  const [selectedBooks, setSelectedBooks] = React.useState([]);
  const [seller, setSeller] = React.useState(null); // 👈 logged in user
  const queryClient = useQueryClient();

  // ✅ Fetch logged-in seller from /api/me
  React.useEffect(() => {
    async function fetchSeller() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          setSeller(data.user);
        }
      } catch (err) {
        console.error("Error fetching seller:", err);
      }
    }
    fetchSeller();
  }, []);

  // ✅ Fetch all books
  const fetchBooks = async () => {
    const { data, error } = await supabase
      .from("books")
      .select("id, name, publisher, class_grade, price, quantity")
      .order("class_grade", { ascending: true });

    if (error) throw new Error(error.message);
    return data;
  };

  const { data: books = [], error, isLoading } = useQuery({
    queryKey: ["books"],
    queryFn: fetchBooks,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
  });

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  const classes = [...new Set(books.map((b) => b.class_grade))];

  // ✅ Buy a single book
  async function handleBuyBook(book) {
    if (!buyerName.trim()) {
      alert("Enter buyer name.");
      return;
    }

    const { error: salesError } = await supabase.from("purchases").insert({
      buyer_name: buyerName,
      book_id: book.id,
      amount_paid: book.price,
      date: new Date(),
      sold_by_name: seller?.email || "Unknown", // 👈 seller added
    });

    if (salesError) {
      alert("Error saving purchase: " + salesError.message);
      return;
    }

    // update stock
    const { error: updateError } = await supabase
      .from("books")
      .update({ quantity: book.quantity - 1 })
      .eq("id", book.id);

    if (updateError) {
      alert(`Error updating stock: ${updateError.message}`);
    }

    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(`Purchased "${book.name}" for PKR ${book.price}`);
  }

  // ✅ Buy selected books
  async function handleBuySelectedBooks() {
    if (!buyerName.trim() || selectedBooks.length === 0) {
      alert("Enter buyer name and select at least one book.");
      return;
    }

    const chosen = books.filter((b) => selectedBooks.includes(b.id));
    const totalAmount = chosen.reduce((sum, b) => sum + Number(b.price), 0);

    const { error: courseError } = await supabase.from("course_sales").insert({
      buyer_name: buyerName,
      class_grade: selectedClass,
      no_of_books: chosen.length,
      total_cost: totalAmount,
      cost_paid: totalAmount,
      books_sold: chosen.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price,
      })),
      date: new Date(),
      sold_by_name: seller?.email || "Unknown", // 👈 seller added
    });

    if (courseError) {
      alert("Error saving course purchase: " + courseError.message);
      return;
    }

    // update stock
    for (const book of chosen) {
      const { error: updateError } = await supabase
        .from("books")
        .update({ quantity: book.quantity - 1 })
        .eq("id", book.id);

      if (updateError) {
        alert(`Error updating stock for ${book.name}: ${updateError.message}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(`Purchased ${chosen.length} book(s) for PKR ${totalAmount}`);
    setOpen(false);
  }

  // ✅ Buy full course
  async function handleBuyCourse() {
    if (!buyerName.trim()) {
      alert("Enter buyer name.");
      return;
    }

    const courseBooks = books.filter((b) => b.class_grade === selectedClass);
    if (courseBooks.length === 0) {
      alert("No books found for this class.");
      return;
    }

    const totalAmount = courseBooks.reduce(
      (sum, b) => sum + Number(b.price),
      0
    );

    const { error: courseError } = await supabase.from("course_sales").insert({
      buyer_name: buyerName,
      class_grade: selectedClass,
      no_of_books: courseBooks.length,
      total_cost: totalAmount,
      cost_paid: totalAmount,
      books_sold: courseBooks.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price,
      })),
      date: new Date(),
      sold_by_name: seller?.email || "Unknown", // 👈 seller added
    });

    if (courseError) {
      alert("Error saving course purchase: " + courseError.message);
      return;
    }

    // update stock
    for (const book of courseBooks) {
      const { error: updateError } = await supabase
        .from("books")
        .update({ quantity: book.quantity - 1 })
        .eq("id", book.id);

      if (updateError) {
        alert(`Error updating stock for ${book.name}: ${updateError.message}`);
      }
    }

    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(
      `Purchased full course (${courseBooks.length} books) for PKR ${totalAmount}`
    );
    setOpen(false);
  }

  function handleOpen(classGrade) {
    setSelectedClass(classGrade);
    setBuyerName("");
    setSelectedBooks([]);
    setOpen(true);
  }

  function toggleBookSelection(bookId) {
    setSelectedBooks((prev) =>
      prev.includes(bookId)
        ? prev.filter((id) => id !== bookId)
        : [...prev, bookId]
    );
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Courses
      </Typography>

      {/* Class cards */}
      <Grid container spacing={3}>
        {classes.map((cls) => (
          <Grid item xs={12} sm={6} md={4} key={cls}>
            <Card>
              <CardContent>
                <Typography variant="h6">Class {cls}</Typography>
                <Typography>
                  Books: {books.filter((b) => b.class_grade === cls).length}
                </Typography>
                <Button
                  variant="outlined"
                  color="primary"
                  sx={{ mt: 2 }}
                  onClick={() => handleOpen(cls)}
                >
                  View Books
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Dialog showing books in a course */}
      <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="md">
        <DialogTitle>Course - Class {selectedClass}</DialogTitle>
        <DialogContent sx={{ mt: 1 }}>
          <TextField
            label="Buyer Name"
            value={buyerName}
            onChange={(e) => setBuyerName(e.target.value)}
            fullWidth
            sx={{ mb: 2 }}
          />

          {/* Total course cost */}
          <Typography variant="h6" sx={{ mb: 2 }}>
            Total Amount (all books): PKR{" "}
            {books
              .filter((b) => b.class_grade === selectedClass)
              .reduce((sum, b) => sum + Number(b.price), 0)}
          </Typography>

          <List>
            {books
              .filter((b) => b.class_grade === selectedClass)
              .map((book) => (
                <ListItem
                  key={book.id}
                  secondaryAction={
                    <Button
                      variant="contained"
                      size="small"
                      onClick={() => handleBuyBook(book)}
                      disabled={book.quantity <= 0}
                    >
                      Buy
                    </Button>
                  }
                >
                  <Checkbox
                    checked={selectedBooks.includes(book.id)}
                    onChange={() => toggleBookSelection(book.id)}
                  />
                  <ListItemText
                    primary={book.name}
                    secondary={`Publisher: ${book.publisher} | Price: PKR ${book.price} | Stock: ${book.quantity}`}
                  />
                </ListItem>
              ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handleBuySelectedBooks}
            variant="contained"
            color="secondary"
          >
            Buy Selected Books
          </Button>
          <Button
            onClick={handleBuyCourse}
            variant="contained"
            color="primary"
          >
            Buy Full Course
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}
