"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { getErrorMessage } from "@/lib/get-error-message";
import { SettingsPageHeader } from "../settings-page-header";
import {
  addRecipient, checkRecipient, fetchCandidates, fetchRecipients, patchRecipient, removeRecipient, testRecipient,
  type ProbeReach, type RecipientPatch,
} from "./telegram-report-api";
import { filterRecipients, summarize, type RecipientFilter } from "./recipient-view";
import { AddRecipientDialog } from "./add-recipient-dialog";
import { RecipientPanel } from "./recipient-panel";
import { RecipientTable } from "./recipient-table";
import { SummaryCards } from "./summary-cards";

const KEY = ["telegram-report-recipients"];
const CANDIDATES = ["telegram-report-candidates"];
const TITLE = msg("Telegram hisobot");
const DESCRIPTION = msg("Kunlik hisobot kimning shaxsiy chatiga, qaysi filiallar va bo'limlar bilan borishi");

const FILTERS: { value: RecipientFilter; label: string }[] = [
  { value: "all", label: msg("Hammasi") },
  { value: "problem", label: msg("Yetib bormaydi") },
  { value: "off", label: msg("O'chirilgan") },
];

const PROBE_TOAST: Record<ProbeReach, string> = {
  DELIVERED: msg("Xabar yetadi"),
  BLOCKED: msg("Xodim botni bloklagan"),
  UNLINKED: msg("Telegram ulanmagan"),
  NO_BOT: msg("Bot ishlamayapti"),
  FAILED: msg("Tekshirib bo'lmadi, keyinroq urinib ko'ring"),
};

/** CEO-only (ADR-0095): recipients of the personal daily report. */
export function TelegramReportSettingsClient() {
  const t = useT();
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RecipientFilter>("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [testingId, setTestingId] = useState<number | null>(null);
  const [checkingId, setCheckingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchRecipients });
  const candidates = useQuery({ queryKey: CANDIDATES, queryFn: fetchCandidates });
  const now = useMemo(() => new Date(), [data]); // eslint-disable-line react-hooks/exhaustive-deps -- the clock follows each answer
  // Returned from onSuccess so isPending stays true until the refetch lands:
  // the next PATCH is computed from the refetched sections/branchIds.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: KEY }),
      qc.invalidateQueries({ queryKey: CANDIDATES }),
    ]);

  const add = useMutation({
    mutationFn: (userId: number) => addRecipient(userId),
    onSuccess: (created) => { setAddOpen(false); setSelectedId(created.id); toast.success(t("Oluvchi qo'shildi")); return refresh(); },
    onError: (e) => toast.error(getErrorMessage(e, t("Qo'shib bo'lmadi"))),
  });
  const patch = useMutation({
    mutationFn: ({ id, p }: { id: number; p: RecipientPatch }) => patchRecipient(id, p),
    onSuccess: refresh,
    onError: (e) => toast.error(getErrorMessage(e, t("Saqlashda xatolik"))),
  });
  const remove = useMutation({
    mutationFn: removeRecipient,
    onSuccess: () => { toast.success(t("Olib tashlandi")); return refresh(); },
    onError: (e) => toast.error(getErrorMessage(e, t("Olib tashlab bo'lmadi"))),
  });
  const test = useMutation({
    mutationFn: testRecipient,
    onMutate: (id) => setTestingId(id),
    onSettled: () => setTestingId(null),
    // The server stores every attempt (success or not): re-read either way.
    onSuccess: () => { toast.success(t("Hisobot yuborildi")); return refresh(); },
    onError: (e) => { toast.error(getErrorMessage(e, t("Yuborib bo'lmadi"))); return refresh(); },
  });
  const check = useMutation({
    mutationFn: checkRecipient,
    onMutate: (id) => setCheckingId(id),
    onSettled: () => setCheckingId(null),
    onSuccess: (probe) => {
      // A BLOCKED probe may carry the server's own reason: it is shown as sent.
      const fallback = PROBE_TOAST[probe.reach];
      const text = probe.reach === "BLOCKED" && probe.note ? probe.note : t(fallback);
      (probe.reach === "DELIVERED" ? toast.success : toast.error)(text);
      return refresh();
    },
    onError: (e) => toast.error(getErrorMessage(e, t("Tekshirib bo'lmadi, keyinroq urinib ko'ring"))),
  });

  if (isError && !data) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
        <p className="text-sm text-muted-foreground">{t("Ma'lumotni yuklab bo'lmadi")}.</p>
        <Button variant="outline" onClick={() => void refetch()}>{t("Qayta urinish")}</Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const rows = filterRecipients(data.recipients, query, filter);
  const selected = data.recipients.find((r) => r.id === selectedId) ?? rows[0] ?? data.recipients[0] ?? null;
  const stats = summarize(data.recipients);
  const filtered = query.trim() !== "" || filter !== "all";

  return (
    <div>
      <SettingsPageHeader title={t(TITLE)} description={t(DESCRIPTION)} />
      <div className="space-y-4">
        <SummaryCards total={stats.total} reaching={stats.reaching} problem={stats.problem} botActive={data.bot.active} />
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Ism yoki lavozim bo'yicha qidirish")}
              className="pl-8"
            />
          </div>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <Button
                key={f.value}
                type="button"
                size="sm"
                variant={filter === f.value ? "default" : "outline"}
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className="rounded-full"
              >
                {t(f.label)}
              </Button>
            ))}
          </div>
          <Button className="sm:ml-auto" onClick={() => setAddOpen(true)}>
            <Plus className="size-4" /> {t("Oluvchi qo'shish")}
          </Button>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-3">
            <RecipientTable
              rows={rows}
              branches={data.branches}
              selectedId={selected?.id ?? null}
              now={now}
              onSelect={setSelectedId}
              onToggle={(id, isActive) => patch.mutate({ id, p: { isActive } })}
              busy={patch.isPending || remove.isPending}
              empty={filtered ? t("Hech narsa topilmadi") : t("Hali oluvchi yo'q")}
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Hisobot dushanba–shanba belgilangan vaqtda keladi; yakshanba va butun markaz bayramida avtomatik bormaydi. Oluvchi botdagi «📊 Hisobot» tugmasi bilan istalgan payt so'ray oladi.",
              )}
            </p>
          </div>
          {selected && (
            <RecipientPanel
              key={selected.id}
              recipient={selected}
              branches={data.branches}
              now={now}
              busy={patch.isPending || remove.isPending}
              testing={testingId === selected.id}
              checking={checkingId === selected.id}
              onPatch={(p) => patch.mutate({ id: selected.id, p })}
              onTest={() => test.mutate(selected.id)}
              onCheck={() => check.mutate(selected.id)}
              onRemove={() => remove.mutate(selected.id)}
            />
          )}
        </div>
      </div>
      <AddRecipientDialog
        candidates={candidates.data ?? []}
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(userId) => add.mutate(userId)}
        pending={add.isPending}
      />
    </div>
  );
}
