import * as React from "react";
import {
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  Typography,
  Box,
  Chip,
} from "@mui/material";

export const PerformanceTable = ({
  data,
  showRanking = false,
  emptyMessage = "No data found",
}) => {
  return (
    <Table>
      <TableHead>
        <TableRow>
          <TableCell>
            <strong>Employee</strong>
          </TableCell>
          <TableCell align="right">
            <strong>Books</strong>
          </TableCell>
          <TableCell align="right">
            <strong>Courses</strong>
          </TableCell>
          <TableCell align="right">
            <strong>Revenue</strong>
          </TableCell>
          <TableCell align="right">
            <strong>Avg/Book</strong>
          </TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {data?.length > 0 ? (
          data.map((row, index) => (
            <TableRow key={row.user} hover>
              <TableCell>
                <Box>
                  <Typography variant="body2" fontWeight="medium">
                    {row.user}
                  </Typography>
                  {showRanking && index < 3 && (
                    <Chip
                      label={`#${index + 1}`}
                      size="small"
                      color={
                        index === 0
                          ? "primary"
                          : index === 1
                            ? "secondary"
                            : "default"
                      }
                      sx={{ mt: 0.5 }}
                    />
                  )}
                </Box>
              </TableCell>
              <TableCell align="right">{row.booksSold}</TableCell>
              <TableCell align="right">{row.coursesSold || 0}</TableCell>
              <TableCell align="right">
                PKR {row.revenue.toLocaleString()}
              </TableCell>
              <TableCell align="right">
                PKR {Math.round(row.avgRevenuePerBook).toLocaleString()}
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={5} align="center">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};
