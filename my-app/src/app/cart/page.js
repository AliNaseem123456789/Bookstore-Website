"use client";
import React, { useEffect, useState, useMemo } from "react";
import {
  Container,
  Typography,
  Button,
  TextField,
  List,
  ListItem,
  ListItemText,
  Divider,
  Box,
  CircularProgress,
  InputAdornment,
} from "@mui/material";
import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { cart, removeFromCart, clearCart } = useCart();
  const [buyerName, setBuyerName] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [seller, setSeller] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((res) => res.json())
      .then((data) => setSeller(data.user))
      .catch((err) => console.error("Error fetching seller:", err));
  }, []);

  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const itemPrice =
        Number(item.total_cost) - (Number(item.discount_amount) || 0);
      return sum + itemPrice;
    }, 0);
  }, [cart]);

  const finalTotal = Math.max(0, subtotal - globalDiscount);

  async function handleCheckout() {
    if (!buyerName.trim()) {
      alert("Please enter the buyer's name.");
      return;
    }

    setIsProcessing(true);
    const transactionId = crypto.randomUUID(); // Grouping marker for History Page

    try {
      for (const item of cart) {
        const itemOriginalTotal = Number(item.total_cost);
        const itemSpecificDiscount = Number(item.discount_amount) || 0;
        const itemSubtotal = itemOriginalTotal - itemSpecificDiscount;

        // Calculate this item's share of the global discount
        // Ratio = Item Price / Total Cart Price
        const discountRatio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const globalDiscountShare = globalDiscount * discountRatio;

        const finalDiscountApplied = itemSpecificDiscount + globalDiscountShare;
        const finalCostPaid = itemOriginalTotal - finalDiscountApplied;

        // 1. Record the Sale with transaction_id
        const { error: saleError } = await supabase
          .from("course_sales")
          .insert({
            transaction_id: transactionId,
            buyer_name: buyerName,
            class_grade: item.class_grade,
            no_of_books: item.books.length,
            total_cost: itemOriginalTotal,
            cost_paid: finalCostPaid,
            discount_applied: finalDiscountApplied,
            books_sold: item.books.map((b) => ({
              id: b.id,
              name: b.name,
              price: b.price,
            })),
            date: new Date(),
            sold_by_name: seller?.email || "Unknown",
          });

        if (saleError) throw new Error(`Sale Error: ${saleError.message}`);

        // 2. Update Inventory
        for (const book of item.books) {
          const { data: latestBook } = await supabase
            .from("books")
            .select("quantity")
            .eq("id", book.id)
            .single();

          const newQuantity = (latestBook?.quantity || 0) - 1;
          await supabase
            .from("books")
            .update({ quantity: newQuantity })
            .eq("id", book.id);
        }
      }

      alert("Checkout completed successfully!");
      clearCart();
      setBuyerName("");
      setGlobalDiscount(0);
    } catch (err) {
      alert("Error during checkout: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Cart Checkout
      </Typography>

      <Box sx={{ display: "flex", gap: 2, mb: 4, mt: 2 }}>
        <TextField
          label="Buyer Name"
          fullWidth
          value={buyerName}
          onChange={(e) => setBuyerName(e.target.value)}
          disabled={isProcessing}
        />
        <TextField
          label="Extra Cart Discount"
          type="number"
          sx={{ width: "300px" }}
          value={globalDiscount}
          onChange={(e) =>
            setGlobalDiscount(Math.max(0, Number(e.target.value)))
          }
          disabled={isProcessing}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">PKR</InputAdornment>
            ),
          }}
        />
      </Box>

      {cart.length === 0 ? (
        <Box textAlign="center" py={5}>
          <Typography color="text.secondary">Your cart is empty.</Typography>
        </Box>
      ) : (
        <>
          <List
            sx={{ bgcolor: "background.paper", borderRadius: 2, boxShadow: 1 }}
          >
            {cart.map((item, index) => {
              const itemDisc = Number(item.discount_amount) || 0;
              const itemOrig = Number(item.total_cost);

              return (
                <Box key={`${item.class_grade}-${index}`}>
                  <ListItem
                    sx={{ py: 2 }}
                    secondaryAction={
                      <Button
                        color="error"
                        onClick={() => removeFromCart(item.class_grade)}
                        disabled={isProcessing}
                      >
                        Remove
                      </Button>
                    }
                  >
                    <ListItemText
                      primary={
                        item.display_name || `Class ${item.class_grade} Course`
                      }
                      secondary={
                        <Box component="span">
                          <Typography
                            variant="body2"
                            color="text.secondary"
                            display="block"
                          >
                            Books: {item.books.length}
                          </Typography>
                          {itemDisc > 0 && (
                            <Typography
                              variant="body2"
                              color="error"
                              display="block"
                            >
                              Item Discount: -PKR {itemDisc}
                            </Typography>
                          )}
                          <Typography
                            variant="body1"
                            fontWeight="medium"
                            color="primary"
                          >
                            PKR {(itemOrig - itemDisc).toLocaleString()}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  <Divider />
                </Box>
              );
            })}

            <Box sx={{ p: 3, bgcolor: "action.hover" }}>
              <Box display="flex" justifyContent="space-between" mb={1}>
                <Typography>Subtotal</Typography>
                <Typography>PKR {subtotal.toLocaleString()}</Typography>
              </Box>
              {globalDiscount > 0 && (
                <Box display="flex" justifyContent="space-between" mb={1}>
                  <Typography color="error">Extra Cart Discount</Typography>
                  <Typography color="error">
                    -PKR {globalDiscount.toLocaleString()}
                  </Typography>
                </Box>
              )}
              <Divider sx={{ my: 1 }} />
              <Box display="flex" justifyContent="space-between">
                <Typography variant="h6" fontWeight="bold">
                  Final Total
                </Typography>
                <Typography variant="h6" fontWeight="bold" color="primary">
                  PKR {finalTotal.toLocaleString()}
                </Typography>
              </Box>
            </Box>
          </List>

          <Box mt={4} display="flex" justifyContent="flex-end">
            <Button
              variant="contained"
              size="large"
              disabled={isProcessing}
              onClick={handleCheckout}
              sx={{ minWidth: 200, py: 1.5, fontWeight: "bold" }}
            >
              {isProcessing ? (
                <CircularProgress size={24} color="inherit" />
              ) : (
                `Confirm Purchase (PKR ${finalTotal.toLocaleString()})`
              )}
            </Button>
          </Box>
        </>
      )}
    </Container>
  );
}
