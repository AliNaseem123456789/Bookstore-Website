import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

export async function POST(req) {
  const { email, password } = await req.json();

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (error || !user) {
    return NextResponse.json({ error: "Invalid email" }, { status: 401 });
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // ✅ UPDATED: Include role in JWT token
  const token = jwt.sign(
    { 
      id: user.id, 
      email: user.email, 
      role: user.role,  // 👈 Add role here
      name: user.name   
    },
    process.env.JWT_SECRET || "SECRET_KEY",
    { expiresIn: "1h" }
  );

  // Set cookie
  const res = NextResponse.json({
    message: "Login successful",
    user: { 
      id: user.id, 
      email: user.email, 
      role: user.role,  // 👈 Also return role in response
      name: user.name   
    },
  });
  res.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60, // 1 hour
    path: "/",
  });

  return res;
}