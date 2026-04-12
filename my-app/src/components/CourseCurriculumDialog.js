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
import { supabase } from "../lib/supabaseClient";
import { useQueryClient } from "@tanstack/react-query";
import { useCart } from "../context/CartContext";
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
  const [amountReceived, setAmountReceived] = React.useState(""); // New state
  const [isProcessing, setIsProcessing] = React.useState(false);
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

  const handleManualQtyChange = (bookId, value, stock) => {
    const numValue = parseInt(value, 10);
    const validatedQty = isNaN(numValue) || numValue < 1 ? 1 : numValue;

    setSelectedBooks((prev) =>
      prev.map((item) =>
        item.id === bookId ? { ...item, qty: validatedQty } : item,
      ),
    );
  };
  const updateItemQty = (bookId, delta, stock) => {
    setSelectedBooks((prev) =>
      prev.map((item) =>
        item.id === bookId
          ? { ...item, qty: Math.max(1, item.qty + delta) } // Removed min/max restriction
          : item,
      ),
    );
  };

  const handleClose = () => {
    // Reset all local states
    setBuyerName("");
    setDiscount(0);
    setSelectedBooks([]);
    setAmountReceived("");

    // Call the original onClose prop to close the dialog
    onClose();
  };
  // 1. Calculate the total based on whether items are selected or the full course is being viewed
  const baseTotal =
    selectedBooks.length > 0
      ? currentSelectionTotal
      : isCopiesOnly
        ? 0
        : fullCourseData.total;

  // 2. Define totalAfterDiscount so it's accessible everywhere
  const totalAfterDiscount = Math.max(0, baseTotal - discount);
  const displayPaidAmount =
    amountReceived !== "" ? Number(amountReceived) : totalAfterDiscount;
  // 3. Helper to handle the actual cost paid (credit logic)
  const getPaymentDetails = (total) => {
    const actualPaid = amountReceived === "" ? total : Number(amountReceived);
    const balanceDue = total - actualPaid;
    return {
      actualPaid,
      balanceDue,
      status: balanceDue > 0 ? "pending" : "paid",
    };
  };
  // 1. Unified Helper Function (Keeps logic in one place)
  const processTransactionInventory = async (
    itemsToProcess,
    saleId,
    buyerName,
  ) => {
    for (const item of itemsToProcess) {
      // FORCE TYPE NORMALIZATION: Cast both to Number to ignore String vs Number mismatches
      const bookInStock = books.find((b) => Number(b.id) === Number(item.id));

      // DETAILED LOGGING FOR DEBUGGING
      if (!bookInStock) {
        console.error(
          `INVENTORY MISMATH: Could not find book ID ${item.id} (type: ${typeof item.id})`,
        );
        console.log(
          "Current Books in State:",
          books.map((b) => `${b.id} (${typeof b.id})`),
        );
        continue; // Skip this item instead of crashing the whole transaction
      }

      const available = Number(bookInStock.quantity);
      const requested = Number(item.qty);

      console.log(
        `Processing ID ${item.id}: Req=${requested}, Avail=${available}`,
      );

      // A. Update physical stock
      const amountToDeduct = Math.min(available, requested);
      if (amountToDeduct > 0) {
        const { error: updateError } = await supabase
          .from("books")
          .update({ quantity: available - amountToDeduct })
          .eq("id", Number(bookInStock.id)); // Use the ID from the found object

        if (updateError) console.error("Update Error:", updateError);
      }

      // B. Handle Backorder
      if (requested > available) {
        const { error: backorderError } = await supabase
          .from("backordered_items")
          .insert({
            sale_id: saleId,
            book_id: Number(item.id),
            quantity: requested - available,
            status: "pending",
            buyer_name: buyerName,
          });

        if (backorderError) console.error("Backorder Error:", backorderError);
      }
    }
  };
  // 2. Fixed handleBuyCourse
  const handleBuyCourse = async () => {
    if (!buyerName.trim()) return alert("Enter buyer name.");

    const { actualPaid, balanceDue, status } =
      getPaymentDetails(totalAfterDiscount);

    // Insert Sale
    const { data, error: saleError } = await supabase
      .from("course_sales")
      .insert({
        transaction_id: crypto.randomUUID(),
        is_full_course: true,
        buyer_name: buyerName,
        class_grade: isCopiesOnly ? "Copies" : selectedClass,
        no_of_books: fullCourseData.items.reduce((a, b) => a + b.qty, 0),
        total_cost: fullCourseData.total,
        cost_paid: actualPaid,
        discount_applied: discount,
        payment_status: status,
        balance_due: balanceDue,
        books_sold: fullCourseData.items.map((item) => ({
          ...item,
          quantity: item.qty,
        })),
        date: new Date(),
        sold_by_name: seller?.email || "Unknown",
      })
      .select();

    if (saleError) return alert("Error recording sale: " + saleError.message);

    // Call Helper
    await processTransactionInventory(
      fullCourseData.items,
      data[0].id,
      buyerName,
    );

    await queryClient.invalidateQueries({ queryKey: ["books"] });
    router.push(`/receipt/${data[0].id}`);
    onClose();
  };

  // 3. Fixed handleBuySelect

  const handleBuySelected = async () => {
    // 1. Validation: Ensure required fields exist
    if (isProcessing) return; // Prevent double-execution
    setIsProcessing(true);

    try {
      if (!buyerName.trim()) return alert("Please enter buyer name.");
      if (selectedBooks.length === 0)
        return alert("Please select items first.");

      const totalAfterDiscount = Math.max(0, currentSelectionTotal - discount);
      const actualPaid =
        amountReceived === "" ? totalAfterDiscount : Number(amountReceived);
      const balanceDue = totalAfterDiscount - actualPaid;
      const status = balanceDue > 0 ? "pending" : "paid";

      try {
        // 2. Prepare items with safety check
        const booksToSell = selectedBooks.map((s) => {
          const bookFound = books.find((b) => Number(b.id) === Number(s.id));
          if (!bookFound)
            throw new Error(`Book ID ${s.id} not found in inventory.`);
          return {
            ...bookFound,
            quantity: s.qty,
          };
        });

        // 3. Insert Sale
        const { data, error: saleError } = await supabase
          .from("course_sales")
          .insert({
            transaction_id: crypto.randomUUID(),
            is_full_course: false,
            buyer_name: buyerName,
            class_grade: isCopiesOnly ? "Copies" : selectedClass,
            no_of_books: selectedBooks.reduce((a, b) => a + b.qty, 0),
            total_cost: currentSelectionTotal,
            cost_paid: actualPaid,
            discount_applied: discount,
            payment_status: status,
            balance_due: balanceDue,
            books_sold: booksToSell,
            date: new Date().toISOString(),
            sold_by_name: seller?.email || "Unknown",
          })
          .select();

        if (saleError) {
          console.error(
            "SALE INSERT ERROR:",
            JSON.stringify(saleError, null, 2),
          );
          throw new Error(saleError.message);
        }

        const saleId = data[0].id;
        console.log("Sale recorded successfully. Sale ID:", saleId);

        // 4. Call Helper
        const itemsForInventory = selectedBooks.map((s) => ({
          id: s.id,
          qty: s.qty,
        }));

        await processTransactionInventory(itemsForInventory, saleId, buyerName);

        // 5. Success
        await queryClient.invalidateQueries({ queryKey: ["books"] });
        router.push(`/receipt/${saleId}`);
        onClose();
      } catch (err) {
        console.error("CRITICAL FAILURE:", err);
        alert("Failed to complete sale: " + err.message);
      }
    } catch (err) {
      // ...
    } finally {
      setIsProcessing(false); // Always reset
    }
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
  // 2. Handle Selected Items Purchase

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
            const selection = selectedBooks.find((s) => s.id === item.id);
            const currentQty = isSelected
              ? selection?.qty
              : getDefaultQty(item);

            return (
              <ListItem key={item.id} divider>
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleBookSelection(item.id)}
                  // disabled={item.quantity <= 0}
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
                    onClick={() => updateItemQty(item.id, -1, 9999)} // Allow arbitrary high number
                    disabled={!isSelected || currentQty <= 1}
                  >
                    <Remove fontSize="small" />
                  </IconButton>

                  <TextField
                    variant="standard"
                    size="small"
                    type="number"
                    value={currentQty}
                    disabled={!isSelected}
                    onChange={(e) =>
                      handleManualQtyChange(item.id, e.target.value, 9999)
                    }
                    inputProps={{
                      style: {
                        textAlign: "center",
                        fontWeight: "bold",
                        width: "40px",
                      },
                      min: 1,
                    }}
                    InputProps={{ disableUnderline: true }}
                    sx={{
                      mx: 0.5,
                      bgcolor: isSelected ? "#f0f7ff" : "transparent",
                      borderRadius: "4px",
                    }}
                  />

                  <IconButton
                    size="small"
                    onClick={() => updateItemQty(item.id, 1, 9999)} // Allow arbitrary high number
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
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="md">
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
              label="Amount Received"
              type="number"
              value={amountReceived}
              onChange={(e) => setAmountReceived(e.target.value)}
              fullWidth
              placeholder="Leave blank for full payment"
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">PKR</InputAdornment>
                ),
              }}
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
          <Typography variant="h6" color="primary" fontWeight="bold">
            Total Payable: PKR {totalAfterDiscount}
          </Typography>

          {/* Add this block */}
          {amountReceived !== "" &&
            Number(amountReceived) < totalAfterDiscount && (
              <Box
                sx={{
                  mt: 1,
                  p: 1,
                  bgcolor: "#fff4e5",
                  border: "1px solid #ffa726",
                  borderRadius: 1,
                }}
              >
                <Typography variant="body2" color="warning.main">
                  <strong>Credit Sale:</strong> Buyer will owe PKR{" "}
                  {totalAfterDiscount - Number(amountReceived)}
                </Typography>
              </Box>
            )}
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
                {/* The label now changes based on input */}
                Buy Full Course (PKR {displayPaidAmount})
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
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
