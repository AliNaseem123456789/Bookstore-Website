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
  Box,
  Card,
  CardContent,
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
import { 
  DatePicker, 
  LocalizationProvider 
} from "@mui/x-date-pickers";
import { AdapterDateFns } from "@mui/x-date-pickers/AdapterDateFns";
import { 
  TrendingUp, 
  People, 
  Inventory, 
  AccountBalance,
  CalendarToday,
  Download
} from "@mui/icons-material";
import { useQuery } from "@tanstack/react-query";
import { format, subDays, startOfMonth, endOfMonth } from "date-fns";

export default function SalesAnalyticsPage() {
  const [dateRange, setDateRange] = React.useState({
    start: subDays(new Date(), 7), // Last 7 days
    end: new Date(),
  });
  const [timeFrame, setTimeFrame] = React.useState("7days"); // 7days, 30days, month, custom
  const [selectedUser, setSelectedUser] = React.useState("all");
  const todayKey = format(new Date(), "yyyy-MM-dd");


  // ✅ Fetch all users for filter
  const { data: users = [] } = useQuery({
    queryKey: ["analytics-users"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("id, name, email, role")
        .eq("role", "user") // Only regular users, not admins
        .order("name");
      
      if (error) throw error;
      return data;
    },
  });

  // ✅ Fetch comprehensive sales data
  const { data: analyticsData, isLoading, error } = useQuery({
    queryKey: ["sales-analytics", dateRange, selectedUser],
    queryFn: async () => {
      let startDate = dateRange.start;
      let endDate = dateRange.end;
      
      // Adjust end date to include full day
      endDate.setHours(23, 59, 59, 999);

      // Build query for course sales
      let courseSalesQuery = supabase
        .from("course_sales")
        .select("sold_by_name, total_cost, no_of_books, date, class_grade")
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());

      // Build query for individual purchases
      let purchasesQuery = supabase
        .from("purchases")
        .select("buyer_name, amount_paid, date, books(name, class_grade)")
        .gte("date", startDate.toISOString())
        .lte("date", endDate.toISOString());

      // Apply user filter if specific user selected
      if (selectedUser !== "all") {
        const user = users.find(u => u.id === selectedUser);
        if (user) {
          courseSalesQuery = courseSalesQuery.eq("sold_by_name", user.email);
          // Individual purchases don't have seller tracking, so we can't filter them by user
        }
      }

      const [{ data: courseSales, error: courseError }, { data: purchases, error: purchaseError }] = 
        await Promise.all([courseSalesQuery, purchasesQuery]);

      if (courseError) throw courseError;
      if (purchaseError) throw purchaseError;

      // Process data for daily breakdown
      const dailyBreakdown = {};
      const userPerformance = {};
      const classPerformance = {};
      const todayEmployeePerformance = {};


      // Process course sales
      courseSales?.forEach(sale => {
        const date = format(new Date(sale.date), 'yyyy-MM-dd');
        const seller = sale.sold_by_name || "Unknown";

        // ✅ Today's employee breakdown
if (date === todayKey) {
  if (!todayEmployeePerformance[seller]) {
    todayEmployeePerformance[seller] = {
      booksSold: 0,
      revenue: 0,
      coursesSold: 0,
    };
  }
  todayEmployeePerformance[seller].booksSold += sale.no_of_books;
  todayEmployeePerformance[seller].revenue += Number(sale.total_cost);
  todayEmployeePerformance[seller].coursesSold += 1;
}

        
        // Daily breakdown
        if (!dailyBreakdown[date]) {
          dailyBreakdown[date] = { date, booksSold: 0, revenue: 0, users: {} };
        }
        dailyBreakdown[date].booksSold += sale.no_of_books;
        dailyBreakdown[date].revenue += Number(sale.total_cost);
        
        // User performance
        if (!userPerformance[seller]) {
          userPerformance[seller] = { booksSold: 0, revenue: 0, coursesSold: 0 };
        }
        userPerformance[seller].booksSold += sale.no_of_books;
        userPerformance[seller].revenue += Number(sale.total_cost);
        userPerformance[seller].coursesSold += 1;
        
        // Class performance
        const classGrade = sale.class_grade || "Unknown";
        if (!classPerformance[classGrade]) {
          classPerformance[classGrade] = { booksSold: 0, revenue: 0 };
        }
        classPerformance[classGrade].booksSold += sale.no_of_books;
        classPerformance[classGrade].revenue += Number(sale.total_cost);
      });

      // Process individual purchases
      purchases?.forEach(purchase => {
        const date = format(new Date(purchase.date), 'yyyy-MM-dd');
        const seller = "Individual Sales";

        // ✅ Today's employee breakdown (individual sales)
if (date === todayKey) {
  if (!todayEmployeePerformance[seller]) {
    todayEmployeePerformance[seller] = {
      booksSold: 0,
      revenue: 0,
      coursesSold: 0,
    };
  }
  todayEmployeePerformance[seller].booksSold += 1;
  todayEmployeePerformance[seller].revenue += Number(purchase.amount_paid);
}

        
        // Daily breakdown
        if (!dailyBreakdown[date]) {
          dailyBreakdown[date] = { date, booksSold: 0, revenue: 0, users: {} };
        }
        dailyBreakdown[date].booksSold += 1;
        dailyBreakdown[date].revenue += Number(purchase.amount_paid);
        
        // User performance (individual sales go to "Individual Sales" bucket)
        if (!userPerformance[seller]) {
          userPerformance[seller] = { booksSold: 0, revenue: 0, coursesSold: 0 };
        }
        userPerformance[seller].booksSold += 1;
        userPerformance[seller].revenue += Number(purchase.amount_paid);
        
        // Class performance from book data if available
        const classGrade = purchase.books?.class_grade || "Unknown";
        if (!classPerformance[classGrade]) {
          classPerformance[classGrade] = { booksSold: 0, revenue: 0 };
        }
        classPerformance[classGrade].booksSold += 1;
        classPerformance[classGrade].revenue += Number(purchase.amount_paid);
      });

      // Calculate totals
      const totalRevenue = Object.values(userPerformance).reduce((sum, user) => sum + user.revenue, 0);
      const totalBooksSold = Object.values(userPerformance).reduce((sum, user) => sum + user.booksSold, 0);
      const totalCoursesSold = Object.values(userPerformance).reduce((sum, user) => sum + (user.coursesSold || 0), 0);

      return {
        dailyBreakdown: Object.values(dailyBreakdown).sort((a, b) => new Date(b.date) - new Date(a.date)),
        userPerformance: Object.entries(userPerformance).map(([user, data]) => ({
          user,
          ...data,
          avgRevenuePerBook: data.booksSold > 0 ? data.revenue / data.booksSold : 0
        })).sort((a, b) => b.revenue - a.revenue),

        todayEmployeePerformance: Object.entries(todayEmployeePerformance)
  .map(([user, data]) => ({
    user,
    ...data,
    avgRevenuePerBook:
      data.booksSold > 0 ? data.revenue / data.booksSold : 0,
  }))
  .sort((a, b) => b.revenue - a.revenue),

        classPerformance: Object.entries(classPerformance).map(([classGrade, data]) => ({
          classGrade,
          ...data
        })).sort((a, b) => b.revenue - a.revenue),


        totals: {
          revenue: totalRevenue,
          booksSold: totalBooksSold,
          coursesSold: totalCoursesSold,
          averageRevenuePerBook: totalBooksSold > 0 ? totalRevenue / totalBooksSold : 0
        }
      };
    },
  });

  // Handle time frame changes
  const handleTimeFrameChange = (newTimeFrame) => {
    setTimeFrame(newTimeFrame);
    const today = new Date();
    
    switch (newTimeFrame) {
      case "7days":
        setDateRange({ start: subDays(today, 7), end: today });
        break;
      case "30days":
        setDateRange({ start: subDays(today, 30), end: today });
        break;
      case "month":
        setDateRange({ start: startOfMonth(today), end: endOfMonth(today) });
        break;
      case "custom":
        // Keep current date range
        break;
    }
  };

  // Export data (simple CSV)
  const handleExport = () => {
    if (!analyticsData) return;
    
    const csvContent = [
      ["Date", "Seller", "Books Sold", "Revenue", "Courses Sold"],
      ...analyticsData.userPerformance.map(up => [
        `${format(dateRange.start, 'yyyy-MM-dd')} to ${format(dateRange.end, 'yyyy-MM-dd')}`,
        up.user,
        up.booksSold,
        up.revenue,
        up.coursesSold
      ])
    ].map(row => row.join(",")).join("\n");
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (error) {
    return (
      <Container sx={{ mt: 4 }}>
        <Alert severity="error">Error loading analytics: {error.message}</Alert>
      </Container>
    );
  }

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Container maxWidth="xl" sx={{ mt: 4 }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Typography variant="h4" fontWeight="bold">
            Sales Analytics Dashboard
          </Typography>
          <Button
            startIcon={<Download />}
            variant="outlined"
            onClick={handleExport}
            disabled={isLoading}
          >
            Export Report
          </Button>
        </Box>

        {/* Filters */}
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
                  {users.map(user => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>

            {timeFrame === "custom" && (
              <>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="Start Date"
                    value={dateRange.start}
                    onChange={(newValue) => setDateRange(prev => ({ ...prev, start: newValue }))}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </Grid>
                <Grid item xs={12} md={3}>
                  <DatePicker
                    label="End Date"
                    value={dateRange.end}
                    onChange={(newValue) => setDateRange(prev => ({ ...prev, end: newValue }))}
                    renderInput={(params) => <TextField {...params} fullWidth />}
                  />
                </Grid>
              </>
            )}
          </Grid>
        </Paper>

        {isLoading && <LinearProgress sx={{ mb: 3 }} />}

        {/* Summary Cards */}
        {analyticsData && (
          <Grid container spacing={3} sx={{ mb: 4 }}>
            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <AccountBalance sx={{ color: "primary.main", mr: 1 }} />
                    <Typography color="textSecondary">Total Revenue</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    PKR {analyticsData.totals.revenue.toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {analyticsData.totals.booksSold} books sold
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <Inventory sx={{ color: "success.main", mr: 1 }} />
                    <Typography color="textSecondary">Books Sold</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {analyticsData.totals.booksSold}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {analyticsData.totals.coursesSold} courses
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <People sx={{ color: "info.main", mr: 1 }} />
                    <Typography color="textSecondary">Active Employees</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    {analyticsData.userPerformance.length}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Selling books
                  </Typography>
                </CardContent>
              </Card>
            </Grid>

            <Grid item xs={12} sm={6} md={3}>
              <Card>
                <CardContent>
                  <Box display="flex" alignItems="center" mb={2}>
                    <TrendingUp sx={{ color: "warning.main", mr: 1 }} />
                    <Typography color="textSecondary">Avg. per Book</Typography>
                  </Box>
                  <Typography variant="h4" fontWeight="bold">
                    PKR {Math.round(analyticsData.totals.averageRevenuePerBook).toLocaleString()}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Average revenue
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        )}

        <Grid container spacing={4}>

          {/* Today's Employee Performance */}
<Grid item xs={12}>
  <Paper sx={{ p: 3 }}>
    <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
      <Typography variant="h6">
        Today’s Employee Performance
      </Typography>
      <Chip
        color="primary"
        label={format(new Date(), "EEE, MMM dd")}
      />
    </Box>

    <Table>
      <TableHead>
        <TableRow>
          <TableCell><strong>Employee</strong></TableCell>
          <TableCell align="right"><strong>Books</strong></TableCell>
          <TableCell align="right"><strong>Courses</strong></TableCell>
          <TableCell align="right"><strong>Revenue</strong></TableCell>
          <TableCell align="right"><strong>Avg/Book</strong></TableCell>
        </TableRow>
      </TableHead>

      <TableBody>
        {analyticsData?.todayEmployeePerformance?.length > 0 ? (
          analyticsData.todayEmployeePerformance.map((user) => (
            <TableRow key={user.user} hover>
              <TableCell>{user.user}</TableCell>
              <TableCell align="right">{user.booksSold}</TableCell>
              <TableCell align="right">{user.coursesSold || 0}</TableCell>
              <TableCell align="right">
                PKR {user.revenue.toLocaleString()}
              </TableCell>
              <TableCell align="right">
                PKR {Math.round(user.avgRevenuePerBook).toLocaleString()}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} align="center">
              No sales recorded today
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  </Paper>
</Grid>

          {/* Employee Performance */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Employee Performance
              </Typography>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Employee</strong></TableCell>
                    <TableCell align="right"><strong>Books</strong></TableCell>
                    <TableCell align="right"><strong>Courses</strong></TableCell>
                    <TableCell align="right"><strong>Revenue</strong></TableCell>
                    <TableCell align="right"><strong>Avg/Book</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analyticsData?.userPerformance.map((user, index) => (
                    <TableRow key={user.user} hover>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {user.user}
                          </Typography>
                          {index < 3 && (
                            <Chip 
                              label={`#${index + 1}`} 
                              size="small" 
                              color={index === 0 ? "primary" : index === 1 ? "secondary" : "default"}
                              sx={{ mt: 0.5 }}
                            />
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="right">{user.booksSold}</TableCell>
                      <TableCell align="right">{user.coursesSold}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="medium">
                          PKR {user.revenue.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        PKR {Math.round(user.avgRevenuePerBook).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Daily Breakdown */}
          <Grid item xs={12} md={6}>
            <Paper sx={{ p: 3 }}>
              <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
                <Typography variant="h6">Daily Breakdown</Typography>
                <Chip 
                  icon={<CalendarToday />} 
                  label={`${format(dateRange.start, 'MMM dd')} - ${format(dateRange.end, 'MMM dd')}`} 
                />
              </Box>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Date</strong></TableCell>
                    <TableCell align="right"><strong>Books Sold</strong></TableCell>
                    <TableCell align="right"><strong>Revenue</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analyticsData?.dailyBreakdown.slice(0, 10).map((day) => (
                    <TableRow key={day.date}>
                      <TableCell>
                        <Typography variant="body2">
                          {format(new Date(day.date), 'EEE, MMM dd')}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{day.booksSold}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight="medium">
                          PKR {day.revenue.toLocaleString()}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>

          {/* Class Performance */}
          <Grid item xs={12}>
            <Paper sx={{ p: 3 }}>
              <Typography variant="h6" gutterBottom>
                Performance by Class Grade
              </Typography>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell><strong>Class Grade</strong></TableCell>
                    <TableCell align="right"><strong>Books Sold</strong></TableCell>
                    <TableCell align="right"><strong>Revenue</strong></TableCell>
                    <TableCell align="right"><strong>% of Total</strong></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {analyticsData?.classPerformance.map((classData) => (
                    <TableRow key={classData.classGrade}>
                      <TableCell>
                        <Typography variant="body2" fontWeight="medium">
                          {classData.classGrade === "Unknown" ? "Not Specified" : `Class ${classData.classGrade}`}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">{classData.booksSold}</TableCell>
                      <TableCell align="right">
                        PKR {classData.revenue.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        {analyticsData.totals.revenue > 0 
                          ? `${Math.round((classData.revenue / analyticsData.totals.revenue) * 100)}%`
                          : "0%"
                        }
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </LocalizationProvider>
  );
}