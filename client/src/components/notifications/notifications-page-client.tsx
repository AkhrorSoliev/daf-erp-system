"use client";

import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import {
  fetchNotificationCounts,
  fetchNotificationPage,
  useNotifications,
} from "@/hooks/use-notifications";
import { useUrlFilters } from "@/hooks/use-url-filters";
import { cn } from "@/lib/utils";
import { useNotificationActions } from "./notification-actions";
import { NotificationPageList } from "./notification-page-list";
import { PAGE_VIEWS, VIEW_LABEL, viewCount, viewParams } from "./notification-view";

// `?view=` (default «Kutilmoqda», left out of the URL) and `?q=`.
const schema = {
  view: { type: "string" as const, defaultValue: "pending" },
  q: { type: "string" as const, defaultValue: "" },
};

/**
 * «Barcha bildirishnomalar» (mockup s20). Every filter lives in the URL; each
 * list is a React Query entry keyed by its filter, so a slow answer of an older
 * filter lands in that filter's own entry and can never replace the current
 * list. Paging follows the server's `nextCursor`.
 */
export function NotificationsPageClient() {
  const { filters, setFilter } = useUrlFilters(schema);
  const { hrefOf, onOpen } = useNotificationActions();
  const markAllRead = useNotifications((s) => s.markAllRead);
  const version = useNotifications((s) => s.version);
  const queryClient = useQueryClient();

  const view = PAGE_VIEWS.find((v) => v === filters.view) ?? "pending";
  const params = viewParams(view);
  const q = filters.q.trim();

  // staleTime 0: a view opened again asks again (the cached rows show meanwhile).
  const list = useInfiniteQuery({
    queryKey: ["notifications", "page", view, q],
    queryFn: ({ pageParam }) => fetchNotificationPage({ ...params, q, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 0,
  });
  const counts = useQuery({
    queryKey: ["notifications", "counts"],
    queryFn: fetchNotificationCounts,
    staleTime: 0,
  });

  // A new, read or closed notification (SSE, the bell or this page) moves the store's version.
  const seenVersion = useRef(version);
  useEffect(() => {
    if (version === seenVersion.current) return;
    seenVersion.current = version;
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [version, queryClient]);

  // «5 daqiqa oldin» and «Bugun» keep up with a page left open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // The box shows what was typed until the URL has caught up, then follows the URL
  // again (Back, or the bell's link to the unfiltered page, change it from outside).
  const [typed, setTyped] = useState<string | null>(null);
  if (typed !== null && typed === filters.q) setTyped(null);
  const writeQuery = useDebouncedCallback((value: string) => setFilter("q", value), 300);

  const items = list.data?.pages.flatMap((p) => p.data);
  const emptyText = q
    ? "Hech narsa topilmadi"
    : view === "pending"
      ? "Sizdan hech narsa kutilmayapti"
      : "Bildirishnomalar yo'q";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Bildirishnomalar</h1>
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={typed ?? filters.q}
            onChange={(e) => {
              setTyped(e.target.value);
              writeQuery(e.target.value);
            }}
            placeholder="Xabarlardan qidirish"
            aria-label="Xabarlardan qidirish"
            className="pl-8"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => void markAllRead()}>
          {"Hammasini o'qilgan qilish"}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-[200px_1fr]">
        <nav aria-label="Bildirishnoma turlari" className="flex gap-1 overflow-x-auto md:flex-col">
          {PAGE_VIEWS.map((v) => {
            const count = viewCount(v, counts.data);
            return (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                onClick={() => setFilter("view", v)}
                className={cn(
                  "flex shrink-0 items-center justify-between gap-3 rounded-md px-3 py-2 text-sm",
                  view === v ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/50",
                )}
              >
                {VIEW_LABEL[v]}
                {count !== null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 rounded-lg border">
          <NotificationPageList
            items={items}
            failed={list.isError}
            emptyText={emptyText}
            now={now}
            onOpen={onOpen}
            hrefOf={hrefOf}
            onRetry={() => void list.refetch()}
          />
          {items && list.hasNextPage && (
            <div className="space-y-2 border-t p-3 text-center">
              {list.isFetchNextPageError && (
                <p role="alert" className="text-sm text-muted-foreground">
                  {"Ma'lumotni yuklab bo'lmadi"}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={list.isFetchingNextPage}
                onClick={() => void list.fetchNextPage()}
              >
                {list.isFetchingNextPage
                  ? "Yuklanmoqda..."
                  : list.isFetchNextPageError
                    ? "Qayta urinish"
                    : "Yana ko'rsatish"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
