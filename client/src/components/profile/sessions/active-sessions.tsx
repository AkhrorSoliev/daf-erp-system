"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Monitor, Smartphone } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  isMobileDevice,
  lastSeenText,
  sortSessions,
  type ActiveSession,
} from "./sessions-model";

export const SESSIONS_KEY = ["user-sessions"] as const;

/**
 * «Faol seanslar» (ADR-0113): this account's signed-in devices, like Telegram's.
 * The server names each device and says which one is this; the client only
 * draws the list and removes a row.
 */
export function ActiveSessions() {
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ActiveSession | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api.get<ActiveSession[]>("/users/sessions").then((r) => r.data),
    // A device may have signed in or out since the page was opened.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/sessions/${id}`),
    onSuccess: () => {
      toast.success("Qurilmadan chiqarildi");
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Qurilmadan chiqarib bo'lmadi"));
    },
  });

  const rows = useMemo(() => sortSessions(data ?? []), [data]);
  // One clock per render of the list: every row is judged against the same instant.
  const now = new Date();

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-heading text-base font-semibold">Faol seanslar</h2>
        <p className="text-sm text-muted-foreground">
          Hisobingizga kirilgan qurilmalar. Tanimagan qurilmani shu yerdan chiqarib yuborishingiz mumkin.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">Ro&apos;yxatni yuklab bo&apos;lmadi.</span>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Qayta urinish
          </Button>
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          Ro&apos;yxat hali bo&apos;sh — qurilmalar keyingi kirishdan so&apos;ng shu yerda ko&apos;rinadi.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {rows.map((session) => {
            const Icon = isMobileDevice(session.device) ? Smartphone : Monitor;
            return (
              <li key={session.id} className="flex items-center gap-3 p-3">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{session.device}</span>
                    {session.current && <Badge variant="secondary">Joriy qurilma</Badge>}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {session.ip ? `${session.ip} · ` : ""}
                    {lastSeenText(session.lastUsedAt, now)}
                  </p>
                </div>
                {!session.current && (
                  <Button variant="outline" size="sm" onClick={() => setTarget(session)}>
                    Chiqarish
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && !remove.isPending && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Qurilmadan chiqarilsinmi?</AlertDialogTitle>
            <AlertDialogDescription>
              {target?.device}: bu qurilmadagi kirish darhol tugatiladi. Qayta kirish uchun
              parol kerak bo&apos;ladi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Bekor qilish</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              variant="destructive"
              onClick={(event) => {
                // Keep the dialog open until the request settles.
                event.preventDefault();
                if (target) remove.mutate(target.id);
              }}
            >
              {remove.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Chiqarish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
