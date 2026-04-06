// src/app/layout.js
import ClientLayout from "../components/ClientLayout"; // ✅ fixed path
import Providers from "../app/providers";
import { CartProvider } from "../context/CartContext";

export const metadata = {
  title: "Bookstore",
  description: "Bookstore website built with Next.js & MUI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <Providers>
          <CartProvider>
            <ClientLayout>{children}</ClientLayout>
          </CartProvider>
        </Providers>
      </body>
    </html>
  );
}
