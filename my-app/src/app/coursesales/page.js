"use client";
import * as React from "react";
import { supabase } from "@/lib/supabaseClient";
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
  Button,
  Divider,
  List, // Added missing import
} from "@mui/material";
import {
  KeyboardArrowDown,
  KeyboardArrowUp,
  Download,
} from "@mui/icons-material";
import { format } from "date-fns";
import { useInfiniteQuery } from "@tanstack/react-query";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const PAGE_SIZE = 40;

async function fetchSales({ pageParam = 0 }) {
  const { data, error } = await supabase
    .from("course_sales")
    .select(
      "id, transaction_id, buyer_name, sold_by_name, class_grade, no_of_books, total_cost, cost_paid, discount_applied, date, books_sold",
    )
    .order("date", { ascending: false })
    .range(pageParam, pageParam + PAGE_SIZE - 1);

  if (error) throw new Error(error.message);
  return {
    data,
    nextPage: pageParam + PAGE_SIZE,
    hasMore: data.length === PAGE_SIZE,
  };
}

export default function CourseSalesPage() {
  const [openRows, setOpenRows] = React.useState({});

  const { data, error, isLoading, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["course_sales"],
    queryFn: fetchSales,
    initialPageParam: 0,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
  });

  const groupedSales = React.useMemo(() => {
    const rawData = data?.pages.flatMap((page) => page.data) ?? [];
    const groups = {};

    rawData.forEach((item) => {
      const key = item.transaction_id || item.id;

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
  }, [data]);

  const downloadPDF = (sale) => {
    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("SALES RECEIPT", 14, 20);
    doc.setFontSize(10);
    doc.text(`Transaction ID: ${sale.transaction_id || sale.id}`, 14, 30);
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
          content: `Class ${course.class_grade}`,
          colSpan: 2,
          styles: { fillColor: [240, 240, 240], fontStyle: "bold" },
        },
      ]);
      course.books.forEach((book) => {
        tableRows.push([book.name, `PKR ${book.price}`]);
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

  if (error)
    return <Typography color="error">Error: {error.message}</Typography>;

  return (
    <Container maxWidth="lg" sx={{ mt: 6, mb: 6 }}>
      <Typography variant="h4" fontWeight="bold" gutterBottom>
        Course Sales History
      </Typography>

      <Paper elevation={3} sx={{ mt: 3, overflow: "hidden" }}>
        <Table>
          <TableHead sx={{ bgcolor: "#f5f5f5" }}>
            <TableRow>
              <TableCell width={50} />
              <TableCell>
                <strong>Buyer</strong>
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
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell colSpan={7}>
                      <Skeleton height={60} />
                    </TableCell>
                  </TableRow>
                ))
              : groupedSales.map((sale) => {
                  const isOpen = openRows[sale.id];
                  return (
                    <React.Fragment key={sale.id}>
                      <TableRow hover>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => toggleRow(sale.id)}
                          >
                            {isOpen ? (
                              <KeyboardArrowUp />
                            ) : (
                              <KeyboardArrowDown />
                            )}
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ fontWeight: "medium" }}>
                          {sale.buyer_name}
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
                          {format(new Date(sale.date), "dd MMM, hh:mm a")}
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
                })}
          </TableBody>
        </Table>
        {isFetchingNextPage && (
          <Box p={2} textAlign="center">
            <CircularProgress size={24} />
          </Box>
        )}
      </Paper>
    </Container>
  );
}
