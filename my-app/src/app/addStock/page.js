"use client";
import * as React from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  Container,
  Typography,
  Paper,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TextField,
  Button,
  Box,
  Alert,
  Snackbar,
  CircularProgress,
} from "@mui/material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { History as HistoryIcon } from "@mui/icons-material";
export default function BulkStockPage() {
  const queryClient = useQueryClient();
  const [updates, setUpdates] = React.useState({}); // { bookId: quantity }
  const [notification, setNotification] = React.useState({
    open: false,
    message: "",
  });

  const { data: books = [], isLoading } = useQuery({
    queryKey: ["books_list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("books")
        .select("id, name, class_grade, quantity");
      return (data || []).sort((a, b) =>
        a.class_grade.localeCompare(b.class_grade),
      );
    },
  });

  const saveUpdates = useMutation({
    mutationFn: async () => {
      for (const [id, qty] of Object.entries(updates)) {
        if (!qty) continue;
        const book = books.find((b) => b.id.toString() === id);

        // 1. Update Inventory
        await supabase
          .from("books")
          .update({ quantity: book.quantity + Number(qty) })
          .eq("id", id);
        // 2. Log History
        await supabase
          .from("stock_history")
          .insert({ book_id: id, quantity_added: qty });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["books_list"] });
      setUpdates({});
      setNotification({ open: true, message: "Bulk update successful!" });
    },
  });

  // Group books by grade for the UI
  const groupedBooks = books.reduce((acc, book) => {
    if (!acc[book.class_grade]) acc[book.class_grade] = [];
    acc[book.class_grade].push(book);
    return acc;
  }, {});

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>
        Bulk Stock Entry
      </Typography>

      <Button
        component={Link}
        href="/stock-history"
        variant="outlined"
        startIcon={<HistoryIcon />}
      >
        View Stock History
      </Button>
      <Paper elevation={3} sx={{ p: 2 }}>
        {isLoading ? (
          <CircularProgress />
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Grade</TableCell>
                <TableCell>Book Name</TableCell>
                <TableCell>Current</TableCell>
                <TableCell>Add New</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {Object.entries(groupedBooks).map(([grade, gradeBooks]) => (
                <React.Fragment key={grade}>
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      sx={{ bgcolor: "#f0f0f0", fontWeight: "bold" }}
                    >
                      Grade {grade}
                    </TableCell>
                  </TableRow>
                  {gradeBooks.map((book) => (
                    <TableRow key={book.id}>
                      <TableCell>{book.class_grade}</TableCell>
                      <TableCell>{book.name}</TableCell>
                      <TableCell>{book.quantity}</TableCell>
                      <TableCell>
                        <TextField
                          size="small"
                          type="number"
                          placeholder="0"
                          onChange={(e) =>
                            setUpdates({
                              ...updates,
                              [book.id]: e.target.value,
                            })
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>
      <Box sx={{ mt: 3, display: "flex", justifyContent: "flex-end" }}>
        <Button
          variant="contained"
          size="large"
          onClick={() => saveUpdates.mutate()}
        >
          Save All Changes
        </Button>
      </Box>
      <Snackbar
        open={notification.open}
        autoHideDuration={3000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert severity="success">{notification.message}</Alert>
      </Snackbar>
    </Container>
  );
}
