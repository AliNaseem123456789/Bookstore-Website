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
  Collapse,
  IconButton,
} from "@mui/material";
import {
  LocalShipping,
  KeyboardArrowDown,
  KeyboardArrowUp,
} from "@mui/icons-material";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";

export default function FulfillmentPage() {
  const queryClient = useQueryClient();
  // Removed TypeScript type annotation to fix build error
  const [openRows, setOpenRows] = React.useState({});
  const [notification, setNotification] = React.useState({
    open: false,
    message: "",
  });

  const { data: groupedBackorders, isLoading } = useQuery({
    queryKey: ["fulfillment_pending"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("backordered_items")
        .select(`id, sale_id, quantity, buyer_name, created_at, books (name)`)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Grouping Logic
      const groups = (data || []).reduce((acc, item) => {
        const key = item.sale_id;
        if (!acc[key]) {
          acc[key] = {
            sale_id: key,
            buyer_name: item.buyer_name,
            created_at: item.created_at,
            items: [],
          };
        }
        acc[key].items.push(item);
        return acc;
      }, {});

      return Object.values(groups);
    },
  });

  const fulfillMutation = useMutation({
    mutationFn: async (items) => {
      for (const item of items) {
        const { error } = await supabase
          .from("backordered_items")
          .update({ status: "delivered" })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fulfillment_pending"] });
      setNotification({ open: true, message: "Order fulfilled successfully!" });
    },
  });

  const toggleRow = (id) =>
    setOpenRows((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <Container maxWidth="lg" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" sx={{ mb: 4 }}>
        Pending Fulfillment
      </Typography>
      <Paper elevation={3}>
        <Table>
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell width={50} />
              <TableCell>
                <strong>Date</strong>
              </TableCell>
              <TableCell>
                <strong>Buyer</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Items Count</strong>
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
                  <CircularProgress />
                </TableCell>
              </TableRow>
            ) : groupedBackorders?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No pending items.
                </TableCell>
              </TableRow>
            ) : (
              groupedBackorders?.map((group) => (
                <React.Fragment key={group.sale_id}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton
                        size="small"
                        onClick={() => toggleRow(group.sale_id)}
                      >
                        {openRows[group.sale_id] ? (
                          <KeyboardArrowUp />
                        ) : (
                          <KeyboardArrowDown />
                        )}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      {format(new Date(group.created_at), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>{group.buyer_name}</TableCell>
                    <TableCell align="center">
                      {group.items.length} items
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        variant="contained"
                        color="success"
                        size="small"
                        startIcon={<LocalShipping />}
                        onClick={() => fulfillMutation.mutate(group.items)}
                      >
                        Deliver All
                      </Button>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={5} sx={{ p: 0 }}>
                      <Collapse
                        in={openRows[group.sale_id]}
                        timeout="auto"
                        unmountOnExit
                      >
                        <Box sx={{ p: 2, bgcolor: "#fafafa" }}>
                          {group.items.map((item) => (
                            <Typography
                              key={item.id}
                              variant="body2"
                              sx={{ py: 0.5 }}
                            >
                              • {item.books?.name} (Qty: {item.quantity})
                            </Typography>
                          ))}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </React.Fragment>
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
