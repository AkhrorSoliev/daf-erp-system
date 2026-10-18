"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { getVisibleSettingsSections } from "@/lib/settings-nav";
import { filterSettingsSections } from "@/lib/settings-search";
import { isCeoUser, useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { useUrlFilters, type FilterSchema } from "@/hooks/use-url-filters";
import {
  SettingsMenuSkeleton,
  SettingsNoResults,
  SettingsSection,
} from "./settings-menu-parts";

const SCHEMA = { q: { type: "string", defaultValue: "" } } satisfies FilterSchema;

/** Qisqa ro'yxatga qidiruv shart emas: 6 tagacha punktli rol uni ko'rmaydi. */
const SEARCH_FROM = 7;

export function SettingsMenu() {
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const { filters, setFilter } = useUrlFilters(SCHEMA);
  // Yozayotganda maydon URL'ni kutib turmaydi: URL ortidan keladi.
  const [query, setQuery] = useState(filters.q);
  const inputRef = useRef<HTMLInputElement>(null);

  const isCeo = isCeoUser(user);
  const visible = useMemo(
    () => (user ? getVisibleSettingsSections(can, isCeo) : []),
    [user, can, isCeo],
  );
  const total = visible.reduce((sum, section) => sum + section.items.length, 0);
  const searchable = total >= SEARCH_FROM;
  const shown = useMemo(
    () => filterSettingsSections(visible, searchable ? query : ""),
    [visible, query, searchable],
  );
  const found = shown.reduce((sum, section) => sum + section.items.length, 0);

  // "/" bosilsa qidiruvga o'tadi (boshqa maydonda yozilayotgan bo'lmasa).
  useEffect(() => {
    if (!searchable) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target?.closest("input, textarea, select, [contenteditable]");
      if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchable]);

  if (!user) return <SettingsMenuSkeleton />;

  const change = (value: string) => {
    setQuery(value);
    setFilter("q", value);
  };

  return (
    <div className="space-y-7">
      {searchable && (
        <div>
          <div className="relative max-w-md">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => change(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && query) change("");
              }}
              placeholder="Sozlamadan qidirish…"
              aria-label="Sozlamadan qidirish"
              className="h-10 bg-card pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
            />
            {query ? (
              <button
                type="button"
                onClick={() => {
                  change("");
                  inputRef.current?.focus();
                }}
                aria-label="Qidiruvni tozalash"
                className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            ) : (
              <kbd className="pointer-events-none absolute right-3 top-1/2 hidden h-5 -translate-y-1/2 items-center rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground sm:inline-flex">
                /
              </kbd>
            )}
          </div>
          <p className="sr-only" aria-live="polite">
            {query ? `${found} ta sozlama topildi` : ""}
          </p>
        </div>
      )}

      {shown.length === 0 ? (
        <SettingsNoResults query={query} onClear={() => change("")} />
      ) : (
        shown.map((section) => (
          <SettingsSection key={section.title} section={section} query={searchable ? query : ""} />
        ))
      )}
    </div>
  );
}
