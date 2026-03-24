"use client";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import CourseCurriculumDialog from "@/components/CourseCurriculumDialog";

const gradeOrder = [
  "Nursery",
  "KG-1",
  "KG-2",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
];

export default function CoursesPage() {
  const [selectedClass, setSelectedClass] = React.useState(null);
  const [open, setOpen] = React.useState(false);
  const [seller, setSeller] = React.useState(null);

  React.useEffect(() => {
    fetch("/api/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSeller(data.user))
      .catch(console.error);
  }, []);

  const { data: books = [], isLoading } = useQuery({
    queryKey: ["books"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("books")
        .select(`id, name, publisher, class_grade, price, quantity, "Type"`);
      if (error) throw new Error(error.message);
      return data;
    },
    staleTime: 1000 * 60 * 5,
  });

  const classes = [...new Set(books.map((b) => b.class_grade))].sort((a, b) => {
    const indexA = gradeOrder.indexOf(String(a));
    const indexB = gradeOrder.indexOf(String(b));
    return indexA === -1 ? 1 : indexB === -1 ? -1 : indexA - indexB;
  });

  const handleOpenCurriculum = (cls) => {
    setSelectedClass(cls);
    setOpen(true);
  };

  if (isLoading) return <Typography sx={{ p: 4 }}>Loading...</Typography>;

  return (
    <Container maxWidth="lg" sx={{ mt: 6 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Courses
      </Typography>
      <Grid container spacing={3}>
        {classes.map((cls) => (
          <Grid item xs={12} sm={6} md={4} key={cls}>
            <Card elevation={2}>
              <CardContent>
                <Typography variant="h6">Class {cls}</Typography>
                <Typography color="text.secondary">
                  Books: {books.filter((b) => b.class_grade === cls).length}
                </Typography>
                <Button
                  variant="contained"
                  fullWidth
                  sx={{ mt: 2 }}
                  onClick={() => handleOpenCurriculum(cls)}
                >
                  View Curriculum
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <CourseCurriculumDialog
        open={open}
        onClose={() => setOpen(false)}
        selectedClass={selectedClass}
        books={books}
        seller={seller}
      />
    </Container>
  );
}
