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
import { Add, Remove, DoneAll, RemoveDone } from "@mui/icons-material";
import { supabase } from "@/lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "@/context/CartContext";
import { useRouter } from "next/navigation";
export default function CourseCurriculumDialog({
  open,
  onClose,
  isCopiesOnly,
  selectedClass,
  books,
  seller,
}) {
  const [buyerName, setBuyerName] = React.useState("");
  const [discount, setDiscount] = React.useState(0);
  const [selectedBooks, setSelectedBooks] = React.useState([]);
  const [courseDefaults, setCourseDefaults] = React.useState([]);
  const [classMap, setClassMap] = React.useState([]);
  const queryClient = useQueryClient();
  const { addToCart } = useCart();
  const router = useRouter();
  React.useEffect(() => {
    async function fetchData() {
      const [defRes, mapRes] = await Promise.all([
        supabase
          .from("course_defaults")
          .select("*")
          .eq("class_grade", selectedClass),
        supabase
          .from("class_item_map")
          .select("book_id")
          .eq("class_grade", selectedClass),
      ]);
      if (defRes.data) setCourseDefaults(defRes.data);
      if (mapRes.data) setClassMap(mapRes.data.map((m) => m.book_id));
    }
    if (open && !isCopiesOnly) fetchData();
  }, [open, selectedClass, isCopiesOnly]);
  const displayItems = React.useMemo(() => {
    if (isCopiesOnly) return books.filter((b) => b.Type === "Copy");
    return books.filter((b) => classMap.includes(b.id));
  }, [books, classMap, isCopiesOnly]);
  const title = isCopiesOnly
    ? "All Copies Inventory"
    : `Class ${selectedClass} - Curriculum`;
  const getDefaultQty = React.useCallback(
    (item) => {
      if (isCopiesOnly) return 0;
      if (item.Type !== "Copy") return 1;
      const rule = courseDefaults.find((r) =>
        item.name.toLowerCase().includes(r.item_name_pattern.toLowerCase()),
      );
      return rule ? rule.default_qty : 1;
    },
    [courseDefaults, isCopiesOnly],
  );
  const fullCourseData = React.useMemo(() => {
    const items = displayItems.map((b) => ({
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
  }, [displayItems, getDefaultQty]);
  const currentSelectionTotal = React.useMemo(() => {
    return selectedBooks.reduce((sum, selected) => {
      const book = books.find((b) => b.id === selected.id);
      return sum + (book ? Number(book.price) * selected.qty : 0);
    }, 0);
  }, [selectedBooks, books]);
  const handleBulkSelect = (type, action) => {
    const itemsOfType = displayItems.filter(
      (b) => b.Type === type && b.quantity > 0,
    );
    const itemIds = itemsOfType.map((b) => b.id);

    if (action === "select") {
      setSelectedBooks((prev) => {
        const otherTypes = prev.filter((item) => !itemIds.includes(item.id));
        const newSelections = itemsOfType.map((item) => ({
          id: item.id,
          qty: isCopiesOnly ? 1 : getDefaultQty(item),
        }));
        return [...otherTypes, ...newSelections];
      });
    } else {
      setSelectedBooks((prev) =>
        prev.filter((item) => !itemIds.includes(item.id)),
      );
    }
  };
  const toggleBookSelection = (bookId) => {
    setSelectedBooks((prev) => {
      const exists = prev.find((i) => i.id === bookId);
      if (exists) return prev.filter((i) => i.id !== bookId);
      const book = books.find((b) => b.id === bookId);
      const startQty = isCopiesOnly ? 1 : getDefaultQty(book);
      return [...prev, { id: bookId, qty: startQty }];
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
    const transactionId = crypto.randomUUID();

    const { data, error: saleError } = await supabase
      .from("course_sales")
      .insert({
        transaction_id: transactionId,
        is_full_course: true,
        buyer_name: buyerName,
        class_grade: isCopiesOnly ? "Copies" : selectedClass,
        no_of_books: fullCourseData.items.reduce((a, b) => a + b.qty, 0),
        total_cost: fullCourseData.total,
        cost_paid: finalCost,
        discount_applied: discount,
        // CHANGE: Map qty to quantity so the Receipt component recognizes it
        books_sold: fullCourseData.items.map((item) => ({
          ...item,
          quantity: item.qty,
        })),
        date: new Date(),
        sold_by_name: seller?.email || "Unknown",
      })
      .select();
    if (saleError) return alert("Error recording sale: " + saleError.message);
    for (const item of fullCourseData.items) {
      const currentInInventory = books.find((b) => b.id === item.id);
      await supabase
        .from("books")
        .update({ quantity: currentInInventory.quantity - item.qty })
        .eq("id", item.id);
    }
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    alert(`Purchase successful for PKR ${finalCost}`);
    router.push(`/receipt/${transactionId}`);
    onClose();
  };
  const handleAddFullCourseToCart = () => {
    addToCart({
      class_grade: isCopiesOnly ? "Copies" : selectedClass,
      display_name: isCopiesOnly
        ? "All Copies Bulk"
        : `Class ${selectedClass} (Full Course)`,
      total_cost: fullCourseData.total,
      discount_amount: discount,
      is_full_course: !isCopiesOnly,
      books: fullCourseData.items.map((i) => ({ ...i, quantity: i.qty })),
    });
    alert(`Added to cart.`);
    onClose();
  };
  const handleBuySelected = async () => {
    if (!buyerName.trim() || selectedBooks.length === 0)
      return alert("Enter name and select items.");
    const finalCost = Math.max(0, currentSelectionTotal - discount);
    const transactionId = crypto.randomUUID();
    const { error: saleError } = await supabase.from("course_sales").insert({
      transaction_id: transactionId,
      is_full_course: false,
      buyer_name: buyerName,
      class_grade: isCopiesOnly ? "Copies" : selectedClass,
      no_of_books: selectedBooks.reduce((a, b) => a + b.qty, 0),
      total_cost: currentSelectionTotal,
      cost_paid: finalCost,
      discount_applied: discount,
      books_sold: selectedBooks.map((s) => {
        const bookData = books.find((b) => b.id === s.id);
        return {
          ...bookData,
          quantity: s.qty,
        };
      }),
      date: new Date(),
      sold_by_name: seller?.email || "Unknown",
    });
    if (saleError) return alert("Error: " + saleError.message);
    for (const s of selectedBooks) {
      const currentInInventory = books.find((b) => b.id === s.id);
      if (currentInInventory) {
        await supabase
          .from("books")
          .update({ quantity: currentInInventory.quantity - s.qty })
          .eq("id", s.id);
      }
    }
    await queryClient.invalidateQueries({ queryKey: ["books"] });
    router.push(`/receipt/${transactionId}`);
    onClose();
  };
  const handleAddSelectedToCart = () => {
    if (selectedBooks.length === 0) return alert("Select items first.");
    addToCart({
      class_grade: isCopiesOnly ? "Copies" : selectedClass,
      display_name: isCopiesOnly
        ? "Selected Copies"
        : `Class ${selectedClass} (Partial)`,
      total_cost: currentSelectionTotal,
      discount_amount: discount,
      is_full_course: false,
      books: selectedBooks.map((s) => ({
        ...books.find((b) => b.id === s.id),
        quantity: s.qty,
      })),
    });
    alert("Added to cart.");
    onClose();
  };
  const renderItemList = (type) => {
    const filtered = displayItems.filter((b) => b.Type === type);
    if (filtered.length === 0) return null;

    const allInTypeSelected = filtered.every(
      (item) =>
        item.quantity <= 0 || selectedBooks.some((s) => s.id === item.id),
    );

    return (
      <Box sx={{ mb: 3 }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mt: 2,
            mb: 1,
          }}
        >
          <Typography variant="subtitle1" fontWeight="bold">
            {type}s:
          </Typography>
          <Box>
            {allInTypeSelected ? (
              <Button
                size="small"
                startIcon={<RemoveDone />}
                color="error"
                onClick={() => handleBulkSelect(type, "deselect")}
              >
                Deselect All {type}s
              </Button>
            ) : (
              <Button
                size="small"
                startIcon={<DoneAll />}
                onClick={() => handleBulkSelect(type, "select")}
              >
                Select All {type}s
              </Button>
            )}
          </Box>
        </Box>
        <List
          sx={{ bgcolor: "#fff", borderRadius: 1, border: "1px solid #eee" }}
        >
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
                  secondary={
                    isCopiesOnly
                      ? `PKR ${item.price} | Stock: ${item.quantity} | Class: ${item.class_grade}`
                      : `PKR ${item.price} | Stock: ${item.quantity}`
                  }
                />
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
              </ListItem>
            );
          })}
        </List>
      </Box>
    );
  };
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle sx={{ fontWeight: "bold" }}>{title}</DialogTitle>
      <DialogContent dividers sx={{ bgcolor: "#fcfcfc" }}>
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
            mb: 1,
            bgcolor: "#fff",
            borderRadius: 2,
            border: "2px solid #1976d2",
          }}
        >
          <Typography variant="body2" color="text.secondary">
            Selected Total: PKR {currentSelectionTotal}
            {!isCopiesOnly && ` | Course Total: PKR ${fullCourseData.total}`}
          </Typography>
          <Typography variant="h6" color="primary" fontWeight="bold">
            Payable: PKR{" "}
            {Math.max(
              0,
              (selectedBooks.length > 0
                ? currentSelectionTotal
                : isCopiesOnly
                  ? 0
                  : fullCourseData.total) - discount,
            )}
          </Typography>
        </Box>
        {!isCopiesOnly && renderItemList("Book")}
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

        {!isCopiesOnly && (
          <>
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
          </>
        )}
        <Button onClick={onClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
