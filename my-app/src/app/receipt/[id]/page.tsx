"use client";
import { use, useRef } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert, Box, Button, CircularProgress, Stack } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";
import { api } from "@/lib/api";
import { Receipt, type ReceiptSale } from "@/components/Receipt";
import { palette } from "@/theme";

export default function ReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const ref = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["sale", id],
    queryFn: () => api.get<{ sale: ReceiptSale }>(`/api/sales/${id}`),
  });

  if (isLoading) {
    return (
      <Box sx={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Box sx={{ maxWidth: 480, mx: "auto", mt: 8, px: 2 }}>
        <Alert severity="error">
          {error instanceof Error ? error.message : "That receipt could not be opened."}
        </Alert>
        <Button component={Link} href="/pos" sx={{ mt: 2 }}>
          Back to the till
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ bgcolor: palette.paper, minHeight: "100vh", py: 3 }}>
      <Stack
        direction="row"
        spacing={1}
        justifyContent="center"
        className="no-print"
        sx={{ mb: 2 }}
      >
        <Button variant="contained" startIcon={<PrintIcon />} onClick={() => window.print()}>
          Print
        </Button>
        <Button component={Link} href="/pos" variant="outlined">
          New sale
        </Button>
        <Button component={Link} href={`/sales?search=${data.sale.code}`} color="inherit">
          Sale details
        </Button>
      </Stack>

      <Box
        sx={{
          bgcolor: "#fff",
          width: "fit-content",
          mx: "auto",
          border: `1px solid ${palette.rule}`,
          "@media print": { border: "none" },
        }}
      >
        <Receipt ref={ref} sale={data.sale} />
      </Box>
    </Box>
  );
}
