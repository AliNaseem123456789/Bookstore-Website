// src/app/layout.js
import ClientLayout from "@/components/ClientLayout";
import Providers from "@/app/providers"; 

export const metadata = {
  title: "Bookstore",
  description: "Bookstore website built with Next.js & MUI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body suppressHydrationWarning={true}>
        <Providers>
          <ClientLayout>{children}</ClientLayout>
        </Providers>
      </body>
    </html>
  );
}
