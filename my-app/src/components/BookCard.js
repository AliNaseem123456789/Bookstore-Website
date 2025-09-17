"use client";
import Link from "next/link";
import { Card, CardContent, Typography, Button } from "@mui/material";

export default function BookCard({ book }) {
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
}
