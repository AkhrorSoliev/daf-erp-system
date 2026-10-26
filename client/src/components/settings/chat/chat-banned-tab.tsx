"use client";

import { useState } from "react";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { TablePagination } from "@/components/outreach/table-pagination";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { useChatBanned, useUnbanStudent } from "./chat-admin-queries";
import { BANNED_LIST_CAP, type ChatBannedRow } from "./chat-admin-types";
import { formatReportDate } from "./chat-report-rules";

const EMPTY = msg("Chatdan chiqarilgan o'quvchi yo'q — shikoyatni ko'rib chiqishda chiqarish mumkin");
const LOAD_FAILED = msg("Chatdan chiqarilganlarni yuklab bo'lmadi.");

export function ChatBannedTab() {
  const t = useT();
  const { data, isError, isFetching, refetch } = useChatBanned();
  const unban = useUnbanStudent();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [target, setTarget] = useState<ChatBannedRow | null>(null);
  const pendingId = unban.isPending ? unban.variables : null;

  const lastPage = Math.max(1, Math.ceil((data?.length ?? 0) / pageSize));
  const current = Math.min(page, lastPage);
  const offset = (current - 1) * pageSize;

  const confirm = () => {
    if (target) unban.mutate(target.id);
    setTarget(null);
  };

  return (
    <div className="space-y-4 pt-4">
      {data ? (
        data.length === 0 ? (
          <p className="rounded-md border py-10 text-center text-sm text-muted-foreground">{t(EMPTY)}</p>
        ) : (
          <BannedTable rows={data.slice(offset, offset + pageSize)} offset={offset} pendingId={pendingId} onPick={setTarget} />
        )
      ) : isError ? (
        <div className="space-y-3 rounded-md border p-6 text-center">
          <p className="text-sm text-muted-foreground">{t(LOAD_FAILED)}</p>
          <Button variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching && <Loader2 className="size-4 animate-spin" />}
            {t("Qayta urinish")}
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded" />
          ))}
        </div>
      )}

      {data && data.length > 0 && (
        <TablePagination
          total={data.length}
          page={current}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      )}
      {data && data.length >= BANNED_LIST_CAP && (
        <p className="text-center text-xs text-muted-foreground">{t("Eng yangi {n} tasi ko'rsatilgan", { n: BANNED_LIST_CAP })}</p>
      )}

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("{name} chatga qaytarilsinmi?", { name: target?.name ?? "" })}</AlertDialogTitle>
            <AlertDialogDescription>{t("U yana chatga yoza oladi.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Bekor qilish")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirm}>{t("Chatga qaytarish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function BannedTable({
  rows,
  offset,
  pendingId,
  onPick,
}: {
  rows: ChatBannedRow[];
  offset: number;
  pendingId: number | null | undefined;
  onPick: (row: ChatBannedRow) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12 border-r">#</TableHead>
            <TableHead>{t("Ism")}</TableHead>
            <TableHead>{t("@nom")}</TableHead>
            <TableHead>{t("Chatdan chiqarilgan sana")}</TableHead>
            <TableHead className="w-12 text-right">
              <span className="sr-only">{t("Amallar")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id}>
              <TableCell className="border-r text-muted-foreground">{offset + i + 1}</TableCell>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="text-muted-foreground">{r.username ? `@${r.username}` : "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatReportDate(r.chatBannedAt)}</TableCell>
              <TableCell className="text-right">
                {pendingId === r.id ? (
                  <Loader2 role="status" aria-label={t("Yuklanmoqda...")} className="ml-auto size-4 animate-spin text-muted-foreground" />
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">{t("Amallar")}</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onPick(r)}>{t("Chatga qaytarish")}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
