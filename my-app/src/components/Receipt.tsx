"use client";
import { forwardRef } from "react";
import { Box, Divider, Typography } from "@mui/material";
import { monoStack } from "@/theme";
import { num, pkrExact, fullDateTime } from "@/lib/format";

export type ReceiptLine = {
  name: string;
  qty: number;
  unitPrice: number;
  lineDiscount: number;
  lineTotal: number;
  qtyDelivered: number;
  qtyBackordered: number;
  className?: string | null;
  fromFullCourse?: boolean;
};

export type ReceiptSale = {
  code: string;
  buyerName: string;
  buyerPhone?: string | null;
  soldAt: string | Date;
  soldBy: { name: string };
  subtotal: number;
  discountTotal: number;
  grossTotal: number;
  amountReceived: number;
  balanceDue: number;
  returnCredit: number;
  lines: ReceiptLine[];
};

/**
 * An 80mm thermal receipt. Printed width and type size are fixed in
 * millimetres so what the buyer is handed matches what is on screen, and
 * the same component serves a reprint months later.
 */
export const Receipt = forwardRef<HTMLDivElement, { sale: ReceiptSale }>(
  function Receipt({ sale }, ref) {
    const backordered = sale.lines.filter((l) => l.qtyBackordered > 0);

    return (
      <Box
        ref={ref}
        className="receipt"
        sx={{
          width: "80mm",
          maxWidth: "100%",
          mx: "auto",
          p: "6mm 5mm",
          bgcolor: "#fff",
          color: "#000",
          fontFamily: monoStack,
          fontSize: "11px",
          lineHeight: 1.5,
          "@media print": { width: "80mm", p: "4mm 3mm" },
        }}
      >
        <Box sx={{ textAlign: "center", mb: 1.5 }}>
          <Typography sx={{ fontFamily: "inherit", fontSize: "15px", fontWeight: 700, letterSpacing: 1 }}>
            AL-SEHAR ACADEMY
          </Typography>
          <Typography sx={{ fontFamily: "inherit", fontSize: "10px" }}>
            Bookstore &amp; Stationery — Karachi
          </Typography>
        </Box>

        <Divider sx={{ borderStyle: "dashed", borderColor: "#000", my: 1 }} />

        <Row label="Receipt" value={sale.code} />
        <Row label="Date" value={fullDateTime(sale.soldAt)} />
        <Row label="Served by" value={sale.soldBy.name} />
        <Row label="Buyer" value={sale.buyerName.toUpperCase()} />
        {sale.buyerPhone ? <Row label="Phone" value={sale.buyerPhone} /> : null}

        <Divider sx={{ borderStyle: "dashed", borderColor: "#000", my: 1 }} />

        {sale.lines.map((l, i) => (
          <Box key={i} sx={{ mb: 0.75 }}>
            <Typography sx={{ fontFamily: "inherit", fontSize: "11px" }}>
              {l.name}
              {l.fromFullCourse && l.className ? ` (${l.className})` : ""}
            </Typography>
            <Box sx={{ display: "flex", justifyContent: "space-between", pl: 1 }}>
              <span>
                {l.qty} × {num(l.unitPrice)}
                {l.lineDiscount > 0 ? `  −${num(l.lineDiscount)}` : ""}
              </span>
              <span>{num(l.lineTotal)}</span>
            </Box>
            {l.qtyBackordered > 0 ? (
              <Box sx={{ pl: 1, fontSize: "10px" }}>
                {num(l.qtyDelivered)} given now, {num(l.qtyBackordered)} to collect later
              </Box>
            ) : null}
          </Box>
        ))}

        <Divider sx={{ borderStyle: "dashed", borderColor: "#000", my: 1 }} />

        <Row label="Subtotal" value={num(sale.subtotal)} />
        {sale.discountTotal > 0 ? (
          <Row label="Discount" value={`−${num(sale.discountTotal)}`} />
        ) : null}
        {sale.returnCredit > 0 ? (
          <Row label="Returns credited" value={`−${num(sale.returnCredit)}`} />
        ) : null}

        <Box sx={{ display: "flex", justifyContent: "space-between", fontWeight: 700, mt: 0.5 }}>
          <span>TOTAL</span>
          <span>{pkrExact(sale.grossTotal - sale.returnCredit)}</span>
        </Box>
        <Row label="Paid" value={pkrExact(sale.amountReceived)} />
        {sale.balanceDue > 0 ? (
          <Box sx={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
            <span>BALANCE DUE</span>
            <span>{pkrExact(sale.balanceDue)}</span>
          </Box>
        ) : null}

        <Divider sx={{ borderStyle: "dashed", borderColor: "#000", my: 1 }} />

        <Box sx={{ textAlign: "center", fontSize: "10px" }}>
          <div style={{ fontWeight: 700 }}>
            {sale.balanceDue > 0 ? "CREDIT — BALANCE PENDING" : "PAID IN FULL"}
          </div>
          {backordered.length ? (
            <div style={{ marginTop: 4 }}>
              Keep this receipt to collect {backordered.reduce((s, l) => s + l.qtyBackordered, 0)} pending item(s).
            </div>
          ) : null}
          <div style={{ marginTop: 6 }}>Items once sold are not returnable without this receipt.</div>
          <div style={{ marginTop: 4, fontWeight: 700 }}>*** THANK YOU ***</div>
        </Box>
      </Box>
    );
  },
);

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
      <span>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </Box>
  );
}
