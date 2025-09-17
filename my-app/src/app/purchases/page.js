"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Grid,
} from "@mui/material";

export default function PurchasesPage() {
  const [purchases, setPurchases] = React.useState([]);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    async function fetchPurchases() {
      const { data, error } = await supabase
        .from("purchases")
        .select(`
          id,
          buyer_name,
          amount_paid,
          date,
          books (name)  -- join to books table for book name
        `)
        .order("date", { ascending: false });

      if (error) setError(error.message);
      else setPurchases(data);
    }
    fetchPurchases();
  }, []);

  if (error) {
    return <p>Error loading purchases: {error}</p>;
  }

  if (purchases.length === 0) {
    return (
      <Container sx={{ mt: 6 }}>
        <Typography variant="h6">No purchases recorded yet.</Typography>
      </Container>
    );
  }

  return (
    <Container maxWidth="sm" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Purchases
      </Typography>
      <Grid container spacing={2}>
        {purchases.map((purchase) => (
          <Grid item xs={12} key={purchase.id}>
            <Card>
              <CardContent>
                <Typography variant="h6">
                  {purchase.books?.name || "Unknown Book"}
                </Typography>
                <Typography>
                  Buyer: {purchase.buyer_name}
                </Typography>
                <Typography>
                  Amount Paid: ₹{purchase.amount_paid}
                </Typography>
                <Typography>
                  Date: {new Date(purchase.date).toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
