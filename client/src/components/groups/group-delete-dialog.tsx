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
  const line = counts ? liveStudentsLine(counts) : null;
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
      toast.success(data?.message ?? "Guruh o'chirildi");
      onDeleted?.(group.id);
    } catch (error) {
      setDeleting(false);
      toast.error(getErrorMessage(error, "O'chirishda xatolik yuz berdi"));
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
            «{group.name}» guruhini o&apos;chirasizmi?
          </AlertDialogTitle>
          {empty ? (
            <AlertDialogDescription>
              Guruhda o&apos;quvchi yo&apos;q. Guruh arxivga o&apos;tkaziladi.
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>

        {counting ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            <AlertDialogDescription className="sr-only">
              Guruhdagi o&apos;quvchilar soni yuklanmoqda
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
                    "Guruhdagi barcha o'quvchilar, muzlatilganlar ham, guruhdan chiqariladi."}
                </AlertDialogDescription>
                <p>
                  {line
                    ? "Ular guruhdan chiqariladi, ishlatilmagan darslari puli balansiga qaytadi."
                    : "Ishlatilmagan darslari puli balansiga qaytadi."}
                </p>
                <p>
                  Guruhni arxivdan tiklasangiz ham o&apos;quvchilar qaytmaydi.
                </p>
              </div>
            </div>
            <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
              <ArrowRightLeft className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                O&apos;quvchilar boshqa guruhda davom etishi kerak bo&apos;lsa,
                avval ularni o&apos;quvchi sahifasidan boshqa guruhga
                o&apos;tkazing.
              </span>
            </p>
          </div>
        )}

        <Textarea
          aria-label="O'chirish sababi"
          placeholder="Sabab yozing (ixtiyoriy)..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={500}
          rows={2}
          className="resize-none"
          disabled={deleting}
        />

        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>Bekor qilish</AlertDialogCancel>
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
            {deleting ? "O'chirilmoqda..." : "O'chirish"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
