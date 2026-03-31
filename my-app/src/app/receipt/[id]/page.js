"use client";
import React, { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useReactToPrint } from "react-to-print";
import { Receipt } from "@/components/Receipt";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  Box,
  Typography,
  Button,
  CircularProgress,
} from "@mui/material";

export default function ReceiptPage() {
  const { id } = useParams(); // Get transaction_id from URL
  const router = useRouter();
  const [transactionData, setTransactionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const receiptRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: receiptRef,
  });

  useEffect(() => {
    async function fetchTransaction() {
      // Fetching all records associated with this transaction ID
      const { data, error } = await supabase
        .from("course_sales")
        .select("*")
        .eq("transaction_id", id);

      if (error || !data || data.length === 0) {
        console.error("Receipt not found");
        setLoading(false);
        return;
      }

      // Formatting the data for the Receipt component
      const firstRecord = data[0];
      const formattedData = {
        id: id,
        buyer: firstRecord.buyer_name,
        date: new Date(firstRecord.date).toLocaleString(),
        seller: firstRecord.sold_by_name,
        cart: data.map((item) => ({
          display_name: `Class ${item.class_grade}`,
          // Ensure this contains the array of books actually saved during checkout
          books_sold: item.books_sold,
          total_cost: item.total_cost,
          discount_amount: item.discount_applied,
        })),
        total: data.reduce((sum, item) => sum + Number(item.cost_paid), 0),
      };

      setTransactionData(formattedData);
      setLoading(false);
    }

    if (id) fetchTransaction();
  }, [id]);

  if (loading)
    return (
      <Box textAlign="center" mt={10}>
        <CircularProgress />
      </Box>
    );

  if (!transactionData) {
    return (
      <Container maxWidth="sm" sx={{ mt: 10, textAlign: "center" }}>
        <Typography variant="h5" color="error">
          Receipt Not Found
        </Typography>
        <Button onClick={() => router.push("/")}>Go to Shop</Button>
      </Container>
    );
  }

  return (
    <Container maxWidth="md" sx={{ mt: 6 }}>
      <Box textAlign="center" sx={{ py: 4 }}>
        <Typography
          variant="h4"
          color="success.main"
          fontWeight="bold"
          gutterBottom
        >
          Purchase Completed!
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
              cart={transactionData.cart}
              buyerName={transactionData.buyer}
              total={transactionData.total}
              transactionId={transactionData.id}
              seller={transactionData.seller}
            />
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 2, justifyContent: "center" }}>
          <Button variant="contained" onClick={handlePrint}>
            Print Receipt
          </Button>
          <Button variant="outlined" onClick={() => router.push("/")}>
            Back to Store
          </Button>
        </Box>
      </Box>
    </Container>
  );
}
