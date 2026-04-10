"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Search,
  Users,
  GraduationCap,
  BookOpen,
  UsersRound,
  Layers,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedCallback } from "@/hooks/use-debounced-callback";
import api from "@/lib/api";

interface SearchItem {
  id: number | string;
  label: string;
  sublabel?: string;
}

interface FullSearchResult {
  data: SearchItem[];
  total: number;
  page: number;
  pageSize: number;
}

const typeConfig: Record<
  string,
  {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    getUrl: (id: string | number) => string;
  }
> = {
  students: {
    label: "O'quvchilar",
    icon: BookOpen,
    getUrl: (id) => `/students/profile/${id}`,
  },
  users: {
    label: "Xodimlar",
    icon: Users,
    getUrl: () => `/settings/employees`,
  },
  teachers: {
    label: "O'qituvchilar",
    icon: GraduationCap,
    getUrl: (id) => `/teachers/profile/${id}`,
  },
  groups: {
    label: "Guruhlar",
    icon: UsersRound,
    getUrl: (id) => `/groups/${id}`,
  },
  courses: {
    label: "Kurslar",
    icon: Layers,
    getUrl: () => `/settings/courses`,
  },
};

const typeKeys = Object.keys(typeConfig);

export function SearchResultsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const q = searchParams.get("q") || "";
  const type = searchParams.get("type") || "";
  const pageParam = parseInt(searchParams.get("page") || "1", 10);

  const [searchInput, setSearchInput] = useState(q);
  const [result, setResult] = useState<FullSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const updateUrl = useCallback(
    (updates: { q?: string; type?: string; page?: number }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (updates.q !== undefined) {
        if (updates.q) params.set("q", updates.q);
        else params.delete("q");
      }
      if (updates.type !== undefined) {
        if (updates.type) params.set("type", updates.type);
        else params.delete("type");
      }
      if (updates.page !== undefined && updates.page > 1) {
        params.set("page", String(updates.page));
      } else {
        params.delete("page");
      }
      const qs = params.toString();
      router.replace(qs ? `/search?${qs}` : "/search");
    },
    [searchParams, router],
  );

  const debouncedUpdateQuery = useDebouncedCallback((value: string) => {
    updateUrl({ q: value, page: 1 });
  }, 300);

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    debouncedUpdateQuery(value);
  };

  useEffect(() => {
    if (!q || !type || q.trim().length < 2) {
      setResult(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    api
      .get<FullSearchResult>("/search", {
        params: { search: q, type, page: pageParam, pageSize: 20 },
      })
      .then(({ data }) => {
        if (!cancelled) setResult(data);
      })
      .catch(() => {
        if (!cancelled) setResult(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [q, type, pageParam]);

  const totalPages = result ? Math.ceil(result.total / 20) : 0;
  const currentType = typeConfig[type];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-6">
      <div className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Qidirish..."
            className="pl-10 text-base h-11"
            autoFocus
          />
        </div>

        {/* Type tabs */}
        <div className="flex gap-2 flex-wrap">
          {typeKeys.map((key) => {
            const config = typeConfig[key];
            const Icon = config.icon;
            const isActive = type === key;
            return (
              <Button
                key={key}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => updateUrl({ type: key, page: 1 })}
              >
                <Icon className="size-3.5 mr-1.5" />
                {config.label}
              </Button>
            );
          })}
        </div>
      </div>

      {/* Results */}
      {!type && q && (
        <p className="text-sm text-muted-foreground">
          Kategoriya tanlang
        </p>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      ) : result && currentType ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {result.total} ta natija topildi
          </p>

          {result.data.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              Natija topilmadi
            </div>
          ) : (
            <div className="space-y-1">
              {result.data.map((item, index) => {
                const Icon = currentType.icon;
                const rowNum = (pageParam - 1) * 20 + index + 1;
                return (
                  <Link
                    key={`${type}-${item.id}`}
                    href={currentType.getUrl(item.id)}
                    className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-accent transition-colors border border-transparent hover:border-border"
                  >
                    <span className="text-xs text-muted-foreground w-6 text-right">
                      {rowNum}
                    </span>
                    <Icon className="size-4 text-muted-foreground shrink-0" />
                    <span className="font-medium truncate">{item.label}</span>
                    {item.sublabel && (
                      <span className="ml-auto text-sm text-muted-foreground shrink-0">
                        {item.sublabel}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4">
              <p className="text-sm text-muted-foreground">
                Sahifa {pageParam} / {totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageParam <= 1}
                  onClick={() => updateUrl({ page: pageParam - 1 })}
                >
                  <ChevronLeft className="size-4" />
                  Oldingi
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageParam >= totalPages}
                  onClick={() => updateUrl({ page: pageParam + 1 })}
                >
                  Keyingi
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
