"use client";
import * as React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Grid,
  List,
  ListItem,
  ListItemText,
  Checkbox,
  Box,
  Divider,
  InputAdornment,
  IconButton,
  Typography,
  Button,
} from "@mui/material";
import { Add, Remove } from "@mui/icons-material";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";

export default function CourseCurriculumDialog({
  open,
  onClose,
  selectedClass,
  books,
  seller,
}) {
  const [buyerName, setBuyerName] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [selectedBooks, setSelectedBooks] = React.useState([]); // [{id, qty}]
  const [courseDefaults, setCourseDefaults] = React.useState([]);

  const queryClient = useQueryClient();
  const { addToCart } = useCart();

  // 1. Fetch Defaults from Supabase when dialog opens
  React.useEffect(() => {
    async function fetchDefaults() {
      const { data, error } = await supabase
        .from("course_defaults")
        .select("*")
        .eq("class_grade", selectedClass);
      if (!error && data) setCourseDefaults(data);
    }
    if (open) fetchDefaults();
  }, [open, selectedClass]);

  // Filter books for the current class
  const classBooks = React.useMemo(
    () => books.filter((b) => b.class_grade === selectedClass),
    [books, selectedClass],
  );

  // 2. Helper to get default qty for an item
  const getDefaultQty = React.useCallback(
    (item) => {
      if (item.Type !== "Copy") return 1;
      const rule = courseDefaults.find((r) =>
        item.name.toLowerCase().includes(r.item_name_pattern.toLowerCase()),
      );
      return rule ? rule.default_qty : 1;
    },
    [courseDefaults],
  );

  // 3. Full Course Data (Calculated with dynamic quantities)
  const fullCourseData = React.useMemo(() => {
    const items = classBooks.map((b) => ({
      id: b.id,
      name: b.name,
      price: b.price,
      qty: getDefaultQty(b),
    }));
    const total = items.reduce(
      (sum, item) => sum + Number(item.price) * item.qty,
      0,
    );
    return { items, total };
  }, [classBooks, getDefaultQty]);

  // Selected Total Calculation
  const currentSelectionTotal = React.useMemo(() => {
    return selectedBooks.reduce((sum, selected) => {
      const book = books.find((b) => b.id === selected.id);
      return sum + (book ? Number(book.price) * selected.qty : 0);
    }, 0);
  }, [selectedBooks, books]);

  // --- Handlers ---
  const toggleBookSelection = (bookId) => {
    setSelectedBooks((prev) => {
      const exists = prev.find((i) => i.id === bookId);
      if (exists) return prev.filter((i) => i.id !== bookId);

      const book = books.find((b) => b.id === bookId);
      return [...prev, { id: bookId, qty: getDefaultQty(book) }];
    });
  };

  const updateItemQty = (bookId, delta, stock) => {
    setSelectedBooks((prev) =>
      prev.map((item) =>
        item.id === bookId
          ? { ...item, qty: Math.max(1, Math.min(stock, item.qty + delta)) }
          : item,
      ),
    );
  };

  const handleBuyCourse = async () => {
    if (!buyerName.trim()) return alert("Enter buyer name.");
    const finalCost = Math.max(0, fullCourseData.total - discount);

    const { error } = await supabase.from("course_sales").insert({
      buyer_name: buyerName,
      class_grade: selectedClass,
      no_of_books: fullCourseData.items.reduce((a, b) => a + b.qty, 0),
      total_cost: fullCourseData.total,
      cost_paid: finalCost,
      discount_applied: discount,
      books_sold: fullCourseData.items,
      date: new Date(),
      sold_by_name: seller?.email || "Unknown",
    });

    if (error) return alert("Error: " + error.message);
    for (const b of fullCourseData.items) {
      const original = books.find((x) => x.id === b.id);
      await supabase
        .from("books")
        .update({ quantity: original.quantity - b.qty })
        .eq("id", b.id);
    }
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(`Full course purchased for PKR ${finalCost}`);
    onClose();
  };

  const handleAddFullCourseToCart = () => {
    addToCart({
      class_grade: selectedClass,
      display_name: `Class ${selectedClass} (Full Course)`,
      total_cost: fullCourseData.total,
      discount_amount: discount,
      is_full_course: true,
      books: fullCourseData.items.map((i) => ({ ...i, quantity: i.qty })),
    });
    alert(`Full course added to cart.`);
    onClose();
  };

  const handleBuySelected = async () => {
    if (!buyerName.trim() || selectedBooks.length === 0)
      return alert("Enter name and select items.");
    const chosen = selectedBooks.map((s) => ({
      ...books.find((b) => b.id === s.id),
      selectedQty: s.qty,
    }));
    const finalCost = Math.max(0, currentSelectionTotal - discount);

    const { error } = await supabase.from("course_sales").insert({
      buyer_name: buyerName,
      class_grade: selectedClass,
      no_of_books: chosen.reduce((a, b) => a + b.selectedQty, 0),
      total_cost: currentSelectionTotal,
      cost_paid: finalCost,
      discount_applied: discount,
      books_sold: chosen.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price,
        qty: b.selectedQty,
      })),
      date: new Date(),
      sold_by_name: seller?.email || "Unknown",
    });

    if (error) return alert("Error: " + error.message);
    for (const b of chosen) {
      await supabase
        .from("books")
        .update({ quantity: b.quantity - b.selectedQty })
        .eq("id", b.id);
    }
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(`Purchased for PKR ${finalCost}`);
    onClose();
  };

  const handleAddSelectedToCart = () => {
    if (selectedBooks.length === 0) return alert("Select books first.");
    const chosen = selectedBooks.map((s) => ({
      ...books.find((b) => b.id === s.id),
      selectedQty: s.qty,
    }));
    addToCart({
      class_grade: selectedClass,
      display_name: `Class ${selectedClass} (Partial)`,
      total_cost: currentSelectionTotal,
      discount_amount: discount,
      is_full_course: false,
      books: chosen.map((b) => ({
        id: b.id,
        name: b.name,
        price: b.price,
        quantity: b.selectedQty,
      })),
    });
    alert("Added to cart.");
    onClose();
  };

  const renderItemList = (type) => {
    const filtered = classBooks.filter((b) => b.Type === type);
    if (filtered.length === 0) return null;
    return (
      <Box sx={{ mb: 2 }}>
        <Typography variant="subtitle1" fontWeight="bold" sx={{ mt: 2, mb: 1 }}>
          {type}s:
        </Typography>
        <List>
          {filtered.map((item) => {
            const isSelected = selectedBooks.some((s) => s.id === item.id);
            const currentQty = isSelected
              ? selectedBooks.find((s) => s.id === item.id)?.qty
              : getDefaultQty(item);

            return (
              <ListItem key={item.id} divider>
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleBookSelection(item.id)}
                  disabled={item.quantity <= 0}
                />
                <ListItemText
                  primary={item.name}
                  secondary={`PKR ${item.price} | Stock: ${item.quantity}`}
                />
                {type !== "Book" && (
                  <Box sx={{ display: "flex", alignItems: "center", mr: 2 }}>
                    <IconButton
                      size="small"
                      onClick={() => updateItemQty(item.id, -1, item.quantity)}
                      disabled={!isSelected}
                    >
                      <Remove fontSize="small" />
                    </IconButton>
                    <Typography sx={{ mx: 1, fontWeight: "bold" }}>
                      {currentQty}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => updateItemQty(item.id, 1, item.quantity)}
                      disabled={!isSelected}
                    >
                      <Add fontSize="small" />
                    </IconButton>
                  </Box>
                )}
              </ListItem>
            );
          })}
        </List>
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: "bold" }}>
        Class {selectedClass} - Curriculum
      </DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={12} md={8}>
            <TextField
              label="Buyer Name"
              value={buyerName}
              onChange={(e) => setBuyerName(e.target.value)}
              fullWidth
              size="small"
            />
          </Grid>
          <Grid item xs={12} md={4}>
            <TextField
              label="Discount"
              type="number"
              value={discount}
              onChange={(e) => setDiscount(Math.max(0, Number(e.target.value)))}
              fullWidth
              size="small"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">PKR</InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        <Box
          sx={{
            p: 2,
            mb: 3,
            bgcolor: "#f9f9f9",
            borderRadius: 2,
            border: "1px solid #eee",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Selected Total: PKR {currentSelectionTotal} | Full Course: PKR{" "}
            {fullCourseData.total}
          </Typography>
          <Typography variant="h6" color="primary" fontWeight="bold">
            Final Payable: PKR{" "}
            {Math.max(
              0,
              (selectedBooks.length > 0
                ? currentSelectionTotal
                : fullCourseData.total) - discount,
            )}
          </Typography>
        </Box>

        {renderItemList("Book")}
        <Divider sx={{ my: 2 }} />
        {renderItemList("Copy")}
      </DialogContent>

      <DialogActions sx={{ p: 3, flexDirection: "column", gap: 1.5 }}>
        <Box display="flex" gap={2} width="100%">
          <Button
            fullWidth
            variant="outlined"
            color="secondary"
            onClick={handleBuySelected}
            disabled={selectedBooks.length === 0}
          >
            Buy Selected ({selectedBooks.length})
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="secondary"
            onClick={handleAddSelectedToCart}
            disabled={selectedBooks.length === 0}
          >
            Add to Cart
          </Button>
        </Box>
        <Divider sx={{ width: "100%", my: 0.5 }} />
        <Box display="flex" gap={2} width="100%">
          <Button
            fullWidth
            variant="outlined"
            color="primary"
            onClick={handleBuyCourse}
          >
            Buy Full Course (PKR {fullCourseData.total})
          </Button>
          <Button
            fullWidth
            variant="contained"
            color="primary"
            onClick={handleAddFullCourseToCart}
          >
            Add Full Course to Cart
          </Button>
        </Box>
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
