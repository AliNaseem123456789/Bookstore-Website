"use client";
import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
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
  Collapse,
  IconButton,
} from "@mui/material";
import { ExpandMore, ExpandLess } from "@mui/icons-material";
import supabase from "../../lib/supabaseClient";
import useCart from "../../context/CartContext";

export default function CartPage() {
  const router = useRouter();
  const { cart, removeFromCart, clearCart } = useCart();
  const [buyerName, setBuyerName] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [seller, setSeller] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  async function handleCheckout() {
    if (!buyerName.trim()) {
      alert("Please enter the buyer's name.");
      return;
    }

    setIsProcessing(true);
    // This UUID remains invisible to the user but links the rows in the database
    const hiddenLink = crypto.randomUUID();

    try {
      // 1. Prepare all sales records
      const salesData = cart.map((item) => {
        const itemOriginalTotal = Number(item.total_cost);
        const itemSpecificDiscount = Number(item.discount_amount) || 0;
        const itemSubtotal = itemOriginalTotal - itemSpecificDiscount;
        const discountRatio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const globalDiscountShare = globalDiscount * discountRatio;
        const finalDiscountApplied = itemSpecificDiscount + globalDiscountShare;

        return {
          transaction_id: hiddenLink, // The invisible linker
          buyer_name: buyerName,
          class_grade: item.class_grade,
          no_of_books: item.books.reduce(
            (sum, b) => sum + (b.quantity || 1),
            0,
          ),
          total_cost: itemOriginalTotal,
          cost_paid: itemOriginalTotal - finalDiscountApplied,
          discount_applied: finalDiscountApplied,
          books_sold: item.books,
          date: new Date(),
          sold_by_name: seller?.email || "Unknown",
          is_full_course: !!item.is_full_course,
        };
      });

      // 2. Insert everything at once and get back the numeric IDs
      const { data, error: saleError } = await supabase
        .from("course_sales")
        .insert(salesData)
        .select(); // This fetches the created IDs

      if (saleError) throw saleError;

      // 3. Update Inventory
      for (const item of cart) {
        for (const book of item.books) {
          const { data: latestBook } = await supabase
            .from("books")
            .select("quantity")
            .eq("id", book.id)
            .single();

          const newQuantity =
            (latestBook?.quantity || 0) - (book.quantity || 1);
          await supabase
            .from("books")
            .update({ quantity: newQuantity })
            .eq("id", book.id);
        }
      }

      clearCart();

      // 4. Redirect using the numeric ID (e.g., 181)
      if (data && data.length > 0) {
        router.push(`/receipt/${data[0].id}`);
      }
    } catch (err) {
      console.error(err);
      alert("Error: " + err.message);
      setIsProcessing(false);
    }
  }

  // ... (Keep the same return UI as your working case) ...
  return (
    <Container maxWidth="md" sx={{ mt: 6, mb: 10 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Cart Checkout
      </Typography>
      <Box sx={{ display: "flex", gap: 2, mb: 4, mt: 2 }}>
        <TextField
          label="Buyer Name"
          fullWidth
          variant="outlined"
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
        <Box
          textAlign="center"
          py={10}
          sx={{ border: "2px dashed #ccc", borderRadius: 2 }}
        >
          <Typography color="text.secondary" variant="h6">
            Your cart is empty.
          </Typography>
          <Button sx={{ mt: 2 }} onClick={() => router.push("/")}>
            Return to Shop
          </Button>
        </Box>
      ) : (
        <>
          <List
            sx={{ bgcolor: "background.paper", borderRadius: 2, boxShadow: 1 }}
          >
            {cart.map((item) => {
              const itemDisc = Number(item.discount_amount) || 0;
              const itemOrig = Number(item.total_cost);
              const isExpanded = expandedId === item.cartItemId;
              return (
                <Box key={item.cartItemId}>
                  <ListItem
                    sx={{ py: 2 }}
                    secondaryAction={
                      <Box display="flex" alignItems="center" gap={1}>
                        <Button
                          color="error"
                          size="small"
                          onClick={() => removeFromCart(item.cartItemId)}
                          disabled={isProcessing}
                        >
                          Remove
                        </Button>
                        <IconButton
                          onClick={() => toggleExpand(item.cartItemId)}
                        >
                          {isExpanded ? <ExpandLess /> : <ExpandMore />}
                        </IconButton>
                      </Box>
                    }
                  >
                    <ListItemText
                      primary={
                        item.display_name || `Class ${item.class_grade} Course`
                      }
                      secondary={
                        <Box component="span">
                          <Typography variant="body2" color="text.secondary">
                            Total Items: {item.books.length}
                          </Typography>
                          <Typography
                            variant="body1"
                            fontWeight="bold"
                            color="primary"
                          >
                            PKR {(itemOrig - itemDisc).toLocaleString()}
                          </Typography>
                        </Box>
                      }
                    />
                  </ListItem>
                  <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                    <Box sx={{ pl: 4, pr: 2, pb: 2, bgcolor: "#fafafa" }}>
                      <Typography
                        variant="subtitle2"
                        fontWeight="bold"
                        sx={{ mb: 1 }}
                      >
                        Included Items:
                      </Typography>
                      {item.books.map((book, idx) => (
                        <Box
                          key={idx}
                          display="flex"
                          justifyContent="space-between"
                          sx={{ mb: 0.5 }}
                        >
                          <Typography variant="caption" color="text.secondary">
                            • {book.name} (x{book.quantity || 1})
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            PKR{" "}
                            {(
                              Number(book.price) * (book.quantity || 1)
                            ).toLocaleString()}
                          </Typography>
                        </Box>
                      ))}
                    </Box>
                  </Collapse>
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
              sx={{ minWidth: 250, py: 1.5, fontWeight: "bold" }}
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
