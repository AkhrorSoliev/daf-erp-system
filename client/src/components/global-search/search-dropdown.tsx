"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Users,
  GraduationCap,
  BookOpen,
  UsersRound,
  Layers,
  FileText,
  Clock,
  X,
  Hash,
  Phone,
  Type,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { useGlobalSearch, type SearchItem } from "@/hooks/use-global-search";

interface FlatItem {
  type: string;
  id: string | number;
  url?: string;
  action?: () => void;
}

const entityRoutes: Record<string, (id: string | number) => string> = {
  students: (id) => `/students/profile/${id}`,
  teachers: (id) => `/teachers/profile/${id}`,
  users: (id) => `/settings/employees/${id}`,
  groups: (id) => `/groups/${id}`,
  courses: () => `/settings/courses`,
};

const categoryConfig = [
  { key: "pages", label: "Sahifalar", icon: FileText },
  { key: "students", label: "O'quvchilar", icon: BookOpen },
  { key: "users", label: "Xodimlar", icon: Users },
  { key: "teachers", label: "O'qituvchilar", icon: GraduationCap },
  { key: "groups", label: "Guruhlar", icon: UsersRound },
  { key: "courses", label: "Kurslar", icon: Layers },
] as const;

function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 9) {
    return `+998 ${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5, 7)} ${digits.slice(7)}`;
  }
  return phone;
}

function getInitials(label: string): string {
  const parts = label.split(" ");
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return label.slice(0, 2).toUpperCase();
}

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
    // Recent searches as navigable items
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
        <div className="relative grow hidden sm:block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleInputKeyDown}
            placeholder="Qidirish..."
            className="pl-9 pr-16 max-w-sm"
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

// --- Empty state: hints + recent searches ---

function EmptyState({
  recentSearches,
  activeIndex,
  flatItems,
  onSelect,
  onRemove,
  onClear,
}: {
  recentSearches: string[];
  activeIndex: number;
  flatItems: FlatItem[];
  onSelect: (term: string) => void;
  onRemove: (term: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="py-2">
      {/* Search hints */}
      <div className="px-3 pb-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Qidirish bo&#39;yicha maslahatlar
        </p>
        <div className="space-y-1.5">
          <HintRow icon={Type} text="Ism yoki familiya yozing" example="Ali Valiyev" />
          <HintRow icon={Phone} text="Telefon raqam bilan qidiring" example="901234567" />
          <HintRow icon={Hash} text="ID bilan qidiring" example="#10234" />
        </div>
      </div>

      {/* Recent searches */}
      {recentSearches.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="flex items-center justify-between px-3 mb-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              So&#39;nggi qidiruvlar
            </p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
              onClick={onClear}
            >
              Tozalash
            </button>
          </div>
          {recentSearches.map((term) => {
            const idx = flatItems.findIndex(
              (f) => f.type === "recent" && f.id === term,
            );
            return (
              <div
                key={term}
                className={`flex items-center gap-2 px-3 py-1.5 text-sm group ${
                  idx === activeIndex ? "bg-accent" : "hover:bg-accent"
                }`}
              >
                <Clock className="size-3.5 text-muted-foreground shrink-0" />
                <button
                  className="flex-1 text-left truncate cursor-pointer"
                  onClick={() => onSelect(term)}
                >
                  {term}
                </button>
                <button
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-muted cursor-pointer transition-opacity"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(term);
                  }}
                >
                  <X className="size-3 text-muted-foreground" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HintRow({
  icon: Icon,
  text,
  example,
}: {
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  example: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <Icon className="size-3.5 shrink-0" />
      <span>{text}</span>
      <code className="ml-auto bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">
        {example}
      </code>
    </div>
  );
}

// --- Result components ---

function ResultCategory({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        <Icon className="size-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

function PageResultItem({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-2 ${
        isActive ? "bg-accent" : "hover:bg-accent"
      }`}
      onClick={onClick}
    >
      <FileText className="size-4 text-muted-foreground shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

function EntityResultItem({
  item,
  showAvatar,
  showId,
  isActive,
  onClick,
}: {
  item: SearchItem;
  showAvatar: boolean;
  showId: boolean;
  isActive: boolean;
  onClick: () => void;
}) {
  const phone = formatPhone(item.phone);

  return (
    <button
      className={`w-full text-left px-3 py-2 text-sm cursor-pointer transition-colors flex items-center gap-3 ${
        isActive ? "bg-accent" : "hover:bg-accent"
      }`}
      onClick={onClick}
    >
      {showAvatar && (
        <Avatar className="size-7 shrink-0">
          <AvatarImage src={item.photo ?? undefined} alt={item.label} />
          <AvatarFallback className="text-[10px]">
            {getInitials(item.label)}
          </AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{item.label}</span>
          {showId && (
            <span className="text-xs text-muted-foreground shrink-0">
              #{item.id}
            </span>
          )}
        </div>
        {(phone || item.sublabel) && (
          <div className="text-xs text-muted-foreground truncate">
            {phone || item.sublabel}
          </div>
        )}
      </div>
    </button>
  );
}

function KbdShortcut() {
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  return (
    <kbd className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:inline-flex h-5 items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
      {isMac ? (
        <>
          <span className="text-xs">&#x2318;</span>K
        </>
      ) : (
        <>Ctrl+K</>
      )}
    </kbd>
  );
}

function SearchSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-20" />
          <div className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="size-7 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
