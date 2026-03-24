"use client";
import React, { useMemo, useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Box,
  Skeleton,
} from "@mui/material";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

// Fetch all books (no pagination)
async function fetchBooks() {
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .order("id", { ascending: true });

  if (error) throw new Error(error.message);
  return data;
}

// ✅ Optimized Table Row Component
const BookTableRow = React.memo(function BookTableRow({ book }) {
  const rowColor = useMemo(() => {
    if (book.quantity < 3) return "#ffcccc";
    if (book.quantity < 10) return "#ffe0b3";
    return "";
  }, [book.quantity]);

  return (
    <TableRow
      hover
      sx={{
        cursor: "pointer",
        backgroundColor: rowColor,
        "&:hover": { backgroundColor: rowColor || "#f9f9f9" },
      }}
    >
      <TableCell>{book.name}</TableCell>
      <TableCell>{book.publisher}</TableCell>
      <TableCell>{book.class_grade || "—"}</TableCell>
      <TableCell>{book.price ? `PKR ${book.price}` : "—"}</TableCell>
      <TableCell>{book.quantity}</TableCell>
      <TableCell align="center">
        <Link href={`/book/${book.id}`} style={{ textDecoration: "none" }}>
          <Button variant="outlined" size="small">
            View
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
});

export default function Home() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);

  // 1. Check Admin Status
  useEffect(() => {
    async function checkAdmin() {
      try {
        const res = await fetch("/api/me");
        if (res.ok) {
          const data = await res.json();
          if (data.user?.role === "admin") {
            setIsAdmin(true);
          }
        }
      } catch (err) {
        console.error("Auth check failed", err);
      } finally {
        setAuthLoading(false);
      }
    }
    checkAdmin();
  }, []);

  // 2. Fetch Books Data
  const {
    data: books = [],
    error,
    isLoading: dataLoading,
  } = useQuery({
    queryKey: ["books"],
    queryFn: fetchBooks,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  const isEmpty = useMemo(() => books.length === 0, [books]);

  if (dataLoading)
    return (
      <Container sx={{ mt: 4 }}>
        <Typography>Loading books...</Typography>
      </Container>
    );

  if (error)
    return (
      <Container sx={{ mt: 4 }}>
        <Typography color="error">Error: {error.message}</Typography>
      </Container>
    );

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      {/* Header */}
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          📚 Bookstore
        </Typography>

        {/* ✅ Only show button if NOT loading auth AND user is admin */}
        {!authLoading && isAdmin && (
          <Link href="/add-book">
            <Button variant="contained" color="primary" startIcon="➕">
              Add Book
            </Button>
          </Link>
        )}
      </Box>

      {/* Table */}
      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <strong>Name</strong>
              </TableCell>
              <TableCell>
                <strong>Publisher</strong>
              </TableCell>
              <TableCell>
                <strong>Class/Grade</strong>
              </TableCell>
              <TableCell>
                <strong>Price</strong>
              </TableCell>
              <TableCell>
                <strong>Stock</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Action</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isEmpty ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No books available.
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => <BookTableRow key={book.id} book={book} />)
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
