"use client";

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";

export function EmotionCacheProvider({ children }) {
  const cache = createCache({ key: "css", prepend: true });
  return <CacheProvider value={cache}>{children}</CacheProvider>;
}
