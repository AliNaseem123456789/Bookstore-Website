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
  TextField,
  InputAdornment,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  CircularProgress,
  IconButton,
  Alert,
  Snackbar,
} from "@mui/material";
import { Search, Payments, History } from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function PendingPaymentsPage() {
  const queryClient = useQueryClient();
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedSale, setSelectedSale] = React.useState(null);
  const [paymentAmount, setPaymentAmount] = React.useState("");
  const [notification, setNotification] = React.useState({
    open: false,
    message: "",
  });

  // 1. Fetch only sales where payment_status is 'pending' OR balance_due > 0
  const { data: pendingSales, isLoading } = useQuery({
    queryKey: ["pending_payments", searchQuery],
    queryFn: async () => {
      let query = supabase
        .from("course_sales")
        .select("*")
        .gt("balance_due", 0) // Only fetch those who actually owe money
        .order("date", { ascending: true }); // Oldest debts first

      if (searchQuery) {
        query = query.ilike("buyer_name", `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });

  // 2. Mutation to update payment
  const updatePaymentMutation = useMutation({
    mutationFn: async ({ saleId, amountToAdd, currentPaid, totalCost }) => {
      const newPaidTotal = Number(currentPaid) + Number(amountToAdd);
      const newBalance = Number(totalCost) - newPaidTotal;
      const newStatus = newBalance <= 0 ? "paid" : "pending";

      const { error } = await supabase
        .from("course_sales")
        .update({
          cost_paid: newPaidTotal,
          balance_due: newBalance,
          payment_status: newStatus,
        })
        .eq("id", saleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["pending_payments"]);
      setNotification({
        open: true,
        message: "Payment recorded successfully!",
      });
      handleClose();
    },
  });

  const handleOpenPayment = (sale) => {
    setSelectedSale(sale);
    setPaymentAmount(sale.balance_due.toString()); // Default to full remaining balance
  };

  const handleClose = () => {
    setSelectedSale(null);
    setPaymentAmount("");
  };

  const handleSubmitPayment = () => {
    if (!paymentAmount || isNaN(paymentAmount) || Number(paymentAmount) <= 0)
      return;

    updatePaymentMutation.mutate({
      saleId: selectedSale.id,
      amountToAdd: paymentAmount,
      currentPaid: selectedSale.cost_paid,
      totalCost: selectedSale.total_cost,
    });
  };

  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 6 }}>
      <Box
        sx={{
          mb: 4,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Box>
          <Typography variant="h4" fontWeight="bold" color="primary">
            Pending Collections
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Manage outstanding balances and record new payments.
          </Typography>
        </Box>

        <TextField
          placeholder="Search buyer..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: 300, bgcolor: "white" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search color="action" />
              </InputAdornment>
            ),
          }}
        />
      </Box>

      <Paper elevation={2}>
        <Table>
          <TableHead sx={{ bgcolor: "#fcfcfc" }}>
            <TableRow>
              <TableCell>
                <strong>Date</strong>
              </TableCell>
              <TableCell>
                <strong>Buyer Name</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Total Bill</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Already Paid</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Balance Due</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Action</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={30} />
                </TableCell>
              </TableRow>
            ) : pendingSales?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">
                    No pending payments found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              pendingSales?.map((sale) => (
                <TableRow key={sale.id} hover>
                  <TableCell>
                    {format(new Date(sale.date), "dd MMM yyyy")}
                  </TableCell>
                  <TableCell sx={{ fontWeight: "medium" }}>
                    {sale.buyer_name}
                  </TableCell>
                  <TableCell align="right">
                    PKR {sale.total_cost.toLocaleString()}
                  </TableCell>
                  <TableCell align="right" sx={{ color: "success.main" }}>
                    PKR {sale.cost_paid.toLocaleString()}
                  </TableCell>
                  <TableCell align="right">
                    <Typography fontWeight="bold" color="error">
                      PKR {sale.balance_due.toLocaleString()}
                    </Typography>
                  </TableCell>
                  <TableCell align="center">
                    <Button
                      variant="contained"
                      size="small"
                      startIcon={<Payments />}
                      onClick={() => handleOpenPayment(sale)}
                      sx={{ borderRadius: 2, textTransform: "none" }}
                    >
                      Receive
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>

      {/* PAYMENT DIALOG */}
      <Dialog
        open={Boolean(selectedSale)}
        onClose={handleClose}
        fullWidth
        maxWidth="xs"
      >
        <DialogTitle sx={{ textAlign: "center", pt: 3 }}>
          Record Payment
        </DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: "center", mb: 2 }}>
            <Typography variant="h6">{selectedSale?.buyer_name}</Typography>
            <Typography variant="body2" color="error" fontWeight="bold">
              Outstanding: PKR {selectedSale?.balance_due.toLocaleString()}
            </Typography>
          </Box>
          <TextField
            fullWidth
            label="Amount Received (PKR)"
            type="number"
            autoFocus
            value={paymentAmount}
            onChange={(e) => setPaymentAmount(e.target.value)}
            sx={{ mt: 1 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">Rs.</InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 3, justifyContent: "center" }}>
          <Button onClick={handleClose} color="inherit">
            Cancel
          </Button>
          <Button
            onClick={handleSubmitPayment}
            variant="contained"
            disabled={updatePaymentMutation.isLoading}
            sx={{ px: 4 }}
          >
            {updatePaymentMutation.isLoading ? "Saving..." : "Confirm Payment"}
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={notification.open}
        autoHideDuration={4000}
        onClose={() => setNotification({ ...notification, open: false })}
      >
        <Alert severity="success">{notification.message}</Alert>
      </Snackbar>
    </Container>
  );
}
