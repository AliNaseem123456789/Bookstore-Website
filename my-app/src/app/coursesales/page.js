"use client";
import * as React from "react";
import { supabase } from "../../lib/supabaseClient";
import {
  Container,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Paper,
  CircularProgress,
  IconButton,
  Collapse,
  Box,
  Skeleton,
  Chip,
  Divider,
  List,
  TextField,
  InputAdornment,
} from "@mui/material";
import { FormControl, InputLabel, Select, MenuItem } from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Download,
  Search,
} from "@mui/icons-material";
import { format } from "date-fns";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 40;

// Add 'seller' to the arguments
async function fetchSales({ pageParam = 0, filter = "all", seller = "all" }) {
  let query = supabase
    .from("course_sales")
    .select(
      "id, transaction_id, buyer_name, sold_by_name, class_grade, no_of_books, total_cost, cost_paid, discount_applied, date, books_sold, payment_status, balance_due",
    );

  // Apply existing filters
  if (filter === "discounted") query = query.gt("discount_applied", 0);
  if (filter === "pending") query = query.eq("payment_status", "pending");

  // NEW: Apply Seller Filter if one is selected
  if (seller !== "all") {
    query = query.eq("sold_by_name", seller);
  }

  const { data, error } = await query
    .order("date", { ascending: false })
    .range(pageParam, pageParam + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);
  return {
    data,
    nextPage: pageParam + PAGE_SIZE,
    hasMore: data.length === PAGE_SIZE,
  };
}
// Fetcher for searching (gets all matches at once)
async function searchSales(name, filter) {
  // Added filter param
  if (!name) return [];
  let query = supabase
    .from("course_sales")
    .select(
      "id, transaction_id, buyer_name, sold_by_name, class_grade, no_of_books, total_cost, cost_paid, discount_applied, date, books_sold, payment_status",
    )
    .ilike("buyer_name", `%${name}%`);

  // APPLY FILTER HERE TOO
  if (filter === "discounted") {
    query = query.gt("discount_applied", 0);
  } else if (filter === "pending") {
    query = query.eq("payment_status", "pending");
  }

  const { data, error } = await query.order("date", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
// NEW: Add this function to fetch unique seller names from the DB
async function fetchUniqueSellers() {
  const { data, error } = await supabase
    .from("course_sales")
    .select("sold_by_name");

  if (error) throw new Error(error.message);

  // Extract names, remove duplicates using Set, and filter out nulls
  const uniqueSellers = [
    ...new Set(data.map((item) => item.sold_by_name)),
  ].filter(Boolean);

  return uniqueSellers;
}

export default function CourseSalesPage() {
  const [openRows, setOpenRows] = React.useState({});
  const [searchQuery, setSearchQuery] = React.useState("");
  const [filter, setFilter] = React.useState("all");
  // 1. Infinite Query for normal history
  const [selectedSeller, setSelectedSeller] = React.useState("all");

  // NEW: Fetch the list of unique sellers
  const { data: sellersList = [] } = useQuery({
    queryKey: ["unique_sellers"],
    queryFn: fetchUniqueSellers,
  });
  const {
    data: infiniteData,
    error: infiniteError,
    isLoading: isInfiniteLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["course_sales", filter, selectedSeller], // This triggers the refetch when filter changes
    queryFn: ({ pageParam }) =>
      fetchSales({ pageParam, filter, seller: selectedSeller }), // PASS FILTER HERE
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
    enabled: searchQuery.trim() === "",
  });
  const { data: searchData, isLoading: isSearchLoading } = useQuery({
    queryKey: ["course_sales_search", searchQuery, filter], // Add filter to key
    queryFn: () => searchSales(searchQuery, filter), // Pass filter to fn
    enabled: searchQuery.trim().length > 0,
  });

  // 3. Unified logic to group data regardless of source
  const displaySales = React.useMemo(() => {
    // Decide which source to use
    const rawData =
      searchQuery.trim().length > 0
        ? (searchData ?? [])
        : (infiniteData?.pages.flatMap((page) => page.data) ?? []);

    const groups = {};

    rawData.forEach((item) => {
      const key = item.transaction_id || `single-${item.id}`;

      if (!groups[key]) {
        groups[key] = {
          ...item,
          course_details: [
            {
              class_grade: item.class_grade,
              books: item.books_sold || [],
              subtotal: Number(item.total_cost),
              discount: Number(item.discount_applied),
            },
          ],
          total_sum: Number(item.total_cost),
          paid_sum: Number(item.cost_paid),
          discount_sum: Number(item.discount_applied),
          items_count: 1,
        };
      } else {
        groups[key].course_details.push({
          class_grade: item.class_grade,
          books: item.books_sold || [],
          subtotal: Number(item.total_cost),
          discount: Number(item.discount_applied),
        });
        groups[key].total_sum += Number(item.total_cost);
        groups[key].paid_sum += Number(item.cost_paid);
        groups[key].discount_sum += Number(item.discount_applied);
        groups[key].items_count += 1;
      }
    });

    return Object.values(groups);
  }, [infiniteData, searchData, searchQuery]);

  const isLoading =
    searchQuery.trim() !== "" ? isSearchLoading : isInfiniteLoading;

  const downloadPDF = (sale) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("SALES RECEIPT", 14, 20);
    doc.setFontSize(10);
    doc.text(`Receipt No: ${sale.id}`, 14, 30);
    doc.text(
      `Date: ${format(new Date(sale.date), "dd MMMM yyyy, hh:mm a")}`,
      14,
      35,
    );
    doc.text(`Buyer: ${sale.buyer_name}`, 14, 40);
    doc.text(`Seller: ${sale.sold_by_name || "N/A"}`, 14, 45);

    const tableRows = [];
    sale.course_details.forEach((course) => {
      tableRows.push([
        {
          content: `Class: ${course.class_grade}`,
          colSpan: 2,
          styles: { fillColor: [240, 240, 240], fontStyle: "bold" },
        },
      ]);
      course.books.forEach((book) => {
        tableRows.push([book.name, `PKR ${book.price.toLocaleString()}`]);
      });
    });

    autoTable(doc, {
      startY: 55,
      head: [["Description", "Amount"]],
      body: [
        ...tableRows,
        [
          { content: "Total Gross", styles: { fontStyle: "bold" } },
          `PKR ${sale.total_sum.toLocaleString()}`,
        ],
        [
          {
            content: "Total Discount",
            styles: { fontStyle: "bold", textColor: [255, 0, 0] },
          },
          `-PKR ${sale.discount_sum.toLocaleString()}`,
        ],
        [
          {
            content: "Final Paid",
            styles: { fontStyle: "bold", fillColor: [230, 230, 230] },
          },
          `PKR ${sale.paid_sum.toLocaleString()}`,
        ],
      ],
    });

    doc.save(
      `Receipt_${sale.buyer_name}_${format(new Date(sale.date), "yyyyMMdd")}.pdf`,
    );
  };

  const toggleRow = (id) =>
    setOpenRows((prev) => ({ ...prev, [id]: !prev[id] }));

  if (infiniteError)
    return (
      <Typography color="error">Error: {infiniteError.message}</Typography>
    );

  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 6 }}>
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        {/* Filter Select */}
        <FormControl size="small" sx={{ minWidth: 150 }}>
          <InputLabel>Filter By</InputLabel>
          <Select
            value={filter}
            label="Filter By"
            onChange={(e) => setFilter(e.target.value)}
          >
            <MenuItem value="all">All Sales</MenuItem>
            <MenuItem value="discounted">Discounted</MenuItem>
            <MenuItem value="pending">Pending Payment</MenuItem>
          </Select>
        </FormControl>
        {/* Search Box */}
        <TextField
          placeholder="Search buyer..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: 250, bgcolor: "white" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search color="action" />
              </InputAdornment>
            ),
          }}
        />
        <FormControl size="small" sx={{ minWidth: 200 }}>
          <InputLabel>Sold By</InputLabel>
          <Select
            value={selectedSeller}
            label="Sold By"
            onChange={(e) => setSelectedSeller(e.target.value)}
          >
            <MenuItem value="all">All Sellers</MenuItem>
            {sellersList.map((email) => (
              <MenuItem key={email} value={email}>
                {email.replace("@gmail.com", "")}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h4" fontWeight="bold">
          Course Sales History
        </Typography>

        {/* SEARCH BOX */}
        {/* <TextField
          placeholder="Search by buyer name..."
          size="small"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          sx={{ width: 300, bgcolor: "white" }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <Search color="action" />
              </InputAdornment>
            ),
          }}
        /> */}
      </Box>

      <Paper elevation={3} sx={{ overflow: "hidden" }}>
        <Table>
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell width={50} />
              <TableCell>
                <strong>Buyer</strong>
              </TableCell>
              <TableCell>
                <strong>Seller</strong>
              </TableCell>
              <TableCell>
                <strong>Class</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Discount</strong>
              </TableCell>
              <TableCell align="right">
                <strong>Paid (PKR)</strong>
              </TableCell>
              <TableCell>
                <strong>Date</strong>
              </TableCell>
              <TableCell align="center">
                <strong>Bill</strong>
              </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton height={60} />
                  </TableCell>
                </TableRow>
              ))
            ) : displaySales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 8 }}>
                  <Typography color="text.secondary">
                    No sales records found.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              displaySales.map((sale) => {
                const isOpen = openRows[sale.id];
                return (
                  <React.Fragment key={sale.id}>
                    <TableRow hover>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => toggleRow(sale.id)}
                        >
                          {isOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                      </TableCell>
                      <TableCell sx={{ fontWeight: "medium" }}>
                        {sale.buyer_name}
                      </TableCell>
                      <TableCell sx={{ fontWeight: "medium" }}>
                        {/* Strips @gmail.com for the seller's name display */}
                        {sale.sold_by_name?.replace("@gmail.com", "") || "N/A"}
                      </TableCell>
                      <TableCell>
                        {sale.items_count > 1 ? (
                          <Chip
                            label="Multiple"
                            size="small"
                            color="primary"
                            variant="outlined"
                          />
                        ) : (
                          `Class ${sale.class_grade}`
                        )}
                      </TableCell>
                      <TableCell align="right" sx={{ color: "error.main" }}>
                        {sale.discount_sum > 0
                          ? `-${sale.discount_sum.toLocaleString()}`
                          : "—"}
                      </TableCell>
                      <TableCell align="right" sx={{ fontWeight: "bold" }}>
                        {sale.paid_sum.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        {sale.date
                          ? format(new Date(sale.date), "dd MMM, hh:mm a")
                          : "—"}
                      </TableCell>
                      <TableCell align="center">
                        <IconButton
                          color="primary"
                          onClick={() => downloadPDF(sale)}
                        >
                          <Download fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell
                        style={{ paddingBottom: 0, paddingTop: 0 }}
                        colSpan={7}
                      >
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Box
                            sx={{
                              m: 2,
                              p: 2,
                              bgcolor: "#fafafa",
                              borderRadius: 1,
                              border: "1px solid #eee",
                            }}
                          >
                            <Typography
                              variant="subtitle2"
                              color="primary"
                              gutterBottom
                            >
                              Detailed Breakdown
                            </Typography>
                            {sale.course_details.map((course, idx) => (
                              <Box key={idx} sx={{ mb: 2 }}>
                                <Typography
                                  variant="body2"
                                  sx={{
                                    fontWeight: "bold",
                                    bgcolor: "#e3f2fd",
                                    p: 0.5,
                                    pl: 1,
                                    borderRadius: 1,
                                  }}
                                >
                                  Class: {course.class_grade}
                                </Typography>
                                <List sx={{ ml: 2, p: 0 }}>
                                  {course.books.map((book, bIdx) => (
                                    <Box
                                      key={bIdx}
                                      sx={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        py: 0.5,
                                        borderBottom: "1px dashed #ddd",
                                      }}
                                    >
                                      <Typography variant="caption">
                                        {book.name}
                                      </Typography>
                                      <Typography variant="caption">
                                        PKR {book.price.toLocaleString()}
                                      </Typography>
                                    </Box>
                                  ))}
                                </List>
                              </Box>
                            ))}
                            <Divider sx={{ my: 1 }} />
                            <Box
                              sx={{
                                display: "flex",
                                justifyContent: "space-between",
                                mt: 1,
                              }}
                            >
                              <Typography variant="body2" fontWeight="bold">
                                Total Paid Amount:
                              </Typography>
                              <Typography
                                variant="body2"
                                fontWeight="bold"
                                color="primary"
                              >
                                PKR {sale.paid_sum.toLocaleString()}
                              </Typography>
                            </Box>
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
          </TableBody>
        </Table>

        {/* ONLY SHOW LOAD MORE IF NOT SEARCHING */}
        {!searchQuery.trim() && (
          <Box
            sx={{
              p: 2,
              display: "flex",
              justifyContent: "center",
              bgcolor: "#f9f9f9",
            }}
          >
            {hasNextPage ? (
              <IconButton
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                color="primary"
                sx={{ borderRadius: 2, px: 3, py: 1, fontSize: "0.9rem" }}
              >
                {isFetchingNextPage ? (
                  <CircularProgress size={24} sx={{ mr: 1 }} />
                ) : (
                  "Load More Records"
                )}
              </IconButton>
            ) : (
              <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>
                You've reached the end of the history.
              </Typography>
            )}
          </Box>
        )}
      </Paper>
    </Container>
  );
}
