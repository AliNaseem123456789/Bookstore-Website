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
  Button,
  Box,
  CircularProgress,
  Alert,
  Snackbar,
} from "@mui/material";
import { LocalShipping } from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function FulfillmentPage() {
  const queryClient = useQueryClient();
  const [notification, setNotification] = React.useState({
    open: false,
    message: "",
  });

  // 1. Fetch pending backorders
  const { data: backorders, isLoading } = useQuery({
    queryKey: ["fulfillment_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backordered_items")
        .select(
          `
          id, 
          book_id, 
          quantity, 
          status, 
          buyer_name, 
          created_at,
          books (id, name, quantity)
        `,
        )
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;
      return data;
    },
  });

  // 2. Mutation to deduct stock and mark as delivered
  const fulfillMutation = useMutation({
    mutationFn: async (item) => {
      // A. Update the book quantity in the books table
      const newStock = item.books.quantity - item.quantity;

      const { error: updateBookError } = await supabase
        .from("books")
        .update({ quantity: newStock })
        .eq("id", item.book_id);

      if (updateBookError) throw updateBookError;

      // B. Mark the backorder as delivered
      const { error: updateBackorderError } = await supabase
        .from("backordered_items")
        .update({ status: "delivered" })
        .eq("id", item.id);

      if (updateBackorderError) throw updateBackorderError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["fulfillment_pending"]);
      setNotification({
        open: true,
        message: "Stock updated and delivery marked!",
      });
    },
  });

  return (
    <Container maxWidth="lg" sx={{ mt: 6 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold">
          Pending Fulfillment
        </Typography>
        <Typography color="text.secondary">
          Items sold but waiting for delivery.
        </Typography>
      </Box>

      <Paper elevation={2}>
        <Table>
          <TableHead sx={{ bgcolor: "#fcfcfc" }}>
            <TableRow>
              <TableCell>
                <strong>Date</strong>
              </TableCell>
              <TableCell>
                <strong>Buyer</strong>
              </TableCell>
              <TableCell>
                <strong>Item</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Qty</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Action</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : backorders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No pending items.
                </TableCell>
              </TableRow>
            ) : (
              backorders?.map((item) => (
                <TableRow key={item.id} hover>
                  <TableCell>
                    {format(new Date(item.created_at), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell>{item.buyer_name}</TableCell>
                  <TableCell sx={{ fontWeight: "bold" }}>
                    {item.books?.name}
                  </TableCell>
                  <TableCell align="center">{item.quantity}</TableCell>
                  <TableCell align="center">
                    <Button
                      variant="contained"
                      color="success"
                      size="small"
                      startIcon={<LocalShipping />}
                      onClick={() => fulfillMutation.mutate(item)}
                      sx={{ borderRadius: 2, textTransform: "none" }}
                    >
                      Deliver
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>

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
