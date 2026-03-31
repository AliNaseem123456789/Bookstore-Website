import React, { forwardRef } from "react";
import { Box, Typography, Divider } from "@mui/material";

export const Receipt = forwardRef(
  ({ cart, buyerName, total, transactionId, seller }, ref) => {
    return (
      <Box
        ref={ref}
        sx={{
          p: 4,
          bgcolor: "white",
          color: "black",
          fontFamily: "'Courier New', Courier, monospace",
          maxWidth: "500px",
          margin: "0 auto",
          border: "1px solid #eee",
        }}
      >
        {/* Header */}
        <Box textAlign="center" mb={3}>
          <Typography variant="h5" fontWeight="bold" sx={{ letterSpacing: 2 }}>
            AL-SEHAR ACADEMY
          </Typography>
          <Typography variant="body2">Bookstore & Stationery</Typography>
          <Typography variant="caption">Karachi, Pakistan</Typography>
        </Box>

        <Divider sx={{ borderStyle: "dashed", my: 1 }} />

        {/* Transaction Info */}
        <Box sx={{ mb: 2 }}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption">
              TRANS ID: {transactionId?.slice(0, 8)}
            </Typography>
            <Typography variant="caption">
              {new Date().toLocaleDateString()}
            </Typography>
          </Box>
          <Typography variant="caption" display="block">
            CASHIER: {seller?.split("@")[0].toUpperCase() || "ADMIN"}
          </Typography>
          <Typography variant="caption" display="block">
            CUSTOMER: {buyerName.toUpperCase()}
          </Typography>
        </Box>

        <Divider sx={{ borderStyle: "dashed", mb: 2 }} />

        {/* Items List */}
        <Box>
          {cart.map((item, i) => (
            <Box key={i} sx={{ mb: 2 }}>
              {/* Course Header & Price Summary */}
              <Box display="flex" justifyContent="space-between">
                <Typography variant="body2" fontWeight="bold">
                  {item.display_name.toUpperCase()}
                </Typography>
                {/* Only show price here if it's a full course to keep header clean */}
                {item.is_full_course && (
                  <Typography variant="body2" fontWeight="bold">
                    {Number(item.total_cost || item.price).toLocaleString()}
                  </Typography>
                )}
              </Box>

              {/* Individual Books: Only Render if NOT a Full Course */}
              {!item.is_full_course && item.books_sold && (
                <Box sx={{ mt: 1 }}>
                  {item.books_sold.map((book, bIdx) => {
                    const isSold = book.quantity > 0;
                    const unitPrice = Number(book.price) || 0;
                    const lineTotal = unitPrice * (book.quantity || 0);

                    return (
                      <Box
                        key={bIdx}
                        sx={{
                          display: "flex",
                          justifyContent: "space-between",
                          pl: 1,
                          mt: 0.5,
                          opacity: isSold ? 1 : 0.4,
                        }}
                      >
                        <Box sx={{ flex: 1 }}>
                          <Typography
                            variant="caption"
                            sx={{
                              textDecoration: isSold ? "none" : "line-through",
                            }}
                          >
                            - {book.name}
                          </Typography>
                          {isSold && (
                            <Typography
                              variant="caption"
                              display="block"
                              sx={{ fontSize: "0.65rem", color: "#666" }}
                            >
                              {book.quantity} x {unitPrice.toLocaleString()}
                            </Typography>
                          )}
                        </Box>
                        <Typography
                          variant="caption"
                          sx={{ alignSelf: "flex-end" }}
                        >
                          {isSold ? lineTotal.toLocaleString() : "SKIPPED"}
                        </Typography>
                      </Box>
                    );
                  })}
                </Box>
              )}

              {/* Course Discount (if any) */}
              {Number(item.discount_amount) > 0 && (
                <Box
                  display="flex"
                  justifyContent="space-between"
                  pl={1}
                  sx={{ color: "red", mt: 0.5 }}
                >
                  <Typography variant="caption">COURSE DISCOUNT</Typography>
                  <Typography variant="caption">
                    -{Number(item.discount_amount).toLocaleString()}
                  </Typography>
                </Box>
              )}
            </Box>
          ))}
        </Box>

        <Divider sx={{ borderStyle: "dashed", my: 2 }} />

        {/* Totals Section */}
        <Box sx={{ px: 1 }}>
          <Box display="flex" justifyContent="space-between" mb={0.5}>
            <Typography variant="body2" fontWeight="bold">
              NET PAYABLE
            </Typography>
            <Typography variant="body2" fontWeight="bold">
              PKR {total?.toLocaleString()}
            </Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption">PAYMENT MODE</Typography>
            <Typography variant="caption">CASH</Typography>
          </Box>
        </Box>

        <Divider sx={{ borderStyle: "dashed", mt: 3, mb: 1 }} />

        {/* Footer */}
        <Box textAlign="center" mt={2}>
          <Typography
            variant="caption"
            sx={{ display: "block", fontWeight: "bold" }}
          >
            *** THANK YOU ***
          </Typography>
          <Typography variant="caption" sx={{ fontSize: "0.6rem" }}>
            Items once sold are not returnable.
          </Typography>
        </Box>
      </Box>
    );
  },
);

Receipt.displayName = "Receipt";
