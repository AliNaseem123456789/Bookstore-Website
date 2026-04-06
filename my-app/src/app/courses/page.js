"use client";
import * as React from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  Container,
  Typography,
  Card,
  CardContent,
  Button,
  Grid,
  Divider,
  Box,
  Paper,
} from "@mui/material";
import { useQuery } from "@tanstack/react-query";
import CourseCurriculumDialog from "../../components/CourseCurriculumDialog";
import { MenuBook, StickyNote2 } from "@mui/icons-material";

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
  const [isCopiesOnly, setIsCopiesOnly] = React.useState(false);
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

  const handleOpenCurriculum = (cls, onlyCopies = false) => {
    setSelectedClass(cls);
    setIsCopiesOnly(onlyCopies);
    setOpen(true);
  };

  if (isLoading) return <Typography sx={{ p: 4 }}>Loading...</Typography>;

  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 10 }}>
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={4}
      >
        <Typography variant="h4" fontWeight="bold">
          Shop Inventory
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* --- SINGLE GLOBAL COPIES SECTION --- */}
        <Grid item xs={12}>
          <Paper
            elevation={3}
            sx={{
              p: 3,
              mb: 2,
              background: "linear-gradient(45deg, #2e7d32 30%, #4caf50 90%)",
              color: "white",
              borderRadius: 2,
            }}
          >
            <Grid container alignItems="center">
              <Grid item xs={12} md={8}>
                <Box display="flex" alignItems="center" gap={2}>
                  <StickyNote2 fontSize="large" />
                  <Box>
                    <Typography variant="h5" fontWeight="bold">
                      All Stationaries & Copies
                    </Typography>
                    <Typography variant="body2">
                      View and sell all available copies across all grades
                    </Typography>
                  </Box>
                </Box>
              </Grid>
              <Grid
                item
                xs={12}
                md={4}
                sx={{
                  textAlign: { md: "right", xs: "left" },
                  mt: { xs: 2, md: 0 },
                }}
              >
                <Button
                  variant="contained"
                  color="inherit"
                  sx={{ color: "#2e7d32", fontWeight: "bold" }}
                  onClick={() => handleOpenCurriculum("All", true)}
                >
                  Open Copies Inventory
                </Button>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        {/* --- CLASS WISE FULL COURSES --- */}
        <Grid item xs={12}>
          <Typography variant="h6" fontWeight="bold" sx={{ mt: 2, mb: 2 }}>
            Class Courses
          </Typography>
        </Grid>

        {classes.map((cls) => (
          <Grid item xs={12} sm={6} md={4} key={cls}>
            <Card elevation={2}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <MenuBook color="primary" />
                  <Typography variant="h6">Class {cls}</Typography>
                </Box>
                <Typography color="text.secondary" variant="body2">
                  Full curriculum set for Grade {cls}
                </Typography>
                <Button
                  variant="outlined"
                  fullWidth
                  sx={{ mt: 2 }}
                  onClick={() => handleOpenCurriculum(cls, false)}
                >
                  View Full Course
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
        isCopiesOnly={isCopiesOnly} // Passing this new prop
        books={books}
        seller={seller}
      />
    </Container>
  );
}
