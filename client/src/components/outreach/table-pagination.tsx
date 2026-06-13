"use client";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumber } from "@/lib/format-utils";

const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50];

interface TablePaginationProps {
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  // Consumers must reset the page to 1 inside this handler. This component does
  // NOT call onPageChange(1) itself — for URL-backed pagination that would fire a
  // second router.replace in the same tick, and the stale-searchParams closure of
  // the second call clobbers the page-size update (the size change is lost).
  onPageSizeChange: (size: number) => void;
}

export function TablePagination({
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: TablePaginationProps) {
  if (total <= 0) return null;

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>Jami: {formatNumber(total)} ta yozuv</span>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs">Sahifa hajmi:</span>
          <Select
            value={String(pageSize)}
            onValueChange={(v) => onPageSizeChange(Number(v))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Oldingi
        </Button>
        <span className="text-xs">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Keyingi
        </Button>
      </div>
    </div>
  );
}
