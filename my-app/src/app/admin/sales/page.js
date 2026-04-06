"use client";
import * as React from "react";
import { supabase } from "../../../lib/supabaseClient";
import {
  Container,
  Typography,
  Paper,
  Box,
  Grid,
  TextField,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Button,
  Chip,
  LinearProgress,
  Alert,
} from "@mui/material";
import { DatePicker, LocalizationProvider } from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { Download } from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

// Internal Component Imports
import { AnalyticsSummaryCards } from "../../../components/AnalyticsSummaryCard";
import { PerformanceTable } from "../../../components/Performance";

export default function SalesAnalyticsPage() {
  const [dateRange, setDateRange] = React.useState({
    start: subDays(new Date(), 7),
    end: new Date(),
  });
  const [timeFrame, setTimeFrame] = React.useState("7days");
  const [selectedUser, setSelectedUser] = React.useState("all");
  const todayKey = format(new Date(), "yyyy-MM-dd");

  const { data: users = [] } = useQuery({
    queryKey: ["analytics-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("role", "user")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const {
    data: analyticsData,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["sales-analytics", dateRange, selectedUser],
    queryFn: async () => {
      let startDate = dateRange.start;
      let endDate = new Date(dateRange.end);
      endDate.setHours(23, 59, 59, 999);

      let courseSalesQuery = supabase
        .from("course_sales")
        .select("sold_by_name, total_cost, no_of_books, date")
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());
      let purchasesQuery = supabase
        .from("purchases")
        .select("amount_paid, date")
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());

      if (selectedUser !== "all") {
        const user = users.find((u) => u.id === selectedUser);
        if (user)
          courseSalesQuery = courseSalesQuery.eq("sold_by_name", user.email);
      }

      const [{ data: courseSales }, { data: purchases }] = await Promise.all([
        courseSalesQuery,
        purchasesQuery,
      ]);

      const userPerf = {};
      const todayPerf = {};

      courseSales?.forEach((s) => {
        const dt = format(new Date(s.date), "yyyy-MM-dd");
        const sel = s.sold_by_name || "Unknown";
        if (dt === todayKey) {
          if (!todayPerf[sel])
            todayPerf[sel] = {
              user: sel,
              booksSold: 0,
              revenue: 0,
              coursesSold: 0,
            };
          todayPerf[sel].booksSold += s.no_of_books;
          todayPerf[sel].revenue += Number(s.total_cost);
          todayPerf[sel].coursesSold += 1;
        }
        if (!userPerf[sel])
          userPerf[sel] = {
            user: sel,
            booksSold: 0,
            revenue: 0,
            coursesSold: 0,
          };
        userPerf[sel].booksSold += s.no_of_books;
        userPerf[sel].revenue += Number(s.total_cost);
        userPerf[sel].coursesSold += 1;
      });

      purchases?.forEach((p) => {
        const dt = format(new Date(p.date), "yyyy-MM-dd");
        const sel = "Individual Sales";
        if (dt === todayKey) {
          if (!todayPerf[sel])
            todayPerf[sel] = {
              user: sel,
              booksSold: 0,
              revenue: 0,
              coursesSold: 0,
            };
          todayPerf[sel].booksSold += 1;
          todayPerf[sel].revenue += Number(p.amount_paid);
        }
        if (!userPerf[sel])
          userPerf[sel] = {
            user: sel,
            booksSold: 0,
            revenue: 0,
            coursesSold: 0,
          };
        userPerf[sel].booksSold += 1;
        userPerf[sel].revenue += Number(p.amount_paid);
      });

      const totals = Object.values(userPerf).reduce(
        (acc, curr) => ({
          revenue: acc.revenue + curr.revenue,
          booksSold: acc.booksSold + curr.booksSold,
          coursesSold: acc.coursesSold + curr.coursesSold,
        }),
        { revenue: 0, booksSold: 0, coursesSold: 0 },
      );

      const mapper = (obj) =>
        Object.values(obj)
          .map((d) => ({
            ...d,
            avgRevenuePerBook: d.booksSold > 0 ? d.revenue / d.booksSold : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);

      return {
        userPerformance: mapper(userPerf),
        todayEmployeePerformance: mapper(todayPerf),
        totals: {
          ...totals,
          averageRevenuePerBook:
            totals.booksSold > 0 ? totals.revenue / totals.booksSold : 0,
        },
      };
    },
    enabled: !!users,
  });

  const handleTimeFrameChange = (val) => {
    setTimeFrame(val);
    const now = new Date();
    if (val === "7days") setDateRange({ start: subDays(now, 7), end: now });
    else if (val === "30days")
      setDateRange({ start: subDays(now, 30), end: now });
    else if (val === "month")
      setDateRange({ start: startOfMonth(now), end: endOfMonth(now) });
  };

  if (error)
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Error loading analytics</Alert>
      </Container>
    );

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems="center"
          mb={3}
        >
          <Typography variant="h4" fontWeight="bold">
            Sales Analytics Dashboard
          </Typography>
          <Button
            startIcon={<Download />}
            variant="outlined"
            disabled={isLoading}
          >
            Export Report
          </Button>
        </Box>

        <Paper sx={{ p: 3, mb: 4 }}>
          <Grid container spacing={3} alignItems="center">
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Time Frame</InputLabel>
                <Select
                  value={timeFrame}
                  label="Time Frame"
                  onChange={(e) => handleTimeFrameChange(e.target.value)}
                >
                  <MenuItem value="7days">Last 7 Days</MenuItem>
                  <MenuItem value="30days">Last 30 Days</MenuItem>
                  <MenuItem value="month">This Month</MenuItem>
                  <MenuItem value="custom">Custom Range</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={3}>
              <FormControl fullWidth>
                <InputLabel>Employee</InputLabel>
                <Select
                  value={selectedUser}
                  label="Employee"
                  onChange={(e) => setSelectedUser(e.target.value)}
                >
                  <MenuItem value="all">All Employees</MenuItem>
                  {users.map((u) => (
                    <MenuItem key={u.id} value={u.id}>
                      {u.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            {timeFrame === "custom" && (
              <>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="Start"
                    value={dateRange.start}
                    onChange={(v) => setDateRange((p) => ({ ...p, start: v }))}
                    renderInput={(p) => <TextField {...p} fullWidth />}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="End"
                    value={dateRange.end}
                    onChange={(v) => setDateRange((p) => ({ ...p, end: v }))}
                    renderInput={(p) => <TextField {...p} fullWidth />}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </Paper>

        {isLoading && <LinearProgress sx={{ mb: 3 }} />}

        {analyticsData && (
          <>
            <AnalyticsSummaryCards
              totals={analyticsData.totals}
              activeEmployees={analyticsData.userPerformance.length}
            />

            <Grid container spacing={4}>
              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Box
                    display="flex"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={2}
                  >
                    <Typography variant="h6">
                      Today’s Employee Performance
                    </Typography>
                    <Chip
                      color="primary"
                      label={format(new Date(), "EEE, MMM dd")}
                    />
                  </Box>
                  <PerformanceTable
                    data={analyticsData.todayEmployeePerformance}
                    emptyMessage="No sales recorded today"
                  />
                </Paper>
              </Grid>

              <Grid item xs={12}>
                <Paper sx={{ p: 3 }}>
                  <Typography variant="h6" gutterBottom>
                    Employee Performance (Selected Range)
                  </Typography>
                  <PerformanceTable
                    data={analyticsData.userPerformance}
                    showRanking
                  />
                </Paper>
              </Grid>
            </Grid>
          </>
        )}
      </Container>
    </LocalizationProvider>
  );
}
