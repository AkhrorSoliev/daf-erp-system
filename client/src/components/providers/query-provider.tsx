"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { BranchQuerySync } from "./branch-query-sync";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 5 * 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={client}>
      {/* Must sit INSIDE the provider — it needs `useQueryClient`. Rendering
          nothing; it only watches the branch selection and drops the cache. */}
      <BranchQuerySync />
      {children}
    </QueryClientProvider>
  );
}
