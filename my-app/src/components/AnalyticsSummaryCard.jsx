import * as React from "react";
import { Grid, Card, CardContent, Box, Typography } from "@mui/material";
import {
  TrendingUp,
  People,
  Inventory,
  AccountBalance,
} from "@mui/icons-material";

export const AnalyticsSummaryCards = ({ totals, activeEmployees }) => {
  const cards = [
    {
      title: "Total Revenue",
      value: `PKR ${totals.revenue.toLocaleString()}`,
      sub: `${totals.booksSold} books sold`,
      icon: <AccountBalance sx={{ color: "primary.main", mr: 1 }} />,
    },
    {
      title: "Books Sold",
      value: totals.booksSold,
      sub: `${totals.coursesSold} courses`,
      icon: <Inventory sx={{ color: "success.main", mr: 1 }} />,
    },
    {
      title: "Active Employees",
      value: activeEmployees,
      sub: "Selling books",
      icon: <People sx={{ color: "info.main", mr: 1 }} />,
    },
    {
      title: "Avg. per Book",
      value: `PKR ${Math.round(totals.averageRevenuePerBook).toLocaleString()}`,
      sub: "Average revenue",
      icon: <TrendingUp sx={{ color: "warning.main", mr: 1 }} />,
    },
  ];

  return (
    <Grid container spacing={3} sx={{ mb: 4 }}>
      {cards.map((card, i) => (
        <Grid item xs={12} sm={6} md={3} key={i}>
          <Card elevation={1}>
            <CardContent>
              <Box display="flex" alignItems="center" mb={2}>
                {card.icon}
                <Typography color="textSecondary">{card.title}</Typography>
              </Box>
              <Typography variant="h4" fontWeight="bold">
                {card.value}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {card.sub}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};
