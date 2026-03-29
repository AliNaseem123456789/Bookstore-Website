"use client";
import React, { useEffect, useState, useMemo, useRef } from "react";
import { useReactToPrint } from "react-to-print";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { Receipt } from "@/components/Receipt";
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
import { supabase } from "@/lib/supabaseClient";
import { useCart } from "@/context/CartContext";

export default function CartPage() {
  const { cart, removeFromCart, clearCart } = useCart();
  const [buyerName, setBuyerName] = useState("");
  const [globalDiscount, setGlobalDiscount] = useState(0);
  const [seller, setSeller] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // State to track which cart item is expanded
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

  const receiptRef = useRef();
  const [showReceipt, setShowReceipt] = useState(false);
  const [recentTransaction, setRecentTransaction] = useState(null);

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
  });

  const handleDownloadPDF = async () => {
    const element = receiptRef.current;
    const canvas = await html2canvas(element);
    const data = canvas.toDataURL("image/png");

    const pdf = new jsPDF();
    const imgProperties = pdf.getImageProperties(data);
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (imgProperties.height * pdfWidth) / imgProperties.width;

    pdf.addImage(data, "PNG", 0, 0, pdfWidth, pdfHeight);
    pdf.save(`receipt-${recentTransaction.id}.pdf`);
  };

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  async function handleCheckout() {
    if (!buyerName.trim()) {
      alert("Please enter the buyer's name.");
      return;
    }

    setIsProcessing(true);
    const transactionId = crypto.randomUUID();

    try {
      for (const item of cart) {
        const itemOriginalTotal = Number(item.total_cost);
        const itemSpecificDiscount = Number(item.discount_amount) || 0;
        const itemSubtotal = itemOriginalTotal - itemSpecificDiscount;

        const discountRatio = subtotal > 0 ? itemSubtotal / subtotal : 0;
        const globalDiscountShare = globalDiscount * discountRatio;

        const finalDiscountApplied = itemSpecificDiscount + globalDiscountShare;
        const finalCostPaid = itemOriginalTotal - finalDiscountApplied;

        // 1. Record Sale
        const { error: saleError } = await supabase
          .from("course_sales")
          .insert({
            transaction_id: transactionId,
            buyer_name: buyerName,
            class_grade: item.class_grade,
            no_of_books: item.books.reduce(
              (sum, b) => sum + (b.quantity || 1),
              0,
            ),
            total_cost: itemOriginalTotal,
            cost_paid: finalCostPaid,
            discount_applied: finalDiscountApplied,
            books_sold: item.books,
            date: new Date(),
            sold_by_name: seller?.email || "Unknown",
          });

        if (saleError) throw saleError;

        // 2. Update Inventory (Corrected for Quantities)
        for (const book of item.books) {
          const { data: latestBook } = await supabase
            .from("books")
            .select("quantity")
            .eq("id", book.id)
            .single();

          const qtyToSubtract = book.quantity || 1;
          const newQuantity = (latestBook?.quantity || 0) - qtyToSubtract;

          await supabase
            .from("books")
            .update({ quantity: newQuantity })
            .eq("id", book.id);
        }
      }

      setRecentTransaction({
        id: transactionId,
        cart: [...cart],
        total: finalTotal,
        buyer: buyerName,
        date: new Date().toLocaleString(),
      });

      setShowReceipt(true);
      clearCart();
      setBuyerName("");
      setGlobalDiscount(0);
    } catch (err) {
      console.error(err);
      alert("Error during checkout: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      {showReceipt ? (
        <Box textAlign="center" sx={{ py: 4 }}>
          <Typography
            variant="h4"
            color="success.main"
            fontWeight="bold"
            gutterBottom
          >
            Purchase Completed!
          </Typography>
          <Typography variant="body1" sx={{ mb: 4 }}>
            Transaction ID: <strong>{recentTransaction?.id}</strong>
          </Typography>

          <Box sx={{ mb: 4, display: "flex", justifyContent: "center" }}>
            <Box
              sx={{
                p: 3,
                border: "1px solid #ddd",
                borderRadius: 2,
                bgcolor: "#fff",
                width: "100%",
                maxWidth: "600px",
              }}
            >
              <Receipt
                ref={receiptRef}
                cart={recentTransaction?.cart || []}
                buyerName={recentTransaction?.buyer}
                total={recentTransaction?.total}
                transactionId={recentTransaction?.id}
                seller={seller?.email || "Unknown"}
              />
            </Box>
          </Box>

          <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
            <Button variant="contained" onClick={handlePrint}>
              Print Receipt
            </Button>
            <Button variant="outlined" onClick={handleDownloadPDF}>
              Download PDF
            </Button>
            <Button variant="text" onClick={() => setShowReceipt(false)}>
              Back to Store
            </Button>
          </Box>
        </Box>
      ) : (
        <>
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
              <Typography color="text.secondary">
                Your cart is empty.
              </Typography>
            </Box>
          ) : (
            <>
              <List
                sx={{
                  bgcolor: "background.paper",
                  borderRadius: 2,
                  boxShadow: 1,
                }}
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
                            item.display_name ||
                            `Class ${item.class_grade} Course`
                          }
                          secondary={
                            <Box component="span">
                              <Typography
                                variant="body2"
                                color="text.secondary"
                              >
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
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                • {book.name} (x{book.quantity || 1})
                              </Typography>
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
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
        </>
      )}
    </Container>
  );
}
