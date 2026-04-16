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
  CircularProgress,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";

export default function StockHistoryPage() {
  const { data: history = [], isLoading } = useQuery({
    queryKey: ["stock_history_log"],
    queryFn: async () => {
      // Fetch history joined with book names
      const { data, error } = await supabase
        .from("stock_history")
        .select(
          `
          id, 
          quantity_added, 
          updated_at, 
          books (name)
        `,
        )
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return data || [];
    },
  });

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>
        Stock Update History
      </Typography>

      <Paper elevation={3}>
        <Table>
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell>
                <strong>Date & Time</strong>
              </TableCell>
              <TableCell>
                <strong>Book Name</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Quantity Added</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : history.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} align="center">
                  No stock history records found.
                </TableCell>
              </TableRow>
            ) : (
              history.map((entry) => (
                <TableRow key={entry.id} hover>
                  <TableCell>
                    {format(new Date(entry.updated_at), "dd MMM yyyy, hh:mm a")}
                  </TableCell>
                  <TableCell>{entry.books?.name || "Unknown Book"}</TableCell>
                  <TableCell
                    align="center"
                    sx={{ color: "green", fontWeight: "bold" }}
                  >
                    +{entry.quantity_added}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
