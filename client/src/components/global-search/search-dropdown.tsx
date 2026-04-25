"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Search, FileText } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useGlobalSearch } from "@/hooks/use-global-search";
import {
  categoryConfig,
  entityRoutes,
  type FlatItem,
} from "./search-dropdown-utils";
import { EmptyState } from "./search-dropdown-empty-state";
import {
  EntityResultItem,
  PageResultItem,
  ResultCategory,
} from "./search-dropdown-results";
import { KbdShortcut, SearchSkeleton } from "./search-dropdown-helpers";

export function SearchDropdown() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const {
    query,
    setQuery,
    results,
    isLoading,
    isOpen,
    setIsOpen,
    close,
    pageResults,
    hasResults,
    showEmpty,
    recentSearches,
    addRecentSearch,
    removeRecentSearch,
    clearRecentSearches,
  } = useGlobalSearch();

  // Build flat list for keyboard navigation
  const flatItems: FlatItem[] = [];

  if (showEmpty) {
    for (const term of recentSearches) {
      flatItems.push({
        type: "recent",
        id: term,
        action: () => setQuery(term),
      });
    }
  } else {
    if (pageResults.length > 0) {
      for (const page of pageResults) {
        flatItems.push({ type: "pages", id: page.url, url: page.url });
      }
    }

    for (const cat of categoryConfig) {
      if (cat.key === "pages") continue;
      const category = results[cat.key as keyof typeof results];
      if (category && category.items.length > 0) {
        for (const item of category.items) {
          flatItems.push({
            type: cat.key,
            id: item.id,
            url: entityRoutes[cat.key](item.id),
          });
        }
        if (category.total > 5) {
          flatItems.push({
            type: `${cat.key}-more`,
            id: "more",
            url: `/search?q=${encodeURIComponent(query)}&type=${cat.key}`,
          });
        }
      }
    }
  }

  const navigateTo = useCallback(
    (url: string) => {
      if (query.trim().length >= 2) {
        addRecentSearch(query);
      }
      close();
      router.push(url);
    },
    [close, router, query, addRecentSearch],
  );

  const handleSelect = useCallback(
    (item: FlatItem) => {
      if (item.action) {
        item.action();
      } else if (item.url) {
        navigateTo(item.url);
      }
    },
    [navigateTo],
  );

  // Cmd+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keyboard navigation
  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || flatItems.length === 0) {
      if (e.key === "Escape") {
        close();
        inputRef.current?.blur();
      }
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => (prev < flatItems.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      handleSelect(flatItems[activeIndex]);
    } else if (e.key === "Escape") {
      close();
      inputRef.current?.blur();
    }
  };

  useEffect(() => {
    setActiveIndex(-1);
  }, [results, pageResults, showEmpty]);

  const showDropdown =
    isOpen &&
    (showEmpty ||
      (query.trim().length >= 1 &&
        (isLoading || hasResults || query.trim().length >= 2)));

  return (
    <Popover open={showDropdown} onOpenChange={setIsOpen}>
      <PopoverAnchor asChild>
        <div className="relative hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onClick={() => setIsOpen(true)}
            onKeyDown={handleInputKeyDown}
            placeholder="Qidirish..."
            className="pl-9 pr-16 w-full max-w-md"
          />
          <KbdShortcut />
        </div>
      </PopoverAnchor>

      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-95 max-h-[70vh] overflow-y-auto p-0 gap-0"
        align="start"
        sideOffset={8}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {showEmpty ? (
          <EmptyState
            recentSearches={recentSearches}
            activeIndex={activeIndex}
            flatItems={flatItems}
            onSelect={setQuery}
            onRemove={removeRecentSearch}
            onClear={clearRecentSearches}
          />
        ) : isLoading && query.trim().length >= 2 ? (
          <SearchSkeleton />
        ) : !hasResults && query.trim().length >= 2 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            Natija topilmadi
          </div>
        ) : (
          <div className="py-1">
            {pageResults.length > 0 && (
              <ResultCategory label="Sahifalar" icon={FileText}>
                {pageResults.map((page) => {
                  const idx = flatItems.findIndex(
                    (f) => f.type === "pages" && f.id === page.url,
                  );
                  return (
                    <PageResultItem
                      key={page.url}
                      label={page.label}
                      isActive={idx === activeIndex}
                      onClick={() => navigateTo(page.url)}
                    />
                  );
                })}
              </ResultCategory>
            )}

            {categoryConfig
              .filter((c) => c.key !== "pages")
              .map((cat) => {
                const category = results[cat.key as keyof typeof results];
                if (!category || category.items.length === 0) return null;

                const showAvatar = ["students", "users", "teachers"].includes(
                  cat.key,
                );

                return (
                  <ResultCategory
                    key={cat.key}
                    label={cat.label}
                    icon={cat.icon}
                  >
                    {category.items.map((item) => {
                      const idx = flatItems.findIndex(
                        (f) => f.type === cat.key && f.id === item.id,
                      );
                      return (
                        <EntityResultItem
                          key={`${cat.key}-${item.id}`}
                          item={item}
                          showAvatar={showAvatar}
                          showId={showAvatar}
                          isStudent={cat.key === "students"}
                          isActive={idx === activeIndex}
                          onClick={() =>
                            navigateTo(entityRoutes[cat.key](item.id))
                          }
                        />
                      );
                    })}
                    {category.total > 5 && (
                      <button
                        className={`w-full text-left px-3 py-1.5 text-xs text-primary hover:bg-accent cursor-pointer transition-colors ${
                          flatItems.findIndex(
                            (f) => f.type === `${cat.key}-more`,
                          ) === activeIndex
                            ? "bg-accent"
                            : ""
                        }`}
                        onClick={() =>
                          navigateTo(
                            `/search?q=${encodeURIComponent(query)}&type=${cat.key}`,
                          )
                        }
                      >
                        Barchasini ko&#39;rish ({category.total})
                      </button>
                    )}
                  </ResultCategory>
                );
              })}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
