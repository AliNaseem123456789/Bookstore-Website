import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";

export const runtime = "nodejs";

export async function GET(req) {
  const token = req.cookies.get("token")?.value;

  if (!token) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "SECRET_KEY");
    
    // ✅ UPDATED: Return full user object with role
    return NextResponse.json({ 
      user: {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role  // 👈 Include role
      }
    });
  } catch {
    return NextResponse.json({ user: null }, { status: 401 });
  }
}