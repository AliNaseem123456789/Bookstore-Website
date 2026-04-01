"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Receipt } from "@/components/Receipt";
import { supabase } from "@/lib/supabaseClient";
import { Container, Box, CircularProgress, Typography } from "@mui/material";

export default function ReceiptPage() {
  const { id } = useParams(); // This is the numeric ID from the URL
  const [transactionData, setTransactionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef();

  useEffect(() => {
    async function fetchFullTransaction() {
      // 1. Get the transaction_id (UUID) for this numeric ID
      const { data: firstItem, error } = await supabase
        .from("course_sales")
        .select("transaction_id")
        .eq("id", id)
        .single();

      if (error || !firstItem) {
        setLoading(false);
        return;
      }

      // 2. Get EVERY item that shares that same UUID
      const { data: allItems } = await supabase
        .from("course_sales")
        .select("*")
        .eq("transaction_id", firstItem.transaction_id);

      if (allItems && allItems.length > 0) {
        const base = allItems[0];
        setTransactionData({
          receiptNumber: id,
          buyer: base.buyer_name,
          seller: base.sold_by_name,
          total: allItems.reduce(
            (sum, item) => sum + Number(item.cost_paid),
            0,
          ),
          cart: allItems.map((item) => ({
            display_name: `Class ${item.class_grade} Course`,
            books_sold: item.books_sold,
            total_cost: item.total_cost,
            discount_amount: item.discount_applied,
            is_full_course: item.is_full_course,
          })),
        });
      }
      setLoading(false);
    }
    fetchFullTransaction();
  }, [id]);

  if (loading)
    return (
      <Box textAlign="center" mt={10}>
        <CircularProgress />
      </Box>
    );
  if (!transactionData)
    return (
      <Typography align="center" mt={10}>
        Receipt not found.
      </Typography>
    );

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Receipt
        ref={receiptRef}
        cart={transactionData.cart}
        buyerName={transactionData.buyer}
        total={transactionData.total}
        transactionId={transactionData.receiptNumber} // Shows "181" instead of UUID
        seller={transactionData.seller}
      />
    </Container>
  );
}
