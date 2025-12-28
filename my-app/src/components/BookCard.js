"use client";
import React from 'react';
import Link from "next/link";
import { Card, CardContent, Typography } from "@mui/material";

// Optimized with React.memo to prevent unnecessary re-renders
const BookCard = React.memo(function BookCard({ book }) {
  return (
    <Link href={`/book/${book.id}`} style={{ textDecoration: "none" }}>
      <Card sx={{ maxWidth: 300, cursor: "pointer", "&:hover": { boxShadow: 6 } }}>
        <CardContent>
          <Typography variant="h6" component="div">
            {book.name}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Publisher: {book.publisher}
          </Typography>
          {book.class_grade && (
            <Typography variant="body2" color="text.secondary">
              Class/Grade: {book.class_grade}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            Price: {book.price ? `pkr ${book.price}` : "—"}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Stock: {book.quantity}
          </Typography>
        </CardContent>
      </Card>
    </Link>
  );
});

// Custom comparison function for complex props (optional)
const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.book.id === nextProps.book.id &&
    prevProps.book.name === nextProps.book.name &&
    prevProps.book.publisher === nextProps.book.publisher &&
    prevProps.book.class_grade === nextProps.book.class_grade &&
    prevProps.book.price === nextProps.book.price &&
    prevProps.book.quantity === nextProps.book.quantity
  );
};

export default React.memo(BookCard, areEqual);