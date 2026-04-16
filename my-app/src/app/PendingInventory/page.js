"use client";
import * as React from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  Container,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  Box,
  CircularProgress,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

export default function PendingInventoryPage() {
  const { data: pendingInventory, isLoading } = useQuery({
    queryKey: ["pending_inventory_summary"],
    queryFn: async () => {
      // 1. Fetch only pending records
      const { data, error } = await supabase
        .from("backordered_items")
        .select(`quantity, books (name)`)
        .eq("status", "pending");

      if (error) throw error;

      // 2. Aggregate quantity by book name
      const summary = (data || []).reduce((acc, item) => {
        const bookName = item.books?.name || "Unknown Book";
        if (!acc[bookName]) {
          acc[bookName] = 0;
        }
        acc[bookName] += item.quantity;
        return acc;
      }, {});

      // 3. Convert to array for table display
      return Object.entries(summary).map(([name, count]) => ({
        name,
        count,
      }));
    },
  });

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>
        Pending Book Requirements
      </Typography>
      <Paper elevation={3}>
        <Table>
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell>
                <strong>Book Name</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Total Pending Quantity</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : pendingInventory?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} align="center">
                  All orders fulfilled! No pending books.
                </TableCell>
              </TableRow>
            ) : (
              pendingInventory?.map((row) => (
                <TableRow key={row.name} hover>
                  <TableCell>{row.name}</TableCell>
                  <TableCell
                    align="center"
                    sx={{ fontWeight: "bold", fontSize: "1.1rem" }}
                  >
                    {row.count}
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
