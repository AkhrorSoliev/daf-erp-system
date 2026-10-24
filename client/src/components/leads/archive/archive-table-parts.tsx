"use client";

import { Archive, MoreHorizontal, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { TableCell, TableRow } from "@/components/ui/table";
import type { DeletedBy } from "./archive-types";
import { useT } from "@/i18n/context";

export function deletedByName(by: DeletedBy | null): string {
  if (!by) return "—";
  return [by.firstName, by.lastName].filter(Boolean).join(" ").trim() || "—";
}

/** The «⋯» menu with the one action an archived row has. */
export function RestoreMenu({ onRestore }: { onRestore: () => void }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-xs">
          <MoreHorizontal className="size-4" />
          <span className="sr-only">{t("Amallar")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onRestore}>
          <RotateCcw className="mr-2 size-4" />
          {t("Tiklash")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * What the table body shows when there are no rows to draw: a skeleton while
 * the first answer is on its way, a retry when it failed (never the empty
 * state), and an empty state that says what to do next.
 */
export function ArchiveEmptyStates({
  span,
  isPending,
  isError,
  isEmpty,
  filtered,
  noun,
  onRetry,
  onClear,
}: {
  span: number;
  isPending: boolean;
  isError: boolean;
  isEmpty: boolean;
  filtered: boolean;
  /** Which list is empty: the texts differ per noun. */
  noun: "lid" | "bo'lim";
  onRetry: () => void;
  onClear: () => void;
}) {
  const t = useT();
  if (isPending) {
    return (
      <>
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRow key={i}>
            <TableCell colSpan={span}>
              <Skeleton className="h-5 w-full" />
            </TableCell>
          </TableRow>
        ))}
      </>
    );
  }
  if (isError) {
    return (
      <TableRow>
        <TableCell colSpan={span} className="h-24 text-center">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            {t("Arxivni yuklab bo'lmadi")}
            <Button variant="outline" size="sm" onClick={onRetry}>
              {t("Qayta urinish")}
            </Button>
          </div>
        </TableCell>
      </TableRow>
    );
  }
  if (isEmpty) {
    return (
      <TableRow>
        <TableCell colSpan={span} className="h-24 text-center text-muted-foreground">
          <div className="flex flex-col items-center gap-2">
            <Archive className="size-7 text-muted-foreground/50" />
            {noun === "lid"
              ? filtered
                ? t("Filtrga mos lid topilmadi — filtrni tozalab ko'ring")
                : t("Arxivda lid yo'q — o'chirilgan lidlar shu yerda saqlanadi")
              : filtered
                ? t("Filtrga mos bo'lim topilmadi — filtrni tozalab ko'ring")
                : t("Arxivda bo'lim yo'q — o'chirilgan bo'limlar shu yerda saqlanadi")}
            {filtered && (
              <Button variant="outline" size="sm" onClick={onClear}>
                {t("Filtrni tozalash")}
              </Button>
            )}
          </div>
        </TableCell>
      </TableRow>
    );
  }
  return null;
}
