"use client";

import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/use-t";

interface DialogPaginationFooterProps {
  isLoading: boolean;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
}

/**
 * Shared pagination footer for dialog tables — matches the main page-level
 * pagination pattern (CLAUDE.md: Pagination Rules → Dialog/drawer tables).
 */
export function DialogPaginationFooter({
  isLoading,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: DialogPaginationFooterProps) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
            {t("Yuklanmoqda...")}
          </span>
        ) : (
          <>
            <span>{t("Sahifada:")}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
            >
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 40, 50].map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>
              {t("Jami:")}{" "}
              <span className="tabular-nums">
                {total.toLocaleString("uz-UZ")}
              </span>
            </span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page <= 1 || isLoading}
          onClick={() => onPageChange(page - 1)}
          aria-label={t("Oldingi")}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8"
          disabled={page >= totalPages || isLoading}
          onClick={() => onPageChange(page + 1)}
          aria-label={t("Keyingi")}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
