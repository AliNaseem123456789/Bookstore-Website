import ThemeRegistry from "@/components/ThemeRegistry";
import NavTabs from "@/components/NavTabs"; // 👈 import the NavTabs

export const metadata = {
  title: "Bookstore",
  description: "Bookstore website built with Next.js & MUI",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <ThemeRegistry>
          <NavTabs />   {/* 👈 Tabs at the top */}
          {children}    {/* 👈 Page content below */}
        </ThemeRegistry>
      </body>
    </html>
  );
}
