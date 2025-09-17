"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
} from "@mui/material";
import { useRouter } from "next/navigation";

export default function AddBookPage() {
  const [formData, setFormData] = useState({
    name: "",
    publisher: "",
    class_grade: "",
    price: "",
    quantity: "",
  });

  const [message, setMessage] = useState(null);
  const router = useRouter();

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { error } = await supabase.from("books").insert([
      {
        name: formData.name,
        publisher: formData.publisher,
        class_grade: formData.class_grade || null,
        price: formData.price ? parseFloat(formData.price) : null,
        quantity: formData.quantity ? parseInt(formData.quantity) : 0,
      },
    ]);

    if (error) {
      setMessage({ type: "error", text: error.message });
    } else {
      setMessage({ type: "success", text: "Book added successfully!" });
      setFormData({
        name: "",
        publisher: "",
        class_grade: "",
        price: "",
        quantity: "",
      });

      // redirect to home after 1s
      setTimeout(() => {
        router.push("/");
      }, 1000);
    }
  };

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        ➕ Add a New Book
      </Typography>

      {message && (
        <Alert severity={message.type} sx={{ mb: 2 }}>
          {message.text}
        </Alert>
      )}

      <Box
        component="form"
        onSubmit={handleSubmit}
        sx={{ display: "flex", flexDirection: "column", gap: 2 }}
      >
        <TextField
          label="Book Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          required
        />
        <TextField
          label="Publisher"
          name="publisher"
          value={formData.publisher}
          onChange={handleChange}
          required
        />
        <TextField
          label="Class/Grade"
          name="class_grade"
          value={formData.class_grade}
          onChange={handleChange}
        />
        <TextField
          label="Price"
          name="price"
          type="number"
          value={formData.price}
          onChange={handleChange}
        />
        <TextField
          label="Quantity"
          name="quantity"
          type="number"
          value={formData.quantity}
          onChange={handleChange}
          required
        />
        <Button type="submit" variant="contained" color="primary">
          Save Book
        </Button>
      </Box>
    </Container>
  );
}
