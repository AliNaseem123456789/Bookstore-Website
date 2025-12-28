"use client";
import React, { useMemo } from "react";
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

// ✅ Optimized Table Row Component with React.memo
const BookTableRow = React.memo(function BookTableRow({ book }) {
  // ✅ useMemo for row color calculation
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
      <TableCell>
        {book.price ? `PKR ${book.price}` : "—"}
      </TableCell>
      <TableCell>{book.quantity}</TableCell>
      <TableCell align="center">
        <Link
          href={`/book/${book.id}`}
          style={{ textDecoration: "none" }}
        >
          <Button variant="outlined" size="small">
            View
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
});

// ✅ Add custom comparison function for better performance
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.book.id === nextProps.book.id &&
    prevProps.book.name === nextProps.book.name &&
    prevProps.book.publisher === nextProps.book.publisher &&
    prevProps.book.class_grade === nextProps.book.class_grade &&
    prevProps.book.price === nextProps.book.price &&
    prevProps.book.quantity === nextProps.book.quantity
  );
};

const MemoizedBookTableRow = React.memo(BookTableRow, areEqual);

export default function Home() {
  const {
    data: books = [], // ✅ Default to empty array
    error,
    isLoading,
  } = useQuery({
    queryKey: ["books"],
    queryFn: fetchBooks,
    staleTime: 1000 * 60,
    refetchOnWindowFocus: false,
  });

  // ✅ useMemo for empty state check
  const isEmpty = useMemo(() => books.length === 0, [books]);

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error loading books: {error.message}</p>;

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          📚 Bookstore
        </Typography>
        <Link href="/add-book">
          <Button variant="contained" color="primary">
            ➕ Add Book
          </Button>
        </Link>
      </div>

      {/* Table */}
      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><strong>Name</strong></TableCell>
              <TableCell><strong>Publisher</strong></TableCell>
              <TableCell><strong>Class/Grade</strong></TableCell>
              <TableCell><strong>Price</strong></TableCell>
              <TableCell><strong>Stock</strong></TableCell>
              <TableCell align="center"><strong>Action</strong></TableCell>
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
              books.map((book) => (
                <MemoizedBookTableRow key={book.id} book={book} />
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}