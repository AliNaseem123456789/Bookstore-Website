//sell history
"use client";

import * as React from "react";
import supabase from "../../lib/supabaseClient";
import {
  Container,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";

export default function PurchasesPage() {
  // ✅ Fetch function
  const fetchPurchases = async () => {
    const { data, error } = await supabase
      .from("purchases")
      .select(
        `
        id,
        buyer_name,
        amount_paid,
        date,
        books (name)  -- join to books table for book name
      `,
      )
      .order("date", { ascending: false });

    if (error) throw new Error(error.message);
    return data;
  };

  // ✅ React Query with caching
  const {
    data: purchases = [],
    error,
    isLoading,
  } = useQuery({
    queryKey: ["purchases"],
    queryFn: fetchPurchases,
    staleTime: 1000 * 60 * 5, // cache fresh for 5 minutes
    gcTime: 1000 * 60 * 30, // keep in memory for 30 minutes
  });

  if (isLoading) {
    return (
      <Container sx={{ mt: 6 }}>
        <Typography>Loading purchases...</Typography>
      </Container>
    );
  }

  if (error) {
    return (
      <Container sx={{ mt: 6 }}>
        <Typography color="error">
          Error loading purchases: {error.message}
        </Typography>
      </Container>
    );
  }

  if (purchases.length === 0) {
    return (
      <Container sx={{ mt: 6 }}>
        <Typography variant="h6">No purchases recorded yet.</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Purchase History of Individual books
      </Typography>
      <Paper sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>
                <strong>Book</strong>
              </TableCell>
              <TableCell>
                <strong>Buyer</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Amount Paid (PKR)</strong>
              </TableCell>
              <TableCell>
                <strong>Date</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {purchases.map((purchase) => (
              <TableRow key={purchase.id}>
                <TableCell>{purchase.books?.name || "Unknown Book"}</TableCell>
                <TableCell>{purchase.buyer_name}</TableCell>
                <TableCell align="right">
                  PKR{" "}
                  {new Intl.NumberFormat("en-PK").format(purchase.amount_paid)}
                </TableCell>
                <TableCell>
                  {new Date(purchase.date).toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}
