//course sales histroy
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
} from "@mui/material";
import { KeyboardArrowDown, KeyboardArrowUp } from "@mui/icons-material";
import { format } from "date-fns";
import { useInfiniteQuery } from "@tanstack/react-query";

const PAGE_SIZE = 20;

async function fetchSales({ pageParam = 0 }) {
  const { data, error } = await supabase
    .from("course_sales")
    .select(
      "id, buyer_name, sold_by_name, class_grade, no_of_books, total_cost, cost_paid, date, books_sold"
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
  
  const {
    data,
    error,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: ["course_sales"],
    queryFn: fetchSales,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.nextPage : undefined,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sales = React.useMemo(() => 
    data?.pages.flatMap((page) => page.data) ?? [], 
    [data]
  );

  const toggleRow = React.useCallback((id) => {
    setOpenRows((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const formatDate = React.useCallback((dateString) => {
    return format(new Date(dateString), "yyyy-MM-dd HH:mm:ss");
  }, []);

  const observer = React.useRef();
  const lastRowRef = React.useCallback(
    (node) => {
      if (isFetchingNextPage) return;
      if (observer.current) observer.current.disconnect();
      
      observer.current = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting && hasNextPage) {
          fetchNextPage();
        }
      });
      
      if (node) observer.current.observe(node);
    },
    [isFetchingNextPage, fetchNextPage, hasNextPage]
  );

  React.useEffect(() => {
    return () => {
      if (observer.current) {
        observer.current.disconnect();
      }
    };
  }, []);

  if (error) return <p>Error: {error.message}</p>;

  return (
    <Container maxWidth="lg" sx={{ mt: 6 }}>
      <Typography variant="h4" gutterBottom>
        Courses sold {sales.length > 0 && `(${sales.length}+)`}
      </Typography>

      <Paper sx={{ mt: 3 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell><strong>Buyer</strong></TableCell>
              <TableCell><strong>Seller</strong></TableCell>
              <TableCell><strong>Class</strong></TableCell>
              <TableCell align="center"><strong>No. of Books</strong></TableCell>
              <TableCell align="right"><strong>Total Cost (PKR)</strong></TableCell>
              <TableCell align="right"><strong>Cost Paid (PKR)</strong></TableCell>
              <TableCell><strong>Date</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, idx) => (
                <TableRow key={`skeleton-${idx}`}>
                  <TableCell><Skeleton variant="circular" width={40} height={40} /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                  <TableCell><Skeleton variant="text" /></TableCell>
                </TableRow>
              ))
            ) : sales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No course sales yet.
                </TableCell>
              </TableRow>
            ) : (
              sales.map((sale, idx) => {
                const isLast = idx === sales.length - 1;
                const isOpen = openRows[sale.id] || false;

                return (
                  <React.Fragment key={sale.id}>
                    <TableRow ref={isLast ? lastRowRef : null}>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleRow(sale.id)}>
                          {isOpen ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                      </TableCell>
                      <TableCell>{sale.buyer_name}</TableCell>
                      <TableCell>{sale.sold_by_name || "—"}</TableCell>
                      <TableCell>Class {sale.class_grade}</TableCell>
                      <TableCell align="center">{sale.no_of_books}</TableCell>
                      <TableCell align="right">{sale.total_cost}</TableCell>
                      <TableCell align="right">{sale.cost_paid}</TableCell>
                      <TableCell>{formatDate(sale.date)}</TableCell>
                    </TableRow>

                    <TableRow>
                      <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={8}>
                        <Collapse in={isOpen} timeout="auto" unmountOnExit>
                          <Box sx={{ margin: 2, ml: 6 }}>
                            <Typography variant="subtitle2">Books Sold:</Typography>
                            {sale.books_sold?.length > 0 ? (
                              <ul style={{ margin: 0, paddingLeft: "20px" }}>
                                {sale.books_sold.map((b, i) => (
                                  <li key={i}>{b.name} – PKR {b.price}</li>
                                ))}
                              </ul>
                            ) : (
                              <Typography variant="body2" color="text.secondary">
                                No books recorded
                              </Typography>
                            )}
                          </Box>
                        </Collapse>
                      </TableCell>
                    </TableRow>
                  </React.Fragment>
                );
              })
            )}
            {isFetchingNextPage && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  <CircularProgress size={24} />
                  <Typography variant="body2" sx={{ mt: 1 }}>
                    Loading more records...
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
}