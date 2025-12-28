import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  console.log('🛡️ Middleware triggered for:', pathname);

  // Public routes - no auth required
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/api/register")
  ) {
    console.log('✅ Public route, allowing access');
    return NextResponse.next();
  }

  const token = req.cookies.get("token")?.value;
  console.log('🔐 Token found:', !!token);

  // No token - redirect to login
  if (!token) {
    console.log('❌ No token, redirecting to login');
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    console.log('🔍 Verifying token...');
    
    // ✅ FIXED: Use jose for Edge Runtime
    const secret = new TextEncoder().encode(
      process.env.JWT_SECRET || "SECRET_KEY"
    );
    
    const { payload } = await jwtVerify(token, secret);
    console.log('✅ Token decoded:', { email: payload.email, role: payload.role });
    
    // ✅ Protect admin routes
    if (pathname.startsWith("/admin")) {
      console.log('🛡️ Admin route check:', { path: pathname, userRole: payload.role });
      if (payload.role !== "admin") {
        console.log('❌ Non-admin trying to access admin route');
        return NextResponse.redirect(new URL("/", req.url));
      }
    }

    console.log('✅ Access granted');
    return NextResponse.next();
  } catch (error) {
    console.log('❌ Token verification failed:', error.message);
    // Invalid token - redirect to login
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|api/register).*)"],
};