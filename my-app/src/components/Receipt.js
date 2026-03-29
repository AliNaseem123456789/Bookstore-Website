// components/Receipt.js
import React, { forwardRef } from "react";
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@mui/material";

export const Receipt = forwardRef(
  ({ cart, buyerName, total, transactionId, seller }, ref) => {
    return (
      <Box ref={ref} sx={{ p: 4, bgcolor: "white", color: "black" }}>
        <Typography variant="h5" textAlign="center" gutterBottom>
          OFFICIAL RECEIPT
        </Typography>
        <Typography variant="body2">ID: {transactionId}</Typography>
        <Typography variant="body2">
          Date: {new Date().toLocaleString()}
        </Typography>
        <Typography variant="body2">Buyer: {buyerName}</Typography>
        <Typography variant="body2">Seller: {seller}</Typography>

        <Box sx={{ my: 3 }}>
          <Table size="small">
            <TableBody>
              {cart.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.display_name}</TableCell>
                  <TableCell align="right">
                    PKR{" "}
                    {Number(item.total_cost) -
                      (Number(item.discount_amount) || 0)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <strong>Final Total</strong>
                </TableCell>
                <TableCell align="right">
                  <strong>PKR {total}</strong>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Box>
        <Typography variant="caption" display="block" textAlign="center">
          Thank you for your purchase!
        </Typography>
      </Box>
    );
  },
);
