"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TablePagination } from "@/components/forms/table-pagination";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import type { LowRating } from "./types";
import { commentStateLabel, dayText } from "./rating-format";
import { ExpandableText } from "./expandable-text";

const TONE = {
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  muted: "bg-muted text-muted-foreground",
};

export function RatingLowList({
  rows,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  commentedOnly,
}: {
  rows: LowRating[];
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  commentedOnly: boolean;
}) {
  const t = useT();
  if (total === 0) {
    return (
      <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        {commentedOnly ? t("Bu oyda izohli past baho yo'q") : t("Bu oyda 1–3 baho yo'q")}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Sana")}</TableHead>
            <TableHead>{t("Guruh")}</TableHead>
            <TableHead>{t("Ustoz")}</TableHead>
            <TableHead>{t("Baho")}</TableHead>
            <TableHead>{t("Izoh")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell className="border-r text-muted-foreground">
                {(page - 1) * pageSize + i + 1}
              </TableCell>
              <TableCell>{dayText(r.date)}</TableCell>
              <TableCell>
                <Link href={`/groups/${r.groupId}`} className="hover:underline">
                  {r.groupName}
                </Link>
              </TableCell>
              <TableCell>{r.teacherNames.join(", ") || "—"}</TableCell>
              <TableCell className="text-destructive">{r.score} ⭐</TableCell>
              <TableCell className="max-w-xs whitespace-normal text-sm">
                <CommentCell row={r} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <TablePagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </div>
  );
}

function CommentCell({ row }: { row: LowRating }) {
  const t = useT();
  const label = commentStateLabel(row.commentState);
  return (
    <div className="space-y-1">
      <Badge variant="ghost" className={cn(TONE[label.tone])}>
        {t(label.text)}
      </Badge>
      {row.comment && <ExpandableText text={row.comment} />}
    </div>
  );
}
