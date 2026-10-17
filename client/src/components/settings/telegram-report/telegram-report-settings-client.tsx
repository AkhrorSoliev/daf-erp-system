"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getErrorMessage } from "@/lib/get-error-message";
import { SettingsPageHeader } from "../settings-page-header";
import {
  addRecipient, fetchCandidates, fetchRecipients, patchRecipient, removeRecipient, testRecipient,
  type RecipientPatch,
} from "./telegram-report-api";
import { RecipientCard } from "./recipient-card";

const KEY = ["telegram-report-recipients"];
const CANDIDATES = ["telegram-report-candidates"];
const TITLE = "Telegram hisobot";
const DESCRIPTION = "Kunlik hisobot kimning shaxsiy chatiga, qaysi filiallar va bo'limlar bilan borishi";

/** CEO-only (ADR-0095): recipients of the personal daily report. */
export function TelegramReportSettingsClient() {
  const qc = useQueryClient();
  const [pick, setPick] = useState<string>("");
  const [testingId, setTestingId] = useState<number | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({ queryKey: KEY, queryFn: fetchRecipients });
  const candidates = useQuery({ queryKey: CANDIDATES, queryFn: fetchCandidates });
  // Returned from onSuccess so isPending stays true until the refetch lands:
  // the next PATCH is computed from the refetched sections/branchIds.
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: KEY }),
      qc.invalidateQueries({ queryKey: CANDIDATES }),
    ]);

  const add = useMutation({
    mutationFn: (userId: number) => addRecipient(userId),
    onSuccess: () => { setPick(""); toast.success("Qo'shildi"); return refresh(); },
    onError: (e) => toast.error(getErrorMessage(e, "Qo'shib bo'lmadi")),
  });
  const patch = useMutation({
    mutationFn: ({ id, p }: { id: number; p: RecipientPatch }) => patchRecipient(id, p),
    onSuccess: refresh,
    onError: (e) => toast.error(getErrorMessage(e, "Saqlashda xatolik")),
  });
  const remove = useMutation({
    mutationFn: removeRecipient,
    onSuccess: () => { toast.success("Olib tashlandi"); return refresh(); },
    onError: (e) => toast.error(getErrorMessage(e, "Olib tashlab bo'lmadi")),
  });
  const test = useMutation({
    mutationFn: testRecipient,
    onMutate: (id) => setTestingId(id),
    onSettled: () => setTestingId(null),
    onSuccess: () => toast.success("Hisobot yuborildi"),
    onError: (e) => toast.error(getErrorMessage(e, "Yuborib bo'lmadi")),
  });

  if (isError && !data) {
    return (
      <div className="space-y-3">
        <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
        <p className="text-sm text-muted-foreground">Ma&apos;lumotni yuklab bo&apos;lmadi.</p>
        <Button variant="outline" onClick={() => void refetch()}>Qayta urinish</Button>
      </div>
    );
  }
  if (isLoading || !data) {
    return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64 w-full max-w-3xl" /></div>;
  }

  return (
    <div>
      <SettingsPageHeader title={TITLE} description={DESCRIPTION} />
      <div className="max-w-3xl space-y-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-4">
          <Select value={pick} onValueChange={setPick}>
            <SelectTrigger className="w-72"><SelectValue placeholder="Xodimni tanlang" /></SelectTrigger>
            <SelectContent>
              {(candidates.data ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.name}{c.position ? ` — ${c.position}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button disabled={!pick || add.isPending} onClick={() => add.mutate(Number(pick))}>
            <Plus className="size-4" /> Oluvchi qo&apos;shish
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Hisobot dushanba–shanba belgilangan vaqtda keladi; yakshanba va butun markaz bayramida avtomatik bormaydi.
          Oluvchi botdagi «📊 Hisobot» tugmasi bilan istalgan payt so&apos;ray oladi.
        </p>
        {data.recipients.length === 0 && (
          <p className="text-sm text-muted-foreground">Hali oluvchi yo&apos;q.</p>
        )}
        {data.recipients.map((r) => (
          <RecipientCard
            key={r.id}
            recipient={r}
            branches={data.branches}
            busy={patch.isPending || remove.isPending}
            testing={testingId === r.id}
            onPatch={(p) => patch.mutate({ id: r.id, p })}
            onTest={() => test.mutate(r.id)}
            onRemove={() => remove.mutate(r.id)}
          />
        ))}
      </div>
    </div>
  );
}
