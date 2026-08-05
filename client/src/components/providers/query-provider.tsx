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
      {/* Must sit INSIDE the provider — it needs `useQueryClient`. Renders
          nothing; it watches the branch selection and drops every cache.

          ORDER IS LOAD-BEARING: keep it BEFORE `{children}`. React queues
          passive effects in render-completion order, so this component's effect
          (which clears the query cache and the zustand stores) runs before the
          effects of anything inside `children` — including the page that
          `BranchScopedMain` has just remounted for the new branch. Move it below
          and the order inverts: the fresh page would call `fetchBoard()`, set
          `loadingBoard: true`, and only THEN be reset to an empty non-loading
          state — showing "no data" instead of a spinner while its request is
          still in flight. The data would still end up correct; the reading of
          it would not. */}
      <BranchQuerySync />
      {children}
    </QueryClientProvider>
  );
}
