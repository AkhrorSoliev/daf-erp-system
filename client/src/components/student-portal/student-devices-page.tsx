"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DeviceMobile, Desktop } from "@phosphor-icons/react";
import { Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
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
import { LogoutOthersDialog } from "@/components/shared/logout-others-dialog";
import {
  isMobileDevice,
  lastSeenText,
  sortSessions,
  type ActiveSession,
} from "@/components/profile/sessions/sessions-model";
import { Badge, Button, Card, EmptyState, Screen, Section, Skeleton, StackHeader } from "./lumio";
import { LoadFailed } from "./load-failed";
import { loadState } from "./lib/load-state";

// Same key as the staff profile's list: `useLogoutOthers` refreshes it.
const SESSIONS_KEY = ["user-sessions"] as const;

/**
 * «Ulangan qurilmalar»: the devices this account is signed in on, with a way
 * to sign any one of them out (ADR-0113 — the same `/users/sessions` the staff
 * profile uses; the server names each device and says which one is this).
 */
export function StudentDevicesPage() {
  const t = useT();
  const queryClient = useQueryClient();
  const [target, setTarget] = useState<ActiveSession | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);

  const query = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: () => api.get<ActiveSession[]>("/users/sessions").then((r) => r.data),
    // A device may have signed in or out since the page was opened.
    refetchOnMount: "always",
    staleTime: 0,
    retry: false,
  });
  const state = loadState(query);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/users/sessions/${id}`),
    onSuccess: () => {
      toast.success(t("Qurilmadan chiqarildi"));
      setTarget(null);
      queryClient.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, t("Qurilmadan chiqarib bo'lmadi")));
    },
  });

  const rows = useMemo(() => sortSessions(query.data ?? []), [query.data]);
  const hasOthers = rows.some((r) => !r.current);
  // One clock per render: every row is judged against the same instant.
  const now = new Date();

  return (
    <Screen narrow>
      <StackHeader title={t("Ulangan qurilmalar")} backHref="/portal/settings" />

      <p className="px-1 text-sm font-semibold leading-snug text-ink-500">
        {t("Hisobingizga kirilgan qurilmalar. Tanimagan qurilmani shu yerdan chiqarib yuborishingiz mumkin.")}
      </p>

      {state === "loading" ? (
        <div className="flex flex-col gap-2.5" aria-busy="true">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-[76px] w-full" />
          ))}
        </div>
      ) : state === "offline" || state === "failed" ? (
        <LoadFailed query={query} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<DeviceMobile weight="bold" />}
          title={t("Ro'yxat hali bo'sh — qurilmalar keyingi kirishdan so'ng shu yerda ko'rinadi.")}
        />
      ) : (
        <Section>
          {rows.map((session) => {
            const Icon = isMobileDevice(session.device) ? DeviceMobile : Desktop;
            return (
              <Card key={session.id} pad="sm" className="flex flex-wrap items-center gap-3">
                <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sunk text-2xl text-ink-700">
                  <Icon weight="bold" />
                </span>
                <div className="min-w-0 flex-1 basis-40">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-display font-extrabold text-ink-900">{session.device}</span>
                    {session.current ? <Badge tone="teal" size="sm">{t("Joriy qurilma")}</Badge> : null}
                  </div>
                  <p className="truncate text-xs font-semibold text-ink-500">
                    {session.ip ? `${session.ip} · ` : ""}
                    {lastSeenText(session.lastUsedAt, now, t)}
                  </p>
                </div>
                {session.current ? null : (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setTarget(session)}>
                    {t("Qurilmadan chiqarish")}
                  </Button>
                )}
              </Card>
            );
          })}
        </Section>
      )}

      {hasOthers ? (
        <Button type="button" variant="danger" block onClick={() => setOthersOpen(true)}>
          {t("Boshqa qurilmalardan chiqish")}
        </Button>
      ) : null}

      <AlertDialog open={target !== null} onOpenChange={(open) => !open && !remove.isPending && setTarget(null)}>
        <AlertDialogContent className="lumio">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display font-extrabold">{t("Qurilmadan chiqarilsinmi?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("{device}: bu qurilmadagi kirish darhol tugatiladi. Qayta kirish uchun parol kerak bo'ladi.", {
                device: target?.device ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>{t("Bekor qilish")}</AlertDialogCancel>
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
              {t("Qurilmadan chiqarish")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LogoutOthersDialog open={othersOpen} onOpenChange={setOthersOpen} contentClassName="lumio" />
    </Screen>
  );
}
