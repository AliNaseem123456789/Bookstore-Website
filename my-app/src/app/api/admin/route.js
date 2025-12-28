import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

// Helper function to verify admin access
export function requireAdmin(req) {
  const token = req.cookies.get("token")?.value;
  
  if (!token) {
    return { error: "No token provided", status: 401 };
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
    
    if (decoded.role !== "admin") {
      return { error: "Admin access required", status: 403 };
    }

    return { user: decoded };
  } catch (error) {
    return { error: "Invalid token", status: 401 };
  }
}

// This file just exports the helper, individual admin routes will use it