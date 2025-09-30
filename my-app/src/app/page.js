"use client";

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

export default function Home() {
  const {
    data: books,
    error,
    isLoading,
  } = useQuery({
    queryKey: ["books"],
    queryFn: fetchBooks,
    staleTime: 1000 * 60, // cache for 1 minute
    refetchOnWindowFocus: false, // don't refetch every time window refocuses
  });

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
            {books.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No books available.
                </TableCell>
              </TableRow>
            ) : (
              books.map((book) => {
                let rowColor = "";
                if (book.quantity < 3) rowColor = "#ffcccc"; // light red
                else if (book.quantity < 10) rowColor = "#ffe0b3"; // light orange

                return (
                  <TableRow
                    key={book.id}
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
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
