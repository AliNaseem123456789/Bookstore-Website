"use client";
import React, { useEffect, useState } from "react";
import {
  Container,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  Divider,
  Box,
} from "@mui/material";
import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { cart, removeFromCart, clearCart } = useCart();
  const [buyerName, setBuyerName] = useState("");
  const [books, setBooks] = useState([]);
  const [seller, setSeller] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // Get logged-in seller
  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setSeller(data.user));
  }, []);

  // Fetch all books once
  useEffect(() => {
    supabase
      .from("books")
      .select("*")
      .then(({ data }) => setBooks(data || []));
  }, []);

  const finalTotal = cart.reduce(
    (sum, course) =>
      sum +
      course.books.reduce((courseSum, b) => courseSum + Number(b.price), 0),
    0
  );

  async function handleCheckout() {
    if (!buyerName.trim()) {
      alert("Enter buyer name");
      return;
    }

    setIsProcessing(true);

    try {
      for (const course of cart) {
        const courseBooks = books.filter(
          (b) => b.class_grade === course.class_grade
        );

        const totalAmount = courseBooks.reduce(
          (sum, b) => sum + Number(b.price),
          0
        );

        const { error } = await supabase.from("course_sales").insert({
          buyer_name: buyerName,
          class_grade: course.class_grade,
          no_of_books: courseBooks.length,
          total_cost: totalAmount,
          cost_paid: totalAmount,
          books_sold: courseBooks.map((b) => ({
            id: b.id,
            name: b.name,
            price: b.price,
          })),
          date: new Date(),
          sold_by_name: seller?.email || "Unknown",
        });

        if (error) throw new Error(error.message);

        // Update stock
        for (const book of courseBooks) {
          await supabase
            .from("books")
            .update({ quantity: book.quantity - 1 })
            .eq("id", book.id);
        }
      }

      clearCart();
      alert("Checkout completed successfully!");
    } catch (err) {
      alert("Error during checkout: " + err.message);
    }

    setTimeout(() => setIsProcessing(false), 15000);
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Cart Checkout
      </Typography>

      <TextField
        label="Buyer Name"
        fullWidth
        sx={{ mb: 3 }}
        value={buyerName}
        onChange={(e) => setBuyerName(e.target.value)}
        disabled={isProcessing}
      />

      {cart.length === 0 ? (
        <Typography>No courses in cart.</Typography>
      ) : (
        <List>
          {cart.map((course) => {
            const courseTotal = course.books.reduce(
              (sum, b) => sum + Number(b.price),
              0
            );
            return (
              <Box key={course.class_grade}>
                <ListItem>
                  <ListItemText
                    primary={`Class ${course.class_grade} Course`}
                    secondary={`Total: PKR ${courseTotal}`}
                  />
                  <Button
                    color="error"
                    onClick={() => removeFromCart(course.class_grade)}
                    disabled={isProcessing}
                  >
                    Remove
                  </Button>
                </ListItem>
                <Divider />
              </Box>
            );
          })}
          <ListItem>
            <ListItemText
              primary="Final Total"
              secondary={`PKR ${finalTotal}`}
            />
          </ListItem>
        </List>
      )}

      <Button
        variant="contained"
        color="primary"
        sx={{ mt: 3 }}
        disabled={cart.length === 0 || isProcessing}
        onClick={handleCheckout}
      >
        {isProcessing
          ? "Processing..."
          : `Checkout (${cart.length} Course${cart.length > 1 ? "s" : ""})`}
      </Button>
    </Container>
  );
}
