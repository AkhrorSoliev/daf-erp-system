"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import toast from "react-hot-toast";
import { Check, Loader2, MessageSquare, Trash2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import api from "@/lib/api";
import { useBranchSwitcher } from "@/hooks/use-branch-switcher";
import { getErrorMessage } from "@/lib/get-error-message";
import { useAuth } from "@/hooks/use-auth";
import { TelegramAnnounceDialog } from "./telegram-announce-dialog";

interface PendingGroup {
  id: string;
  chatId: string;
  title: string;
  addedAt: string;
  addedByTelegramUserId: string | null;
}

interface ApprovedGroup {
  id: string;
  chatId: string;
  title: string;
  branch: { id: number; name: string } | null;
  /**
   * This group deliberately watches every branch. Without it the table could
   * not tell an org-wide chat from one nobody had assigned — both showed "—"
   * under Filial, and only one of them was a mistake.
   */
  receivesAllBranches: boolean;
  isActive: boolean;
  approvedBy: { id: number; firstName: string; lastName: string } | null;
  approvedAt: string | null;
  lastDailyReportAt: string | null;
}

export function TelegramGroupsClient() {
  const queryClient = useQueryClient();
  const user = useAuth((s) => s.user);
  const isCeo = user?.roles.some((r) => r.id === 1) ?? false;
  const { selectedBranch } = useBranchSwitcher();
  const [confirmAction, setConfirmAction] = useState<{
    kind: "approve" | "reject" | "unlink";
    group: PendingGroup | ApprovedGroup;
  } | null>(null);

  const pendingQuery = useQuery({
    queryKey: ["telegram-groups", "pending"],
    queryFn: () =>
      api.get<PendingGroup[]>("/telegram-groups/pending").then((r) => r.data),
    refetchInterval: 10000,
  });

  const approvedQuery = useQuery({
    queryKey: ["telegram-groups", "approved"],
    queryFn: () =>
      api.get<ApprovedGroup[]>("/telegram-groups").then((r) => r.data),
  });

  const approveMutation = useMutation({
    // The branch is REQUIRED now. This used to post an empty body, so every
    // approved group was born branch-less — and a branch-less group received
    // every branch's operational events, including the 21:00 financial report.
    // Taken from the active branch: approving a group is a statement about
    // which branch's events it should carry, and that is the branch you are
    // looking at.
    mutationFn: (id: string) =>
      api
        .post(`/telegram-groups/${id}/approve`, {
          branchId: selectedBranch?.id,
        })
        .then((r) => r.data),
    onSuccess: () => {
      toast.success("Guruh tasdiqlandi — bot guruhda e'lon yuboradi");
      queryClient.invalidateQueries({ queryKey: ["telegram-groups"] });
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Tasdiqlashda xatolik"));
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) =>
      api.post(`/telegram-groups/${id}/reject`, {}).then((r) => r.data),
    onSuccess: () => {
      toast.success("Guruh rad etildi");
      queryClient.invalidateQueries({ queryKey: ["telegram-groups", "pending"] });
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Rad etishda xatolik"));
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: (id: string) =>
      api.delete(`/telegram-groups/${id}`).then((r) => r.data),
    onSuccess: () => {
      toast.success("Guruh tizimdan uzildi");
      queryClient.invalidateQueries({ queryKey: ["telegram-groups", "approved"] });
      setConfirmAction(null);
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, "Uzishda xatolik"));
    },
  });

  const handleConfirm = () => {
    if (!confirmAction) return;
    const id = confirmAction.group.id;
    if (confirmAction.kind === "approve") approveMutation.mutate(id);
    if (confirmAction.kind === "reject") rejectMutation.mutate(id);
    if (confirmAction.kind === "unlink") unlinkMutation.mutate(id);
  };

  const confirmText = confirmAction
    ? {
        approve: {
          title: "Guruhni tasdiqlash",
          description: `"${confirmAction.group.title}" guruhi sizning kompaniyangizga bog'lanadi. Bot guruhda tasdiqlash xabarini yuboradi va barcha komandalar shu yerda ishlay boshlaydi.`,
          actionLabel: "Tasdiqlash",
          destructive: false,
        },
        reject: {
          title: "Guruhni rad etish",
          description: `"${confirmAction.group.title}" guruhi rad etiladi va ro'yxatdan o'chiriladi. Botni qaytadan qo'shsangiz, yana paydo bo'ladi.`,
          actionLabel: "Rad etish",
          destructive: true,
        },
        unlink: {
          title: "Botni uzish",
          description: `Bot "${confirmAction.group.title}" guruhidan tizim darajasida uzladi. Guruh DB'da arxivlanadi, lekin bot guruhda qoladi — uni qo'lda chiqarib yuborishingiz mumkin.`,
          actionLabel: "Uzish",
          destructive: true,
        },
      }[confirmAction.kind]
    : null;

  /**
   * Repoint an already-approved group. Two production groups were approved
   * before a branch was required, so they receive no branch events at all —
   * without this the only fix was a database script.
   */
  const scopeMutation = useMutation({
    mutationFn: ({
      id,
      receivesAllBranches,
    }: {
      id: string;
      receivesAllBranches: boolean;
    }) =>
      api
        .patch(`/telegram-groups/${id}`, {
          receivesAllBranches,
          // Clearing the branch is only legal alongside the flag; the server
          // refuses the state where a group has neither.
          ...(receivesAllBranches ? {} : { branchId: selectedBranch?.id }),
        })
        .then((r) => r.data),
    onSuccess: (_d, vars) => {
      toast.success(
        vars.receivesAllBranches
          ? "Guruh barcha filiallarni kuzatadi"
          : "Guruh filialga bog'landi",
      );
      queryClient.invalidateQueries({ queryKey: ["telegram-groups", "approved"] });
    },
    onError: (e) =>
      toast.error(getErrorMessage(e, "Guruh sozlamasini o'zgartirib bo'lmadi")),
  });

  const anyPending =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    unlinkMutation.isPending ||
    scopeMutation.isPending;

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold tracking-tight">
            Telegram guruhlar
          </h2>
          <p className="text-sm text-muted-foreground">
            Botni Telegram guruhga qo&apos;shing — guruh shu yerda &quot;Tasdiqlash kutilayotgan&quot;
            ro&apos;yxatda paydo bo&apos;ladi. Tasdiqlangach komandalar guruh ichida ishlay boshlaydi.
          </p>
        </div>
        {isCeo && <TelegramAnnounceDialog />}
      </div>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Tasdiqlash kutilayotgan</h3>
          {pendingQuery.data && (
            <Badge variant="secondary">{pendingQuery.data.length} ta</Badge>
          )}
        </div>

        {pendingQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : !pendingQuery.data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded">
            Tasdiqlash kutilayotgan guruh yo&apos;q. Botni Telegram guruhingizga qo&apos;shing —
            bu yerda paydo bo&apos;ladi.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Guruh nomi</TableHead>
                <TableHead>Chat ID</TableHead>
                <TableHead>Qo&apos;shilgan vaqt</TableHead>
                <TableHead className="text-right">Amal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingQuery.data.map((g, idx) => (
                <TableRow key={g.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <span className="font-medium">{g.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{g.chatId}</TableCell>
                  <TableCell className="text-sm">
                    {format(new Date(g.addedAt), "dd.MM.yyyy, HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        onClick={() => setConfirmAction({ kind: "approve", group: g })}
                        disabled={anyPending}
                      >
                        <Check className="size-4 mr-1" />
                        Tasdiqlash
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ kind: "reject", group: g })}
                        disabled={anyPending}
                      >
                        <X className="size-4 mr-1" />
                        Rad etish
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">Tasdiqlangan guruhlar</h3>
          {approvedQuery.data && (
            <Badge variant="secondary">{approvedQuery.data.length} ta</Badge>
          )}
        </div>

        {approvedQuery.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded" />
            ))}
          </div>
        ) : !approvedQuery.data?.length ? (
          <p className="text-sm text-muted-foreground py-8 text-center border rounded">
            Hali tasdiqlangan guruh yo&apos;q
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 border-r">#</TableHead>
                <TableHead>Guruh nomi</TableHead>
                <TableHead>Filial</TableHead>
                <TableHead>Tasdiqlovchi</TableHead>
                <TableHead>Tasdiqlangan</TableHead>
                <TableHead className="text-right">Amal</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedQuery.data.map((g, idx) => (
                <TableRow key={g.id}>
                  <TableCell className="border-r text-muted-foreground">
                    {idx + 1}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MessageSquare className="size-4 text-muted-foreground" />
                      <span className="font-medium">{g.title}</span>
                      {!g.isActive && (
                        <Badge variant="destructive">to&apos;xtatilgan</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm">
                    {g.receivesAllBranches ? (
                      <Badge variant="secondary">Barcha filiallar</Badge>
                    ) : g.branch ? (
                      g.branch.name
                    ) : (
                      <Badge variant="destructive">belgilanmagan</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {g.approvedBy
                      ? `${g.approvedBy.firstName} ${g.approvedBy.lastName}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {g.approvedAt
                      ? format(new Date(g.approvedAt), "dd.MM.yyyy, HH:mm")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      {isCeo && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            scopeMutation.mutate({
                              id: g.id,
                              receivesAllBranches: !g.receivesAllBranches,
                            })
                          }
                          disabled={anyPending}
                          title={
                            g.receivesAllBranches
                              ? "Faqat tanlangan filialga bog'lash"
                              : "Barcha filiallarni kuzatadigan qilish"
                          }
                        >
                          {g.receivesAllBranches
                            ? "Filialga bog'lash"
                            : "Barcha filiallar"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setConfirmAction({ kind: "unlink", group: g })}
                        disabled={anyPending}
                      >
                        <Trash2 className="size-4 mr-1" />
                        Uzish
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(open) => !open && !anyPending && setConfirmAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmText?.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmText?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={anyPending}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirm}
              disabled={anyPending}
              className={
                confirmText?.destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {anyPending && <Loader2 className="size-4 mr-2 animate-spin" />}
              {confirmText?.actionLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
