"use client";
import React, { useCallback } from "react"; // ✅ Fixed import
import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { CssBaseline } from "@mui/material";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { useServerInsertedHTML } from "next/navigation";
import { useState } from "react";
import NavTabs from "@/components/NavTabs";

// Create an Emotion cache for MUI
function createEmotionCache() {
  const cache = createCache({ key: "mui", prepend: true });
  cache.compat = true;
  return cache;
}

// Memoized theme creation outside component
const theme = createTheme({
  palette: {
    mode: "light",
    primary: { main: "#1976d2" },
  },
});

export default function ClientLayout({ children }) {
  const [cache] = useState(() => createEmotionCache());

  // ✅ Properly inject only *new* styles on each render
  useServerInsertedHTML(() => {
    const names = Object.keys(cache.inserted);
    if (names.length === 0) return null;

    return (
      <style
        data-emotion={`${cache.key} ${names.join(" ")}`}
        dangerouslySetInnerHTML={{
          __html: names.map((name) => cache.inserted[name]).join(" "),
        }}
      />
    );
  });

  // Memoized children rendering to prevent unnecessary re-renders
  const renderedChildren = React.useMemo(() => children, [children]);

  return (
    <CacheProvider value={cache}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <NavTabs />
        {renderedChildren}
      </ThemeProvider>
    </CacheProvider>
  );
}

// "use client";

// import { CacheProvider } from "@emotion/react";
// import createCache from "@emotion/cache";
// import { CssBaseline } from "@mui/material";
// import { ThemeProvider, createTheme } from "@mui/material/styles";
// import { useServerInsertedHTML } from "next/navigation";
// import { useState } from "react";
// import NavTabs from "@/components/NavTabs";

// // Create an Emotion cache for MUI
// function createEmotionCache() {
//   const cache = createCache({ key: "mui", prepend: true });
//   cache.compat = true;
//   return cache;
// }

// export default function ClientLayout({ children }) {
//   const [cache] = useState(() => createEmotionCache());

//   // ✅ Properly inject only *new* styles on each render
//   useServerInsertedHTML(() => {
//     const names = Object.keys(cache.inserted);
//     if (names.length === 0) return null;

//     return (
//       <style
//         data-emotion={`${cache.key} ${names.join(" ")}`}
//         dangerouslySetInnerHTML={{
//           __html: names.map((name) => cache.inserted[name]).join(" "),
//         }}
//       />
//     );
//   });


//   const theme = createTheme({
//     palette: {
//       mode: "light",
//       primary: { main: "#1976d2" }, // keep your primary color
//     },
//   });

//   return (
//     <CacheProvider value={cache}>
//       <ThemeProvider theme={theme}>
//         <CssBaseline />
//         <NavTabs />
//         {children}
//       </ThemeProvider>
//     </CacheProvider>
//   );
// }
