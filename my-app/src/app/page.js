import { supabase } from "@/lib/supabaseClient";
import BookCard from "@/components/BookCard";
import { Container, Typography, Button, Grid } from "@mui/material";
import Link from "next/link";

export default async function Home() {
  const { data: books, error } = await supabase.from("books").select("*");

  if (error) {
    console.error("Error fetching books:", error.message);
    return <p>Error loading books</p>;
  }

  return (
    <Container maxWidth="lg" sx={{ mt: 4, mb: 6 }}>
      {/* Header */}
      <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Typography variant="h4" fontWeight="bold">
          📚 Bookstore
        </Typography>
        <Link href="/add-book">
          <Button variant="contained" color="primary">
            ➕ Add Book
          </Button>
        </Link>
      </Grid>

      {/* Books Grid */}
      <Grid container spacing={4}>
        {books?.map((book) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={book.id}>
            <BookCard book={book} />
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
