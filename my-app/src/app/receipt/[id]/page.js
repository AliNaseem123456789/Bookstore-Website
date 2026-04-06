"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { Receipt } from "../../../components/Receipt";
import { supabase } from "../../../lib/supabaseClient";
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

        // 1. Calculate the math across all items in this transaction
        const totalGross = allItems.reduce(
          (sum, item) => sum + Number(item.total_cost || 0),
          0,
        );
        const totalPaid = allItems.reduce(
          (sum, item) => sum + Number(item.cost_paid || 0),
          0,
        );
        const totalBalance = allItems.reduce(
          (sum, item) => sum + Number(item.balance_due || 0),
          0,
        );
        const totalDiscount = allItems.reduce(
          (sum, item) => sum + Number(item.discount_applied || 0),
          0,
        );

        setTransactionData({
          receiptNumber: id,
          buyer: base.buyer_name,
          seller: base.sold_by_name,
          // 2. Create a summary object to pass to the Receipt
          summary: {
            gross: totalGross,
            paid: totalPaid,
            balance: totalBalance,
            discount: totalDiscount,
            payable: totalGross - totalDiscount,
          },
          cart: allItems.map((item) => ({
            display_name:
              item.class_grade === "Copies"
                ? "Bulk Copies"
                : `Class ${item.class_grade} Course`,
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
        summary={transactionData.summary} // Updated this
        transactionId={transactionData.receiptNumber}
        seller={transactionData.seller}
      />
    </Container>
  );
}
