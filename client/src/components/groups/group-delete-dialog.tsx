"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft, Loader2, TriangleAlert } from "lucide-react";
import toast from "react-hot-toast";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { liveStudentsLine, type GroupDeletePreview } from "./group-delete-copy";
import { useT } from "@/i18n/context";

interface GroupDeleteDialogProps {
  group: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: (id: string) => void;
}

/**
 * Deleting a group takes its students out of it: every active and frozen
 * enrollment closes, unused lessons go back to the balance, and restoring the
 * group from the archive brings it back empty. The dialog says so, with the
 * number of students, before the admin confirms.
 */
export function GroupDeleteDialog({
  group,
  open,
  onOpenChange,
  onDeleted,
}: GroupDeleteDialogProps) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [deleting, setDeleting] = useState(false);

  // Asked on every open (staleTime 0 overrides the app's 5-minute default):
  // the admin decides on this number, and the row it would otherwise come
  // from counts active students only.
  const preview = useQuery<GroupDeletePreview>({
    queryKey: ["group-delete-preview", group.id],
    queryFn: () =>
      api
        .get<GroupDeletePreview>(`/groups/${group.id}/delete-preview`)
        .then((r) => r.data),
    enabled: open,
    staleTime: 0,
    retry: false,
  });
  const counting = preview.isFetching;
  // Unknown after a failed request: the warning then goes without a number.
  const counts = preview.isError ? undefined : preview.data;
  const line = counts ? liveStudentsLine(counts, t) : null;
  const empty = !counting && counts !== undefined && line === null;

  const handleOpenChange = (next: boolean) => {
    if (deleting) return;
    if (!next) setReason("");
    onOpenChange(next);
  };

  const handleDelete = async () => {
    setDeleting(true);
    const note = reason.trim();
    try {
      const { data } = await api.delete<{ message?: string }>(
        `/groups/${group.id}`,
        note ? { data: { reason: note } } : undefined,
      );
      setDeleting(false);
      setReason("");
      onOpenChange(false);
      toast.success(data?.message ?? t("Guruh o'chirildi"));
      onDeleted?.(group.id);
    } catch (error) {
      setDeleting(false);
      toast.error(getErrorMessage(error, t("O'chirishda xatolik yuz berdi")));
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent
        className="max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("«{name}» guruhini o'chirasizmi?", { name: group.name })}
          </AlertDialogTitle>
          {empty ? (
            <AlertDialogDescription>
              {t("Guruhda o'quvchi yo'q. Guruh arxivga o'tkaziladi.")}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {counting ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <AlertDialogDescription className="sr-only">
              {t("Guruhdagi o'quvchilar soni yuklanmoqda")}
            </AlertDialogDescription>
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : empty ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm leading-relaxed">
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-hidden
              />
              <div className="flex flex-col gap-1">
                <AlertDialogDescription className="font-medium text-foreground">
                  {line ??
                    t("Guruhdagi barcha o'quvchilar, muzlatilganlar ham, guruhdan chiqariladi.")}
                </AlertDialogDescription>
                <p>
                  {line
                    ? t("Ular guruhdan chiqariladi, ishlatilmagan darslari puli balansiga qaytadi.")
                    : t("Ishlatilmagan darslari puli balansiga qaytadi.")}
                </p>
                <p>
                  {t("Guruhni arxivdan tiklasangiz ham o'quvchilar qaytmaydi.")}
                </p>
              </div>
            </div>
            <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {t("O'quvchilar boshqa guruhda davom etishi kerak bo'lsa, avval ularni o'quvchi sahifasidan boshqa guruhga o'tkazing.")}
              </span>
            </p>
          </div>
        )}

        <Textarea
          aria-label={t("O'chirish sababi")}
          placeholder={t("Sabab yozing (ixtiyoriy)...")}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          className="resize-none"
          disabled={deleting}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>{t("Bekor qilish")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={deleting || counting}
            onClick={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            {deleting ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : null}
            {deleting ? t("O'chirilmoqda...") : t("O'chirish")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
